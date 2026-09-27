/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the main host plugin survives FIRST INSTALL: module
 *   evaluation builds the storage-domain spec with Zod (the protocol
 *   dsh-storage-domain reopens through valueSchema.parse), the plugin
 *   constructs against stubbed DSH services, and the assembler wiring seals
 *   final text with interpolate:false while pinning the per-session decision
 *   in memory.
 * @scope node:test with a stubbed Cordis context and fake storageDomain;
 *   NOT: the real loader lifecycle or client behavior.
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import plugin, { promptProfilesDomain } from "../lib/index.js";

// #region FUNC_stubContext
/** @purpose Stand in for a Cordis context: record inject callbacks so tests
 *  can fire them with fake child services, and no-op everything else. */
function stubContext() {
  const injections = [];
  const ctx = {
    inject: (deps, callback) => {
      injections.push({ deps, callback });
      return () => {};
    },
    effect: (dispose) => dispose,
    on: () => () => {},
    get: () => undefined,
    reflect: { provide: () => {} },
    logger: { debug() {}, warn() {} },
  };
  ctx.injections = injections;
  return ctx;
}
// #endregion FUNC_stubContext

/** @purpose Schemastery has no `.nullable()` — the spec must build at module
 *  evaluation (the import above already proves it) and satisfy the
 *  storage-domain protocol (Zod record schemas reopened via
 *  `valueSchema.parse`). */
test("module evaluates; the domain spec is the Zod protocol dsh-storage-domain parses", () => {
  const table = promptProfilesDomain.tables.sessions;
  assert.equal(typeof table.valueSchema.parse, "function", "records reopen through valueSchema.parse (Zod)");
  assert.equal(promptProfilesDomain.layout, "per-record", "one document per session, not a whole-unit rewrite");
  const record = { sections: [{ id: "x", order: 1050, text: "final text" }] };
  assert.deepEqual(table.valueSchema.parse(record), record);
  // A record written before the trim (version 1, carrying `profileId` and a
  // per-section `title`) still parses: Zod objects strip unknown keys, so the
  // existing file needs no version bump and no migration.
  const legacy = {
    profileId: "light",
    sections: [{ id: "x", title: "X", order: 1050, text: "final text" }],
  };
  assert.deepEqual(table.valueSchema.parse(legacy), record);
  assert.throws(() => table.valueSchema.parse({ sections: [{ id: "x", order: "many", text: "t" }] }));
  assert.throws(() => table.valueSchema.parse({ sections: [{ id: "x", order: 1 }] }));
});

/** @purpose The service constructs and degrades with every DSH service stubbed. */
test("plugin constructs against stubbed DSH services", () => {
  const ctx = stubContext();
  const service = new plugin(ctx, { default: { get: () => "" }, lastByWorkspace: { get: () => ({}) } });
  assert.equal(typeof service.registerSection, "function");
  assert.equal(typeof service.builtinOrders(), "object");
  const dispose = service.registerSection({
    rowId: "row-tone",
    config: { id: "tone", title: { get: () => "Tone" }, body: { get: () => "Be brief." } },
    source: "bundle",
  });
  assert.deepEqual(
    service.sections().map((row) => row.title),
    ["Tone"],
  );
  dispose();
});

// #region FUNC_reloadContext
/** @purpose Reload stand: effect disposers are COLLECTED (like cordis), the injected typert registry throws on a duplicate endpoint (like the real TypertRegistry), and info/warn logs are captured. */
function reloadContext() {
  const endpoints = new Map();
  const effects = [];
  const logs = [];
  let typertInject = null;
  const typert = {
    register(contribution) {
      const keys = contribution.invocations.map((descriptor) => `${descriptor.namespace}/${descriptor.method}`);
      for (const key of keys) {
        if (endpoints.has(key)) throw new Error(`typert: endpoint ${key} is already registered`);
      }
      for (const [index, key] of keys.entries()) endpoints.set(key, contribution.invocations[index]);
      return () => {
        for (const key of keys) endpoints.delete(key);
      };
    },
  };
  const logger = {
    debug() {},
    info: (message) => logs.push({ level: "info", message }),
    warn: (message) => logs.push({ level: "warn", message }),
    error: (message) => logs.push({ level: "error", message }),
  };
  const collect = (callback) => {
    const dispose = callback();
    if (typeof dispose === "function") effects.push(dispose);
    return dispose;
  };
  const child = {
    typert,
    logger,
    get: () => undefined,
    settings: { configure: () => () => {} },
    configEditor: { documentPath: "/nonexistent-dsh-reload/cordis.patch.yml" },
    effect: collect,
    on: () => () => {},
    // The delegating Remote service itself is Cordis machinery; the reload
    // concern here is the contribution lifetime, so the fiber is a recorder.
    plugin: () => ({ dispose() {} }),
  };
  const ctx = {
    inject: (deps, callback) => {
      if (deps.includes("typert")) typertInject = callback;
      return () => {};
    },
    effect: collect,
    on: () => () => {},
    get: () => undefined,
    reflect: { provide: () => {} },
    logger,
  };
  return { ctx, child, endpoints, effects, logs, mountRemote: () => typertInject?.(child) };
}
// #endregion FUNC_reloadContext

/** @purpose HMR reload: mount → dispose the effects (as the loader does) → mount the SAME inject callback again; the Remote contribution must leave and come back without a duplicate-endpoint failure. */
test("plugin mounts, disposes and remounts without duplicate-endpoint failures", async () => {
  const lc = reloadContext();
  const config = { default: { get: () => "" }, lastByWorkspace: { get: () => ({}) } };
  new plugin(lc.ctx, config);
  lc.mountRemote(); // mount #1: fire the recorded typert inject callback
  const firstCount = lc.endpoints.size;
  assert.equal(firstCount, 11, "all eleven Remote endpoints registered on mount");
  // HMR unmount: run every collected effect disposer.
  for (const dispose of lc.effects.splice(0).reverse()) await dispose();
  assert.equal(lc.endpoints.size, 0, "contribution withdrawn on unmount");
  // HMR remount of the same row (same child services).
  lc.mountRemote();
  assert.equal(lc.endpoints.size, firstCount, "the same endpoints are back, no duplicate failure");
  assert.ok(
    !lc.logs.some((entry) => /contribution rejected/.test(entry.message)),
    "no registration failure logged on a clean reload",
  );
  assert.ok(
    lc.logs.some((entry) => /remote: mounted/.test(entry.message)),
    "mount logged at info",
  );
});

/** @purpose End-to-end smoke over the real listener: fake volatile config,
 *  fake storageDomain table, one profile section — the workspace key resolves
 *  to the SAME id the chip writes, the sealed text is interpolated once,
 *  inserted with interpolate:false, the decision is logged at info, and it
 *  survives a storage outage on the next step. */
test("assembler resolves the workspace key, seals and logs the decision, and pins it across a storage outage", async () => {
  const logs = [];
  const records = new Map();
  let openFails = false;
  const table = {
    get: (id) => records.get(id),
    put: async (id, snapshot) => {
      records.set(id, snapshot);
    },
  };
  const domain = { table: () => table, close: async () => {} };
  let assemble = null;
  const config = {
    default: { get: () => "" },
    lastByWorkspace: { get: () => ({ "ws-session": "light" }) },
  };
  const ctx = stubContext();
  const service = new plugin(ctx, config);
  service.registerSection({
    rowId: "row-cwd",
    config: { id: "cwd-note", title: { get: () => "Cwd" }, body: { get: () => "Work in {{cwd}}." } },
    source: "bundle",
  });
  service.registerProfile({
    rowId: "row-light",
    config: {
      id: "light",
      title: { get: () => "Light" },
      sections: { get: () => [{ id: "cwd-note", order: 1050 }] },
    },
    source: "bundle",
  });
  // Fire the assembler injection with fake child services. The registry's
  // membership is what the client chip matches on; resolveByPath is ASYNC
  // (a plain object here masked the live missing-await bug).
  const resolveCalls = [];
  const workspaceRegistry = {
    list: () => [{ id: "ws-session", sessionIds: ["s1"] }],
    resolveByPath: async (path) => {
      resolveCalls.push(path);
      return { id: "ws-path" };
    },
  };
  const assembler = ctx.injections.find(({ deps }) => deps.includes("storageDomain"));
  assert.ok(assembler, "assembler injection declared");
  assembler.callback({
    storageDomain: {
      open: async () => {
        if (openFails) throw new Error("storage down");
        return domain;
      },
    },
    workspaceRegistry,
    on: (_event, handler) => {
      assemble = handler;
      return () => {};
    },
    effect: (thunk) => thunk(),
    logger: {
      debug: (message, details) => logs.push({ level: "debug", message, details }),
      info: (message, details) => logs.push({ level: "info", message, details }),
      warn: (message, details) => logs.push({ level: "warn", message, details }),
    },
  });
  assert.ok(assemble, "system-prompt/assemble listener registered");
  const agent = { session: { id: "s1", header: { cwd: "/proj", origin: "web" } } };
  const runAssembly = async (variables) => {
    const state = { sections: [{ name: "tool:bash", text: "T" }], variables };
    await assemble(state, { agent }, () => {});
    return state;
  };
  openFails = true; // first assembly happens while storage is down
  const first = await runAssembly({ cwd: "/first" });
  assert.deepEqual(first.sections, [
    { name: "tool:bash", text: "T" },
    { name: "prompt-profile:cwd-note", text: "Work in /first.", interpolate: false },
  ]);
  assert.equal(
    logs.some((entry) => /pinned in memory/.test(entry.message)),
    true,
  );
  // The seal line the user can send when a chip choice does not reach the prompt.
  const seal = logs.find((entry) => entry.message === "prompt-profiles seal");
  assert.ok(seal, "seal diagnostics logged");
  assert.equal(seal.level, "info");
  assert.equal(seal.details.sessionId, "s1");
  assert.equal(seal.details.workspaceKey, "ws-session", "session membership wins over path resolution");
  assert.equal(seal.details.profileId, "light");
  assert.equal(seal.details.selected, 1);
  assert.equal(seal.details.skipped, 0);
  assert.deepEqual(seal.details.sectionIds, ["cwd-note"]);
  assert.deepEqual(resolveCalls, ["/proj"], "the path is collected as a FALLBACK candidate even when membership wins");
  const inserted = logs.find((entry) => entry.message === "prompt-profiles inserted");
  assert.ok(inserted, "insertion order logged");
  assert.deepEqual(inserted.details.inserted, [{ name: "prompt-profile:cwd-note", index: 1 }]);
  // Later step: storage recovered, variables changed — the sealed text is
  // identical and now persisted (decision made once, kept stable).
  openFails = false;
  config.lastByWorkspace = { get: () => ({ "ws-session": "other" }) };
  const second = await runAssembly({ cwd: "/second" });
  assert.deepEqual(second.sections, first.sections);
  assert.deepEqual(records.get("s1").sections, [{ id: "cwd-note", order: 1050, text: "Work in /first." }]);
  // A literal `{{` body would be skipped at seal time — nothing render-hostile
  // is ever persisted or inserted.
  service.registerSection({
    rowId: "row-bad",
    config: { id: "bad", title: { get: () => "Bad" }, body: { get: () => "Uses {{unknown}} var" } },
    source: "bundle",
  });
  const third = await runAssembly({ cwd: "/first" });
  assert.equal(third.sections.length, 2, "uninterpolatable section skipped, existing snapshot untouched");
});

/** @purpose With no session membership the key must come from the ASYNC
 *  resolveByPath result — the missing `await` was the live injection bug. */
test("assembler falls back to the async resolveByPath workspace id", async () => {
  const logs = [];
  const records = new Map();
  const table = {
    get: (id) => records.get(id),
    put: async (id, snapshot) => {
      records.set(id, snapshot);
    },
  };
  let assemble = null;
  const config = { default: { get: () => "" }, lastByWorkspace: { get: () => ({ "ws-path": "light" }) } };
  const ctx = stubContext();
  const service = new plugin(ctx, config);
  service.registerSection({
    rowId: "row-tone",
    config: { id: "tone", title: { get: () => "Tone" }, body: { get: () => "Be brief." } },
    source: "bundle",
  });
  service.registerProfile({
    rowId: "row-light",
    config: { id: "light", title: { get: () => "Light" }, sections: { get: () => [{ id: "tone", order: 1050 }] } },
    source: "bundle",
  });
  const assembler = ctx.injections.find(({ deps }) => deps.includes("storageDomain"));
  assembler.callback({
    storageDomain: { open: async () => ({ table: () => table, close: async () => {} }) },
    workspaceRegistry: {
      list: () => [{ id: "ws-other", sessionIds: ["someone-else"] }],
      resolveByPath: async () => ({ id: "ws-path" }),
    },
    on: (_event, handler) => {
      assemble = handler;
      return () => {};
    },
    effect: (thunk) => thunk(),
    logger: { debug() {}, info: (message, details) => logs.push({ message, details }), warn() {} },
  });
  const state = { sections: [{ name: "tool:bash", text: "T" }], variables: {} };
  await assemble(state, { agent: { session: { id: "s2", header: { cwd: "/proj" } } } }, () => {});
  assert.deepEqual(
    state.sections,
    [
      { name: "tool:bash", text: "T" },
      { name: "prompt-profile:tone", text: "Be brief.", interpolate: false },
    ],
    "the awaited path-resolved workspace id reaches resolveProfileId",
  );
  const seal = logs.find((entry) => entry.message === "prompt-profiles seal");
  assert.equal(seal.details.workspaceKey, "ws-path");
  assert.equal(seal.details.profileId, "light");
});

/** @purpose Compatibility: a legacy PATH-keyed choice reaches a session whose workspace resolves to a UUID (candidates walked in order). */
test("assembler finds a legacy path-keyed choice under a UUID-resolved workspace", async () => {
  const logs = [];
  const records = new Map();
  const table = {
    get: (id) => records.get(id),
    put: async (id, snapshot) => {
      records.set(id, snapshot);
    },
  };
  let assemble = null;
  // The choice exists ONLY under the old path key.
  const config = { default: { get: () => "" }, lastByWorkspace: { get: () => ({ "/proj": "light" }) } };
  const ctx = stubContext();
  const service = new plugin(ctx, config);
  service.registerSection({
    rowId: "row-tone",
    config: { id: "tone", title: { get: () => "Tone" }, body: { get: () => "Be brief." } },
    source: "bundle",
  });
  service.registerProfile({
    rowId: "row-light",
    config: { id: "light", title: { get: () => "Light" }, sections: { get: () => [{ id: "tone", order: 1050 }] } },
    source: "bundle",
  });
  const assembler = ctx.injections.find(({ deps }) => deps.includes("storageDomain"));
  assembler.callback({
    storageDomain: { open: async () => ({ table: () => table, close: async () => {} }) },
    workspaceRegistry: { list: () => [], resolveByPath: async () => ({ id: "uuid-1" }) },
    on: (_event, handler) => {
      assemble = handler;
      return () => {};
    },
    effect: (thunk) => thunk(),
    logger: { debug() {}, info: (message, details) => logs.push({ message, details }), warn() {} },
  });
  const state = { sections: [{ name: "tool:bash", text: "T" }], variables: {} };
  await assemble(state, { agent: { session: { id: "s-path", header: { cwd: "/proj" } } } }, () => {});
  assert.deepEqual(
    state.sections,
    [
      { name: "tool:bash", text: "T" },
      { name: "prompt-profile:tone", text: "Be brief.", interpolate: false },
    ],
    "the legacy path choice still reaches the prompt",
  );
  const seal = logs.find((entry) => entry.message === "prompt-profiles seal");
  assert.equal(seal.details.workspaceKey, "uuid-1", "diagnostics report the first (UUID) candidate");
  assert.equal(seal.details.profileId, "light");
});

/** @purpose LIVE REGRESSION: source must resolve through the inject-free
 *  `ctx.get('configEditor')` — `this.ctx.configEditor` was undefined on the
 *  service's own context, so every registered row showed `unknown`. */
test("registerSection resolves source through ctx.get('configEditor') without injection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-source-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(
    patchPath,
    [
      "- insert:",
      "    - id: prompt-section-old-slug",
      '      name: "@knopki/dsh-prompt-profiles/section"',
      "      config: { id: old-slug, title: T, body: B }",
    ].join("\n"),
    { mode: 0o600 },
  );
  try {
    const ctx = stubContext();
    // No injected configEditor property — only the reflect accessor.
    ctx.get = (name) => (name === "configEditor" ? { documentPath: patchPath } : undefined);
    const service = new plugin(ctx, { default: { get: () => "" }, lastByWorkspace: { get: () => ({}) } });
    service.registerSection({
      rowId: "include:prompt-section-old-slug",
      config: { id: "old-slug", title: { get: () => "T" }, body: { get: () => "B" } },
    });
    service.registerSection({
      rowId: "prompt-section-bundle",
      config: { id: "prompt-section-bundle", title: { get: () => "X" }, body: { get: () => "Y" } },
    });
    const sources = Object.fromEntries(service.sections().map((row) => [row.id, row.source]));
    assert.equal(sources["old-slug"], "user", "qualified loader id matched the patch insert");
    assert.equal(sources["prompt-section-bundle"], "unknown", "a row absent from the patch is unresolved");
    // Without configEditor the source degrades to unknown, never throws.
    const bare = new plugin(stubContext(), { default: { get: () => "" }, lastByWorkspace: { get: () => ({}) } });
    bare.registerSection({
      rowId: "prompt-section-x",
      config: { id: "prompt-section-x", title: { get: () => "T" }, body: { get: () => "B" } },
    });
    assert.equal(bare.sections()[0].source, "unknown");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
