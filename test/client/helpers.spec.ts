/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the pure view helpers directly (render-free by design): row
 *   identity, outline order, preview plan, save gate, labels, rename report,
 *   Esc guard, and the profiles-changed signal.
 * #endregion moduleContract
 */
import { expect, test } from "vitest";
import {
  addSectionsToRefs,
  canSaveSection,
  dedupeRowPrefix,
  escapesDrillDown,
  filterSections,
  idOf,
  insertionOrders,
  normalizeSections,
  notifyProfilesChanged,
  type OursOutlineRow,
  outlineRows,
  previewPlan,
  previewVariableNotice,
  profileLabel,
  refIdOf,
  renameNotice,
  scopeKeyOf,
  sourceKindOf,
  subscribeProfilesChanged,
  usedInProfileName,
} from "../../src/client/helpers.ts";
import { keyT } from "./harness.ts";

test("idOf prefers the unqualified configId", () => {
  expect(idOf({ configId: "main", patchId: "p" })).toBe("main");
  expect(idOf({ patchId: "p" })).toBe("p");
  expect(idOf(null)).toBeNull();
});

test("profileLabel never reports a made choice as the no-selection string", () => {
  expect(profileLabel({ configId: "light", title: "Light tone" }, keyT)).toBe("Light tone");
  expect(profileLabel({ configId: "light", title: "" }, keyT)).toBe("light");
  expect(profileLabel({ patchId: "p1" }, keyT)).toBe("p1");
  expect(profileLabel(null, keyT)).toBe("none");
  expect(profileLabel({ title: "" }, keyT)).toBe("untitled");
});

test("escapesDrillDown spares editable fields and open overlays", () => {
  const event = (key: string, closest?: () => unknown) => ({ key, target: { closest: closest ?? (() => null) } });
  expect(escapesDrillDown(event("Escape"))).toBe(true);
  expect(escapesDrillDown(event("Enter"))).toBe(false);
  expect(escapesDrillDown(event("Escape", () => ({})))).toBe(false);
  expect(escapesDrillDown(undefined)).toBe(false);
  expect(escapesDrillDown(event("Escape"), { document: { querySelector: () => ({}) } })).toBe(false);
  expect(escapesDrillDown(event("Escape"), { document: { querySelector: () => null } })).toBe(true);
});

test("insertionOrders are the integer gaps, never a half-step", () => {
  const rows = [
    { kind: "builtin", order: 100 },
    { kind: "ours", order: 100 },
    { kind: "ours", order: 200 },
  ];
  expect(insertionOrders(rows)).toEqual([99, 101, 101, 201]);
  expect(insertionOrders([{ kind: "ours", order: 500 }])).toEqual([499, 501]);
  expect(
    insertionOrders([
      { kind: "broken", order: 7 },
      { kind: "ours", order: 100 },
    ]),
  ).toEqual([99, 99, 101]);
  expect(insertionOrders([])).toEqual([100]);
  const gap = insertionOrders([
    { kind: "ours", order: 499 },
    { kind: "ours", order: 500 },
  ]);
  expect(gap).toEqual([498, 500, 501]);
  expect(gap.every(Number.isInteger)).toBe(true);
  expect([...insertionOrders(rows), ...gap].every(Number.isInteger)).toBe(true);
});

test("a drop below a built-in lands visually below it", () => {
  const belowBuiltin = insertionOrders([
    { kind: "builtin", order: 100 },
    { kind: "ours", order: 100 },
  ]);
  expect(belowBuiltin[1]).toBe(101);
  expect(
    outlineRows(
      { sections: [{ id: "a", order: belowBuiltin[1], scope: "inherit" }] },
      { a: { id: "a", title: "A", patchId: "a" } },
      { "plan:policy": 100 },
    ).map((row) => row.kind),
  ).toEqual(["builtin", "ours"]);
});

test("outlineRows keeps the persisted orders and ties resolve deterministically", () => {
  const outline = outlineRows(
    {
      sections: [
        { id: "x", order: 500, scope: "inherit" },
        { id: "gone", order: 10, scope: "inherit" },
      ],
    },
    { x: { id: "x", title: "X", body: "hi", patchId: "x" } },
    { "persona-prefix": 0, "plan:policy": 500 },
  );
  expect(outline.map((row) => row.kind)).toEqual(["builtin", "ours", "builtin", "broken"]);
  expect(outline[1].order).toBe(500);
  expect(outline[2].order).toBe(500);
  expect((outline[1] as { displayOrder?: number }).displayOrder).toBeUndefined();
  expect((outline[1] as { collides?: boolean }).collides).toBeUndefined();
  const oursRow = outline[1] as OursOutlineRow;
  const brokenRow = outline[3] as OursOutlineRow;
  expect(brokenRow.ref.id).toBe("gone");
  expect(oursRow.ref).toEqual({ id: "x", order: 500, scope: "inherit" });

  const tie = outlineRows(
    {
      sections: [
        { id: "b", order: 100, scope: "inherit" },
        { id: "a", order: 100, scope: "inherit" },
      ],
    },
    { a: { id: "a", title: "A", patchId: "a" }, b: { id: "b", title: "B", patchId: "b" } },
    {},
  );
  expect(tie.map((row) => (row as OursOutlineRow).ref.id)).toEqual(["b", "a"]);
  const reversed = outlineRows(
    {
      sections: [
        { id: "a", order: 100, scope: "inherit" },
        { id: "b", order: 100, scope: "inherit" },
      ],
    },
    { a: { id: "a", title: "A", patchId: "a" }, b: { id: "b", title: "B", patchId: "b" } },
    {},
  );
  expect(reversed.map((row) => (row as OursOutlineRow).ref.id)).toEqual(["a", "b"]);

  const kindsAt = (order: number) =>
    outlineRows(
      { sections: [{ id: "a", order, scope: "inherit" }] },
      { a: { id: "a", title: "A", patchId: "a" } },
      { "plan:policy": 100 },
    ).map((row) => row.kind);
  expect(kindsAt(100)).toEqual(["ours", "builtin"]);
  expect(kindsAt(101)).toEqual(["builtin", "ours"]);
});

test("the outline resolves a prefixed configId ref against a configId-keyed map", () => {
  const rows = outlineRows(
    { sections: [{ id: "prompt-section-x", order: 10 }] },
    new Map([["prompt-section-x", { configId: "prompt-section-x", title: "X", body: "hi", patchId: "x" }]]),
    {},
  );
  expect(rows[0].kind).toBe("ours");
});

test("canSaveSection gates the autosave on a confirmed row with a title", () => {
  expect(canSaveSection("Greeting", true)).toBe(true);
  expect(canSaveSection("   ", true)).toBe(false);
  expect(canSaveSection("", true)).toBe(false);
  expect(canSaveSection(undefined, true)).toBe(false);
  expect(canSaveSection("Greeting", false)).toBe(false);
});

test("sourceKindOf hides the calm user source", () => {
  expect(sourceKindOf("bundle")).toBe("bundle");
  expect(sourceKindOf("unknown")).toBe("unknown");
  expect(sourceKindOf("user")).toBeNull();
  expect(sourceKindOf(undefined)).toBeNull();
});

test("usedInProfileName resolves the title, falling back to the raw id", () => {
  expect(usedInProfileName({ profiles: [{ configId: "light", title: "Light tone", patchId: "l" }] }, "light")).toBe(
    "Light tone",
  );
  expect(usedInProfileName({ profiles: [] }, "ghost")).toBe("ghost");
  expect(usedInProfileName({ profiles: [{ configId: "x", title: "", patchId: "x" }] }, "x")).toBe("x");
});

test("scopeKeyOf maps every scope enum to a locale key", () => {
  expect(scopeKeyOf("main-only")).toBe("scopeMainOnly");
  expect(scopeKeyOf("subagents-only")).toBe("scopeSubagentsOnly");
  expect(scopeKeyOf("inherit")).toBe("scopeInherit");
  expect(scopeKeyOf(undefined)).toBe("scopeInherit");
});

test("renameNotice reports only the profiles still holding the old id", () => {
  expect(renameNotice({ affectedProfiles: [] }, keyT)).toBeNull();
  expect(renameNotice(undefined, keyT)).toBeNull();
  expect(renameNotice({}, keyT)).toBeNull();
  expect(renameNotice({ affectedProfiles: "nope" } as never, keyT)).toBeNull();
  expect(
    renameNotice(
      {
        affectedProfiles: [
          { profileId: "p1", title: "Main" },
          { profileId: "p2", title: "Review" },
        ],
      },
      keyT,
    ),
  ).toBe("renameAffected Main, Review");
  expect(renameNotice({ affectedProfiles: [{ profileId: "p9" }] }, keyT)).toBe("renameAffected p9");
  expect(renameNotice({ affectedProfiles: [{}] }, keyT)).toBe("renameAffected 1");
});

test("filterSections searches title and id, case-insensitively", () => {
  const list = [
    { id: "light-tone", configId: "light-tone", patchId: "a", title: "Light tone" },
    { id: "no-preamble", configId: "no-preamble", patchId: "b", title: "No preamble" },
  ];
  expect(filterSections(list, "light")).toHaveLength(1);
  expect(filterSections(list, "")).toHaveLength(2);
  expect(filterSections(list, "NO PREAM")).toHaveLength(1);
});

test("previewPlan collapses built-in runs and keeps order/text/reasons", () => {
  const plan = previewPlan({
    sections: [
      { builtin: true, title: "persona-prefix" },
      { builtin: true, title: "plan:policy" },
      { id: "x", title: "X", order: 1050, text: "Be brief." },
      { builtin: true, title: "tool:bash" },
    ],
    skipped: [{ id: "y", title: "Y", reason: "scope subagents-only" }],
  });
  expect(plan.plan.map((entry) => entry.kind)).toEqual(["builtins", "ours", "builtins"]);
  expect((plan.plan[0] as { names: string[] }).names).toEqual(["persona-prefix", "plan:policy"]);
  expect((plan.plan[1] as { text?: string }).text).toBe("Be brief.");
  expect(plan.skipped[0].reason).toBe("scope subagents-only");
  expect(previewPlan({}).plan).toEqual([]);
});

test("previewVariableNotice flags only variables it cannot prove exact", () => {
  expect(previewVariableNotice("{{cwd}} here", "{{cwd}} here", { cwd: "/host", model: null })).toEqual(["cwd"]);
  expect(previewVariableNotice("a {{model}} b", "a {{model}} b", { cwd: "/host", model: null })).toEqual(["model"]);
  expect(previewVariableNotice("no variables", "no variables", { cwd: "/host" })).toBeNull();
  expect(previewVariableNotice("{{cwd}}", "{{cwd}}", { cwd: "/same" }, { cwd: "/same" })).toBeNull();
});

test("refs carry the configId verbatim; only a doubled prefix is collapsed", () => {
  expect(refIdOf({ rowId: "prompt-section-x", patchId: "prompt-section-x", configId: "prompt-section-x" })).toBe(
    "prompt-section-x",
  );
  expect(refIdOf({ patchId: "bare-token" })).toBe("bare-token");
  expect(dedupeRowPrefix("prompt-section-prompt-section-first-one")).toBe("prompt-section-first-one");
  expect(dedupeRowPrefix("prompt-profile-prompt-profile-a1")).toBe("prompt-profile-a1");
  expect(dedupeRowPrefix("prompt-section-x")).toBe("prompt-section-x");
  expect(dedupeRowPrefix("123123")).toBe("123123");

  const normalized = normalizeSections([
    { id: "prompt-section-prompt-section-first-one", order: 100, scope: "inherit" },
    { id: "prompt-section-01a0d494", order: 200, scope: "inherit" },
  ]);
  expect(JSON.stringify(normalized)).not.toContain("prompt-section-prompt-section-");
  expect(normalized).toEqual([
    { id: "prompt-section-first-one", order: 100, scope: "inherit" },
    { id: "prompt-section-01a0d494", order: 200, scope: "inherit" },
  ]);
});

test("addSectionsToRefs appends picked ids verbatim, stepping +100", () => {
  const appended = addSectionsToRefs(
    [{ id: "prompt-section-a", order: 100 }],
    ["prompt-section-b", "prompt-section-prompt-section-c"],
  );
  expect(appended.map((ref) => ref.id)).toEqual(["prompt-section-a", "prompt-section-b", "prompt-section-c"]);
  expect(appended.map((ref) => ref.order)).toEqual([100, 200, 300]);
});

test("the profiles-changed signal reaches every live subscriber and unsubscribes", () => {
  const seen: number[] = [];
  const unsubscribe = subscribeProfilesChanged((seq) => seen.push(seq));
  notifyProfilesChanged();
  notifyProfilesChanged();
  unsubscribe();
  notifyProfilesChanged();
  expect(seen).toHaveLength(2);
  expect(seen[1]).toBeGreaterThan(seen[0]);
});
