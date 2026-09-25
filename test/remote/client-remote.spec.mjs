// #region MODULE_CONTRACT
// PURPOSE: Prove the phase-2b CLIENT Remote half on real machinery: the
//   built lib/client.js contribution mounts through the REAL Client Remote
//   service (@deepseek-ai/dsh-api-gateway client face) on a REAL Cordis
//   Context with the REAL dsh-typert-registry, with only the Connection
//   carrier replaced by @deepseek-ai/dsh-remote-mock (the exact seam the
//   platform's whole-client tier binds as `{ rpc: mock.rpc }`).
// SCOPE: Mount, exact wire args at the mock, failure-envelope surfacing into
//   the UI error path (runSave notify), and disposal removing the namespace.
//   NOT covered here (honest limits, see migration log): DOM rendering of the
//   chip/settings page (the published test-runtime ships neither the jsdom
//   slot bench's React doubles for our primitives nor the whole-client
//   `createClientTest`/`webApp` assembly — its published lib/ has only the
//   slot tier and a TestRemote whose $mount rejects by design).
// INVARIANTS: The plugin under test is the BUILT lib/client.js artifact (the
//   same bytes the profile serves), loaded through the ModuleLoader handshake
//   exactly like the browser; assertions are on real gateway-validated calls.
// #endregion MODULE_CONTRACT

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import { ok, RemoteMock } from "@deepseek-ai/dsh-remote-mock";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);

// #region FUNC_loadClientBundle
/**
 * @purpose Load a ModuleLoader-wrapped browser bundle (the built
 *   lib/client.js or the platform's api-gateway client face) the way the
 *   browser does: window.__ModuleLoader__.load({ id, factory }) with the
 *   factory's `require` answered from the bundle's externals table.
 */
function loadClientBundle(sourcePath, requireTable) {
  const source = readFileSync(fileURLToPath(new URL(sourcePath, import.meta.url)), "utf8");
  const modules = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    __ModuleLoader__: {
      load: (module) => {
        modules.set(
          module.id,
          module.factory((id) => requireTable(id)),
        );
      },
    },
  };
  try {
    // biome-ignore lint/security/noGlobalEval: the bench must evaluate the built browser bundle exactly as the ModuleLoader does; only local build output is ever passed in.
    globalThis.eval(source);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  if (modules.size !== 1) throw new Error(`expected exactly one module in ${sourcePath}, got ${modules.size}`);
  return [...modules.values()][0];
}
// #endregion FUNC_loadClientBundle

// #region FUNC_makeBench
/**
 * @purpose Assemble the bench: real Context + real TypertRegistry + the REAL
 *   Client Remote service (api-gateway client face) over a stub Connection
 *   whose rpc is the remote-mock carrier; then mount the BUILT client plugin.
 */
async function makeBench() {
  const mock = RemoteMock.create();
  const ctx = new Context();
  ctx.logger = { debug() {}, info() {}, warn() {}, error() {} };
  const stubs = ctx.plugin({
    name: "bench-stubs",
    apply(child) {
      // The Connection face the gateway client consumes: the mock's rpc
      // carrier (call/open) plus the lifecycle surface the service touches
      // (generation sources, reconnect loop).
      child.provide("connection", {
        rpc: mock.rpc,
        start: () => ({ stop() {} }),
        isLoopback: true,
        generation: {
          getSnapshot: () => ({ host: { home: "/home/mock" } }),
          subscribe: () => () => {},
        },
        registerGenerationSource: () => () => {},
      });
      child.provide("locale", { register() {}, bind: () => (key) => key });
      child.provide("slots", {
        inject(_name, callback) {
          callback();
        },
        register() {
          return () => {};
        },
      });
    },
  });
  await stubs.await();
  const registry = ctx.plugin(TypertRegistry);
  await registry.await();
  const gatewayClient = loadClientBundle("../../node_modules/@deepseek-ai/dsh-api-gateway/lib/client.js", (id) =>
    require(id),
  );
  const gateway = ctx.plugin({ name: "bench-remote", inject: gatewayClient.inject, apply: gatewayClient.apply });
  await gateway.await();
  expect(typeof ctx.remote.$mount, "the real Client Remote service is installed").toBe("function");

  const plugin = loadClientBundle("../../lib/client.js", (id) => {
    if (id === "react") return require("react");
    // The UI primitives are browser-side and never render in this bench; a
    // stub per destructured name keeps the module import honest without
    // pulling the (browser-graph) primitives package into Node.
    if (id === "@deepseek-ai/dsh-client-ui-primitives") {
      return new Proxy({}, { get: (_target, prop) => (prop === "__esModule" ? true : function PrimitiveStub() {}) });
    }
    return require(id);
  });
  const fiber = ctx.plugin(plugin);
  await fiber.await();
  await waitFor(() => ctx.get("remote.promptProfiles") !== undefined, "remote.promptProfiles namespace");
  return {
    ctx,
    mock,
    fiber,
    plugin,
    dispose: async () => {
      await fiber.dispose();
      await gateway.dispose();
      await registry.dispose();
      await stubs.dispose();
    },
  };
}

/** Poll a predicate with a deadline instead of a fixed sleep. */
async function waitFor(predicate, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`waitFor timed out on ${label}`);
}
// #endregion FUNC_makeBench

// #region SECTION_specs
test("the built client contribution mounts: namespace service reachable via inject only", async () => {
  const bench = await makeBench();
  try {
    expect(bench.ctx.get("remote.promptProfiles")).toBeTruthy();
    // Bare access is refused for a fiber that did not declare `remote`:
    // the namespace service is reachable only through ctx.inject.
    let refused = false;
    bench.ctx.inject(["locale"], (scope) => {
      try {
        void scope.remote;
      } catch {
        refused = true;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(refused, "scope.remote without inject throws").toBe(true);
    let answer = null;
    bench.ctx.inject(["remote", "remote.promptProfiles"], (scope) => {
      answer = scope.remote.promptProfiles;
    });
    await waitFor(() => answer !== null, "inject callback");
    expect(typeof answer.state).toBe("function");
  } finally {
    await bench.dispose();
  }
});

test("a call reaches the mock with the exact expected args and unwraps the envelope", async () => {
  const bench = await makeBench();
  try {
    const state = {
      profiles: [
        { rowId: "prompt-profile-light", patchId: "profile-light", configId: "light", title: "Light", sections: [] },
      ],
      sections: [],
      builtinOrders: {},
      modes: [],
      default: "light",
      lastByWorkspace: {},
      revision: 1,
    };
    bench.mock.unary("promptProfiles/state", ok(state));
    bench.mock.unary(
      "promptProfiles/sectionRename",
      ok({
        rowId: "prompt-section-a",
        patchId: "prompt-section-a",
        id: "prompt-section-b",
        affectedProfiles: [],
      }),
    );
    const scope = await new Promise((resolve) => {
      bench.ctx.inject(["remote", "remote.promptProfiles"], resolve);
    });
    const envelope = await scope.remote.promptProfiles.state({});
    expect(envelope.ok).toBe(true);
    expect(envelope.value).toEqual(state);
    // Exact wire args at the mock: one object carrying the strict `input`.
    expect(bench.mock.remote.promptProfiles.state).toHaveBeenCalledWith({ input: {} });
    await scope.remote.promptProfiles.sectionRename({ rowId: "prompt-section-a", id: "prompt-section-b" });
    expect(bench.mock.remote.promptProfiles.sectionRename).toHaveBeenCalledWith({
      input: { rowId: "prompt-section-a", id: "prompt-section-b" },
    });

    // The facade (what the UI consumes) maps onto the same endpoints.
    bench.mock.unary(
      "promptProfiles/preview",
      ok({
        profileId: "light",
        title: "Light",
        sections: [],
        skipped: [],
        variables: {},
      }),
    );
    const api = bench.plugin.remote.makeRemoteApi(scope);
    const preview = await api.preview("light");
    expect(preview.profileId).toBe("light");
    expect(bench.mock.remote.promptProfiles.preview).toHaveBeenCalledWith({ input: { profileId: "light" } });
    const lastResult = await (() => {
      bench.mock.unary("promptProfiles/last", ok({ ok: true }));
      return api.last({ profileId: "light", cwd: "/work/repo" });
    })();
    expect(lastResult).toEqual({ ok: true });
    expect(bench.mock.remote.promptProfiles.last).toHaveBeenCalledWith({
      input: { cwd: "/work/repo", profileId: "light" },
    });
  } finally {
    await bench.dispose();
  }
});

test("a failure envelope surfaces through the UI error path (runSave notify), conflict classified", async () => {
  const bench = await makeBench();
  try {
    bench.mock.unary("promptProfiles/preview", {
      ok: false,
      error: { code: "gateway/internal", message: 'preview: profile "ghost" is not registered', details: {} },
    });
    bench.mock.unary("promptProfiles/sectionUpdate", {
      ok: false,
      error: {
        code: "gateway/internal",
        message: "configuration changed since read (expected revision 7)",
        details: {},
      },
    });
    const scope = await new Promise((resolve) => {
      bench.ctx.inject(["remote", "remote.promptProfiles"], resolve);
    });
    const api = bench.plugin.remote.makeRemoteApi(scope);

    // (1) plain failure: the envelope's message is the Error the UI renders.
    const error = await api.preview("ghost").then(
      () => null,
      (err) => err,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("is not registered");
    expect(error.code).toBe("gateway/internal");
    // The SAME error path runSave feeds: notify receives the message text.
    const notes = [];
    const reloaded = [];
    const okSave = await bench.plugin.runSave(
      () => api.preview("ghost"),
      async () => {
        reloaded.push(1);
      },
      (k) => k,
      (m) => notes.push(m),
    );
    expect(okSave).toBe(false);
    expect(notes.at(-1)).toContain("is not registered");
    expect(reloaded.length).toBe(0);

    // (2) conflict message (no HTTP status crosses the envelope): re-apply
    // once after a reload, exactly like the fetch 409 path.
    notes.length = 0;
    let attempts = 0;
    const conflict = await bench.plugin.runSave(
      async () => {
        attempts += 1;
        if (attempts === 1) await api.sectionUpdate("section-a", { title: "T", body: "B" });
      },
      async () => {
        reloaded.push(1);
      },
      (k) => k,
      (m) => notes.push(m),
    );
    expect(conflict).toBe(true, "the stale-revision message takes the 409 re-apply path");
    expect(attempts).toBe(2);
    expect(reloaded.length).toBe(2);
    expect(notes.length).toBe(0, "a recovered conflict raises no toast");
  } finally {
    await bench.dispose();
  }
});

test("disposing the plugin removes the namespace", async () => {
  const bench = await makeBench();
  expect(bench.ctx.get("remote.promptProfiles")).toBeTruthy();
  await bench.fiber.dispose();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(bench.ctx.get("remote.promptProfiles")).toBeUndefined();
  await bench.mock.assertNoUnmatched();
});
// #endregion SECTION_specs
