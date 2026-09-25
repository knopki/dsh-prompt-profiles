/**
 * #region moduleContract
 * @modulecontract
 * @purpose Honest smoke test on the REAL Cordis runtime: the fake-ctx unit
 *   tests cannot catch loader-level mount failures, so this file boots a real
 *   `Context`, provides the host services through real `ctx.plugin`/`provide`
 *   fibers, and mounts the bundle's real ESM entry (`lib/index.js`).
 * @scope node:test + @deepseek-ai/cordis from the bundle's own node_modules
 *   (peerDependency — never added to package.json) with stub service
 *   implementations, the REAL dsh-typert-registry, and (for the Remote
 *   dispatch tests) the REAL dsh-api-gateway TypertGatewayService invoked
 *   host-side through invokeRpc; NOT the real dsh-web/host composition and
 *   NOT the HTTP/WebSocket carrier.
 * @invariants The API depends ONLY on `webServer`: with webServer present the
 *   routes MUST register even when settings/configEditor/connection/
 *   agentPresets/workspaceRegistry are missing (reads degrade, mutations 503);
 *   the plugin always MOUNTS; a missing web surface is reported, never silent.
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PromptProfilesPlugin } from "../lib/index.js";
import { API_ROUTE_BASE } from "../lib/api.js";
import { tokenSource } from "../lib/operations.js";
import * as sectionRow from "../lib/section.js";
import * as profileRow from "../lib/profile.js";

let TypertRegistry = null;
let typertRegistryError = null;
try {
  ({ TypertRegistry } = await import("@deepseek-ai/dsh-typert-registry"));
} catch (error) {
  typertRegistryError = error;
}
const missingTypert = typertRegistryError === null ? false : `@deepseek-ai/dsh-typert-registry not resolvable: ${typertRegistryError.message}`;

let TypertGatewayService = null;
let gatewayError = null;
try {
  ({ TypertGatewayService } = await import("@deepseek-ai/dsh-api-gateway"));
} catch (error) {
  gatewayError = error;
}
const missingGateway = gatewayError === null ? false : `@deepseek-ai/dsh-api-gateway not resolvable: ${gatewayError.message}`;

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

// #region TEST_typertRemote
/** @purpose Await an async mount side effect (typert inject callback, contribution commit) with a timeout instead of a fixed sleep. */
async function waitFor(predicate, { timeoutMs = 2000, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`waitFor timed out on ${label}`);
}

/** @purpose Real typert registry + real plugin: the Remote contribution registers via ctx.typert.register, all strict endpoints are locally visible, and disposing the plugin withdraws them. */
test("real typert registry: contribution registers, 11 strict endpoints visible, dispose withdraws", { skip: missingCordis || missingTypert }, async () => {
  const patch = await makePatch();
  const host = stubHost(["connection", "settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], { patchPath: patch.path });
  await host.stubs.await();
  const registryFiber = host.ctx.plugin(TypertRegistry);
  await registryFiber.await();
  assert.equal(typeof host.ctx.typert.register, "function", "the real registry exposes ctx.typert.register");
  const fiber = await mountPlugin(host.ctx);
  await waitFor(() => host.ctx.typert.local.get("promptProfiles/state") !== undefined, { label: "promptProfiles/state endpoint" });
  const endpoints = host.ctx.typert.local.list().map((descriptor) => `${descriptor.namespace}/${descriptor.method}`);
  const ours = endpoints.filter((endpoint) => endpoint.startsWith("promptProfiles/"));
  assert.deepEqual(ours.sort(), [
    "promptProfiles/defaultSet",
    "promptProfiles/last",
    "promptProfiles/preview",
    "promptProfiles/profileCreate",
    "promptProfiles/profileDelete",
    "promptProfiles/profileUpdate",
    "promptProfiles/sectionCreate",
    "promptProfiles/sectionDelete",
    "promptProfiles/sectionRename",
    "promptProfiles/sectionUpdate",
    "promptProfiles/state",
  ], "exactly the 11 phase-2b endpoints are registered");
  assert.ok(host.logs.some((entry) => entry.level === "info" && /remote: mounted/.test(entry.message) && entry.details?.methods === 11), "remote mount logged at info with 11 methods");
  await fiber.dispose();
  assert.equal(host.ctx.typert.local.get("promptProfiles/state"), undefined, "plugin disposal withdraws the strict endpoints");
  await registryFiber.dispose();
  await patch.cleanup();
});

/** @purpose Without a typert service the plugin still mounts (HTTP untouched) and the missing Remote surface is reported at error level. */
test("real Cordis: no typert service degrades loudly (error log), HTTP routes unaffected", { skip: missingCordis }, async () => {
  const host = stubHost(["connection", "settings", "configEditor"]);
  await host.stubs.await();
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.routes.size >= 10, `HTTP routes still register without typert (got ${host.routes.size})`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const zero = host.logs.find((entry) => entry.level === "error" && /remote: mounted ZERO remote endpoints/.test(entry.message));
  assert.ok(zero, "missing typert reported at error level after the settle window");
  await fiber.dispose();
});

/** @purpose REAL gateway dispatch: strict codecs reject malformed input (missing/extra/wrong-type) without touching the patch; a valid call mutates it exactly like the HTTP path; business errors surface as Remote failures. */
test("real gateway: strict rejection leaves the patch untouched; a valid Remote call matches the HTTP path byte-for-byte", { skip: missingCordis || missingTypert || missingGateway }, async () => {
  const patchA = await makePatch();
  const patchB = await makePatch();
  const hostA = stubHost(["connection", "settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], { patchPath: patchA.path });
  const hostB = stubHost(["connection", "settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], { patchPath: patchB.path });
  await hostA.stubs.await();
  await hostB.stubs.await();
  const fiberA = await mountPlugin(hostA.ctx);
  const registryFiber = hostB.ctx.plugin(TypertRegistry);
  await registryFiber.await();
  const gatewayFiber = hostB.ctx.plugin(TypertGatewayService, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1048576 });
  await gatewayFiber.await();
  const gateway = hostB.ctx.get("typertGateway");
  assert.ok(gateway, "the real typertGateway service mounted");
  const fiberB = await mountPlugin(hostB.ctx);
  await waitFor(() => hostB.ctx.typert.local.get("promptProfiles/sectionCreate") !== undefined, { label: "remote contribution" });

  // --- malformed input: rejected by the STRICT codecs, patch byte-identical.
  const before = await readFile(patchB.path, "utf8");
  const wrongArgs = await gateway.invokeRpc("promptProfiles/state", { args: {} });
  assert.equal(wrongArgs.ok, false, "missing wire field input is a Remote failure");
  assert.match(wrongArgs.error.message, /missing "input"/);
  const missingField = await gateway.invokeRpc("promptProfiles/sectionUpdate", { args: { input: {} } });
  assert.equal(missingField.ok, false, "missing required field rejected");
  const extraField = await gateway.invokeRpc("promptProfiles/sectionDelete", { args: { input: { rowId: "x", bogus: 1 } } });
  assert.equal(extraField.ok, false, "extra field rejected");
  const wrongType = await gateway.invokeRpc("promptProfiles/sectionCreate", { args: { input: { title: 5 } } });
  assert.equal(wrongType.ok, false, "wrong type rejected");
  assert.match(wrongType.error.message, /boundary validation|input/i);
  assert.equal(await readFile(patchB.path, "utf8"), before, "the patch file is byte-identical after every rejection");

  // --- business error surfaces as a Remote failure, not a silent success.
  const notRegistered = await gateway.invokeRpc("promptProfiles/profileUpdate", { args: { input: { rowId: "ghost", value: { title: "T" } } } });
  assert.equal(notRegistered.ok, false, "unknown row surfaces as a Remote failure");
  assert.match(notRegistered.error.message, /is not registered/);

  // --- valid call: same fixture, deterministic token, identical outcome on
  //     both transports (HTTP on A, Remote through the real gateway on B).
  const original = tokenSource.next;
  const fixture = { title: "Tone", body: "Be brief." };
  // One FIXED token: each host has its own patch, so both creates accept the
  // same id and the two results/patches are directly comparable.
  tokenSource.next = () => "deadbe00";
  try {
    const http = await hostA.drive("/section/create", "POST", fixture);
    assert.equal(http.status, 200, JSON.stringify(http.body));
    const remote = await gateway.invokeRpc("promptProfiles/sectionCreate", { args: { input: fixture } });
    assert.equal(remote.ok, true, JSON.stringify(remote));
    const { ok, ...httpResult } = http.body;
    assert.deepEqual(remote.value, httpResult, "the Remote result equals the HTTP result (minus the ok envelope)");
    assert.equal(await readFile(patchB.path, "utf8"), await readFile(patchA.path, "utf8"), "both transports produce a byte-identical patch");

    // read paths agree too
    const httpState = await hostA.drive("/state");
    const remoteState = await gateway.invokeRpc("promptProfiles/state", { args: { input: {} } });
    assert.equal(remoteState.ok, true);
    assert.deepEqual(remoteState.value.sections, httpState.body.sections);
    assert.equal(remoteState.value.revision, httpState.body.revision);
  } finally {
    tokenSource.next = original;
  }
  await fiberA.dispose();
  await fiberB.dispose();
  await gatewayFiber.dispose();
  await registryFiber.dispose();
  await patchA.cleanup();
  await patchB.cleanup();
});
// #endregion TEST_typertRemote
