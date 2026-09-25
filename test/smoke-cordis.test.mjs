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
 * @invariants The plugin must MOUNT (never throw) with any subset of
 *   webServer/settings/configEditor present; routes are registered exactly
 *   when all three exist; a dispose+remount is clean; optional services are
 *   read through `ctx.get` inside try/catch.
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PromptProfilesPlugin } from "../lib/index.js";
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
/** @purpose One real Cordis root context plus stub service instances provided by a real plugin fiber (like the host's own rows). */
function stubHost(names) {
  const routes = new Map();
  const logs = [];
  const values = {
    webServer: {
      register(route) {
        if (routes.has(route.path)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
        routes.set(route.path, route.handler);
        return () => routes.delete(route.path);
      },
    },
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 1 }],
      mutate: async () => {},
      replace: async () => {},
      configure: () => () => {},
    },
    configEditor: { documentPath: "/nonexistent-cordis-smoke/cordis.patch.yml" },
    storageDomain: {
      open: async () => ({ table: () => ({ get: () => undefined, put: async () => {} }), close: async () => {} }),
    },
    workspaceRegistry: { list: () => [], resolveByPath: async () => undefined, get: () => undefined },
    connection: { admit: async () => ({ peer: { id: "smoke" } }) },
  };
  const ctx = new Context();
  ctx.logger = {
    debug() {},
    info: (message) => logs.push({ level: "info", message }),
    warn: (message) => logs.push({ level: "warn", message }),
    error: (message) => logs.push({ level: "error", message }),
  };
  const stubs = ctx.plugin({
    name: "smoke-stubs",
    apply(child) { for (const name of names) child.provide(name, values[name]); },
  });
  return { ctx, stubs, routes, logs, values };
}

/** @purpose Mount the real plugin row and return its fiber. */
async function mountPlugin(ctx) {
  const fiber = ctx.plugin(PromptProfilesPlugin, { default: "", lastByWorkspace: {} });
  await fiber.await();
  return fiber;
}
// #endregion FUNC_stubHost

// #region TEST_mount
/** @purpose The real runtime mounts our ESM entry, activates the service and registers every route. */
test("real Cordis: the plugin mounts and registers its routes", { skip: missingCordis }, async () => {
  const host = stubHost(["webServer", "settings", "configEditor", "storageDomain", "workspaceRegistry", "connection"]);
  await host.stubs.await();
  assert.equal(PromptProfilesPlugin.inject.length, 0, "the row declares no mandatory injections");
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.routes.size >= 10, `all routes registered (got ${host.routes.size})`);
  assert.ok(host.routes.has("/__dsh-prompt-profiles/state"), "/state registered");
  assert.ok(host.ctx.get("promptProfiles"), "the promptProfiles service is provided");
  assert.ok(host.logs.some((entry) => entry.level === "info" && /api: mounted/.test(entry.message)), "mount logged at info");
  await fiber.dispose();
  assert.equal(host.routes.size, 0, "dispose removes every route");
});

/** @purpose SPEC degradation: the row must MOUNT (never throw) with any subset of the API services. */
test("real Cordis: missing webServer/settings/configEditor degrade instead of failing the mount", { skip: missingCordis }, async () => {
  for (const names of [
    ["settings", "configEditor"],
    ["webServer", "configEditor"],
    ["webServer", "settings"],
    [],
  ]) {
    const host = stubHost(names);
    await host.stubs.await();
    const fiber = await mountPlugin(host.ctx); // must NOT throw
    assert.equal(host.routes.size, 0, `no routes without all three (provided: ${names.join(",") || "none"})`);
    await fiber.dispose();
  }
});

/** @purpose Reload semantics on the real runtime: dispose → remount restores the same routes; a second mount without disposing fails on the service name (expected). */
test("real Cordis: dispose and remount is clean; a non-disposed double mount fails on the service name", { skip: missingCordis }, async () => {
  const host = stubHost(["webServer", "settings", "configEditor"]);
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

// #endregion TEST_mount

/** @purpose The subpath rows consume the service for real: mounting `lib/section.js` + `lib/profile.js` registers rows in the registry. */
test("real Cordis: section and profile rows mount against the live service", { skip: missingCordis }, async () => {
  const host = stubHost(["webServer", "settings", "configEditor"]);
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
// #region TEST_ctxGet
/** @purpose Requirement check: on the real runtime `ctx.get(name)` returns undefined for an absent service (it does NOT throw in cordis 4.0.4), and every optional read in our code is guarded regardless. */
test("real Cordis: ctx.get for absent services, and every optional read is guarded", { skip: missingCordis }, async () => {
  const host = stubHost(["webServer", "settings", "configEditor"]);
  await host.stubs.await();
  assert.equal(host.ctx.get("definitelyMissing"), undefined, "absent service via ctx.get -> undefined (cordis 4.0.4 semantics: it does NOT throw)");
  assert.equal(host.ctx.definitelyMissing, undefined, "absent service as a property -> undefined too (no throw on this cordis)");
  assert.ok(host.ctx.logger !== undefined, "ctx.logger is a built-in accessor, present without any provide");
  // No agentPresets / connection / workspaceRegistry / hmr / storageDomain:
  // the mount must still succeed and the OPTIONAL probes must not throw.
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.routes.size > 0);
  assert.ok(host.logs.some((entry) => entry.level === "warn" && /connection\.admit unavailable/.test(entry.message)),
    "the missing platform-auth service is reported, not swallowed");
  await fiber.dispose();
});
// #endregion TEST_ctxGet
