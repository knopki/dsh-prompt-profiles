/**
 * #region moduleContract
 * @modulecontract
 * @purpose Honest smoke test on the REAL Cordis runtime: the fake-ctx unit
 *   tests cannot catch loader-level mount failures, so this file boots a real
 *   `Context`, provides the host services through real `ctx.plugin`/`provide`
 *   fibers, and mounts the bundle's real ESM entry (`lib/index.js`).
 * @scope node:test + @deepseek-ai/cordis from the bundle's own node_modules
 *   (peerDependency — never added to package.json) with stub service
 *   implementations; NOT the real dsh-web/host composition.
 * @invariants The API depends ONLY on `webServer`: with webServer present the
 *   routes MUST register even when settings/configEditor/connection/
 *   agentPresets/workspaceRegistry are missing (reads degrade, mutations 503);
 *   the plugin always MOUNTS; a missing web surface is reported, never silent.
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PromptProfilesPlugin } from "../lib/index.js";
import { API_ROUTE_BASE } from "../lib/api.js";
import * as sectionRow from "../lib/section.js";
import * as profileRow from "../lib/profile.js";

let Context = null;
let cordisError = null;
try {
  ({ Context } = await import("@deepseek-ai/cordis"));
} catch (error) {
  cordisError = error;
}
const missingCordis = cordisError === null ? false : `@deepseek-ai/cordis not resolvable from the bundle: ${cordisError.message}`;

// #region FUNC_stubHost
/** @purpose One real Cordis root context plus stub service instances provided by a real plugin fiber (like the host's own rows). `registerFails` makes every Fetch-route registration throw (zero-route case); omitting "connection" emulates a headless surface. */
function stubHost(names, { registerFails = false, patchPath = "/nonexistent-cordis-smoke/cordis.patch.yml" } = {}) {
  const routes = new Map();
  const logs = [];
  const values = {
    connection: {
      admit: async () => ({ peer: { id: "smoke" } }),
      fetch: {
        register({ path, methods, requestBody, fetch }) {
          if (registerFails) throw new Error(`register refused ${path}`);
          if (routes.has(path)) throw new Error(`connection: exact Fetch route ${JSON.stringify(path)} is already registered`);
          routes.set(path, { methods: new Set(methods), requestBody, fetch });
          return () => routes.delete(path);
        },
      },
    },
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 1 }],
      mutate: async () => {},
      replace: async () => {},
      configure: () => () => {},
    },
    configEditor: { documentPath: patchPath, entries: () => [] },
    storageDomain: {
      open: async () => ({ table: () => ({ get: () => undefined, put: async () => {} }), close: async () => {} }),
    },
    workspaceRegistry: { list: () => [], resolveByPath: async () => undefined, get: () => undefined },
    agentPresets: { list: async () => [], readDocument: async () => ({ content: "" }) },
  };
  const ctx = new Context();
  ctx.logger = {
    debug() {},
    info: (message, details) => logs.push({ level: "info", message, details }),
    warn: (message, details) => logs.push({ level: "warn", message, details }),
    error: (message, details) => logs.push({ level: "error", message, details }),
  };
  const stubs = ctx.plugin({
    name: "smoke-stubs",
    apply(child) { for (const name of names) child.provide(name, values[name]); },
  });
  /** Drive one registered Fetch route with a REAL Request. */
  const drive = async (path, method = "GET", body, headers) => {
    const route = routes.get(`${API_ROUTE_BASE}${path.split("?")[0]}`);
    if (!route) return { status: 404, body: null };
    const request = new Request(`http://127.0.0.1:3080${API_ROUTE_BASE}${path}`, {
      method,
      headers: {
        host: "127.0.0.1:3080",
        ...(method === "GET" ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    const response = await route.fetch(request);
    const text = await response.text();
    return { status: response.status, body: text === "" ? null : JSON.parse(text) };
  };
  return { ctx, stubs, routes, logs, values, drive };
}

/** @purpose A real, writable patch file for the writer-backed routes. */
async function makePatch() {
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-smoke-"));
  const path = join(dir, "cordis.patch.yml");
  await writeFile(path, "[]\n", { mode: 0o600 });
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** @purpose Mount the real plugin row and return its fiber. */
async function mountPlugin(ctx) {
  const fiber = ctx.plugin(PromptProfilesPlugin, { default: "", lastByWorkspace: {} });
  await fiber.await();
  return fiber;
}
// #endregion FUNC_stubHost

// #region TEST_mount
/** @purpose (б) connection + all optional services: full behaviour — Fetch routes, /state, a working mutation. */
test("real Cordis: with connection and every service the full API works over Fetch routes", { skip: missingCordis }, async () => {
  const patch = await makePatch();
  const host = stubHost(["connection", "settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], { patchPath: patch.path });
  await host.stubs.await();
  assert.equal(PromptProfilesPlugin.inject.length, 0, "the row declares no mandatory injections");
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.routes.size >= 10, `all Fetch routes registered (got ${host.routes.size})`);
  assert.ok(host.routes.has(`${API_ROUTE_BASE}/state`), "/state registered under the /api carrier base");
  assert.ok(host.ctx.get("promptProfiles"), "the promptProfiles service is provided");
  const state = await host.drive("/state");
  assert.equal(state.status, 200);
  assert.equal(state.body.revision, 1, "settings revision read");
  const created = await host.drive("/section/create", "POST", { title: "T", body: "B" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.ok(host.logs.some((entry) => entry.level === "info" && /api: mounted/.test(entry.message)), "mount logged at info");
  await fiber.dispose();
  assert.equal(host.routes.size, 0, "dispose removes every Fetch route");
  assert.ok(host.logs.some((entry) => entry.level === "info" && /api: unmounted/.test(entry.message)), "unmount logged at info");
  await patch.cleanup();
});

/** @purpose (а) connection ALONE: routes MUST register; reads work; mutations answer 503; the missing services are warned about. */
test("real Cordis: connection alone still registers routes, reads work and mutations answer 503", { skip: missingCordis }, async () => {
  const host = stubHost(["connection"]);
  await host.stubs.await();
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.routes.size >= 10, `routes registered without settings/configEditor (got ${host.routes.size})`);
  const state = await host.drive("/state");
  assert.equal(state.status, 200, JSON.stringify(state.body));
  assert.equal(state.body.revision, null, "no settings -> revision null, not a failure");
  assert.equal((await host.drive("/preview?profileId=ghost")).status, 404, "preview reads the registry, not settings");
  const section = host.ctx.plugin(sectionRow, { id: "tone", title: "Tone", body: "Be brief." });
  const profile = host.ctx.plugin(profileRow, { id: "light", title: "Light", sections: [{ id: "tone", order: 1050 }] });
  await section.await();
  await profile.await();
  const preview = await host.drive("/preview?profileId=light");
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.sections.some((row) => row.id === "tone"), true, "preview renders the profile without settings");
  await section.dispose();
  await profile.dispose();
  const created = await host.drive("/section/create", "POST", { title: "T", body: "B" });
  assert.equal(created.status, 503, JSON.stringify(created.body));
  assert.match(created.body.error.message, /profile storage service is unavailable/);
  const last = await host.drive("/last", "POST", { workspaceId: "w", profileId: "" });
  assert.equal(last.status, 503, JSON.stringify(last.body));
  const warn = host.logs.find((entry) => entry.level === "warn" && /mounted with missing services/.test(entry.message));
  assert.ok(warn, "missing services warned at registration");
  assert.deepEqual(warn.details?.missing?.sort(), ["agentPresets", "configEditor", "settings", "workspaceRegistry"]);
  await fiber.dispose();
});

/** @purpose (в) no connection: the plugin mounts, has ZERO routes and logs it at error level. A registered-but-refusing carrier is equally loud. */
test("real Cordis: zero routes is loud (no connection, and a refusing carrier)", { skip: missingCordis }, async () => {
  // (в1) no connection at all -> error diagnostic after the settle window.
  const none = stubHost(["settings", "configEditor"]);
  await none.stubs.await();
  const noneFiber = await mountPlugin(none.ctx);
  assert.equal(none.routes.size, 0);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const zero = none.logs.find((entry) => entry.level === "error" && /mounted ZERO routes/.test(entry.message));
  assert.ok(zero, "no connection -> ZERO routes logged at error level");
  assert.ok(zero.details?.missing?.includes("connection"));
  await noneFiber.dispose();
  // (в2) carrier present but every registration fails -> ZERO routes + error.
  const broken = stubHost(["connection"], { registerFails: true });
  await broken.stubs.await();
  const brokenFiber = await mountPlugin(broken.ctx);
  assert.equal(broken.routes.size, 0);
  assert.ok(broken.logs.some((entry) => entry.level === "error" && /mounted ZERO routes/.test(entry.message)), "zero routes error");
  for (const failure of broken.logs.filter((entry) => /route registration failed/.test(entry.message))) {
    assert.equal(failure.level, "error");
  }
  await brokenFiber.dispose();
});

/** @purpose Reload semantics on the real runtime: dispose → remount restores the same routes; a second mount without disposing fails on the service name (expected). */
test("real Cordis: dispose and remount is clean; a non-disposed double mount fails on the service name", { skip: missingCordis }, async () => {
  const host = stubHost(["connection", "settings", "configEditor"]);
  await host.stubs.await();
  const first = await mountPlugin(host.ctx);
  const count = host.routes.size;
  assert.ok(count > 0);
  await first.dispose();
  assert.equal(host.routes.size, 0);
  const second = await mountPlugin(host.ctx);
  assert.equal(host.routes.size, count, "same routes after a clean remount");
  await assert.rejects(mountPlugin(host.ctx), /has been registered/, "a second live mount is a service-name conflict");
  await second.dispose();
});

/** @purpose The subpath rows consume the service for real: mounting `lib/section.js` + `lib/profile.js` registers rows in the registry. */
test("real Cordis: section and profile rows mount against the live service", { skip: missingCordis }, async () => {
  const host = stubHost(["connection", "settings", "configEditor"]);
  await host.stubs.await();
  const main = await mountPlugin(host.ctx);
  const section = host.ctx.plugin(sectionRow, { id: "tone", title: "Tone", body: "Be brief." });
  const profile = host.ctx.plugin(profileRow, { id: "light", title: "Light", sections: [{ id: "tone", order: 1050 }] });
  await section.await();
  await profile.await();
  const service = host.ctx.get("promptProfiles");
  assert.deepEqual(service.sections().map((row) => row.id), ["tone"]);
  assert.deepEqual(service.profiles().map((row) => row.id), ["light"]);
  await section.dispose();
  assert.deepEqual(service.sections(), [], "row disposal unregisters the section");
  await profile.dispose();
  await main.dispose();
});
// #endregion TEST_mount

// #region TEST_ctxGet
/** @purpose Requirement check: on the real runtime `ctx.get(name)` returns undefined for an absent service (it does NOT throw in cordis 4.0.4), and every optional read in our code is guarded. */
test("real Cordis: ctx.get for absent services, and every optional read is guarded", { skip: missingCordis }, async () => {
  const host = stubHost(["connection"]);
  await host.stubs.await();
  assert.equal(host.ctx.get("definitelyMissing"), undefined, "absent service via ctx.get -> undefined (cordis 4.0.4 semantics: it does NOT throw)");
  assert.equal(host.ctx.definitelyMissing, undefined, "absent service as a property -> undefined too (no throw on this cordis)");
  assert.ok(host.ctx.logger !== undefined, "ctx.logger is a built-in accessor, present without any provide");
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.routes.size > 0);
  await fiber.dispose();
});
// #endregion TEST_ctxGet
