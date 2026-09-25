/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the main host plugin survives FIRST INSTALL: module
 *   evaluation builds the storage-domain spec with Zod (the protocol
 *   dsh-storage-domain reopens through valueSchema.parse), the plugin
 *   constructs against stubbed DSH services, and the assembler wiring seals
 *   final text with interpolate:false while pinning the per-session decision
 *   in memory (astra findings A, D, G).
 * @scope node:test with a stubbed Cordis context and fake storageDomain;
 *   NOT: the real loader lifecycle (spike R1/R2 proved that against a live
 *   host) or client behavior (lib/client.js has its own suite).
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import plugin, { promptProfilesDomain } from "../lib/index.js";
import { BUILTIN_ORDERS } from "../lib/builtin-orders.js";

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

// #region TEST_zodDomainSpec
/** @purpose Astra finding A: Schemastery has no `.nullable()` — building this
 *  spec used to throw a TypeError at module evaluation, before mount. The
 *  import above already proves evaluation succeeds; here we additionally
 *  verify the spec satisfies the dsh-storage-domain protocol (Zod record
 *  schemas reopened via `valueSchema.parse`). */
test("module evaluates; the domain spec is the Zod protocol dsh-storage-domain parses", () => {
  const table = promptProfilesDomain.tables.sessions;
  assert.equal(typeof table.valueSchema.parse, "function", "records reopen through valueSchema.parse (Zod)");
  const record = { profileId: null, sections: [{ id: "x", title: "X", order: 1050, text: "final text" }] };
  assert.deepEqual(table.valueSchema.parse(record), record);
  const withProfile = { profileId: "light", sections: [] };
  assert.deepEqual(table.valueSchema.parse(withProfile), withProfile);
  assert.throws(() => table.valueSchema.parse({ profileId: 5, sections: [] }));
  assert.throws(() => table.valueSchema.parse({ profileId: null, sections: [{ id: "x", order: "many" }] }));
});
// #endregion TEST_zodDomainSpec

// #region TEST_construction
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
  assert.deepEqual(service.sections().map((row) => row.title), ["Tone"]);
  dispose();
});
// #endregion TEST_construction

// #region TEST_assemblerWiring
/** @purpose End-to-end smoke over the real listener: fake volatile config,
 *  fake storageDomain table, one profile section — the sealed text is
 *  interpolated once, inserted with interpolate:false, and the in-memory
 *  decision survives a storage outage on the next step. */
test("assembler seals interpolated text with interpolate:false and pins the decision across a storage outage", async () => {
  const warnings = [];
  const records = new Map();
  let openFails = false;
  const table = { get: (id) => records.get(id), put: async (id, snapshot) => { records.set(id, snapshot); } };
  const domain = { table: () => table, close: async () => {} };
  let assemble = null;
  let config = {
    default: { get: () => "" },
    lastByWorkspace: { get: () => ({ ws1: "light" }) },
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
      id: "light", title: { get: () => "Light" },
      sections: { get: () => [{ id: "cwd-note", order: 1050 }] },
    },
    source: "bundle",
  });
  // Fire the assembler injection with fake child services.
  const assembler = ctx.injections.find(({ deps }) => deps.includes("storageDomain"));
  assert.ok(assembler, "assembler injection declared");
  assembler.callback({
    storageDomain: { open: async () => { if (openFails) throw new Error("storage down"); return domain; } },
    workspaceRegistry: { resolveByPath: () => ({ id: "ws1" }) },
    on: (event, handler) => { assemble = handler; return () => {}; },
    effect: (thunk) => thunk(),
    logger: { debug() {}, warn: (message, details) => warnings.push(message) },
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
  assert.equal(warnings.some((message) => /pinned in memory/.test(message)), true);
  // Later step: storage recovered, variables changed — the sealed text is
  // identical and now persisted (decision made once, kept stable).
  openFails = false;
  config.lastByWorkspace = { get: () => ({ ws1: "other" }) };
  const second = await runAssembly({ cwd: "/second" });
  assert.deepEqual(second.sections, first.sections);
  assert.deepEqual(records.get("s1").sections, [{ id: "cwd-note", title: "Cwd", order: 1050, text: "Work in /first." }]);
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
// #endregion TEST_assemblerWiring
