/**
 * Registry tests — duplicates, usedIn, insertionIndex.
 * #region moduleContract
 * @modulecontract
 * @purpose Verify the pure registry's observable contracts: sorted detached
 *   views, deterministic duplicate-config.id resolution with both-rowId
 *   warnings, usedIn scope reporting, and name-anchored splice planning
 *   against a realistic assembly WITHOUT any collision offset (orders reach
 *   the assembly exactly as the profile states them).
 * @scope lib/registry.js (PLAN step 2); assembly fixtures encode the spike-R1
 *   fact that assembled sections carry names but no order field.
 * #endregion moduleContract
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PromptProfilesRegistry, insertionIndex } from "../lib/registry.js";
import { BUILTIN_ORDERS, builtinOrdersByName } from "../lib/builtin-orders.js";

function fixtureRegistry() {
  const warnings = [];
  const registry = new PromptProfilesRegistry({ warn: (m) => warnings.push(m) });
  const disposeA = registry.registerSection({
    rowId: "row-a",
    config: { id: "light-tone", title: "Light tone", body: "Be brief." },
    source: "bundle",
  });
  const disposeB = registry.registerSection({
    rowId: "row-b",
    config: { id: "no-preamble", title: "No preamble", body: "No preamble." },
    source: "bundle",
  });
  registry.registerProfile({
    rowId: "row-light",
    config: {
      id: "light",
      title: "Light",
      sections: [
        { id: "light-tone", order: 1050, scope: "main-only" },
        { id: "no-preamble", order: 1400, scope: "inherit" },
      ],
    },
    source: "bundle",
  });
  registry.registerProfile({
    rowId: "row-review",
    config: {
      id: "review",
      title: "Review",
      sections: [{ id: "light-tone", order: 300, scope: "subagents-only" }],
    },
    source: "bundle",
  });
  return { registry, warnings, disposeA, disposeB };
}

// #region SECTION_views
test("sections() sorts by id; profiles() sorts by title", () => {
  const { registry } = fixtureRegistry();
  assert.deepEqual(registry.sections().map((s) => s.id), ["light-tone", "no-preamble"]);
  assert.deepEqual(registry.profiles().map((p) => p.id), ["light", "review"]);
});

test("views are detached copies", () => {
  const { registry } = fixtureRegistry();
  registry.sections()[0].title = "mutated";
  assert.equal(registry.sections()[0].title, "Light tone");
});

test("disposers remove registrations", () => {
  const { registry, disposeA } = fixtureRegistry();
  disposeA();
  assert.deepEqual(registry.sections().map((s) => s.id), ["no-preamble"]);
});
// #endregion SECTION_views

// #region SECTION_duplicates
test("duplicate config.id warns naming both rowIds and the later row wins", () => {
  const { registry, warnings } = fixtureRegistry();
  registry.registerSection({
    rowId: "row-c",
    config: { id: "light-tone", title: "Other tone", body: "Other." },
    source: "user",
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /duplicate section config\.id "light-tone"/);
  assert.match(warnings[0], /"row-a"/);
  assert.match(warnings[0], /"row-c"/);
  const winner = registry.sections().find((s) => s.id === "light-tone");
  assert.equal(winner.title, "Other tone");
  assert.equal(winner.rowId, "row-c");
});

test("disposing an overridden registration is a no-op (deterministic winner)", () => {
  const { registry, disposeA } = fixtureRegistry();
  const disposeC = registry.registerSection({
    rowId: "row-c",
    config: { id: "light-tone", title: "Other tone", body: "Other." },
    source: "user",
  });
  disposeA(); // overridden row must not delete the winner
  const winner = registry.sections().find((s) => s.id === "light-tone");
  assert.equal(winner.rowId, "row-c");
  disposeC();
  assert.equal(registry.sections().find((s) => s.id === "light-tone"), undefined);
});

test("H4: disposing the winner RESTORES the still-mounted earlier registration", () => {
  const { registry, disposeA } = fixtureRegistry();
  const disposeC = registry.registerSection({
    rowId: "row-c",
    config: { id: "light-tone", title: "Other tone", body: "Other." },
    source: "user",
  });
  assert.equal(registry.sections().find((s) => s.id === "light-tone").rowId, "row-c");
  // HMR unloads the later row: the original must come back, not disappear.
  disposeC();
  const survivor = registry.sections().find((s) => s.id === "light-tone");
  assert.ok(survivor, "the id is still registered");
  assert.equal(survivor.rowId, "row-a");
  assert.equal(survivor.title, "Light tone");
  // And disposing the survivor finally removes it.
  disposeA();
  assert.equal(registry.sections().find((s) => s.id === "light-tone"), undefined);
});
// #endregion SECTION_duplicates

// #region SECTION_usedIn
test("usedIn lists referencing profiles with per-profile scope", () => {
  const { registry } = fixtureRegistry();
  assert.deepEqual(registry.usedIn("light-tone"), [
    { profileId: "light", scope: "main-only" },
    { profileId: "review", scope: "subagents-only" },
  ]);
  assert.deepEqual(registry.usedIn("no-preamble"), [{ profileId: "light", scope: "inherit" }]);
  assert.deepEqual(registry.usedIn("missing"), []);
});
// #endregion SECTION_usedIn

// #region SECTION_insertionIndex
test("insertionIndex anchors on builtin names present in the assembly", () => {
  // Realistic assembly: entries carry names only, NO order field (spike R1).
  const assemblyNames = [
    "harness:identity",            // -1000
    "deployment:persona-prefix",   // 0
    "plan:policy",                 // 500
    "tool:bash",                   // 1000
    "deployment:persona-suffix",   // 10200
  ];
  const byName = builtinOrdersByName(BUILTIN_ORDERS);
  // Our snapshot sections, orders exactly as the profile states them.
  const ours = [300, 1000, 1400];
  const plan = insertionIndex(ours, assemblyNames, byName);
  assert.deepEqual(plan, [
    { order: 300, index: 2 },    // after persona-prefix(0), before plan:policy(500)
    { order: 1000, index: 3 },   // EQUAL to tool:bash: lands before it — no +0.5
    { order: 1400, index: 4 },   // after tool:bash (no anchor between 1000 and 10200)
  ]);
});

test("insertionIndex ignores builtins absent from the assembly and unknown names", () => {
  const byName = builtinOrdersByName(BUILTIN_ORDERS);
  // Only the tail of the assembly is present; earlier built-ins must not count.
  const plan = insertionIndex([500], ["tool:bash", "deployment:persona-suffix"], byName);
  assert.deepEqual(plan, [{ order: 500, index: 0 }]);
  // Unknown/foreign names occupy slots but never act as anchors.
  const plan2 = insertionIndex([1200], ["foreign:x", "tool:bash", "foreign:y"], byName);
  assert.deepEqual(plan2, [{ order: 1200, index: 2 }]); // right after tool:bash
  // Empty assembly: everything goes to index 0.
  assert.deepEqual(insertionIndex([1, 2], [], byName), [
    { order: 1, index: 0 },
    { order: 2, index: 0 },
  ]);
});

test("insertionIndex splices descending keep our ascending order intact", () => {
  const byName = builtinOrdersByName(BUILTIN_ORDERS);
  const assembly = [
    { name: "harness:identity", text: "A" },
    { name: "deployment:persona-prefix", text: "B" },
    { name: "plan:policy", text: "C" },
    { name: "tool:bash", text: "D" },
    { name: "deployment:persona-suffix", text: "E" },
  ];
  // 1000 EQUALS tool:bash: it anchors before tool:bash, unshifted.
  const plan = insertionIndex([1000, 1400], assembly.map((s) => s.name), byName);
  for (const entry of [...plan].reverse()) {
    assembly.splice(entry.index, 0, { name: `prompt-profile:x${entry.order}`, text: "ours" });
  }
  assert.deepEqual(assembly.map((s) => s.name), [
    "harness:identity",
    "deployment:persona-prefix",
    "plan:policy",
    "prompt-profile:x1000",
    "tool:bash",
    "prompt-profile:x1400",
    "deployment:persona-suffix",
  ]);
});
// #endregion SECTION_insertionIndex

// #region TEST_volatileUnwrap
/** @purpose Astra finding B: volatile wrapper refs (.get()) are unwrapped at
 *  READ time — a live settings edit after registration flows into views,
 *  sorting, and usedIn without re-registering the row. */
test("volatile wrappers are unwrapped at read time and follow live edits", () => {
  const registry = new PromptProfilesRegistry({ warn: () => {} });
  // Fake Cordis volatile wrapper: .get() returns the CURRENT value.
  const box = (initial) => ({ value: initial, get() { return this.value; } });
  const title = box("Zen");
  const body = box("Old body.");
  const sections = box([{ id: "zen", order: 100, scope: "main-only" }]);
  registry.registerSection({ rowId: "row-zen", config: { id: "zen", title, body }, source: "user" });
  registry.registerProfile({ rowId: "row-p", config: { id: "p", title: box("P"), sections }, source: "user" });
  const sectionView = () => registry.sections().find((row) => row.id === "zen");
  const profileView = () => registry.profiles().find((row) => row.id === "p");
  // Unwrapped, not the wrapper objects themselves.
  assert.equal(sectionView().title, "Zen");
  assert.equal(sectionView().body, "Old body.");
  assert.equal(typeof profileView().sections[0].id, "string");
  assert.deepEqual(registry.usedIn("zen"), [{ profileId: "p", scope: "main-only" }]);
  // A live settings edit AFTER registration…
  title.value = "Zen 2";
  body.value = "New body.";
  sections.value = [{ id: "zen", order: 200, scope: "inherit" }];
  // …is visible on the NEXT read, including scope via usedIn.
  assert.equal(sectionView().title, "Zen 2");
  assert.equal(sectionView().body, "New body.");
  assert.equal(profileView().sections[0].order, 200);
  assert.deepEqual(registry.usedIn("zen"), [{ profileId: "p", scope: "inherit" }]);
  // Sorting follows live titles: a re-titled profile reorders against a peer.
  const beta = box("Beta");
  registry.registerProfile({ rowId: "row-b", config: { id: "b", title: beta, sections: box([]) }, source: "user" });
  assert.deepEqual(registry.profiles().map((row) => row.id), ["b", "p"]);
  beta.value = "Zeta";
  assert.deepEqual(registry.profiles().map((row) => row.id), ["p", "b"]);
});
// #endregion TEST_volatileUnwrap
