/**
 * #region moduleContract
 * @modulecontract
 * @purpose Freeze operation behaviour across the layered refactor: run the same
 *   68 operation cases against the BASELINE build (git ref, default 4ce8c7c —
 *   the last pre-refactor `lib/`) and the CURRENT `lib/`, and require status,
 *   result JSON, patch bytes, settings calls and diagnostics to be identical —
 *   except for cases marked as intended divergences.
 * @scope
 *  - The differential bench only: no assertions about internals, module layout
 *    or port wiring — those are structural and change on purpose.
 *  - NOT: a substitute for the behavioural suites (`pnpm test`).
 * @invariants
 *  - Both sides run over the SAME fake host, patch text and call sequence, so
 *    any difference is a behaviour change, never a fixture difference.
 *  - A side is addressed through its public operation set: the baseline gets
 *    the old deps bag, the current build gets composed host ports when it
 *    exposes them.
 *  - Skips only when the baseline ref is absent from this clone.
 *  - An intended divergence is a per-case `divergent` reason string: the case
 *    skips the parity comparison but still asserts its own expected statuses.
 *  - Every case pins its call statuses (`expectStatuses`, default all-200).
 * @invariants
 *  - Both sides run over the SAME fake host, patch text and call sequence, so
 *    any difference is a behaviour change, never a fixture difference.
 *  - A side is addressed through its public operation set: the baseline gets
 *    the old deps bag, the current build gets composed host ports when it
 *    exposes them.
 *  - Skips only when the baseline ref is absent from this clone.
 * @dependencies READS git history (`git archive <ref> lib`) and the built
 *   `lib/`; writes temp patch files under os.tmpdir only.
 * @keywords differential, regression, bench, behaviour freeze, refactor
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE = process.env.PP_BENCH_BASELINE ?? "4ce8c7c";

const SECTION_NAME = "@knopki/dsh-prompt-profiles/section";
const PROFILE_NAME = "@knopki/dsh-prompt-profiles/profile";
const WS_UUID = "11111111-1111-1111-1111-111111111111";
const WS_GHOST = "22222222-2222-2222-2222-222222222222";

// #region FUNC_fixtures
/** One `insert` row: what a section/profile this bundle created looks like in the patch. */
const insertRow = (id, name, config) =>
  `- insert:\n    - id: ${id}\n      name: "${name}"\n      config:\n${Object.entries(config)
    .map(([key, value]) => `        ${key}: ${value}\n`)
    .join("")}`;

const sectionPatch = (id, title, body) => `${insertRow(id, SECTION_NAME, { id, title, body })}`;

const sectionRow = (id, title, body, extra = {}) => ({
  id,
  title,
  body,
  rowId: `include:prompt-section-${id}`,
  source: "bundle",
  ...extra,
});
const profileRow = (id, title, sections, extra = {}) => ({
  id,
  title,
  sections,
  rowId: `include:prompt-profile-${id}`,
  source: "bundle",
  ...extra,
});

const TONE = sectionRow("tone", "Tone", "Be brief.");
const LIGHT = profileRow("light", "Light", [{ id: "tone", order: 1050, scope: "inherit" }]);

/** A patch that already carries the tone section as a user insert. */
const PATCH_WITH_TONE = sectionPatch("tone", "Tone", "Be brief.");
/** A patch whose YAML cannot be parsed (mirror/patch failure paths). */
const PATCH_BROKEN = "- insert: [\n";
// #endregion FUNC_fixtures

/**
 * THE 68 cases. Every entry is a full fake-host state plus the call sequence;
 * both sides replay it verbatim. `calls` entries are `{ op, input }`; unknown
 * ops are the operation names published by createOperations. A case pins its
 * CURRENT-side call statuses in `expectStatuses` (default: every call 200);
 * a case with `divergent: "<why>"` is an intended behaviour change and skips
 * the parity comparison while keeping its own status assertion.
 */
const CASES = [
  // --- state (8) ---
  { name: "state: empty registry, settings without revision", settingsRevision: false, calls: [{ op: "state" }] },
  {
    name: "state: rows with patchId, usedIn, emits, orders, default, last, revision",
    sections: [{ ...TONE, body: " " }, TONE],
    profiles: [LIGHT],
    defaultId: "light",
    lastByWorkspace: { ws1: "light" },
    calls: [{ op: "state" }],
  },
  {
    name: "state: patchId comes from configEditor.entries when present",
    sections: [TONE],
    entries: () => [{ options: { id: "include:prompt-section-tone" } }],
    calls: [{ op: "state" }],
  },
  {
    name: "state: no settings service at all",
    noSettings: true,
    defaultId: "light",
    lastByWorkspace: { w: "light" },
    calls: [{ op: "state" }],
  },
  {
    name: "state: settings.describe throws",
    describeThrows: true,
    calls: [{ op: "state" }],
    expectStatuses: [200],
    divergent: "the current build degrades to revision null instead of rejecting",
  },
  {
    name: "state: agentPresets.list throws -> modes empty",
    agentPresetsListThrows: true,
    calls: [{ op: "state" }],
  },
  {
    name: "state: agentPresets document unparseable -> complete stays false",
    agentPresets: {
      list: async () => [{ id: "p1", name: "Preset 1" }],
      readDocument: async () => ({ content: ":\n  - [" }),
    },
    calls: [{ op: "state" }],
  },
  {
    name: "state: persona complete nested in config.plugins -> complete true",
    agentPresets: {
      list: async () => [{ id: "complete", name: "Complete" }, { id: "plain" }],
      readDocument: async (id) => ({
        content:
          id === "complete"
            ? "insert:\n  - config:\n      plugins:\n        - name: '@deepseek-ai/dsh-persona'\n          config:\n            complete: true\n"
            : "insert: []\n",
      }),
    },
    calls: [{ op: "state" }],
  },

  // --- preview (6) ---
  {
    name: "preview: cwd substitution, builtin interleave, used variables",
    sections: [TONE],
    profiles: [LIGHT],
    calls: [{ op: "preview", input: { profileId: "light", cwd: "/work" } }],
  },
  {
    name: "preview: missing profileId -> 400",
    calls: [{ op: "preview", input: {} }],
    expectStatuses: [400],
  },
  {
    name: "preview: unknown profile -> 404",
    calls: [{ op: "preview", input: { profileId: "nope" } }],
    expectStatuses: [404],
  },
  {
    name: "preview: malformed variable skips the section with a reason",
    sections: [sectionRow("weird", "Weird", "a {{9bad}} b")],
    profiles: [profileRow("p", "P", [{ id: "weird", order: 1000 }])],
    calls: [{ op: "preview", input: { profileId: "p" } }],
    expectStatuses: [200],
    divergent: "the current build reports a malformed reference as a skip instead of emitting it literal",
  },
  {
    name: "preview: unknown variable reported as null",
    sections: [sectionRow("vars", "Vars", "{{host}} / {{cwd}}")],
    profiles: [profileRow("p", "P", [{ id: "vars", order: 1000 }])],
    calls: [{ op: "preview", input: { profileId: "p", cwd: "/cwd" } }],
  },
  {
    name: "preview: disabled, absent and scoped references are skipped with reasons",
    sections: [sectionRow("off", "Off", "x", { disabled: true }), sectionRow("main", "Main", "m")],
    profiles: [
      profileRow("p", "P", [
        { id: "off", order: 1000 },
        { id: "ghost", order: 1100 },
        { id: "main", order: 1200, scope: "subagents-only" },
      ]),
    ],
    calls: [{ op: "preview", input: { profileId: "p" } }],
  },

  // --- sectionCreate (10) ---
  { name: "sectionCreate: generated token", calls: [{ op: "sectionCreate", input: { title: "T", body: "B" } }] },
  { name: "sectionCreate: empty body allowed", calls: [{ op: "sectionCreate", input: { title: "T", body: "  " } }] },
  {
    name: "sectionCreate: explicit bare id",
    calls: [{ op: "sectionCreate", input: { id: "mine", title: "T", body: "B" } }],
  },
  {
    name: "sectionCreate: explicit full id",
    calls: [{ op: "sectionCreate", input: { id: "prompt-section-mine", title: "T", body: "B" } }],
  },
  {
    name: "sectionCreate: unsafe explicit id -> 400",
    calls: [{ op: "sectionCreate", input: { id: "../x" } }],
    expectStatuses: [400],
  },
  {
    name: "sectionCreate: registered config id duplicate -> 400",
    sections: [TONE],
    calls: [{ op: "sectionCreate", input: { id: "tone" } }],
  },
  {
    name: "sectionCreate: patch row id duplicate -> 400, bytes unchanged",
    patch: insertRow("prompt-section-tone", SECTION_NAME, {
      id: "prompt-section-tone",
      title: "Tone",
      body: "Be brief.",
    }),
    calls: [{ op: "sectionCreate", input: { id: "prompt-section-tone" } }],
    expectStatuses: [400],
  },
  {
    name: "sectionCreate: no configEditor -> 503",
    noConfigEditor: true,
    calls: [{ op: "sectionCreate" }],
    expectStatuses: [503],
  },
  {
    name: "sectionCreate: no settings -> 503",
    noSettings: true,
    calls: [{ op: "sectionCreate" }],
    expectStatuses: [503],
  },
  { name: "sectionCreate: blank title falls back to Section", calls: [{ op: "sectionCreate", input: { title: " " } }] },

  // --- sectionUpdate (8) ---
  {
    name: "sectionUpdate: replace with expected revision",
    sections: [TONE],
    calls: [{ op: "sectionUpdate", input: { rowId: "tone", value: { title: "T2", body: "B2" } } }],
  },
  {
    name: "sectionUpdate: qualified rowId still addresses the unqualified patch id",
    sections: [TONE],
    calls: [
      { op: "sectionUpdate", input: { rowId: "include:prompt-section-tone", value: { title: "T2", body: "B" } } },
    ],
  },
  {
    name: "sectionUpdate: unknown row -> 404",
    calls: [{ op: "sectionUpdate", input: { rowId: "nope", value: { title: "x", body: "y" } } }],
    expectStatuses: [404],
  },
  {
    name: "sectionUpdate: missing value.body -> 400",
    sections: [TONE],
    calls: [{ op: "sectionUpdate", input: { rowId: "tone", value: { title: "x" } } }],
    expectStatuses: [400],
  },
  {
    name: "sectionUpdate: non-volatile settings rejection -> 400",
    sections: [TONE],
    replaceError: "field id is not volatile",
    calls: [{ op: "sectionUpdate", input: { rowId: "tone", value: { title: "x", body: "y" } } }],
    expectStatuses: [400],
  },
  {
    name: "sectionUpdate: client revision mismatch -> 409",
    sections: [TONE],
    calls: [{ op: "sectionUpdate", input: { rowId: "tone", value: { title: "x", body: "y" }, revision: 1 } }],
  },
  {
    name: "sectionUpdate: SETTINGS_CONFLICT -> 409",
    sections: [TONE],
    replaceConflict: true,
    calls: [{ op: "sectionUpdate", input: { rowId: "tone", value: { title: "x", body: "y" }, revision: 7 } }],
    expectStatuses: [409],
  },
  {
    name: "sectionUpdate: whitespace body reports emits false",
    sections: [TONE],
    calls: [{ op: "sectionUpdate", input: { rowId: "tone", value: { title: "x", body: "  " } } }],
  },

  // --- sectionDelete (6) ---
  {
    name: "sectionDelete: user row is physically removed",
    patch: PATCH_WITH_TONE,
    sections: [{ ...TONE, source: "user" }],
    calls: [{ op: "sectionDelete", input: { rowId: "tone" } }],
  },
  {
    name: "sectionDelete: bundle row is disabled with a bare override",
    sections: [TONE],
    calls: [{ op: "sectionDelete", input: { rowId: "tone" } }],
  },
  {
    name: "sectionDelete: unknown row -> 404",
    calls: [{ op: "sectionDelete", input: { rowId: "nope" } }],
    expectStatuses: [404],
  },
  {
    name: "sectionDelete: user-source row absent from the patch -> 404",
    sections: [{ ...TONE, source: "user" }],
    calls: [{ op: "sectionDelete", input: { rowId: "tone" } }],
  },
  {
    name: "sectionDelete: unreadable patch -> 500",
    patch: PATCH_BROKEN,
    sections: [TONE],
    calls: [{ op: "sectionDelete", input: { rowId: "tone" } }],
    expectStatuses: [500],
  },
  {
    name: "sectionDelete: no configEditor -> 503",
    noConfigEditor: true,
    calls: [{ op: "sectionDelete" }],
    expectStatuses: [503],
  },

  // --- sectionRename (6) ---
  {
    name: "sectionRename: user-owned old row is removed in the same commit",
    patch: PATCH_WITH_TONE,
    sections: [{ ...TONE, source: "user" }],
    calls: [{ op: "sectionRename", input: { rowId: "tone", id: "prompt-section-renamed" } }],
  },
  {
    name: "sectionRename: bundle-owned old row is disabled instead",
    sections: [TONE],
    calls: [{ op: "sectionRename", input: { rowId: "tone", id: "prompt-section-renamed" } }],
  },
  {
    name: "sectionRename: same id -> 400",
    sections: [TONE],
    calls: [{ op: "sectionRename", input: { rowId: "tone", id: "prompt-section-tone" } }],
    expectStatuses: [400],
  },
  {
    name: "sectionRename: clash with another registered section -> 400",
    sections: [TONE, sectionRow("other", "Other", "o")],
    calls: [{ op: "sectionRename", input: { rowId: "tone", id: "prompt-section-other" } }],
    expectStatuses: [400],
  },
  {
    name: "sectionRename: duplicate patch row id -> 400 with rollback",
    patch: `${PATCH_WITH_TONE}${insertRow("prompt-section-taken", SECTION_NAME, { id: "prompt-section-taken", title: "Taken", body: "t" })}`,
    sections: [TONE],
    calls: [{ op: "sectionRename", input: { rowId: "tone", id: "prompt-section-taken" } }],
    expectStatuses: [400],
  },
  {
    name: "sectionRename: missing id -> 400",
    sections: [TONE],
    calls: [{ op: "sectionRename", input: { rowId: "tone" } }],
    expectStatuses: [400],
  },

  // --- profileCreate (6) ---
  {
    name: "profileCreate: registered section refs",
    sections: [TONE],
    calls: [{ op: "profileCreate", input: { title: "P", sections: [{ id: "tone", order: 1050 }] } }],
  },
  {
    name: "profileCreate: pending patch section counts as a target -> 400",
    patch: PATCH_WITH_TONE,
    calls: [{ op: "profileCreate", input: { title: "P", sections: [{ id: "prompt-section-tone", order: 1050 }] } }],
    expectStatuses: [400],
  },
  {
    name: "profileCreate: unknown ref -> 400",
    calls: [{ op: "profileCreate", input: { title: "P", sections: [{ id: "ghost", order: 1 }] } }],
    expectStatuses: [400],
  },
  {
    name: "profileCreate: disabled pending row -> 400",
    patch: `- id: prompt-section-tone\n  name: ${SECTION_NAME}\n  disabled: true\n`,
    calls: [{ op: "profileCreate", input: { title: "P", sections: [{ id: "prompt-section-tone", order: 1 }] } }],
    expectStatuses: [400],
  },
  {
    name: "profileCreate: explicit registered id duplicate -> 400",
    profiles: [LIGHT],
    calls: [{ op: "profileCreate", input: { id: "light", title: "P" } }],
  },
  { name: "profileCreate: no sections -> []", calls: [{ op: "profileCreate", input: { title: "P" } }] },

  // --- profileUpdate (4) ---
  {
    name: "profileUpdate: whole sections array replaces",
    sections: [TONE],
    profiles: [LIGHT],
    calls: [{ op: "profileUpdate", input: { rowId: "light", value: { title: "L2", sections: [] } } }],
  },
  {
    name: "profileUpdate: unknown row -> 404",
    calls: [{ op: "profileUpdate", input: { rowId: "nope", value: { title: "x" } } }],
    expectStatuses: [404],
  },
  {
    name: "profileUpdate: unknown ref -> 400",
    profiles: [LIGHT],
    calls: [
      { op: "profileUpdate", input: { rowId: "light", value: { title: "x", sections: [{ id: "ghost", order: 1 }] } } },
    ],
    expectStatuses: [400],
  },
  {
    name: "profileUpdate: extra value key is ignored",
    sections: [TONE],
    profiles: [LIGHT],
    calls: [
      {
        op: "profileUpdate",
        input: { rowId: "light", value: { title: "x", sections: [{ id: "tone", order: 1 }], body: "ignored" } },
      },
    ],
  },

  // --- profileDelete (4) ---
  {
    name: "profileDelete: user row removed and references cleared",
    patch: insertRow("prompt-profile-light", PROFILE_NAME, { id: "prompt-profile-light", title: "Light" }),
    sections: [TONE],
    profiles: [{ ...LIGHT, id: "prompt-profile-light", rowId: "include:prompt-profile-light", source: "user" }],
    defaultId: "prompt-profile-light",
    lastByWorkspace: { w: "prompt-profile-light", keep: "" },
    calls: [{ op: "profileDelete", input: { rowId: "prompt-profile-light" } }],
  },
  {
    name: "profileDelete: bundle row disabled",
    profiles: [LIGHT],
    calls: [{ op: "profileDelete", input: { rowId: "light" } }],
  },
  {
    name: "profileDelete: failing cleanup is logged, not fatal",
    profiles: [LIGHT],
    mutateError: "settings down",
    calls: [{ op: "profileDelete", input: { rowId: "light" } }],
  },
  {
    name: "profileDelete: unknown row -> 404",
    calls: [{ op: "profileDelete", input: { rowId: "nope" } }],
    expectStatuses: [404],
  },

  // --- defaultSet (4) ---
  {
    name: "defaultSet: writes the default through mutate",
    profiles: [LIGHT],
    calls: [{ op: "defaultSet", input: { default: "light" } }],
  },
  { name: "defaultSet: empty string clears", profiles: [LIGHT], calls: [{ op: "defaultSet", input: { default: "" } }] },
  {
    name: "defaultSet: unknown profile -> 404",
    calls: [{ op: "defaultSet", input: { default: "ghost" } }],
    expectStatuses: [404],
  },
  {
    name: "defaultSet: HMR-lagged removed user row -> 404",
    profiles: [{ ...LIGHT, source: "user" }],
    calls: [{ op: "defaultSet", input: { default: "light" } }],
    expectStatuses: [404],
  },

  // --- last (6) ---
  {
    name: "last: writes the workspace key",
    profiles: [LIGHT],
    calls: [{ op: "last", input: { workspaceId: "ws-1", profileId: "light" } }],
  },
  {
    name: "last: explicit none is stored as an empty string",
    profiles: [LIGHT],
    calls: [{ op: "last", input: { workspaceId: "ws-1", profileId: "" } }],
  },
  {
    name: "last: prunes dangling and unknown-workspace keys",
    profiles: [LIGHT],
    lastByWorkspace: { [WS_UUID]: "light", [WS_GHOST]: "ghost", "cwd:/x": "ghost2" },
    workspaceRegistry: { get: (id) => (id === WS_UUID ? { id } : undefined) },
    calls: [{ op: "last", input: { workspaceId: "ws-1", profileId: "light" } }],
  },
  {
    name: "last: without a revision the prune is skipped",
    profiles: [LIGHT],
    settingsRevision: false,
    lastByWorkspace: { [WS_GHOST]: "ghost" },
    calls: [{ op: "last", input: { workspaceId: "ws-1", profileId: "light" } }],
  },
  {
    name: "last: unknown profile -> 404 and no settings write",
    profiles: [LIGHT],
    calls: [{ op: "last", input: { workspaceId: "ws-1", profileId: "ghost" } }],
    expectStatuses: [404],
  },
  {
    name: "last: one SETTINGS_CONFLICT is retried inside the lock",
    profiles: [LIGHT],
    mutateConflicts: 1,
    calls: [{ op: "last", input: { workspaceId: "ws-1", profileId: "light" } }],
  },
];

/** The baseline ref must exist in this clone, or the gate cannot compare anything. */
function baselineAvailable() {
  const probe = spawnSync("git", ["cat-file", "-e", `${BASELINE}^{commit}`], { cwd: REPO });
  return probe.status === 0;
}

/** Extract the baseline `lib/` into a temp dir inside the repo, so node resolves node_modules. */
async function extractBaselineLib() {
  const dir = await mkdtemp(join(REPO, "test", ".bench-baseline-"));
  const archive = execFileSync("git", ["archive", "--format=tar", BASELINE, "lib"], {
    cwd: REPO,
    maxBuffer: 1 << 28,
  });
  const untar = spawnSync("tar", ["-x", "-C", dir], { input: archive });
  assert.equal(untar.status, 0, `tar failed to extract the baseline lib/: ${untar.stderr}`);
  return dir;
}

// #region FUNC_harness
/**
 * @purpose Build ONE fake host from a case spec and run its call sequence
 *   through the given operation set. The same spec drives both sides, so the
 *   returned observation is the only thing that can differ.
 */
async function observe(spec, side) {
  const dir = await mkdtemp(join(tmpdir(), "pp-bench-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(patchPath, spec.patch ?? "[]\n", { mode: 0o600 });
  let defaultId = spec.defaultId ?? "";
  let lastByWorkspace = spec.lastByWorkspace ?? {};
  let revision = spec.revision ?? 7;
  let mutateConflicts = spec.mutateConflicts ?? 0;
  const mutations = [];
  const replacements = [];
  const logs = [];
  const applyOps = (ops) => {
    for (const op of ops) {
      if (op.path[0] === "default") {
        if (op.op === "set") defaultId = op.value;
        continue;
      }
      if (op.path[0] !== "lastByWorkspace") continue;
      const key = op.path[1];
      if (key === undefined) continue;
      const next = { ...lastByWorkspace };
      if (op.op === "set") next[key] = op.value;
      else delete next[key];
      lastByWorkspace = next;
    }
  };
  const settings = {
    describe: spec.describeThrows
      ? () => {
          throw new Error("describe exploded");
        }
      : () => [{ ns: "prompt-profiles", ...(spec.settingsRevision === false ? {} : { revision }) }],
    mutate: async (ns, ops, expected) => {
      if (mutateConflicts > 0) {
        mutateConflicts -= 1;
        const conflict = new Error("configuration changed");
        conflict.code = "SETTINGS_CONFLICT";
        throw conflict;
      }
      if (spec.mutateError) throw new Error(spec.mutateError);
      if (typeof expected === "number" && expected !== revision) {
        const conflict = new Error("configuration changed");
        conflict.code = "SETTINGS_CONFLICT";
        throw conflict;
      }
      mutations.push({ ns, ops, expected });
      revision += 1;
      applyOps(ops);
    },
    replace: async (ns, value, expected) => {
      if (spec.replaceError) throw new Error(spec.replaceError);
      if (spec.replaceConflict) {
        const conflict = new Error("configuration changed");
        conflict.code = "SETTINGS_CONFLICT";
        throw conflict;
      }
      replacements.push({ ns, value, expected });
      revision += 1;
    },
  };
  const service = {
    sections: () => spec.sections ?? [],
    profiles: () => spec.profiles ?? [],
    usedIn: () => [],
    builtinOrders: () => ({ TOOL_BASH: 1000, PLAN_POLICY: 500 }),
    builtinOrdersByName: () => ({ "tool:bash": 1000, "plan:policy": 500 }),
    config: { default: { get: () => defaultId }, lastByWorkspace: { get: () => lastByWorkspace } },
  };
  const ctx = {
    settings,
    configEditor: spec.entries || !spec.noConfigEditor ? { documentPath: patchPath, entries: spec.entries } : undefined,
  };
  ctx.get = (name) => {
    if (name === "settings") return spec.noSettings ? undefined : ctx.settings;
    if (name === "configEditor") return ctx.configEditor;
    if (name === "workspaceRegistry") return spec.workspaceRegistry;
    if (name === "agentPresets") {
      if (spec.agentPresetsListThrows) {
        return {
          list: async () => {
            throw new Error("presets exploded");
          },
          readDocument: async () => ({}),
        };
      }
      return spec.agentPresets;
    }
    return undefined;
  };
  const warn = (message, details) => logs.push({ level: "warn", message, details });
  const getService = (name) => {
    try {
      return ctx.get(name);
    } catch {
      return undefined;
    }
  };
  // The baseline returns `{ ops }`; the current build returns the set directly.
  const created = side.createHostPorts
    ? side.createOperations(side.createHostPorts({ service, getService, warn, log: { warn } }))
    : side.createOperations({ service, getService, warn, log: { warn } });
  const ops = side.createHostPorts ? created : created.ops;
  // Deterministic minted ids: both sides must see the SAME token sequence.
  const restoreTokens = side.stubTokens(spec.tokens ?? ["bench0001", "bench0002", "bench0003"]);
  try {
    const results = [];
    for (const call of spec.calls) {
      try {
        const value = call.input === undefined ? await ops[call.op]() : await ops[call.op](call.input);
        results.push({ status: 200, body: value === undefined ? { ok: true } : { ok: true, ...value } });
      } catch (error) {
        results.push({ status: error?.status ?? 500, body: { error: { message: side.errorMessage(error) } } });
      }
    }
    return {
      results,
      patch: await readFile(patchPath, "utf8"),
      mutations,
      replacements,
      logs,
    };
  } finally {
    restoreTokens();
    await rm(dir, { recursive: true, force: true });
  }
}
// #endregion FUNC_harness

// #region FUNC_side
/** Load one side: its operation set, its optional host-port composition, and a token stub for id minting. */
async function loadSide(createOperations, createHostPorts, tokenSource, messageOf) {
  return {
    createOperations,
    createHostPorts,
    stubTokens(tokens) {
      const original = tokenSource.next;
      let index = 0;
      tokenSource.next = () => tokens[index++] ?? "ffffffff";
      return () => {
        tokenSource.next = original;
      };
    },
    errorMessage: messageOf,
  };
}
// #endregion FUNC_side

test("differential: 68 operation cases match the pre-refactor build byte for byte", {
  skip: baselineAvailable() ? false : `baseline ref ${BASELINE} is not available in this clone`,
}, async () => {
  const baselineDir = await extractBaselineLib();
  try {
    const baselineDomain = await import(pathToFileURL(join(baselineDir, "lib", "domain", "index.js")).href);
    const baselineOps = await import(pathToFileURL(join(baselineDir, "lib", "operations.js")).href);
    const currentDomain = await import(pathToFileURL(join(REPO, "lib", "domain", "index.js")).href);
    const currentOps = await import(pathToFileURL(join(REPO, "lib", "application", "index.js")).href);
    const currentInfra = await import(pathToFileURL(join(REPO, "lib", "infra", "index.js")).href);

    const oldSide = await loadSide(
      baselineOps.createOperations,
      undefined,
      baselineOps.tokenSource,
      baselineDomain.errorMessage,
    );
    const newSide = await loadSide(
      currentOps.createOperations,
      currentInfra.createHostPorts,
      currentOps.tokenSource,
      currentDomain.errorMessage,
    );

    assert.equal(CASES.length, 68, "the bench is pinned at 68 cases");
    // CONTROL: the two sides must be distinct modules and the comparator must
    // see a difference — otherwise a green run would prove nothing.
    assert.notEqual(baselineOps.createOperations, currentOps.createOperations, "sides are distinct modules");
    assert.ok(existsSync(join(baselineDir, "lib", "writer.js")), "the baseline is the pre-refactor layout");
    const controlBefore = await observe(CASES[1], oldSide);
    const controlAfter = await observe({ ...CASES[1], lastByWorkspace: { other: "light" } }, oldSide);
    assert.notDeepEqual(controlAfter, controlBefore, "the comparator must detect a difference");

    const differences = [];
    const statusMismatches = [];
    const diverged = [];
    const observations = [];
    for (const spec of CASES) {
      const tokens = ["bench0001", "bench0002", "bench0003"];
      const before = await observe({ ...spec, tokens }, oldSide);
      const after = await observe({ ...spec, tokens }, newSide);
      observations.push(before);
      // Each case pins its CURRENT-side call statuses (default: all-200).
      const observed = after.results.map((step) => step.status);
      const expectedStatuses = spec.expectStatuses ?? spec.calls.map(() => 200);
      try {
        assert.deepEqual(observed, expectedStatuses);
      } catch {
        statusMismatches.push(`${spec.name}: expected [${expectedStatuses}] but observed [${observed}]`);
      }
      // An intended divergence states why and skips the parity comparison;
      // every other case must be byte-identical to the baseline.
      if (typeof spec.divergent === "string") {
        assert.ok(spec.divergent.length > 0, `${spec.name}: a divergent case must state why`);
        diverged.push(spec.name);
        continue;
      }
      try {
        assert.deepEqual(after, before);
      } catch (error) {
        differences.push(`${spec.name}\n${error.message}`);
      }
    }
    assert.deepEqual(statusMismatches, [], `unexpected call statuses:\n${statusMismatches.join("\n")}`);
    assert.deepEqual(differences, [], `behaviour drifted from ${BASELINE}:\n${differences.join("\n\n")}`);
    assert.deepEqual(
      diverged.sort(),
      ["preview: malformed variable skips the section with a reason", "state: settings.describe throws"],
      "exactly the two intended divergences are marked",
    );

    // Coverage: a degenerate all-error or all-read run would be green for the
    // wrong reason. Pin that the bench actually succeeds, writes and mutates.
    const succeeded = observations.filter((entry) => entry.results.every((step) => step.status === 200));
    const failed = observations.filter((entry) => entry.results.some((step) => step.status !== 200));
    const wrote = observations.filter((entry) => entry.patch !== "[]\n" && entry.patch !== PATCH_WITH_TONE);
    const settingsCalls = observations.filter((entry) => entry.mutations.length + entry.replacements.length > 0);
    assert.ok(succeeded.length >= 35, `expected >=35 clean cases, got ${succeeded.length}`);
    assert.ok(failed.length >= 25, `expected >=25 failure cases, got ${failed.length}`);
    assert.ok(wrote.length >= 12, `expected >=12 patch writes, got ${wrote.length}`);
    assert.ok(settingsCalls.length >= 8, `expected >=8 settings writes, got ${settingsCalls.length}`);
  } finally {
    await rm(baselineDir, { recursive: true, force: true });
  }
});
