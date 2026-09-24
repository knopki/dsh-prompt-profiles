/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin pure profile resolution, scope filtering, insertion order, and durable-first sealing without a live host.
 * @scope node:test using fake agents, assembly arrays, and storage; NOT: live Cordis lifecycle.
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProfileId, buildSnapshot, planInsertion, isSubagent, isFork, sealSnapshot, retryingCache } from "../lib/resolve.js";
import { builtinOrdersByName } from "../lib/builtin-orders.js";

const orders = builtinOrdersByName();
const sections = new Map([
  ["inherited", { title: "Inherited", body: "Always" }],
  ["main", { title: "Main", body: "Main only" }],
  ["child", { title: "Child", body: "Child only" }],
  ["blank", { title: "Blank", body: " \n " }],
  ["disabled", { title: "Disabled", body: "Ignored", disabled: true }],
]);
const profile = { id: "light", sections: [
  { id: "inherited", order: 1100 }, { id: "main", order: 1200, scope: "main-only" },
  { id: "child", order: 1300, scope: "subagents-only" },
  { id: "blank", order: 1400 }, { id: "missing", order: 1500 }, { id: "disabled", order: 1600 },
] };
const fakeAgent = (origin, seeded) => ({ session: { header: { origin, isSeeded: seeded } } });

// #region TEST_resolution
/** @purpose Confirm explicit workspace selection, default fallback, and silent stale-id reset. */
test("no profile resolves to null and injects nothing", () => {
  const choice = resolveProfileId({ lastByWorkspace: {}, workspaceKey: "w", defaultId: "", profileIds: [] });
  assert.deepEqual(choice, { profileId: null, reset: false });
  assert.deepEqual(planInsertion({ snapshot: buildSnapshot({ profile: null, sectionsById: sections }), assemblySections: [], builtinOrdersByName: orders }), []);
});
test("workspace choice wins; dangling choice resets to live default then null", () => {
  assert.deepEqual(resolveProfileId({ lastByWorkspace: { w: "light" }, workspaceKey: "w", defaultId: "other", profileIds: ["light", "other"] }), { profileId: "light", reset: false });
  assert.deepEqual(resolveProfileId({ lastByWorkspace: { w: "" }, workspaceKey: "w", defaultId: "other", profileIds: ["other"] }), { profileId: null, reset: false });
  assert.deepEqual(resolveProfileId({ lastByWorkspace: { w: "removed" }, workspaceKey: "w", defaultId: "other", profileIds: ["other"] }), { profileId: "other", reset: true });
  assert.deepEqual(resolveProfileId({ lastByWorkspace: { w: "disabled" }, workspaceKey: "w", defaultId: "removed", profileIds: ["light"] }), { profileId: null, reset: true });
});
// #endregion TEST_resolution

// #region TEST_scope
/** @purpose Lock in the four main/child/fork classifications and empty/unknown/disabled section behavior. */
test("scope matrix: root, ordinary child, seeded child, seeded root", () => {
  for (const [agent, expected] of [
    [fakeAgent("web", false), ["inherited", "main"]],
    [fakeAgent("subagent", false), ["inherited", "child"]],
    [fakeAgent("subagent", true), ["inherited"]],
    [fakeAgent("web", true), ["inherited", "main"]],
  ]) {
    assert.deepEqual(buildSnapshot({ profile, sectionsById: sections, isSubagent: isSubagent(agent), isFork: isFork(agent) }).sections.map((row) => row.id), expected);
  }
  assert.equal(isSubagent(null), false);
  assert.equal(isFork({}), false);
});
test("snapshot copies text, keeps profile order, and excludes blank, unknown and disabled sections", () => {
  const snapshot = buildSnapshot({ profile, sectionsById: sections });
  assert.deepEqual(snapshot, { profileId: "light", sections: [
    { id: "inherited", title: "Inherited", order: 1100, text: "Always" },
    { id: "main", title: "Main", order: 1200, text: "Main only" },
  ] });
  sections.get("inherited").body = "Edited";
  assert.equal(snapshot.sections[0].text, "Always");
  sections.get("inherited").body = "Always";
});
// #endregion TEST_scope

// #region TEST_insertion
/** @purpose Pin present-built-in anchors, absent anchors, stable ties, and low-order placement (BASE indices). */
test("two profile sections between the same built-ins retain profile order", () => {
  const assembly = [{ name: "tool:bash" }, { name: "tool:read" }];
  const snapshot = { sections: [
    { id: "a", order: 1050, text: "A" }, { id: "b", order: 1050, text: "B" },
  ] };
  const planned = planInsertion({ snapshot, assemblySections: assembly, builtinOrdersByName: orders });
  assert.deepEqual(planned, [
    { name: "prompt-profile:a", text: "A", index: 1 },
    { name: "prompt-profile:b", text: "B", index: 1 },
  ]);
  for (let i = planned.length - 1; i >= 0; i--) assembly.splice(planned[i].index, 0, planned[i]);
  assert.deepEqual(assembly.map((row) => row.name), ["tool:bash", "prompt-profile:a", "prompt-profile:b", "tool:read"]);
});
test("base indices splice descending keep order; ascending without offsets would not", () => {
  const base = [{ name: "tool:bash" }, { name: "tool:read" }];
  const snapshot = { sections: [{ id: "a", order: 1050, text: "A" }, { id: "b", order: 1050, text: "B" }, { id: "c", order: 1200, text: "C" }] };
  const planned = planInsertion({ snapshot, assemblySections: base.map((row) => ({ ...row })), builtinOrdersByName: orders });
  const descending = base.map((row) => ({ ...row }));
  for (let i = planned.length - 1; i >= 0; i--) descending.splice(planned[i].index, 0, planned[i]);
  assert.deepEqual(descending.map((row) => row.name), ["tool:bash", "prompt-profile:a", "prompt-profile:b", "tool:read", "prompt-profile:c"]);
});
test("missing built-in anchors and foreign sections: last preceding present anchor, or index zero", () => {
  const assembly = [{ name: "foreign:before" }, { name: "tool:bash" }, { name: "foreign:after" }, { name: "deployment:persona-suffix" }];
  const snapshot = { sections: [{ id: "mid", order: 1150, text: "Mid" }, { id: "low", order: -2000, text: "Low" }] };
  assert.deepEqual(planInsertion({ snapshot, assemblySections: assembly, builtinOrdersByName: orders }), [
    { name: "prompt-profile:low", text: "Low", index: 0 },
    { name: "prompt-profile:mid", text: "Mid", index: 2 },
  ]);
  assert.equal(planInsertion({ snapshot: { sections: [{ id: "solo", order: 1100, text: "X" }] }, assemblySections: [{ name: "foreign" }], builtinOrdersByName: orders })[0].index, 0);
});
test("order below every present built-in goes first, collision follows its built-in", () => {
  assert.deepEqual(planInsertion({ snapshot: { sections: [{ id: "early", order: -2000, text: "E" }, { id: "same", order: 1000, text: "S" }] }, assemblySections: [{ name: "harness:identity" }, { name: "tool:bash" }, { name: "tool:read" }], builtinOrdersByName: orders }).map((row) => row.index), [0, 2]);
});
// #endregion TEST_insertion

// #region TEST_sealing
/** @purpose Ensure the first write is durable before rendering and no later assembly reads edited config. */
test("fake storage seals first result and reuses it without rerunning config resolution", async () => {
  const records = new Map();
  let release;
  let builds = 0;
  const table = { get: (id) => records.get(id), put: async (id, snapshot) => { await new Promise((resolve) => { release = resolve; }); records.set(id, snapshot); } };
  const createSnapshot = () => { builds++; return { profileId: "light", sections: [{ id: "x", title: "X", order: 1, text: "Original" }] }; };
  const first = sealSnapshot({ table, sessionId: "s1", createSnapshot });
  assert.equal(records.has("s1"), false);
  release();
  assert.equal((await first).sections[0].text, "Original");
  const again = await sealSnapshot({ table, sessionId: "s1", createSnapshot: () => { throw Error("config leaked"); } });
  assert.equal(again.sections[0].text, "Original");
  assert.equal(builds, 1);
});
// #endregion TEST_sealing

// #region TEST_retryCache
/** @purpose Prove a rejected open is dropped from the cache so the next assembly retries (verify-step2b-glm defect 1). */
test("retryingCache drops a rejected promise and retries; a fulfilled one stays cached", async () => {
  let attempts = 0;
  const get = retryingCache(() => {
    attempts += 1;
    if (attempts < 3) return Promise.reject(new Error(`boom ${attempts}`));
    return Promise.resolve({ value: attempts });
  });
  await assert.rejects(get(), /boom 1/);
  await assert.rejects(get(), /boom 2/);
  assert.equal(attempts, 2);
  assert.equal(get.cached(), null);
  const first = await get();
  assert.equal(first.value, 3);
  assert.equal(get.cached() instanceof Promise, true);
  const again = await get();
  assert.equal(again, first);
  assert.equal(attempts, 3);
  assert.equal(await get.cached(), first);
});
// #endregion TEST_retryCache
