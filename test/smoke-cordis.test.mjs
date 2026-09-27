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
 *   NOT the transport carrier.
 * @invariants The plugin always MOUNTS, whatever optional service is missing;
 *   its Remote contribution registers exactly eleven endpoints and is
 *   withdrawn with the plugin fiber; a missing typert service is reported,
 *   never silent.
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOperations, tokenSource } from "../lib/application/index.js";
import { PromptProfilesPlugin } from "../lib/index.js";
import { createHostPorts } from "../lib/infra/index.js";
import * as profileRow from "../lib/profile.js";
import * as sectionRow from "../lib/section.js";

let TypertRegistry = null;
let typertRegistryError = null;
try {
  ({ TypertRegistry } = await import("@deepseek-ai/dsh-typert-registry"));
} catch (error) {
  typertRegistryError = error;
}
const missingTypert =
  typertRegistryError === null
    ? false
    : `@deepseek-ai/dsh-typert-registry not resolvable: ${typertRegistryError.message}`;

let TypertGatewayService = null;
let gatewayError = null;
try {
  ({ TypertGatewayService } = await import("@deepseek-ai/dsh-api-gateway"));
} catch (error) {
  gatewayError = error;
}
const missingGateway =
  gatewayError === null ? false : `@deepseek-ai/dsh-api-gateway not resolvable: ${gatewayError.message}`;

let Context = null;
let cordisError = null;
try {
  ({ Context } = await import("@deepseek-ai/cordis"));
} catch (error) {
  cordisError = error;
}
const missingCordis =
  cordisError === null ? false : `@deepseek-ai/cordis not resolvable from the bundle: ${cordisError.message}`;

/** @purpose One real Cordis root context plus stub service instances provided by a real plugin fiber (like the host's own rows). Omitting a name emulates a surface without that service. */
function stubHost(names, { patchPath = "/nonexistent-cordis-smoke/cordis.patch.yml" } = {}) {
  const logs = [];
  const values = {
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
    apply(child) {
      for (const name of names) child.provide(name, values[name]);
    },
  });
  return { ctx, stubs, logs, values };
}

/** @purpose A real, writable patch file for the writer-backed operations. */
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

/** @purpose The operation set of a mounted plugin, read the way a surface reads it (guarded REFLECT per call). */
function operationsOf(ctx) {
  const ops = createOperations(
    createHostPorts({
      service: ctx.get("promptProfiles"),
      getService: (name) => {
        try {
          return ctx.get(name) ?? undefined;
        } catch {
          return undefined;
        }
      },
    }),
  );
  return ops;
}

/** @purpose With every optional service present: the plugin mounts, its operations read and write for real, and disposal removes the service. */
test("real Cordis: with every service the shared operations read and write for real", {
  skip: missingCordis,
}, async () => {
  const patch = await makePatch();
  const host = stubHost(["settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], {
    patchPath: patch.path,
  });
  await host.stubs.await();
  assert.equal(PromptProfilesPlugin.inject.length, 0, "the row declares no mandatory injections");
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.ctx.get("promptProfiles"), "the promptProfiles service is provided");
  const ops = operationsOf(host.ctx);
  const state = await ops.state();
  assert.equal(state.revision, 1, "settings revision read");
  const created = await ops.sectionCreate({ title: "T", body: "B" });
  assert.match(created.patchId, /^prompt-section-[0-9a-f]{8}$/, "the operation writes through the real writer");
  await fiber.dispose();
  assert.equal(host.ctx.get("promptProfiles"), undefined, "dispose removes the service");
  await patch.cleanup();
});

/** @purpose With NO optional service: the plugin must still mount (the loader-level failure this test exists for). */
test("real Cordis: the plugin mounts with no optional service at all", { skip: missingCordis }, async () => {
  const host = stubHost([]);
  await host.stubs.await();
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.ctx.get("promptProfiles"), "the service is provided without settings/configEditor/storage");
  const state = await operationsOf(host.ctx).state();
  assert.equal(state.revision, null, "no settings -> revision null, not a failure");
  assert.deepEqual(state.profiles, []);
  await fiber.dispose();
});

/** @purpose Reload semantics on the real runtime: dispose → remount restores the same contribution; a second mount without disposing fails on the service name (expected). */
test("real Cordis: dispose and remount is clean; a non-disposed double mount fails on the service name", {
  skip: missingCordis || missingTypert,
}, async () => {
  const host = stubHost(["settings", "configEditor"]);
  await host.stubs.await();
  const registryFiber = host.ctx.plugin(TypertRegistry);
  await registryFiber.await();
  const first = await mountPlugin(host.ctx);
  await waitFor(() => host.ctx.typert.local.get("promptProfiles/state") !== undefined, { label: "first contribution" });
  await first.dispose();
  assert.equal(host.ctx.typert.local.get("promptProfiles/state"), undefined, "disposal withdraws the endpoints");
  const second = await mountPlugin(host.ctx);
  await waitFor(() => host.ctx.typert.local.get("promptProfiles/state") !== undefined, {
    label: "remounted contribution",
  });
  await assert.rejects(mountPlugin(host.ctx), /has been registered/, "a second live mount is a service-name conflict");
  await second.dispose();
  await registryFiber.dispose();
});

/** @purpose The subpath rows consume the service for real: mounting `lib/section.js` + `lib/profile.js` registers rows in the registry. */
test("real Cordis: section and profile rows mount against the live service", { skip: missingCordis }, async () => {
  const host = stubHost(["settings", "configEditor"]);
  await host.stubs.await();
  const main = await mountPlugin(host.ctx);
  const section = host.ctx.plugin(sectionRow, { id: "tone", title: "Tone", body: "Be brief." });
  const profile = host.ctx.plugin(profileRow, { id: "light", title: "Light", sections: [{ id: "tone", order: 1050 }] });
  await section.await();
  await profile.await();
  const service = host.ctx.get("promptProfiles");
  assert.deepEqual(
    service.sections().map((row) => row.id),
    ["tone"],
  );
  assert.deepEqual(
    service.profiles().map((row) => row.id),
    ["light"],
  );
  await section.dispose();
  assert.deepEqual(service.sections(), [], "row disposal unregisters the section");
  await profile.dispose();
  await main.dispose();
});

/** @purpose Requirement check: on the real runtime `ctx.get(name)` returns undefined for an absent service (it does NOT throw in cordis 4.0.4), and every optional read in our code is guarded. */
test("real Cordis: ctx.get for absent services, and every optional read is guarded", {
  skip: missingCordis,
}, async () => {
  const host = stubHost([]);
  await host.stubs.await();
  assert.equal(
    host.ctx.get("definitelyMissing"),
    undefined,
    "absent service via ctx.get -> undefined (cordis 4.0.4 semantics: it does NOT throw)",
  );
  assert.equal(
    host.ctx.definitelyMissing,
    undefined,
    "absent service as a property -> undefined too (no throw on this cordis)",
  );
  assert.ok(host.ctx.logger !== undefined, "ctx.logger is a built-in accessor, present without any provide");
  const fiber = await mountPlugin(host.ctx);
  assert.ok(host.ctx.get("promptProfiles"), "the plugin mounts with every optional read absent");
  await fiber.dispose();
});

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
test("real typert registry: contribution registers, 11 strict endpoints visible, dispose withdraws", {
  skip: missingCordis || missingTypert,
}, async () => {
  const patch = await makePatch();
  const host = stubHost(["settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], {
    patchPath: patch.path,
  });
  await host.stubs.await();
  const registryFiber = host.ctx.plugin(TypertRegistry);
  await registryFiber.await();
  assert.equal(typeof host.ctx.typert.register, "function", "the real registry exposes ctx.typert.register");
  const fiber = await mountPlugin(host.ctx);
  await waitFor(() => host.ctx.typert.local.get("promptProfiles/state") !== undefined, {
    label: "promptProfiles/state endpoint",
  });
  const endpoints = host.ctx.typert.local.list().map((descriptor) => `${descriptor.namespace}/${descriptor.method}`);
  const ours = endpoints.filter((endpoint) => endpoint.startsWith("promptProfiles/"));
  assert.deepEqual(
    ours.sort(),
    [
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
    ],
    "exactly the eleven endpoints are registered",
  );
  assert.ok(
    host.logs.some(
      (entry) => entry.level === "info" && /remote: mounted/.test(entry.message) && entry.details?.methods === 11,
    ),
    "remote mount logged at info with 11 methods",
  );
  await fiber.dispose();
  assert.equal(
    host.ctx.typert.local.get("promptProfiles/state"),
    undefined,
    "plugin disposal withdraws the strict endpoints",
  );
  await registryFiber.dispose();
  await patch.cleanup();
});

/** @purpose Without a typert service the plugin still mounts and the missing Remote surface is reported at error level. */
test("real Cordis: no typert service degrades loudly (error log)", { skip: missingCordis }, async () => {
  const host = stubHost(["settings", "configEditor"]);
  await host.stubs.await();
  const fiber = await mountPlugin(host.ctx);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const zero = host.logs.find(
    (entry) => entry.level === "error" && /remote: mounted ZERO remote endpoints/.test(entry.message),
  );
  assert.ok(zero, "missing typert reported at error level after the settle window");
  await fiber.dispose();
});

/** @purpose REAL gateway dispatch: strict codecs reject malformed input (missing/extra/wrong-type) without touching the patch; a valid call mutates it exactly like the shared operations; business errors surface as Remote failures. */
test("real gateway: strict rejection leaves the patch untouched; a valid Remote call matches the shared operations byte-for-byte", {
  skip: missingCordis || missingTypert || missingGateway,
}, async () => {
  const patchA = await makePatch();
  const patchB = await makePatch();
  const hostA = stubHost(["settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], {
    patchPath: patchA.path,
  });
  const hostB = stubHost(["settings", "configEditor", "storageDomain", "workspaceRegistry", "agentPresets"], {
    patchPath: patchB.path,
  });
  await hostA.stubs.await();
  await hostB.stubs.await();
  const fiberA = await mountPlugin(hostA.ctx);
  const registryFiber = hostB.ctx.plugin(TypertRegistry);
  await registryFiber.await();
  const gatewayFiber = hostB.ctx.plugin(TypertGatewayService, {
    websocketHeartbeatIntervalMs: 30000,
    streamInboxBytes: 1048576,
  });
  await gatewayFiber.await();
  const gateway = hostB.ctx.get("typertGateway");
  assert.ok(gateway, "the real typertGateway service mounted");
  const fiberB = await mountPlugin(hostB.ctx);
  await waitFor(() => hostB.ctx.typert.local.get("promptProfiles/sectionCreate") !== undefined, {
    label: "remote contribution",
  });

  // --- malformed input: rejected by the STRICT codecs, patch byte-identical.
  const before = await readFile(patchB.path, "utf8");
  const wrongArgs = await gateway.invokeRpc("promptProfiles/state", { args: {} });
  assert.equal(wrongArgs.ok, false, "missing wire field input is a Remote failure");
  assert.match(wrongArgs.error.message, /missing "input"/);
  const missingField = await gateway.invokeRpc("promptProfiles/sectionUpdate", { args: { input: {} } });
  assert.equal(missingField.ok, false, "missing required field rejected");
  const extraField = await gateway.invokeRpc("promptProfiles/sectionDelete", {
    args: { input: { rowId: "x", bogus: 1 } },
  });
  assert.equal(extraField.ok, false, "extra field rejected");
  const wrongType = await gateway.invokeRpc("promptProfiles/sectionCreate", { args: { input: { title: 5 } } });
  assert.equal(wrongType.ok, false, "wrong type rejected");
  assert.match(wrongType.error.message, /boundary validation|input/i);
  assert.equal(await readFile(patchB.path, "utf8"), before, "the patch file is byte-identical after every rejection");

  // --- business error surfaces as a Remote failure, not a silent success.
  const notRegistered = await gateway.invokeRpc("promptProfiles/profileUpdate", {
    args: { input: { rowId: "ghost", value: { title: "T" } } },
  });
  assert.equal(notRegistered.ok, false, "unknown row surfaces as a Remote failure");
  assert.match(notRegistered.error.message, /is not registered/);

  // --- valid call: same fixture, deterministic token, identical outcome for
  //     the shared operations (A) and the Remote surface (B).
  const original = tokenSource.next;
  const fixture = { title: "Tone", body: "Be brief." };
  // One FIXED token: each host has its own patch, so both creates accept the
  // same id and the two results/patches are directly comparable.
  tokenSource.next = () => "deadbe00";
  try {
    const core = await operationsOf(hostA.ctx).sectionCreate(fixture);
    const remote = await gateway.invokeRpc("promptProfiles/sectionCreate", { args: { input: fixture } });
    assert.equal(remote.ok, true, JSON.stringify(remote));
    assert.deepEqual(remote.value, core, "the Remote result equals the shared operation result");
    assert.equal(
      await readFile(patchB.path, "utf8"),
      await readFile(patchA.path, "utf8"),
      "both surfaces produce a byte-identical patch",
    );

    // read paths agree too
    const coreState = await operationsOf(hostA.ctx).state();
    const remoteState = await gateway.invokeRpc("promptProfiles/state", { args: { input: {} } });
    assert.equal(remoteState.ok, true);
    assert.deepEqual(remoteState.value.sections, coreState.sections);
    assert.equal(remoteState.value.revision, coreState.revision);
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
