/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin pure profile resolution, scope filtering, insertion order, and durable-first sealing without a live host.
 * @scope node:test using fake agents, assembly arrays, and storage; NOT: live Cordis lifecycle.
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import test from "node:test";
import { builtinOrdersByName } from "../lib/infra/builtin-orders.js";
import { retryingCache, sealSnapshot } from "../lib/infra/session-snapshots.js";
import { resolveWorkspaceKeys } from "../lib/infra/workspace-adapter.js";
import {
  buildSnapshot,
  interpolateSealedText,
  isFork,
  isSubagent,
  planInsertion,
  resolveProfileId,
  sectionSkipReason,
} from "../lib/resolve.js";

const orders = builtinOrdersByName();
const sections = new Map([
  ["inherited", { title: "Inherited", body: "Always" }],
  ["main", { title: "Main", body: "Main only" }],
  ["child", { title: "Child", body: "Child only" }],
  ["blank", { title: "Blank", body: " \n " }],
  ["disabled", { title: "Disabled", body: "Ignored", disabled: true }],
]);
const profile = {
  id: "light",
  sections: [
    { id: "inherited", order: 1100 },
    { id: "main", order: 1200, scope: "main-only" },
    { id: "child", order: 1300, scope: "subagents-only" },
    { id: "blank", order: 1400 },
    { id: "missing", order: 1500 },
    { id: "disabled", order: 1600 },
  ],
};
const fakeAgent = (origin, seeded) => ({ session: { header: { origin, isSeeded: seeded } } });

// #region TEST_resolution
/** @purpose Confirm explicit workspace selection, default fallback, and silent stale-id reset. */
test("no profile resolves to null and injects nothing", () => {
  const choice = resolveProfileId({ lastByWorkspace: {}, workspaceKey: "w", defaultId: "", profileIds: [] });
  assert.deepEqual(choice, { profileId: null, reset: false });
  assert.deepEqual(
    planInsertion({
      snapshot: buildSnapshot({ profile: null, sectionsById: sections }),
      assemblySections: [],
      builtinOrdersByName: orders,
    }),
    [],
  );
});
test("workspace choice wins; dangling choice resets to live default then null", () => {
  assert.deepEqual(
    resolveProfileId({
      lastByWorkspace: { w: "light" },
      workspaceKey: "w",
      defaultId: "other",
      profileIds: ["light", "other"],
    }),
    { profileId: "light", reset: false },
  );
  assert.deepEqual(
    resolveProfileId({ lastByWorkspace: { w: "" }, workspaceKey: "w", defaultId: "other", profileIds: ["other"] }),
    { profileId: null, reset: false },
  );
  assert.deepEqual(
    resolveProfileId({
      lastByWorkspace: { w: "removed" },
      workspaceKey: "w",
      defaultId: "other",
      profileIds: ["other"],
    }),
    { profileId: "other", reset: true },
  );
  assert.deepEqual(
    resolveProfileId({
      lastByWorkspace: { w: "disabled" },
      workspaceKey: "w",
      defaultId: "removed",
      profileIds: ["light"],
    }),
    { profileId: null, reset: true },
  );
});
// #endregion TEST_resolution

// #region TEST_workspaceKey
/** @purpose /last and the assembler MUST derive the same ORDERED candidates; duplicates never appear. */
test("resolveWorkspaceKeys returns ordered unique candidates (membership, path id, cwd, workspaceId)", async () => {
  const registry = {
    list: () => [
      { id: "ws-session", sessionIds: ["s1"] },
      { id: "ws-other", sessionIds: ["s2"] },
    ],
    resolveByPath: async (path) => (path === "/known" ? { id: "ws-known" } : undefined),
  };
  // 1. session membership, then the awaited path id, then the raw cwd.
  assert.deepEqual(await resolveWorkspaceKeys({ workspaceRegistry: registry, session: { id: "s2" }, cwd: "/known" }), [
    "ws-other",
    "ws-known",
    "/known",
  ]);
  // 2. no membership → the awaited resolveByPath id first (missing await was the bug).
  assert.deepEqual(await resolveWorkspaceKeys({ workspaceRegistry: registry, session: { id: "s3" }, cwd: "/known" }), [
    "ws-known",
    "/known",
  ]);
  // 3. path unknown to the registry → the raw cwd fallback key.
  assert.deepEqual(
    await resolveWorkspaceKeys({ workspaceRegistry: registry, session: { id: "s3" }, cwd: "/unknown" }),
    ["/unknown"],
  );
  // 4. no cwd → the explicit workspace id, else the degenerate ""
  assert.deepEqual(await resolveWorkspaceKeys({ workspaceRegistry: registry, workspaceId: "ws-client" }), [
    "ws-client",
  ]);
  assert.deepEqual(await resolveWorkspaceKeys({}), [""]);
  // 5. Duplicates collapse: the session id IS the path id and the raw cwd repeats it.
  const same = { list: () => [{ id: "ws-one", sessionIds: ["s1"] }], resolveByPath: async () => ({ id: "ws-one" }) };
  assert.deepEqual(
    await resolveWorkspaceKeys({ workspaceRegistry: same, session: { id: "s1" }, cwd: "/x", workspaceId: "ws-one" }),
    ["ws-one", "/x"],
  );
  // 6. a throwing/absent registry degrades to cwd, never rejects.
  const boom = {
    list: () => {
      throw new Error("nope");
    },
    resolveByPath: async () => {
      throw new Error("nope");
    },
  };
  assert.deepEqual(await resolveWorkspaceKeys({ workspaceRegistry: boom, session: { id: "s1" }, cwd: "/x" }), ["/x"]);
  assert.deepEqual(
    await resolveWorkspaceKeys({ workspaceRegistry: { resolveByPath: () => ({ id: "ws-plain" }) }, cwd: "/x" }),
    ["ws-plain", "/x"],
  );
});

/** @purpose (а)/(б) A legacy path-keyed choice is visible from a UUID session; an explicit "" on the first candidate beats the path choice. */
test("resolveProfileId walks candidates in order: first PRESENT key decides, including explicit none", () => {
  const base = { defaultId: "", profileIds: ["light", "other"] };
  // (а) UUID candidate absent → the path-keyed choice wins.
  assert.deepEqual(
    resolveProfileId({
      ...base,
      lastByWorkspace: { "/home/knopki/desktop": "light" },
      workspaceKeys: ["uuid-1", "/home/knopki/desktop"],
    }),
    { profileId: "light", reset: false },
  );
  // (б) explicit "" under the UUID (first candidate) beats the path choice.
  assert.deepEqual(
    resolveProfileId({
      ...base,
      lastByWorkspace: { "uuid-1": "", "/home/knopki/desktop": "light" },
      workspaceKeys: ["uuid-1", "/home/knopki/desktop"],
    }),
    { profileId: null, reset: false },
  );
  // A valid UUID choice wins over the path.
  assert.deepEqual(
    resolveProfileId({
      ...base,
      lastByWorkspace: { "uuid-1": "other", "/home/knopki/desktop": "light" },
      workspaceKeys: ["uuid-1", "/home/knopki/desktop"],
    }),
    { profileId: "other", reset: false },
  );
  // No candidate present → default; a stale first candidate → default + reset.
  assert.deepEqual(
    resolveProfileId({
      ...base,
      defaultId: "other",
      lastByWorkspace: {},
      workspaceKeys: ["uuid-1", "/home/knopki/desktop"],
    }),
    { profileId: "other", reset: false },
  );
  assert.deepEqual(
    resolveProfileId({
      ...base,
      defaultId: "other",
      lastByWorkspace: { "uuid-1": "gone" },
      workspaceKeys: ["uuid-1", "/home/knopki/desktop"],
    }),
    { profileId: "other", reset: true },
  );
  // Single-key back-compat form still works.
  assert.deepEqual(resolveProfileId({ ...base, lastByWorkspace: { w: "light" }, workspaceKey: "w" }), {
    profileId: "light",
    reset: false,
  });
});
// #endregion TEST_workspaceKey

// #region TEST_scope
/** @purpose Lock in the four main/child/fork classifications and empty/unknown/disabled section behavior. */
test("scope matrix: root, ordinary child, seeded child, seeded root", () => {
  for (const [agent, expected] of [
    [fakeAgent("web", false), ["inherited", "main"]],
    [fakeAgent("subagent", false), ["inherited", "child"]],
    [fakeAgent("subagent", true), ["inherited"]],
    [fakeAgent("web", true), ["inherited", "main"]],
  ]) {
    assert.deepEqual(
      buildSnapshot({
        profile,
        sectionsById: sections,
        isSubagent: isSubagent(agent),
        isFork: isFork(agent),
      }).sections.map((row) => row.id),
      expected,
    );
  }
  assert.equal(isSubagent(null), false);
  assert.equal(isFork({}), false);
});
test("snapshot copies text, keeps profile order, and excludes blank, unknown and disabled sections", () => {
  const snapshot = buildSnapshot({ profile, sectionsById: sections });
  assert.deepEqual(snapshot, {
    profileId: "light",
    sections: [
      { id: "inherited", title: "Inherited", order: 1100, text: "Always" },
      { id: "main", title: "Main", order: 1200, text: "Main only" },
    ],
  });
  sections.get("inherited").body = "Edited";
  assert.equal(snapshot.sections[0].text, "Always");
  sections.get("inherited").body = "Always";
});
// #endregion TEST_scope

// #region TEST_skipDiagnostics
/** @purpose buildSnapshot reports WHY each reference was dropped, and a throwing diagnostics sink cannot break sealing. */
test("buildSnapshot reports skip reasons without letting the sink break sealing", () => {
  const skips = [];
  const snapshot = buildSnapshot({
    profile: {
      id: "p",
      sections: [
        { id: "main", order: 1, scope: "main-only" },
        { id: "missing", order: 2 },
        { id: "disabled", order: 3 },
        { id: "blank", order: 4 },
        { id: "inherited", order: 5 },
      ],
    },
    sectionsById: sections,
    isSubagent: true,
    onSkip: (skip) => skips.push(skip),
    warn: () => {},
  });
  assert.deepEqual(
    snapshot.sections.map((row) => row.id),
    ["inherited"],
  );
  assert.deepEqual(skips, [
    { id: "main", reason: "scope main-only in a subagent" },
    { id: "missing", reason: "section not found" },
    { id: "disabled", reason: "section disabled" },
    { id: "blank", reason: "empty body" },
  ]);
  // A throwing diagnostics sink never breaks the sealed decision.
  const robust = buildSnapshot({
    profile: { id: "p", sections: [{ id: "inherited", order: 1 }] },
    sectionsById: sections,
    onSkip: () => {
      throw new Error("sink down");
    },
    warn: () => {},
  });
  assert.deepEqual(
    robust.sections.map((row) => row.id),
    ["inherited"],
  );
});

/** @purpose The SAME predicate the host preview uses; main-agent scope matrix. */
test("sectionSkipReason is the shared selection rule (scope first, then state)", () => {
  const body = { title: "T", body: "B" };
  // inherit + main-only emit for the main agent; subagents-only does not.
  assert.equal(sectionSkipReason({ id: "a", scope: "inherit" }, body, { subagent: false }), null);
  assert.equal(sectionSkipReason({ id: "a", scope: "main-only" }, body, { subagent: false }), null);
  assert.match(sectionSkipReason({ id: "a", scope: "subagents-only" }, body, { subagent: false }), /subagents-only/);
  // …and the reverse for a plain subagent / a fork.
  assert.match(sectionSkipReason({ id: "a", scope: "main-only" }, body, { subagent: true }), /main-only/);
  assert.equal(sectionSkipReason({ id: "a", scope: "subagents-only" }, body, { subagent: true }), null);
  assert.match(
    sectionSkipReason({ id: "a", scope: "subagents-only" }, body, { subagent: true, fork: true }),
    /subagents-only/,
  );
  // Scope wins over state; then existence / disabled / empty body.
  assert.match(
    sectionSkipReason({ id: "a", scope: "subagents-only" }, undefined, { subagent: false }),
    /subagents-only/,
  );
  assert.equal(sectionSkipReason({ id: "a" }, undefined), "section not found");
  assert.equal(sectionSkipReason({ id: "a" }, { ...body, disabled: true }), "section disabled");
  assert.equal(sectionSkipReason({ id: "a" }, { ...body, body: "  " }), "empty body");
  assert.match(sectionSkipReason({ id: "a", scope: "everywhere" }, body), /unknown scope/);
});
// #endregion TEST_skipDiagnostics

// #region TEST_insertion
/** @purpose Pin present-built-in anchors, absent anchors, stable ties, and low-order placement (BASE indices). */
test("two profile sections between the same built-ins retain profile order", () => {
  const assembly = [{ name: "tool:bash" }, { name: "tool:read" }];
  const snapshot = {
    sections: [
      { id: "a", order: 1050, text: "A" },
      { id: "b", order: 1050, text: "B" },
    ],
  };
  const planned = planInsertion({ snapshot, assemblySections: assembly, builtinOrdersByName: orders });
  assert.deepEqual(planned, [
    { name: "prompt-profile:a", text: "A", interpolate: false, index: 1 },
    { name: "prompt-profile:b", text: "B", interpolate: false, index: 1 },
  ]);
  for (let i = planned.length - 1; i >= 0; i--) assembly.splice(planned[i].index, 0, planned[i]);
  assert.deepEqual(
    assembly.map((row) => row.name),
    ["tool:bash", "prompt-profile:a", "prompt-profile:b", "tool:read"],
  );
});
test("base indices splice descending keep order; ascending without offsets would not", () => {
  const base = [{ name: "tool:bash" }, { name: "tool:read" }];
  const snapshot = {
    sections: [
      { id: "a", order: 1050, text: "A" },
      { id: "b", order: 1050, text: "B" },
      { id: "c", order: 1200, text: "C" },
    ],
  };
  const planned = planInsertion({
    snapshot,
    assemblySections: base.map((row) => ({ ...row })),
    builtinOrdersByName: orders,
  });
  const descending = base.map((row) => ({ ...row }));
  for (let i = planned.length - 1; i >= 0; i--) descending.splice(planned[i].index, 0, planned[i]);
  assert.deepEqual(
    descending.map((row) => row.name),
    ["tool:bash", "prompt-profile:a", "prompt-profile:b", "tool:read", "prompt-profile:c"],
  );
});
test("missing built-in anchors and foreign sections: last preceding present anchor, or index zero", () => {
  const assembly = [
    { name: "foreign:before" },
    { name: "tool:bash" },
    { name: "foreign:after" },
    { name: "deployment:persona-suffix" },
  ];
  const snapshot = {
    sections: [
      { id: "mid", order: 1150, text: "Mid" },
      { id: "low", order: -2000, text: "Low" },
    ],
  };
  assert.deepEqual(planInsertion({ snapshot, assemblySections: assembly, builtinOrdersByName: orders }), [
    { name: "prompt-profile:low", text: "Low", interpolate: false, index: 0 },
    { name: "prompt-profile:mid", text: "Mid", interpolate: false, index: 2 },
  ]);
  assert.equal(
    planInsertion({
      snapshot: { sections: [{ id: "solo", order: 1100, text: "X" }] },
      assemblySections: [{ name: "foreign" }],
      builtinOrdersByName: orders,
    })[0].index,
    0,
  );
});
test("order below every present built-in goes first; an order EQUAL to a built-in is not shifted", () => {
  // `same` shares tool:bash's order 1000: it anchors BEFORE tool:bash with its
  // own order intact (no +0.5 half-step).
  const planned = planInsertion({
    snapshot: {
      sections: [
        { id: "early", order: -2000, text: "E" },
        { id: "same", order: 1000, text: "S" },
      ],
    },
    assemblySections: [{ name: "harness:identity" }, { name: "tool:bash" }, { name: "tool:read" }],
    builtinOrdersByName: orders,
  });
  assert.deepEqual(
    planned.map((row) => row.order ?? null),
    [null, null],
    "planInsertion rows carry no order field",
  );
  assert.deepEqual(
    planned.map((row) => row.index),
    [0, 1],
  );
});

/** @purpose Equal orders are legal: they are kept verbatim and both the profile order and the splice result stay deterministic. */
test("two sections with the same order keep it and insert deterministically", () => {
  const snapshot = {
    sections: [
      { id: "b", order: 1000, text: "B" },
      { id: "a", order: 1000, text: "A" },
    ],
  };
  const run = () => {
    const assembly = [{ name: "tool:bash" }, { name: "tool:read" }];
    const planned = planInsertion({ snapshot, assemblySections: assembly, builtinOrdersByName: orders });
    // 1000 equals tool:bash: BOTH sections anchor before it at index 0.
    assert.deepEqual(
      planned.map((row) => row.index),
      [0, 0],
    );
    for (let i = planned.length - 1; i >= 0; i--) assembly.splice(planned[i].index, 0, planned[i]);
    return assembly.map((row) => row.name);
  };
  const first = run();
  assert.deepEqual(
    first,
    ["prompt-profile:b", "prompt-profile:a", "tool:bash", "tool:read"],
    "equal orders are preserved and profile order is the stable tie-break",
  );
  assert.deepEqual(run(), first, "planInsertion is deterministic across runs");
});
// #endregion TEST_insertion

// #region TEST_sealing
/** @purpose Ensure the first write is durable before rendering and no later assembly reads edited config. */
test("fake storage seals first result and reuses it without rerunning config resolution", async () => {
  const records = new Map();
  let release;
  let builds = 0;
  const table = {
    get: (id) => records.get(id),
    put: async (id, snapshot) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      records.set(id, snapshot);
    },
  };
  const memo = new Map();
  const openTable = async () => table;
  const createSnapshot = () => {
    builds++;
    return { profileId: "light", sections: [{ id: "x", title: "X", order: 1, text: "Original" }] };
  };
  const first = sealSnapshot({ sessionId: "s1", memo, openTable, createSnapshot });
  assert.equal(records.has("s1"), false);
  await new Promise((resolve) => setImmediate(resolve)); // the delayed put is now pending
  release();
  assert.equal((await first).sections[0].text, "Original");
  const again = await sealSnapshot({
    sessionId: "s1",
    memo,
    openTable,
    createSnapshot: () => {
      throw Error("config leaked");
    },
  });
  assert.equal(again.sections[0].text, "Original");
  assert.equal(builds, 1);
});
// #endregion TEST_sealing

// #region TEST_sealInterpolation
/** @purpose Astra finding D: interpolation is resolved and validated at SEAL time;
 *  unusable bodies are skipped with a warning instead of persisted. */
test("unknown variable skips the section with a warning; known variables are resolved into the sealed text", () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);
  const map = new Map([
    ["ok", { title: "Ok", body: "Work in {{cwd}}, model {{model}}." }],
    ["bad", { title: "Bad", body: "Uses {{unknown}} here." }],
    ["literal", { title: "Literal", body: "Math: {{ is prose, no closing braces" }],
    ["malformed", { title: "Malformed", body: "Broken {{1up}} ref" }],
  ]);
  const snapshot = buildSnapshot({
    profile: {
      id: "p",
      sections: [
        { id: "ok", order: 1 },
        { id: "bad", order: 2 },
        { id: "literal", order: 3 },
        { id: "malformed", order: 4 },
      ],
    },
    sectionsById: map,
    variables: { cwd: "/tmp/x", model: "glm" },
    warn,
  });
  assert.deepEqual(snapshot.sections, [
    { id: "ok", title: "Ok", order: 1, text: "Work in /tmp/x, model glm." },
    { id: "literal", title: "Literal", order: 3, text: "Math: {{ is prose, no closing braces" },
  ]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /unknown prompt variable "\{\{unknown\}\}"/);
  assert.match(warnings.join("\n"), /section "bad" skipped/);
  assert.match(warnings.join("\n"), /section "malformed" skipped/);
  assert.equal(interpolateSealedText("x", "{{a}}{{a}}", { a: 1 }), "11");
  assert.throws(() => interpolateSealedText("x", "{{ }}", {}), /malformed/);
  assert.throws(() => interpolateSealedText("x", "{{novalue}}", { novalue: undefined }), /has no value/);
});

test("sealed text stays identical across steps even when variables change; insertion carries interpolate:false", async () => {
  let variables = { cwd: "/first" };
  const records = new Map();
  const memo = new Map();
  const table = {
    get: (id) => records.get(id),
    put: async (id, snapshot) => {
      records.set(id, snapshot);
    },
  };
  const build = () =>
    buildSnapshot({
      profile: { id: "p", sections: [{ id: "cwd", order: 1000 }] },
      sectionsById: new Map([["cwd", { title: "Cwd", body: "cwd={{cwd}}" }]]),
      variables,
    });
  const first = await sealSnapshot({ sessionId: "s", memo, openTable: async () => table, createSnapshot: build });
  assert.equal(first.sections[0].text, "cwd=/first");
  variables = { cwd: "/second" }; // a later assembly step with different variables
  const second = await sealSnapshot({ sessionId: "s", memo, openTable: async () => table, createSnapshot: build });
  assert.equal(second.sections[0].text, "cwd=/first");
  assert.equal(second, first, "memoized decision object");
  // The engine (dsh-system-prompt) returns interpolate:false sections verbatim:
  // a literal `{{` in sealed text can never throw at render time.
  const planned = planInsertion({
    snapshot: first,
    assemblySections: [{ name: "tool:bash" }],
    builtinOrdersByName: orders,
  });
  assert.equal(planned[0].interpolate, false);
  const rendered = planned
    .map((row) =>
      row.interpolate === false
        ? row.text
        : (() => {
            throw new Error("would interpolate");
          })(),
    )
    .join("");
  assert.match(rendered, /cwd=\/first/);
});

test("a body with literal {{ cannot break rendering: sealed verbatim and never re-interpolated", () => {
  const body = "Braces {{ stay, and {{not-a-var}} is skipped at seal time";
  const warnings = [];
  const snapshot = buildSnapshot({
    profile: { id: "p", sections: [{ id: "braces", order: 1 }] },
    sectionsById: new Map([["braces", { title: "B", body }]]),
    variables: {},
    warn: (message) => warnings.push(message),
  });
  // "{{ ... {{not-a-var}}" is a MALFORMED reference for the engine (a `{{`
  // followed later by `}}` without a complete simple group) → the section is
  // skipped+warned BEFORE persistence; nothing that throws at render time is
  // ever stored.
  assert.deepEqual(snapshot.sections, []);
  assert.match(warnings[0], /section "braces" skipped: (malformed|unknown)/);
  const literal = buildSnapshot({
    profile: { id: "p", sections: [{ id: "braces", order: 1 }] },
    sectionsById: new Map([["braces", { title: "B", body: "Only literal {{ braces" }]]),
    variables: {},
    warn: () => {},
  });
  assert.equal(literal.sections[0].text, "Only literal {{ braces");
});
// #endregion TEST_sealInterpolation

// #region TEST_pinnedDecision
/** @purpose Astra finding G: storage failures never yield an unprofiled turn nor mid-session activation. */
test("storage outage pins the decision in memory; retry persists the SAME snapshot; no mid-session activation", async () => {
  const records = new Map();
  let openFailuresRemaining = 2;
  const openTable = async () => {
    if (openFailuresRemaining > 0) {
      openFailuresRemaining -= 1;
      throw new Error("storage down");
    }
    return {
      get: (id) => records.get(id),
      put: async (id, snapshot) => {
        records.set(id, snapshot);
      },
    };
  };
  const warnings = [];
  const memo = new Map();
  let configProfile = "light";
  const build = () => ({ profileId: configProfile, sections: [{ id: "x", title: "X", order: 1, text: "Light text" }] });
  // First assembly: storage is down — the turn is STILL profiled (in memory).
  const first = await sealSnapshot({
    sessionId: "s",
    memo,
    openTable,
    createSnapshot: build,
    warn: (m) => warnings.push(m),
  });
  assert.equal(first.profileId, "light");
  assert.equal(first.sections.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /pinned in memory/);
  // The user edits settings while storage is down: a retry must NOT activate
  // the new profile mid-session.
  configProfile = "other";
  const second = await sealSnapshot({
    sessionId: "s",
    memo,
    openTable,
    createSnapshot: build,
    warn: (m) => warnings.push(m),
  });
  assert.equal(second.profileId, "light");
  assert.equal(second, first);
  // Storage recovers: the pinned decision is persisted verbatim.
  const third = await sealSnapshot({
    sessionId: "s",
    memo,
    openTable,
    createSnapshot: build,
    warn: (m) => warnings.push(m),
  });
  assert.equal(third, first);
  assert.deepEqual(records.get("s"), first, "pinned snapshot persisted after recovery");
});

/** @purpose STRICT sealing (SPEC §2 decision 9): an EMPTY snapshot is a decision too — a session that started without a profile never gains one mid-session; a NEW session does. */
test("an empty snapshot is sealed: later config changes never activate a profile in that session", async () => {
  const records = new Map();
  const memo = new Map();
  const table = {
    get: (id) => records.get(id),
    put: async (id, snapshot) => {
      records.set(id, snapshot);
    },
  };
  const openTable = async () => table;
  let chosen = null;
  const build = () => ({ profileId: chosen, sections: chosen ? [{ id: "x", title: "X", order: 1, text: "t" }] : [] });
  // Session starts with no profile: an explicit EMPTY record is persisted.
  const first = await sealSnapshot({ sessionId: "s-empty", memo, openTable, createSnapshot: build });
  assert.deepEqual(first, { profileId: null, sections: [] });
  assert.deepEqual(records.get("s-empty"), { profileId: null, sections: [] }, "empty decision persisted durable-first");
  // The user later sets a default: the RUNNING session must NOT change …
  chosen = "light";
  const again = await sealSnapshot({ sessionId: "s-empty", memo, openTable, createSnapshot: build });
  assert.deepEqual(again, { profileId: null, sections: [] }, "the existing empty session stays empty");
  assert.equal(again, first, "the memoized decision object is reused");
  // … while a NEW session gets the profile.
  const fresh = await sealSnapshot({ sessionId: "s-new", memo, openTable, createSnapshot: build });
  assert.equal(fresh.profileId, "light");
  assert.equal(fresh.sections.length, 1);
  assert.deepEqual(records.get("s-new"), fresh);
  // After a restart (fresh memo) the persisted empty record is authoritative.
  const restarted = await sealSnapshot({
    sessionId: "s-empty",
    memo: new Map(),
    openTable,
    createSnapshot: () => {
      throw new Error("persisted empty record must not be rebuilt");
    },
  });
  assert.deepEqual(restarted, { profileId: null, sections: [] });
});
// #endregion TEST_pinnedDecision

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
