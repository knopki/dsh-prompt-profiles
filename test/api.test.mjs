/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin the shared prompt-profile operations (frozen live-bugfix
 *   contract: rowId OR patchId addressing, whole-object writes via
 *   settings.replace) against fake settings/configEditor services and a temp
 *   profile patch: validation-first writes, correct dispatch of each
 *   operation, clean ApiError statuses, and failure diagnostics.
 * @scope node:test with in-memory fakes; NOT: the platform transport (the
 *   Remote surface has its own suites: test/smoke-cordis.test.mjs and
 *   test/remote/client-remote.spec.mjs).
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isSeq, parseDocument } from "yaml";
import { BUILTIN_ORDERS, builtinOrdersByName as nameBuiltinOrders } from "../lib/builtin-orders.js";
import { createOperations, errorText, tokenSource } from "../lib/operations.js";
import { resolveProfileId } from "../lib/resolve.js";

const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };

// #region CONST_operations
/**
 * @purpose Path → operation map of the test's own driver. The bundle publishes
 *   one operation set; this table is only how the tests address it, so every
 *   assertion below is about operation behaviour, not about a transport.
 */
const OPERATIONS = {
  "/state": { method: "GET", op: "state" },
  "/preview": { method: "GET", op: "preview" },
  "/section/create": { method: "POST", op: "sectionCreate" },
  "/section/update": { method: "POST", op: "sectionUpdate" },
  "/section/delete": { method: "POST", op: "sectionDelete" },
  "/section/rename": { method: "POST", op: "sectionRename" },
  "/profile/create": { method: "POST", op: "profileCreate" },
  "/profile/update": { method: "POST", op: "profileUpdate" },
  "/profile/delete": { method: "POST", op: "profileDelete" },
  "/default": { method: "POST", op: "defaultSet" },
  "/last": { method: "POST", op: "last" },
};
// #endregion CONST_operations

// #region FUNC_harness
/**
 * @purpose Compose one operation set over fakes plus a temp patch file and
 *   return a `call(method, path, body)` driver. The fake settings records
 *   BOTH mutate ops and whole-object replace calls.
 */
async function harness({
  sections = [],
  profiles = [],
  defaultId = "",
  lastByWorkspace = {},
  agentPresets,
  agentPresetsGetThrows = false,
  entries,
  workspaceRegistry,
  builtinOrdersByName,
  beforeMutate,
  settingsRevision = true,
  configEditor: configEditorOverride,
  settings: settingsOverride,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-api-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(patchPath, "# comment\n[]\n", { mode: 0o600 });
  const mutations = [];
  const replacements = [];
  const logs = [];
  let revision = 7;
  const settings = settingsOverride ?? {
    // settingsRevision:false emulates a settings service whose describe()
    // carries no revision (CAS unavailable).
    describe: () => [{ ns: "prompt-profiles", ...(settingsRevision ? { revision } : {}) }],
    mutate: async (ns, ops, expected) => {
      // Test hook: a test may bump the revision here to emulate a concurrent
      // writer, making the expected-revision check below fail as a conflict,
      // or inject a foreign lastByWorkspace value between our read and write.
      if (typeof beforeMutate === "function") {
        await beforeMutate({
          ops,
          expected,
          bumpRevision: () => {
            revision += 1;
          },
          setLastByWorkspace: (value) => {
            lastByWorkspace = value;
          },
        });
      }
      if (typeof expected === "number" && expected !== revision) {
        const conflict = new Error("configuration changed");
        conflict.code = "SETTINGS_CONFLICT";
        throw conflict;
      }
      mutations.push({ ns, ops, expected });
      revision += 1;
      // Apply ops the way dsh-settings does: against the CURRENT value, one
      // path at a time. lastByWorkspace.<key> set/unset touches ONE key only.
      for (const op of ops) {
        if (op.path[0] === "default") {
          if (op.op === "set") defaultId = op.value;
          continue;
        }
        if (op.path[0] !== "lastByWorkspace") continue;
        const key = op.path[1];
        if (key === undefined) {
          if (op.op === "set") lastByWorkspace = op.value; // whole-dict (legacy)
          continue;
        }
        const next = { ...lastByWorkspace };
        if (op.op === "set") next[key] = op.value;
        else delete next[key];
        lastByWorkspace = next;
      }
    },
    replace: async (ns, value, expected) => {
      replacements.push({ ns, value, expected });
      revision += 1;
    },
  };
  const service = {
    sections: () => sections,
    profiles: () => profiles,
    usedIn: (id) =>
      profiles.flatMap((profile) =>
        profile.sections
          .filter((ref) => ref.id === id)
          .map((ref) => ({ profileId: profile.id, scope: ref.scope ?? "inherit" })),
      ),
    builtinOrders: () => ({ TOOL_BASH: 1000 }),
    builtinOrdersByName: () => builtinOrdersByName ?? { "tool:bash": 1000 },
    config: { default: { get: () => defaultId }, lastByWorkspace: { get: () => lastByWorkspace } },
  };
  const ctx = {
    settings,
    configEditor:
      configEditorOverride ?? (entries ? { documentPath: patchPath, entries } : { documentPath: patchPath }),
  };
  // Optional services are exposed ONLY through cordis REFLECT (`ctx.get`) —
  // exactly like the live host, where a service is a `ctx.<name>` property
  // only when the plugin declares it in `inject`. No `ctx.agentPresets`
  // property is set, so a regression to property access empties `modes`.
  ctx.get = (name) => {
    if (name === "workspaceRegistry") return workspaceRegistry;
    if (name === "agentPresets") {
      if (agentPresetsGetThrows) throw new Error("agentPresets reflect exploded");
      return agentPresets;
    }
    if (name === "settings") return ctx.settings;
    if (name === "configEditor") return ctx.configEditor;
    return undefined;
  };
  const warn = (message, details) => logs.push({ level: "warn", message, details });
  // The surfaces hand the operations a GUARDED reader (a throwing REFLECT read
  // degrades to "absent"); the harness reproduces exactly that contract.
  const getService = (name) => {
    try {
      return ctx.get(name);
    } catch {
      return undefined;
    }
  };
  const { ops } = createOperations({
    service,
    getService,
    warn,
    log: { warn },
  });
  return {
    patchPath,
    mutations,
    replacements,
    logs,
    ops,
    configValues: () => ({ defaultId, lastByWorkspace }),
    async call(method, path, body) {
      const [pathname, search] = path.split("?");
      const route = OPERATIONS[pathname];
      if (!route) return { status: 404, body: null };
      if (route.method !== method) return { status: 405, body: null };
      const query = new URLSearchParams(search ?? "");
      try {
        const result =
          route.op === "preview"
            ? await ops.preview({
                profileId: query.get("profileId") ?? undefined,
                cwd: query.get("cwd") ?? undefined,
              })
            : await ops[route.op](body ?? {});
        return { status: 200, body: result === undefined ? { ok: true } : { ok: true, ...result } };
      } catch (error) {
        return { status: error?.status ?? 500, body: { error: { message: errorText(error) } } };
      }
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const userSection = { id: "tone", title: "Tone", body: "Be brief.", rowId: "prompt-section-tone", source: "user" };
const userProfile = {
  id: "light",
  title: "Light",
  sections: [{ id: "tone", order: 1050, scope: "inherit" }],
  rowId: "prompt-profile-light",
  source: "bundle",
};
// #endregion FUNC_harness

// #region TEST_state
/** @purpose GET /state serves every field SPEC §5.5 lists PLUS patchId on every row (frozen contract). */
test("state returns profiles, sections with patchId, usedIn, builtinOrders, default, last, revision", async () => {
  const api = await harness({
    sections: [userSection],
    profiles: [userProfile],
    defaultId: "light",
    lastByWorkspace: { ws1: "light" },
  });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.deepEqual(body.profiles, [{ ...userProfile, patchId: "prompt-profile-light" }]);
    assert.deepEqual(body.sections, [
      {
        ...userSection,
        patchId: "prompt-section-tone",
        usedIn: [{ profileId: "light", scope: "inherit" }],
        emits: true,
      },
    ]);
    assert.deepEqual(body.builtinOrders, { TOOL_BASH: 1000 });
    assert.deepEqual(body.modes, []);
    assert.equal(body.default, "light");
    assert.deepEqual(body.lastByWorkspace, { ws1: "light" });
    assert.equal(body.revision, 7);
  } finally {
    await api.cleanup();
  }
});

/** @purpose A registry row whose rowId is the QUALIFIED loader entry id still reports a clean unqualified patchId. */
test("state normalizes patchId for qualified loader entry rowIds", async () => {
  const qualified = { ...userSection, rowId: "include:prompt-section-tone" };
  const api = await harness({ sections: [qualified] });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.equal(body.sections[0].rowId, "include:prompt-section-tone");
    assert.equal(body.sections[0].patchId, "prompt-section-tone");
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_state

// #region TEST_validation
/** @purpose Bad payloads fail with a clean error object, no file write, no settings call — the patch stays byte-identical (task d). */
test("whole-object validation rejects bad values without writing (patch byte-identical)", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    const before = await readFile(api.patchPath, "utf8");
    const attacks = [
      ["/section/create", { title: "T", body: 42 }],
      ["/section/create", { id: "Bad_Id", title: "T", body: "B" }],
      ["/section/update", { rowId: "prompt-section-tone", value: { title: "  ", body: "x" } }],
      ["/section/update", { rowId: "prompt-section-tone", value: { title: "T", body: 7 } }],
      ["/section/update", { rowId: "prompt-section-tone", value: "not-an-object" }],
      ["/section/update", { rowId: "prompt-section-tone", revision: "not-a-number", value: { title: "T", body: "x" } }],
      [
        "/profile/update",
        { rowId: "prompt-profile-light", value: { title: "T", sections: [{ id: "ghost", order: 1 }] } },
      ],
      [
        "/profile/update",
        { rowId: "prompt-profile-light", value: { title: "T", sections: [{ id: "tone", order: "invalid" }] } },
      ],
      [
        "/profile/update",
        {
          rowId: "prompt-profile-light",
          value: { title: "T", sections: [{ id: "tone", order: 1, scope: "everywhere" }] },
        },
      ],
      ["/profile/update", { rowId: "prompt-profile-light", value: { title: "T", sections: "not-an-array" } }],
      ["/profile/update", { rowId: "prompt-profile-light", value: { title: "", sections: [] } }],
      ["/profile/create", { title: "T", sections: [{ id: "x", order: "many" }] }],
      ["/profile/create", { title: "T", sections: [{ id: "x", order: 1, scope: "everywhere" }] }],
      ["/default", {}],
      ["/default", { default: 42 }],
    ];
    for (const [path, body] of attacks) {
      const { status, payload } = await api
        .call("POST", path, body)
        .then((result) => ({ status: result.status, payload: result.body }));
      assert.equal(status, 400, `${path} ${JSON.stringify(body)}`);
      assert.ok(payload.error.message);
    }
    assert.equal(await readFile(api.patchPath, "utf8"), before, "patch file byte-identical after validation failures");
    assert.equal(api.mutations.length, 0);
    assert.equal(api.replacements.length, 0);
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_validation

// #region TEST_create
/** @purpose section/profile create write insert rows through the writer and answer the full frozen-contract payload INCLUDING patchId (task e). */
test("section and profile create append insert rows and return rowId + patchId + configId", async () => {
  const api = await harness();
  try {
    const section = await api.call("POST", "/section/create", { title: "Tone", body: "Be brief." });
    assert.equal(section.status, 200);
    // FROZEN ID SCHEME: configId IS the full row id (prefix included).
    assert.match(section.body.configId, /^prompt-section-[0-9a-f]{8}$/);
    assert.equal(section.body.rowId, section.body.configId);
    assert.equal(section.body.patchId, section.body.rowId);
    assert.equal(section.body.title, "Tone");
    assert.equal(section.body.body, "Be brief.");
    const profile = await api.call("POST", "/profile/create", {
      title: "Light",
      sections: [{ id: section.body.configId, order: 1050 }],
    });
    assert.match(profile.body.configId, /^prompt-profile-[0-9a-f]{8}$/);
    assert.equal(profile.body.rowId, profile.body.configId);
    assert.equal(profile.body.title, "Light");
    assert.deepEqual(
      profile.body.sections,
      [{ id: section.body.configId, order: 1050 }],
      "the full-id ref round-trips unchanged",
    );
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const inserts = document.contents.items.filter((item) => item?.get?.("insert"));
    const rows = inserts.flatMap((item) =>
      item.get("insert").items.map((row) => ({
        id: row.get("id"),
        configId: row.get("config").get("id"),
      })),
    );
    assert.deepEqual(rows.map((row) => row.id).sort(), [profile.body.rowId, section.body.rowId].sort());
    for (const row of rows) assert.equal(row.configId, row.id, "stored config.id equals the full row id");
  } finally {
    await api.cleanup();
  }
});

// #region TEST_refConsistency
/** @purpose H5: CREATE and UPDATE accept the same refs — registered, or pending in the patch — and both reject typos; no CREATE-only allowance. */
test("profile create and update reject unknown section refs symmetrically", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    const typo = "prompt-section-typo1234";
    const created = await api.call("POST", "/profile/create", { title: "P", sections: [{ id: typo, order: 1 }] });
    assert.equal(created.status, 400, "a syntactically valid but unknown ref is rejected on CREATE");
    assert.match(created.body.error.message, /not a registered section/);
    const updated = await api.call("POST", "/profile/update", {
      rowId: "prompt-profile-light",
      value: { title: "L", sections: [{ id: typo, order: 1 }] },
    });
    assert.equal(updated.status, 400, "and symmetrically on UPDATE");
    // A section created moments earlier (row already in the patch, HMR pending)
    // IS accepted on BOTH paths — the create-then-add flow keeps working.
    const section = await api.call("POST", "/section/create", { title: "Fresh", body: "y" });
    const okCreate = await api.call("POST", "/profile/create", {
      title: "P2",
      sections: [{ id: section.body.configId, order: 1 }],
    });
    assert.equal(okCreate.status, 200, "pending patch row accepted on CREATE");
    assert.deepEqual(okCreate.body.sections, [{ id: section.body.configId, order: 1 }]);
    const okUpdate = await api.call("POST", "/profile/update", {
      rowId: "prompt-profile-light",
      value: { title: "L", sections: [{ id: section.body.configId, order: 2 }] },
    });
    assert.equal(okUpdate.status, 200, "pending patch row accepted on UPDATE");
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_refConsistency

/** @purpose H5: a pending ref counts ONLY for a real, live, config-bearing SECTION row; profile/foreign/disabled/config-less ids are 400. */
test("pending section refs require a real live section row in the patch", async () => {
  const api = await harness({ profiles: [], sections: [] });
  try {
    await writeFile(
      api.patchPath,
      [
        "- insert:",
        "    - id: prompt-section-pending",
        `      name: "@knopki/dsh-prompt-profiles/section"`,
        "      config: { id: prompt-section-pending, title: P, body: B }",
        "- id: prompt-section-nocfg",
        `  name: "@knopki/dsh-prompt-profiles/section"`,
        "- id: prompt-section-disabled",
        `  name: "@knopki/dsh-prompt-profiles/section"`,
        "  disabled: true",
        "  config: { id: prompt-section-disabled }",
        "- id: prompt-section-foreign",
        '  name: "some-other-plugin"',
        "  config: { id: prompt-section-foreign }",
        "- insert:",
        "    - id: prompt-profile-other",
        `      name: "@knopki/dsh-prompt-profiles/profile"`,
        "      config: { id: other }",
        "",
      ].join("\n"),
    );
    const create = (id) => api.call("POST", "/profile/create", { title: "P", sections: [{ id, order: 1 }] });
    assert.equal((await create("prompt-section-pending")).status, 200, "a real pending section row is accepted");
    for (const bad of [
      "prompt-section-nocfg",
      "prompt-section-disabled",
      "prompt-section-foreign",
      "prompt-profile-other",
    ]) {
      const { status, body } = await create(bad);
      assert.equal(status, 400, `${bad} must be rejected: ${JSON.stringify(body)}`);
    }
  } finally {
    await api.cleanup();
  }
});

/** @purpose Create ids are short random tokens (SPEC §3/§5.5) carried IDENTICALLY by rowId and configId (full prefixed form), with no dependence on the title. */
test("create mints one full id used as rowId and configId, unique across creates", async () => {
  const api = await harness();
  try {
    const section = await api.call("POST", "/section/create", { title: "Тестовая секция", body: "x" });
    assert.equal(section.status, 200);
    assert.match(section.body.configId, /^prompt-section-[0-9a-f]{8}$/);
    assert.equal(section.body.rowId, section.body.configId, "rowId === configId (full prefixed id)");
    assert.equal(section.body.patchId, section.body.rowId);
    assert.equal(section.body.title, "Тестовая секция");

    const profile = await api.call("POST", "/profile/create", { title: "Light", sections: [] });
    assert.match(profile.body.configId, /^prompt-profile-[0-9a-f]{8}$/);
    assert.equal(profile.body.rowId, profile.body.configId);

    // two consecutive creates never share an id
    const again = await api.call("POST", "/section/create", { body: "b" });
    assert.notEqual(again.body.configId, section.body.configId);
    assert.equal(again.body.configId, again.body.rowId);
    assert.equal(again.body.title, "Section", "default title kept");

    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const ids = document.contents.items.map((item) => item.get("insert")?.items?.[0]?.get("id")).filter(Boolean);
    assert.deepEqual(ids.sort(), [profile.body.configId, again.body.configId, section.body.configId].sort());
  } finally {
    await api.cleanup();
  }
});

/** @purpose A forced token collision (stubbed random source + pre-seeded patch row) regenerates instead of erroring. */
test("create regenerates the token on collision with an existing row id or config id", async (t) => {
  const api = await harness();
  // Pre-seed the patch with rows carrying the doomed token.
  await writeFile(
    api.patchPath,
    [
      "# comment",
      "- insert:",
      "    - id: prompt-section-deadbeef",
      "      name: '@knopki/dsh-prompt-profiles/section'",
      "      config: { id: deadbeef, title: Taken, body: x }",
    ].join("\n"),
    { mode: 0o600 },
  );
  const original = tokenSource.next;
  const queue = ["deadbeef", "deadbeef", "cafebabe"];
  tokenSource.next = () => queue.shift() ?? "ffffffff";
  t.after(() => {
    tokenSource.next = original;
  });
  try {
    const created = await api.call("POST", "/section/create", { title: "Fresh", body: "y" });
    assert.equal(created.status, 200);
    assert.equal(created.body.configId, "prompt-section-cafebabe", "colliding tokens regenerated, not an error");
    assert.equal(created.body.rowId, created.body.configId);
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const ids = document.contents.items.map((item) => item?.get?.("insert")?.items?.[0]?.get("id")).filter(Boolean);
    assert.deepEqual(ids.sort(), ["prompt-section-cafebabe", "prompt-section-deadbeef"]);
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_create

// #region TEST_idScheme
/** @purpose Explicit create ids accept the bare token, the full `prompt-<kind>-<token>` form, and a qualified `include:` form — all stored FULL. */
test("explicit create ids accept bare, full and qualified forms and store the full form", async () => {
  const api = await harness();
  try {
    const bare = await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "B" });
    assert.equal(bare.status, 200);
    assert.equal(bare.body.configId, "prompt-section-tone");
    assert.equal(bare.body.rowId, "prompt-section-tone");

    const full = await api.call("POST", "/section/create", { id: "prompt-section-alt", title: "Alt", body: "B" });
    assert.equal(full.body.configId, "prompt-section-alt");
    assert.equal(full.body.rowId, "prompt-section-alt");

    const qualified = await api.call("POST", "/profile/create", {
      id: "include:prompt-profile-qual",
      title: "Qual",
      sections: [],
    });
    assert.equal(qualified.body.configId, "prompt-profile-qual");
    assert.equal(qualified.body.rowId, "prompt-profile-qual");

    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const rows = document.contents.items
      .flatMap((item) => (isSeq(item?.get?.("insert")) ? item.get("insert").items : []))
      .map((row) => ({ id: row.get("id"), configId: row.get("config").get("id") }));
    assert.deepEqual(rows.map((row) => row.id).sort(), [
      "prompt-profile-qual",
      "prompt-section-alt",
      "prompt-section-tone",
    ]);
    for (const row of rows) assert.equal(row.configId, row.id, "stored config.id === full row id");
  } finally {
    await api.cleanup();
  }
});

/** @purpose A new id may never duplicate a registered config.id, even when no patch row carries that row id. */
test("create rejects an explicit id that duplicates a registered config.id", async () => {
  // A row addressed by a qualified loader id whose config.id is already full.
  const registered = { ...userSection, id: "prompt-section-tone", rowId: "include:prompt-section-tone" };
  const api = await harness({ sections: [registered] });
  try {
    const before = await readFile(api.patchPath, "utf8");
    const clash = await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "B" });
    assert.equal(clash.status, 400);
    assert.match(clash.body.error.message, /already exists/);
    assert.equal(await readFile(api.patchPath, "utf8"), before, "no row written");
  } finally {
    await api.cleanup();
  }
});

/** @purpose Profile refs accept the bare token, full id and qualified form of a registered section; the registered config.id is stored so runtime lookups hit. */
test("profile section refs accept every id form and store the registered config.id", async () => {
  const registered = { ...userSection, id: "prompt-section-tone", rowId: "prompt-section-tone" };
  const api = await harness({ sections: [registered], profiles: [userProfile] });
  try {
    const created = await api.call("POST", "/profile/create", {
      title: "Refs",
      sections: [
        { id: "tone", order: 1000 },
        { id: "prompt-section-tone", order: 1010 },
        { id: "include:prompt-section-tone", order: 1020 },
      ],
    });
    assert.equal(created.status, 200);
    assert.deepEqual(
      created.body.sections.map((ref) => ref.id),
      ["prompt-section-tone", "prompt-section-tone", "prompt-section-tone"],
    );
    const updated = await api.call("POST", "/profile/update", {
      rowId: "light",
      value: { title: "Light", sections: [{ id: "tone", order: 900 }] },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(
      api.replacements.at(-1).value.sections[0].id,
      "prompt-section-tone",
      "bare token normalized to the registered full config.id",
    );
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_idScheme

// #region TEST_createDuplicate
/** @purpose Creating a section or profile whose id already exists maps the writer's duplicate guard to a clean 400 — never a 500. */
test("section and profile create with an existing id answer a clean 400", async () => {
  const api = await harness();
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "B" });
    const duplicateSection = await api.call("POST", "/section/create", { id: "tone", title: "Again", body: "B2" });
    assert.equal(duplicateSection.status, 400);
    assert.match(duplicateSection.body.error.message, /already exists/);
    await api.call("POST", "/profile/create", { id: "light", title: "Light", sections: [] });
    const duplicateProfile = await api.call("POST", "/profile/create", { id: "light", title: "Again", sections: [] });
    assert.equal(duplicateProfile.status, 400);
    assert.match(duplicateProfile.body.error.message, /already exists/);
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    assert.equal(document.contents.items.length, 2, "no duplicate rows written (one section, one profile)");
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_createDuplicate

// #region TEST_update
/** @purpose Updates replace the WHOLE config through settings.replace with the sent revision (task c). */
test("section update replaces the whole config through settings.replace", async () => {
  const api = await harness({ sections: [userSection] });
  try {
    const { status, body } = await api.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      revision: 7,
      value: { title: "New", body: "Shorter." },
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, rowId: "prompt-section-tone", patchId: "prompt-section-tone", emits: true });
    assert.deepEqual(api.replacements, [
      {
        ns: "prompt-section-tone",
        value: { title: "New", body: "Shorter." },
        expected: 7,
      },
    ]);
    assert.equal(api.mutations.length, 0, "no per-op mutate calls anymore");
  } finally {
    await api.cleanup();
  }
});

/** @purpose The QUALIFIED loader entry rowId works on update (task a) in both registry directions. */
test("qualified include:… rowId works on section and profile update", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    const section = await api.call("POST", "/section/update", {
      rowId: "include:prompt-section-tone",
      value: { title: "Тестовая секция 2", body: "b" },
    });
    assert.equal(section.status, 200);
    assert.equal(section.body.patchId, "prompt-section-tone");
    assert.equal(api.replacements[0].ns, "prompt-section-tone");
    const profile = await api.call("POST", "/profile/update", {
      rowId: "include:prompt-profile-light",
      value: { title: "Light", sections: [{ id: "tone", order: 100, scope: "inherit" }] },
    });
    assert.equal(profile.status, 200);
    assert.equal(api.replacements[1].ns, "prompt-profile-light");
    assert.deepEqual(api.replacements[1].value.sections, [{ id: "tone", order: 100, scope: "inherit" }]);
  } finally {
    await api.cleanup();
  }
});

/** @purpose When the REGISTRY holds the qualified id, the settings ns is still the unqualified patch row id. */
test("update normalizes the settings ns when the registry rowId is qualified", async () => {
  const qualified = { ...userSection, rowId: "include:prompt-section-tone" };
  const api = await harness({ sections: [qualified] });
  try {
    const sent = await api.call("POST", "/section/update", {
      rowId: "include:prompt-section-tone",
      value: { title: "T", body: "b" },
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.rowId, "include:prompt-section-tone");
    assert.equal(api.replacements[0].ns, "prompt-section-tone");
    const unqualified = await api.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      value: { title: "T", body: "b" },
    });
    assert.equal(unqualified.status, 200, "the unqualified form addresses the same row");
    assert.equal(api.replacements[1].ns, "prompt-section-tone");
  } finally {
    await api.cleanup();
  }
});

/** @purpose An unknown rowId answers a clear 404 envelope, never a bare 500 (task b). */
test("unknown rowIds answer 404 with a readable message, not 500", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    for (const [path, rowId] of [
      ["/section/update", "include:prompt-section-ghost"],
      ["/section/update", "prompt-section-ghost"],
      ["/section/delete", "include:prompt-section-ghost"],
      ["/section/rename", "prompt-section-ghost"],
      ["/profile/update", "prompt-profile-ghost"],
      ["/profile/delete", "prompt-profile-ghost"],
    ]) {
      const extra = path.endsWith("update")
        ? { value: { title: "T", body: "b" } }
        : path.endsWith("rename")
          ? { id: "new-id" }
          : {};
      const { status, body } = await api.call("POST", path, { rowId, ...extra });
      assert.equal(status, 404, `${path} ${rowId}`);
      assert.match(body.error.message, /is not registered/);
    }
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_update

// #region TEST_liveBugEmpty400
/**
 * @purpose Live bug (empty 400 on every update): reproduce against a
 *   settings stub that enforces the REAL dsh-settings@0.1.7-rc.1 rules —
 *   `SettingsForms.write()` runs `validatePaths(next, volatileForm(schema))`
 *   and throws `Config field "<key>" is not volatile` for every replace()
 *   payload key that the row Config does not mark `.volatile()`. The
 *   section/profile row Configs (lib/section.js, lib/profile.js) mark only
 *   title/body and title/sections volatile; `id` is inherited. The stub also
 *   COMPOSES the accepted write onto the insert row's config exactly like
 *   `mergeLayers(base, input)` so the persisted result can be asserted.
 */
function realRulesSettings({ patchPath, composed }) {
  const VOLATILE = new Set(["title", "body", "sections", "default", "lastByWorkspace"]);
  return {
    describe: () => [{ ns: "prompt-profiles", revision: 7 }],
    mutate: async () => {},
    replace: async (ns, value) => {
      for (const key of Object.keys(value)) {
        // mirrors: throw new Error(`Config field "${key}" is not volatile`)
        if (!VOLATILE.has(key)) throw new Error(`Config field "${key}" is not volatile`);
      }
      // mirrors mergeLayers(base, input): shallow for these flat configs,
      // arrays replace wholesale.
      const document = parseDocument(readFileSync(patchPath, "utf8"), parseOptions);
      const row = document.contents.items
        .flatMap((item) => (isSeq(item?.get?.("insert")) ? item.get("insert").items : []))
        .find((candidate) => candidate?.get?.("id") === ns);
      const base = row ? row.get("config").toJS(document) : {};
      composed.push({ ns, value, base, merged: { ...base, ...value } });
    },
  };
}

test("live payloads succeed under real dsh-settings volatile rules and keep the inherited id", async () => {
  const composed = [];
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-live-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(
    patchPath,
    [
      "- insert:",
      "  - id: prompt-section-new-section",
      '    name: "@knopki/dsh-prompt-profiles/section"',
      "    config: {id: new-section, title: New section, body: ''}",
      "- insert:",
      "  - id: prompt-profile-new-profile",
      '    name: "@knopki/dsh-prompt-profiles/profile"',
      "    config: {id: new-profile, title: New profile, sections: []}",
    ].join("\n"),
    { mode: 0o600 },
  );
  const api = await harness({
    sections: [
      { id: "new-section", title: "New section", body: "", rowId: "prompt-section-new-section", source: "user" },
    ],
    profiles: [
      { id: "new-profile", title: "New profile", sections: [], rowId: "prompt-profile-new-profile", source: "user" },
    ],
    settings: realRulesSettings({ patchPath, composed }),
  });
  try {
    // EXACT captured live requests:
    const section = await api.call("POST", "/section/update", {
      rowId: "prompt-section-new-section",
      value: { title: "Тестовая секция 3", body: "Тестовая инструкция" },
    });
    assert.equal(section.status, 200, JSON.stringify(section.body));
    assert.deepEqual(section.body, {
      ok: true,
      rowId: "prompt-section-new-section",
      patchId: "prompt-section-new-section",
      emits: true,
    });
    assert.deepEqual(
      composed[0].value,
      { title: "Тестовая секция 3", body: "Тестовая инструкция" },
      "only volatile fields are replaced — no id key",
    );
    assert.equal(composed[0].merged.id, "new-section", "composed config still carries the inherited id");
    assert.equal(composed[0].merged.title, "Тестовая секция 3");

    const profile = await api.call("POST", "/profile/update", {
      rowId: "prompt-profile-new-profile",
      value: { title: "123", sections: [] },
    });
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
    assert.deepEqual(composed[1].value, { title: "123", sections: [] });
    assert.equal(composed[1].merged.id, "new-profile");
    assert.deepEqual(composed[1].merged.sections, []);
    assert.equal(api.logs.length, 0, "no failures logged on the happy path");
  } finally {
    await api.cleanup();
    await rm(dir, { recursive: true, force: true });
  }
});

/** @purpose A settings layer refusing a non-volatile key now answers a readable 400 (previously an opaque 500/empty body). */
test("a non-volatile write attempt from the settings layer maps to a readable 400", async () => {
  const api = await harness({
    sections: [userSection],
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 7 }],
      mutate: async () => {},
      replace: async () => {
        throw new Error('Config field "id" is not volatile');
      },
    },
  });
  try {
    const { status, body } = await api.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      value: { title: "T", body: "b" },
    });
    assert.equal(status, 400);
    assert.match(body.error.message, /is not volatile/);
  } finally {
    await api.cleanup();
  }
});

/** @purpose A thrown NON-Error (plain string) still yields a readable 500 with a NON-EMPTY message. */
test("a thrown non-Error string produces a readable 500 with a non-empty message", async () => {
  const api = await harness({
    sections: [userSection],
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 7 }],
      mutate: async () => {},
      replace: async () => {
        throw "boom-string";
      }, // eslint-disable-line no-throw-literal
    },
  });
  try {
    const { status, body } = await api.call("POST", "/section/update", {
      rowId: "include:prompt-section-tone",
      value: { title: "T", body: "b" },
    });
    assert.equal(status, 500);
    assert.equal(body.error.message, "boom-string");
    assert.ok(body.error.message.length > 0);
  } finally {
    await api.cleanup();
  }
  // Even `throw undefined` keeps the reported message non-empty.
  const api2 = await harness({
    sections: [userSection],
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 7 }],
      mutate: async () => {},
      replace: async () => {
        throw undefined;
      }, // eslint-disable-line no-throw-literal
    },
  });
  try {
    const thrown = await api2.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      value: { title: "T", body: "b" },
    });
    assert.equal(thrown.status, 500);
    assert.equal(thrown.body.error.message, "undefined");
    assert.ok(thrown.body.error.message.length > 0);
  } finally {
    await api2.cleanup();
  }
});
// #endregion TEST_liveBugEmpty400

// #region TEST_delete
/** @purpose Delete removes user rows physically and disables bundle rows; the QUALIFIED rowId works (task a). */
test("delete removes a user insert row (qualified rowId); a bundle row gets a bare disabled override", async () => {
  const api = await harness({ sections: [userSection] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "B" });
    const removed = await api.call("POST", "/section/delete", { rowId: "include:prompt-section-tone" });
    assert.deepEqual(removed.body, { ok: true, disabled: false });
    const after = await readFile(api.patchPath, "utf8");
    assert.doesNotMatch(after, /prompt-section-tone/);

    const bundleSection = { ...userSection, rowId: "prompt-section-bundled", source: "bundle" };
    const api2 = await harness({ sections: [bundleSection] });
    try {
      const disabled = await api2.call("POST", "/section/delete", { rowId: "prompt-section-bundled" });
      assert.deepEqual(disabled.body, { ok: true, disabled: true });
      const document = parseDocument(await readFile(api2.patchPath, "utf8"), parseOptions);
      const row = document.contents.items.find((item) => item?.get?.("id") === "prompt-section-bundled");
      assert.equal(row.get("disabled"), true);
      assert.equal(row.has("insert"), false);
    } finally {
      await api2.cleanup();
    }
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_delete

// #region TEST_rename
/** @purpose Rename is ONE writer commit that changes the SECTION only: the new row lands, the old row goes, and every profile reference stays OLD — the response reports the affected profiles. */
test("rename creates the new row, leaves profile refs untouched, removes the old row, and reports affectedProfiles", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "Be brief." });
    await api.call("POST", "/profile/create", {
      id: "light",
      title: "Light",
      sections: [{ id: "tone", order: 1050, scope: "inherit" }],
    });
    const { status, body } = await api.call("POST", "/section/rename", {
      rowId: "prompt-section-tone",
      id: "short-tone",
    });
    assert.equal(status, 200);
    // The new id is the FULL prefixed form, plus the profiles left behind.
    assert.deepEqual(body, {
      ok: true,
      rowId: "prompt-section-short-tone",
      patchId: "prompt-section-short-tone",
      id: "prompt-section-short-tone",
      affectedProfiles: [{ profileId: "light", title: "Light" }],
    });
    assert.deepEqual(api.replacements, [], "rename performs no settings.replace calls");
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    assert.ok(isSeq(document.contents), "patch stays a valid YAML sequence");
    const inserted = document.contents.items.flatMap((item) =>
      isSeq(item?.get?.("insert")) ? item.get("insert").items : [],
    );
    const renamed = inserted.find((row) => row.get("id") === "prompt-section-short-tone");
    assert.ok(renamed, "new section row present");
    assert.equal(
      renamed.get("config").get("id"),
      "prompt-section-short-tone",
      "renamed config.id is the full new row id",
    );
    assert.ok(!inserted.some((row) => row.get("id") === "prompt-section-tone"), "old section row removed");
    assert.ok(
      !document.contents.items.some((item) => item?.get?.("id") === "prompt-profile-light"),
      "no bare override written",
    );
    const profileRow = inserted.find((row) => row.get("id") === "prompt-profile-light");
    assert.deepEqual(
      profileRow.get("config").get("sections").toJS(document),
      [{ id: "tone", order: 1050, scope: "inherit" }],
      "profile refs are NOT rewritten: they still name the old id",
    );
    const text = await readFile(api.patchPath, "utf8");
    assert.match(text, /prompt-section-short-tone/);
    assert.doesNotMatch(text, /prompt-section-tone\b/);
  } finally {
    await api.cleanup();
  }
});

/** @purpose The QUALIFIED rowId works on rename too (task a). */
test("rename accepts the qualified include:… rowId", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "Be brief." });
    await api.call("POST", "/profile/create", {
      id: "light",
      title: "Light",
      sections: [{ id: "tone", order: 1050, scope: "inherit" }],
    });
    const { status, body } = await api.call("POST", "/section/rename", {
      rowId: "include:prompt-section-tone",
      id: "short-tone",
    });
    assert.equal(status, 200);
    assert.deepEqual(body.affectedProfiles, [{ profileId: "light", title: "Light" }]);
    const text = await readFile(api.patchPath, "utf8");
    assert.match(text, /prompt-section-short-tone/);
    assert.doesNotMatch(text, /prompt-section-tone\b/);
    assert.match(text, /id: tone/, "the profile ref keeps the old id");
  } finally {
    await api.cleanup();
  }
});

/** @purpose A referencing profile from a LOWER layer is NEVER given a bare override from rename — it is reported instead. */
test("rename never writes a bare override for a foreign profile; it reports it", async () => {
  const api = await harness({
    sections: [userSection],
    profiles: [userProfile],
    entries: () => [{ options: { id: "prompt-profile-light", name: "@foreign/bundle/profile" } }],
  });
  try {
    await api.call("POST", "/section/create", { title: "Tone", body: "Be brief." });
    const { status, body } = await api.call("POST", "/section/rename", {
      rowId: "prompt-section-tone",
      id: "short-tone",
    });
    assert.equal(status, 200);
    assert.deepEqual(body.affectedProfiles, [{ profileId: "light", title: "Light" }]);
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    assert.ok(
      !document.contents.items.some((item) => item?.get?.("id") === "prompt-profile-light"),
      "no bare override written for the foreign profile",
    );
    assert.equal(api.replacements.length, 0, "no settings.replace either");
  } finally {
    await api.cleanup();
  }
});

/** @purpose A profile that cannot be named safely no longer refuses the rename — the section is renamed and the profile is reported. */
test("rename succeeds when a referencing profile cannot be named; affectedProfiles lists it", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { title: "Tone", body: "Be brief." });
    const { status, body } = await api.call("POST", "/section/rename", {
      rowId: "prompt-section-tone",
      id: "short-tone",
    });
    assert.equal(status, 200);
    assert.deepEqual(body.affectedProfiles, [{ profileId: "light", title: "Light" }]);
  } finally {
    await api.cleanup();
  }
});

/** @purpose A repeat rename into the same id is a 400, and any failure inside the single-commit rename leaves the patch byte-identical. */
test("rename rejects a repeat/duplicate id with 400 and rolls the patch back byte-identically", async () => {
  const before = "# comment\n[]\n"; // harness's initial patch file, byte-for-byte
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    // Repeating the same id (it already names this row) is a clean 400.
    const same = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "tone" });
    assert.equal(same.status, 400);
    assert.match(same.body.error.message, /already taken/);
    const missing = await api.call("POST", "/section/rename", { rowId: "prompt-section-ghost", id: "whatever" });
    assert.equal(missing.status, 404);
    assert.equal(await readFile(api.patchPath, "utf8"), before);
  } finally {
    await api.cleanup();
  }
  const api2 = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api2.call("POST", "/section/create", { id: "taken", title: "Taken", body: "x" });
    const before2 = await readFile(api2.patchPath, "utf8");
    const failed = await api2.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "taken" });
    assert.equal(failed.status, 400, "duplicate section id rejected");
    assert.equal(await readFile(api2.patchPath, "utf8"), before2, "file byte-identical after rejected rename");
  } finally {
    await api2.cleanup();
  }
});
// #endregion TEST_rename

// #region TEST_defaults
/** @purpose default and last write volatile fields through settings.mutate; an explicit "none" is STORED (own-property ""). */
test("default and last write through settings.mutate on the main row", async () => {
  const api = await harness({ profiles: [userProfile], defaultId: "light", lastByWorkspace: { ws1: "light" } });
  try {
    assert.equal((await api.call("POST", "/default", { default: "light" })).status, 200);
    assert.equal((await api.call("POST", "/default", { default: "" })).status, 200);
    assert.equal((await api.call("POST", "/last", { workspaceId: "ws2", profileId: "light" })).status, 200);
    const none = await api.call("POST", "/last", { workspaceId: "ws1", profileId: "" });
    assert.equal(none.status, 200);
    assert.deepEqual(
      api.mutations.map(({ ns, ops }) => ({ ns, ops })),
      [
        { ns: "prompt-profiles", ops: [{ op: "set", path: ["default"], value: "light" }] },
        { ns: "prompt-profiles", ops: [{ op: "set", path: ["default"], value: "" }] },
        // Per-key ops: only the caller's workspace key is written.
        { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace", "ws2"], value: "light" }] },
        { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace", "ws1"], value: "" }] },
      ],
    );
    const unknown = await api.call("POST", "/default", { default: "ghost" });
    assert.equal(unknown.status, 404);
  } finally {
    await api.cleanup();
  }
});

/** @purpose (в) /last writes under the FIRST candidate: the UUID when the workspace resolves, the raw cwd when it does not. */
test("/last writes under the UUID when resolvable and under the cwd otherwise", async () => {
  const api = await harness({
    profiles: [userProfile],
    workspaceRegistry: {
      list: () => [],
      resolveByPath: async (path) => (path === "/desktop" ? { id: "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75" } : undefined),
    },
  });
  try {
    assert.equal((await api.call("POST", "/last", { cwd: "/desktop", profileId: "light" })).status, 200);
    assert.deepEqual(
      api.configValues().lastByWorkspace,
      { "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75": "light" },
      "new choices key on the workspace UUID, never on a path",
    );
    assert.equal((await api.call("POST", "/last", { cwd: "/loose", profileId: "light" })).status, 200);
    assert.deepEqual(
      api.configValues().lastByWorkspace,
      { "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75": "light", "/loose": "light" },
      "without a resolvable workspace the raw cwd remains the key",
    );
  } finally {
    await api.cleanup();
  }
});

/** @purpose End-to-end (API value + resolver): explicit none beats a configured default. */
test("explicit none stored by /last resolves to no profile even with a default set", async () => {
  const api = await harness({ profiles: [userProfile], defaultId: "light" });
  try {
    await api.call("POST", "/last", { workspaceId: "ws1", profileId: "" });
    const stored = api.configValues().lastByWorkspace;
    const resolved = resolveProfileId({
      lastByWorkspace: stored,
      workspaceKey: "ws1",
      defaultId: "light",
      profileIds: ["light"],
    });
    assert.deepEqual(resolved, { profileId: null, reset: false });
  } finally {
    await api.cleanup();
  }
});

/** @purpose /last contract: {workspaceId?, cwd?, profileId} — cwd resolves through the SAME key the assembler uses. */
test("/last accepts cwd, resolves the workspace key, and rejects an addressless request", async () => {
  const resolved = [];
  const api = await harness({
    profiles: [userProfile],
    workspaceRegistry: {
      list: () => [],
      resolveByPath: async (path) => {
        resolved.push(path);
        return path === "/work" ? { id: "ws-resolved" } : undefined;
      },
    },
  });
  try {
    // cwd known to the registry → stored under the registry id.
    assert.equal((await api.call("POST", "/last", { cwd: "/work", profileId: "light" })).status, 200);
    assert.deepEqual(api.configValues().lastByWorkspace, { "ws-resolved": "light" });
    // cwd unknown → the raw cwd is the fallback key (what the assembler reads).
    assert.equal((await api.call("POST", "/last", { cwd: "/loose", profileId: "light" })).status, 200);
    assert.deepEqual(api.configValues().lastByWorkspace, { "ws-resolved": "light", "/loose": "light" });
    // explicit none is still an own-property empty string.
    assert.equal((await api.call("POST", "/last", { cwd: "/work", profileId: "" })).status, 200);
    assert.deepEqual(api.configValues().lastByWorkspace, { "ws-resolved": "", "/loose": "light" });
    assert.deepEqual(resolved, ["/work", "/loose", "/work"]);
    // An unknown profile is a 404; an addressless request is a 400.
    assert.equal((await api.call("POST", "/last", { cwd: "/work", profileId: "ghost" })).status, 404);
    assert.equal((await api.call("POST", "/last", { profileId: "light" })).status, 400);
    assert.equal((await api.call("POST", "/last", { workspaceId: 42, profileId: "light" })).status, 400);
  } finally {
    await api.cleanup();
  }
});
/** @purpose Orphan cleanup on delete: AFTER the row is gone, its id disappears from every lastByWorkspace value and default resets. */
test("deleting a profile clears default and lastByWorkspace references after the row is gone", async () => {
  const api = await harness({
    profiles: [userProfile],
    defaultId: "light",
    lastByWorkspace: { ws1: "light", ws2: "", "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75": "light" },
  });
  try {
    const { status } = await api.call("POST", "/profile/delete", { rowId: "light", revision: 7 });
    assert.equal(status, 200);
    const cleanup = api.mutations.at(-1);
    assert.equal(cleanup.ns, "prompt-profiles");
    assert.deepEqual(
      cleanup.ops,
      [
        { op: "unset", path: ["lastByWorkspace", "ws1"] },
        { op: "unset", path: ["lastByWorkspace", "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75"] },
        { op: "set", path: ["default"], value: "" },
      ],
      "only the matching keys are unset (ws2 and its explicit none are kept)",
    );
    assert.equal(cleanup.expected, 7, "cleanup uses the request revision");
    assert.deepEqual(api.configValues(), { defaultId: "", lastByWorkspace: { ws2: "" } });
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    assert.ok(isSeq(document.contents), "patch stays a valid YAML sequence");
    const row = document.contents.items.find((item) => item?.get?.("id") === "prompt-profile-light");
    assert.ok(row, "the profile row was deleted (disabled override written)");
  } finally {
    await api.cleanup();
  }
});

/** @purpose The safe order: when the ROW deletion fails, the stored choice must NOT have been touched. */
test("a failed profile deletion keeps the stored choice and writes no cleanup", async () => {
  const api = await harness({
    profiles: [userProfile],
    defaultId: "light",
    lastByWorkspace: { ws1: "light" },
    // An unwritable patch path makes deleteRow throw; cleanup must not run.
    configEditor: { documentPath: "/nonexistent-dsh-dir/cordis.patch.yml" },
  });
  try {
    const { status } = await api.call("POST", "/profile/delete", { rowId: "light" });
    assert.equal(status, 500, "deletion failure surfaces as a server error");
    assert.equal(api.mutations.length, 0, "no settings write happened");
    assert.deepEqual(
      api.configValues(),
      { defaultId: "light", lastByWorkspace: { ws1: "light" } },
      "choice and default untouched",
    );
  } finally {
    await api.cleanup();
  }
});

/** @purpose Cleanup is best-effort: a failing settings write after a SUCCESSFUL delete is logged, not fatal. */
test("a successful delete whose cleanup fails keeps the row deleted and logs the failure", async () => {
  const api = await harness({
    profiles: [userProfile],
    defaultId: "light",
    lastByWorkspace: { ws1: "light" },
    beforeMutate: () => {
      throw new Error("settings down");
    },
  });
  try {
    const { status } = await api.call("POST", "/profile/delete", { rowId: "light" });
    assert.equal(status, 200, "the row deletion still succeeds");
    const entry = api.logs.find((log) => /references were not cleared/.test(log.message));
    assert.ok(entry, "cleanup failure logged");
    assert.equal(entry.level, "warn");
    assert.match(entry.details.error, /settings down/);
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const row = document.contents.items.find((item) => item?.get?.("id") === "prompt-profile-light");
    assert.equal(row.get("disabled"), true, "profile row disabled before the cleanup attempt");
    assert.deepEqual(
      api.configValues().lastByWorkspace,
      { ws1: "light" },
      "dangling choice remains — safe degradation",
    );
  } finally {
    await api.cleanup();
  }
});

/** @purpose Parallel /last calls on different keys: per-key ops + the write lock lose no choice, with or without a revision. */
test("parallel /last calls with different workspace keys lose no choice", async () => {
  let forcedConflicts = 1;
  let bumped = 0;
  const api = await harness({
    profiles: [userProfile],
    // Emulate a concurrent writer: bump the revision before the first mutate,
    // which trips its expectedRevision check exactly once.
    beforeMutate: ({ bumpRevision }) => {
      if (forcedConflicts > 0) {
        forcedConflicts -= 1;
        bumped += 1;
        bumpRevision();
      }
    },
  });
  try {
    const [first, second] = await Promise.all([
      api.call("POST", "/last", { workspaceId: "ws-a", profileId: "light" }),
      api.call("POST", "/last", { workspaceId: "ws-b", profileId: "light" }),
    ]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(bumped, 1, "the emulated conflict actually fired, forcing a retry");
    assert.deepEqual(
      api.configValues().lastByWorkspace,
      { "ws-a": "light", "ws-b": "light" },
      "both workspace choices survive the conflict and retry",
    );
  } finally {
    await api.cleanup();
  }
});

/** @purpose The same guarantee when settings.describe() carries NO revision (CAS unavailable): the lock + per-key ops still hold. */
test("parallel /last calls lose no choice when the settings revision is unavailable", async () => {
  let injected = false;
  const api = await harness({
    profiles: [userProfile],
    settingsRevision: false,
    // Emulate an out-of-lock writer landing a foreign choice between a read
    // and a write: per-key ops must MERGE, never clobber it.
    beforeMutate: ({ setLastByWorkspace }) => {
      if (!injected) {
        injected = true;
        setLastByWorkspace({ "ws-foreign": "light" });
      }
    },
  });
  try {
    const [first, second] = await Promise.all([
      api.call("POST", "/last", { workspaceId: "ws-a", profileId: "light" }),
      api.call("POST", "/last", { workspaceId: "ws-b", profileId: "light" }),
    ]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.deepEqual(
      api.configValues().lastByWorkspace,
      { "ws-foreign": "light", "ws-a": "light", "ws-b": "light" },
      "no revision is required: per-key ops preserve every concurrent choice",
    );
  } finally {
    await api.cleanup();
  }
});

/** @purpose /last pruning: dangling profile values and stale UUID keys go, cwd keys and explicit none stay. */
test("/last prunes dangling profile values and stale workspace-id keys", async () => {
  const liveId = "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75";
  const staleId = "00000000-0000-4000-8000-000000000000";
  const api = await harness({
    profiles: [userProfile],
    lastByWorkspace: {
      "ws-path": "ghost", // dangling value → dropped
      "ws-none": "", // explicit none → kept
      "/work/dir": "light", // cwd key → kept
      [liveId]: "light", // UUID the registry knows → kept
      [staleId]: "light", // UUID absent from the registry → dropped
    },
    workspaceRegistry: {
      list: () => [],
      resolveByPath: async () => undefined,
      get: (id) => (id === liveId ? { id } : undefined),
    },
  });
  try {
    const { status } = await api.call("POST", "/last", { cwd: "/new", profileId: "light" });
    assert.equal(status, 200);
    // Per-key ops: unset ONLY the two stale keys, then set the new one.
    assert.deepEqual(api.mutations.at(-1).ops, [
      { op: "unset", path: ["lastByWorkspace", "ws-path"] },
      { op: "unset", path: ["lastByWorkspace", staleId] },
      { op: "set", path: ["lastByWorkspace", "/new"], value: "light" },
    ]);
    assert.deepEqual(api.configValues().lastByWorkspace, {
      "ws-none": "",
      "/work/dir": "light",
      [liveId]: "light",
      "/new": "light",
    });
  } finally {
    await api.cleanup();
  }
  // Without a workspace registry a UUID key cannot be PROVEN stale: keep it.
  const api2 = await harness({
    profiles: [userProfile],
    lastByWorkspace: { [staleId]: "light" },
  });
  try {
    await api2.call("POST", "/last", { workspaceId: "ws-plain", profileId: "" });
    assert.deepEqual(api2.configValues().lastByWorkspace, { [staleId]: "light", "ws-plain": "" });
  } finally {
    await api2.cleanup();
  }
});
/** @purpose B1-remaining: the prune decision is re-derived inside the mutation; a key that became valid between the scan and the write survives (CAS retry rescans). */
test("a lastByWorkspace key that becomes valid before the write is NOT pruned", async () => {
  let injected = false;
  const api = await harness({
    profiles: [userProfile],
    lastByWorkspace: { "ws-stale": "ghost" }, // dangling → a prune candidate
    // Emulate an out-of-lock writer: the first mutate makes the candidate valid
    // AND bumps the revision, exactly like a real settings write.
    beforeMutate: ({ setLastByWorkspace, bumpRevision }) => {
      if (!injected) {
        injected = true;
        setLastByWorkspace({ "ws-stale": "light" });
        bumpRevision();
      }
    },
  });
  try {
    const { status } = await api.call("POST", "/last", { workspaceId: "ws-new", profileId: "light" });
    assert.equal(status, 200);
    assert.deepEqual(
      api.configValues().lastByWorkspace,
      { "ws-stale": "light", "ws-new": "light" },
      "the now-valid key survives the rescan",
    );
  } finally {
    await api.cleanup();
  }
});

/** @purpose B1-remaining: without a revision the stale-key prune is skipped (safe), while the caller's own key is still written. */
test("without a settings revision /last skips the prune but still writes its own key", async () => {
  const api = await harness({
    profiles: [userProfile],
    settingsRevision: false,
    lastByWorkspace: { "ws-stale": "ghost" }, // would be pruned only under CAS
  });
  try {
    const { status } = await api.call("POST", "/last", { workspaceId: "ws-new", profileId: "light" });
    assert.equal(status, 200);
    assert.deepEqual(
      api.configValues().lastByWorkspace,
      { "ws-stale": "ghost", "ws-new": "light" },
      "no CAS → no destructive guess; the choice is still stored",
    );
    assert.deepEqual(api.mutations.at(-1).ops, [{ op: "set", path: ["lastByWorkspace", "ws-new"], value: "light" }]);
  } finally {
    await api.cleanup();
  }
});

/** @purpose B2 race: a profile deleted while the request awaits its workspace key must yield 404 and write nothing. */
test("a profile deleted during /last key resolution is not resurrected", async () => {
  const profiles = [{ ...userProfile }];
  const api = await harness({
    profiles,
    // The awaited key resolution is exactly the window the deletion commits in.
    workspaceRegistry: {
      list: () => [],
      resolveByPath: async () => {
        profiles.length = 0;
        return { id: "ws-resolved" };
      },
    },
  });
  try {
    const { status, body } = await api.call("POST", "/last", { cwd: "/work", profileId: "light" });
    assert.equal(status, 404, JSON.stringify(body));
    assert.match(body.error.message, /not registered/);
    assert.equal(api.mutations.length, 0, "no settings write for a deleted profile");
    assert.deepEqual(api.configValues().lastByWorkspace, {});
  } finally {
    await api.cleanup();
  }
});
/** @purpose B2 residual: a profile whose patch row is already gone must 404 even while the registry still lists it (HMR lag). */
test("a profile removed from the patch but still in the registry cannot be chosen", async () => {
  const stale = { ...userProfile, source: "user" }; // a patch-backed row that was removed
  const api = await harness({ profiles: [stale] });
  try {
    const last = await api.call("POST", "/last", { workspaceId: "ws", profileId: "light" });
    assert.equal(last.status, 404, JSON.stringify(last.body));
    const def = await api.call("POST", "/default", { default: "light" });
    assert.equal(def.status, 404, "default validates against the patch too");
    assert.equal(api.mutations.length, 0, "no write for a vanished profile");
    assert.deepEqual(api.configValues(), { defaultId: "", lastByWorkspace: {} });
  } finally {
    await api.cleanup();
  }
});

/** @purpose B2: the patch row's state wins — a live user row is selectable, a disabled row and a foreign row are not. */
test("patch rows decide profile validity (live row / disabled row / foreign row)", async () => {
  const profiles = [
    { id: "live", title: "Live", sections: [], rowId: "prompt-profile-live", source: "user" },
    { id: "off", title: "Off", sections: [], rowId: "prompt-profile-off", source: "user" },
    { id: "foreign", title: "Foreign", sections: [], rowId: "prompt-profile-foreign", source: "user" },
  ];
  const api = await harness({ profiles });
  try {
    await writeFile(
      api.patchPath,
      [
        "- insert:",
        "    - id: prompt-profile-live",
        `      name: "@knopki/dsh-prompt-profiles/profile"`,
        "      config: { id: live, sections: [] }",
        "- id: prompt-profile-off",
        `  name: "@knopki/dsh-prompt-profiles/profile"`,
        "  disabled: true",
        "  config: { id: off, sections: [] }",
        "- id: prompt-profile-foreign",
        '  name: "some-other-plugin"',
        "  config: { id: foreign }",
        "",
      ].join("\n"),
    );
    assert.equal((await api.call("POST", "/last", { workspaceId: "w1", profileId: "live" })).status, 200);
    assert.equal((await api.call("POST", "/last", { workspaceId: "w2", profileId: "off" })).status, 404);
    assert.equal((await api.call("POST", "/last", { workspaceId: "w3", profileId: "foreign" })).status, 404);
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_defaults

// #region TEST_emptyBody
/** @purpose Empty/whitespace section bodies are legal (SPEC §7) and marked emits:false on create AND whole-object update. */
test("empty body is accepted on create and update and reported as non-emitting", async () => {
  const api = await harness();
  try {
    const blank = await api.call("POST", "/section/create", { title: "Blank", body: "  \n " });
    assert.equal(blank.status, 200);
    assert.equal(blank.body.emits, false);
    const filled = await api.call("POST", "/section/create", { title: "Filled", body: "text" });
    assert.equal(filled.body.emits, true);
  } finally {
    await api.cleanup();
  }
  const api2 = await harness({ sections: [userSection] });
  try {
    const cleared = await api2.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      value: { title: "Tone", body: "" },
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body, {
      ok: true,
      rowId: "prompt-section-tone",
      patchId: "prompt-section-tone",
      emits: false,
    });
  } finally {
    await api2.cleanup();
  }
});
// #endregion TEST_emptyBody

// #region TEST_modes
/** @purpose state.modes derives complete flags from agentPresets documents (SPEC decision 21); absent service degrades to []. */
test("state modes mark complete presets and degrade without agentPresets", async () => {
  const completeYaml = ['- name: "@deepseek-ai/dsh-persona"', "  config:", "    complete: true"].join("\n");
  const agentPresets = {
    list: async () => [{ id: "minimal" }, { id: "default", name: "Default" }],
    readDocument: async (id) => ({
      agentPreset: id,
      content: id === "minimal" ? completeYaml : '- name: "@deepseek-ai/dsh-persona"\n',
    }),
  };
  const api = await harness({ agentPresets });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.deepEqual(body.modes, [
      { id: "minimal", title: "minimal", complete: true },
      { id: "default", title: "Default", complete: false },
    ]);
  } finally {
    await api.cleanup();
  }
});

/**
 * @purpose LIVE BUG: `complete` was missed for the shipped minimal preset
 *   because the persona row sits DEEP (`insert[].config.plugins[]`) while the
 *   scan only unwrapped `insert`. The fixture below is the real
 *   `@deepseek-ai/dsh-web-app/presets/minimal.patch.yml` shape (with its `!!js`
 *   tags), so a shallow scan fails and the recursive one must pass.
 */
const REAL_MINIMAL_PRESET = [
  "# Agent preset minimal: one `@deepseek-ai/dsh-agent-preset` declaration inserted",
  "# after the web patch. Edits saved from the Web editor override this row's",
  "# `config.plugins` by id from the profile patch.",
  "- insert:",
  "    - id: preset-minimal",
  "      name: '@deepseek-ai/dsh-agent-preset'",
  "      config:",
  "        id: minimal",
  "        order: 3",
  "        plugins:",
  "          - id: persona",
  "            name: '@deepseek-ai/dsh-persona'",
  "            config:",
  "              prefix: You are a helpful software engineer assistant.",
  "              complete: true",
  "              includeRuntimeContext: false",
  "          - id: persistent-shell",
  "            name: cordis:group",
  "            group: true",
  "            isolate:",
  "              terminals: true",
  "            config:",
  "              - id: terminal-bash",
  "                name: '@deepseek-ai/dsh-terminal-bash'",
  "                disabled: !!js process.platform === 'win32'",
  "                config:",
  "                  timeoutMs: 300000",
  "",
].join("\n");

test("state modes find a persona-complete row at any depth, including the real minimal preset", async () => {
  const documents = {
    minimal: REAL_MINIMAL_PRESET,
    standard: "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    complete: false\n",
    deep: "- insert:\n    - name: cordis:group\n      group: true\n      config:\n        - name: '@deepseek-ai/dsh-persona'\n          config:\n            complete: true\n",
    dumped: "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    complete: true\n",
    broken: "- name: x\n  config: [1, 2\n", // unclosed flow sequence → parse throws
  };
  const agentPresets = {
    list: async () => Object.keys(documents).map((id) => ({ id })),
    readDocument: async (id) => ({ agentPreset: id, content: documents[id] }),
  };
  const api = await harness({ agentPresets });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    const byId = Object.fromEntries(body.modes.map((mode) => [mode.id, mode.complete]));
    assert.equal(byId.minimal, true, "real minimal shape: persona under insert[].config.plugins[]");
    assert.equal(byId.standard, false, "no persona with complete: true → false");
    assert.equal(byId.deep, true, "nested deeper than one level is found");
    assert.equal(byId.dumped, true, "a top-level plugin list (readDocument dump) is found too");
    assert.equal(byId.broken, false, "an unparseable document stays false");
    assert.ok(
      api.logs.some((entry) => /preset document unreadable/.test(entry.message)),
      "the parse failure warns instead of being swallowed",
    );
    // The `!!js` tags in the real fixture must NOT warn.
    assert.ok(
      !api.logs.some(
        (entry) => /preset document unreadable/.test(entry.message) && entry.details?.preset === "minimal",
      ),
      "!!js tags parse cleanly",
    );
  } finally {
    await api.cleanup();
  }
});
/** @purpose (а) REFLECT: a service reachable ONLY through ctx.get('agentPresets') still fills modes (the harness sets no ctx.agentPresets property). */
test("modes resolve agentPresets through ctx.get, not as a ctx property", async () => {
  const agentPresets = {
    list: async () => [{ id: "minimal" }],
    readDocument: async (id) => ({ agentPreset: id, content: REAL_MINIMAL_PRESET }),
  };
  const api = await harness({ agentPresets });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.deepEqual(body.modes, [{ id: "minimal", title: "minimal", complete: true }]);
  } finally {
    await api.cleanup();
  }
});

/** @purpose (в) a throwing ctx.get must not take /state down. */
test("a throwing ctx.get leaves modes empty instead of failing /state", async () => {
  const api = await harness({ agentPresets: { list: async () => [] }, agentPresetsGetThrows: true });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.deepEqual(body.modes, []);
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_modes

// #region TEST_preview
/** @purpose preview orders our sections, interpolates {{cwd}}, reports the profile's order verbatim (no +0.5), places built-in placeholders, and reports skipped refs with reasons. */
test("preview renders ordered sections with interpolation and skip reasons", async () => {
  const blank = { id: "blank", title: "Blank", body: " ", rowId: "prompt-section-blank", source: "user" };
  const cwdSection = {
    id: "cwd-note",
    title: "Cwd",
    body: "Work in {{cwd}} with {{model}}.",
    rowId: "prompt-section-cwd-note",
    source: "user",
  };
  const profile = {
    id: "light",
    title: "Light",
    sections: [
      // 1000 EQUALS the built-in tool:bash order: the preview must report 1000,
      // not a shifted 1000.5, and place the section BEFORE that built-in.
      { id: "cwd-note", order: 1000, scope: "inherit" },
      { id: "missing", order: 1100 },
      { id: "blank", order: 1200 },
    ],
    rowId: "prompt-profile-light",
    source: "user",
  };
  const api = await harness({ sections: [cwdSection, blank], profiles: [profile] });
  try {
    assert.equal((await api.call("GET", "/preview")).status, 400);
    assert.equal((await api.call("GET", "/preview?profileId=ghost")).status, 404);
    const { status, body } = await api.call("GET", "/preview?profileId=light");
    assert.equal(status, 200);
    assert.equal(body.title, "Light");
    assert.deepEqual(
      body.sections,
      [
        {
          id: "cwd-note",
          title: "Cwd",
          order: 1000,
          scope: "inherit",
          text: `Work in ${process.cwd()} with {{model}}.`,
          emits: true,
        },
        { kind: "builtin", name: "tool:bash", title: "tool:bash", order: 1000 },
      ],
      "our equal-order section stands BEFORE the built-in placeholder",
    );
    assert.deepEqual(body.skipped, [
      { id: "missing", title: "missing", reason: "section not found" },
      { id: "blank", title: "Blank", reason: "empty body" },
    ]);
    assert.equal(body.variables.cwd, process.cwd());
    assert.equal(body.variables.model, null);
  } finally {
    await api.cleanup();
  }
});

/**
 * @purpose Preview applies the RUNTIME selection rule and the real built-in
 *   order. M6: the expected sequence below is written BY HAND against the REAL
 *   annotated built-in table (validated against the installed package in
 *   mirror.test.mjs), NOT computed with planInsertion — so a wrong/degraded
 *   built-in set fails here instead of agreeing with itself.
 */
test("preview merges the REAL built-in placeholders in an independently expected order", async () => {
  const realBuiltinOrders = nameBuiltinOrders(BUILTIN_ORDERS);
  assert.equal(Object.keys(realBuiltinOrders).length, 23, "sanity: real mapped built-in set");
  const makeSection = (id, title, body) => ({ id, title, body, rowId: `prompt-section-${id}`, source: "user" });
  const profile = {
    id: "light",
    title: "Light",
    sections: [
      { id: "cwd-note", order: 1000, scope: "inherit" }, // EQUAL to tool:bash
      { id: "main-note", order: 5000, scope: "main-only" }, // EQUAL to tools:sdk, main agent emits it
      { id: "sub-note", order: 1300, scope: "subagents-only" }, // skipped for the main agent
      { id: "tail-note", order: 20000, scope: "inherit" }, // after every built-in
    ],
    rowId: "prompt-profile-light",
    source: "user",
  };
  const api = await harness({
    sections: [
      makeSection("cwd-note", "Cwd", "C"),
      makeSection("main-note", "Main", "M"),
      makeSection("sub-note", "Sub", "S"),
      makeSection("tail-note", "Tail", "T"),
    ],
    profiles: [profile],
    builtinOrdersByName: realBuiltinOrders,
  });
  try {
    const { status, body } = await api.call("GET", "/preview?profileId=light");
    assert.equal(status, 200);
    const tags = body.sections.map((s) => (s.kind === "builtin" ? `builtin:${s.name}` : `ours:${s.id}`));
    assert.deepEqual(
      tags,
      [
        "builtin:harness:identity",
        "builtin:deployment:persona-prefix",
        "builtin:plan:policy",
        "builtin:team:policy",
        "builtin:tools:ptc-only",
        "builtin:context:file-reference",
        "ours:cwd-note", // order 1000 == tool:bash → BEFORE it
        "builtin:tool:bash",
        "builtin:tool:pwsh",
        "builtin:tool:read",
        "builtin:tool:write",
        "builtin:tool:edit",
        "builtin:tool:glob",
        "builtin:tool:grep",
        "builtin:tool:jobs",
        "builtin:tool:web_search",
        "builtin:tool:web_fetch",
        "builtin:tool:goal",
        "builtin:tool:ralph",
        "builtin:mcp-resource-servers",
        "ours:main-note", // order 5000 == tools:sdk → BEFORE it
        "builtin:tools:sdk",
        "builtin:ui:deliverable-file-references",
        "builtin:app:web-surface",
        "builtin:deployment:persona-suffix",
        "ours:tail-note", // after every built-in
      ],
      "hand-written expected merge of the REAL built-in table",
    );
    assert.deepEqual(body.skipped, [
      { id: "sub-note", title: "Sub", reason: "scope subagents-only outside a plain subagent" },
    ]);
    assert.ok(
      body.sections.filter((s) => s.kind !== "builtin").every((s) => s.emits === true && typeof s.text === "string"),
      "emitted sections carry their text",
    );
    // Built-in placeholders are ordered by the REAL order values.
    const builtinOrdersInBody = body.sections.filter((s) => s.kind === "builtin").map((s) => s.order);
    assert.deepEqual(
      builtinOrdersInBody,
      [...builtinOrdersInBody].sort((a, b) => a - b),
      "engine order",
    );
    assert.equal(body.sections.find((s) => s.kind === "builtin" && s.name === "tool:bash").order, 1000);
  } finally {
    await api.cleanup();
  }
});

/** @purpose H6: the preview reports which variables it used and the value it substituted; unknown ones are null, and a session cwd supplied in the query wins. */
test("preview reports used variables honestly and prefers the session cwd", async () => {
  const section = {
    id: "vars",
    title: "Vars",
    body: "cwd={{cwd}} model={{model}} user={{username}} broken={{not a var}} upper={{userName}}",
    rowId: "prompt-section-vars",
    source: "user",
  };
  const profile = {
    id: "light",
    title: "Light",
    sections: [{ id: "vars", order: 100 }],
    rowId: "prompt-profile-light",
    source: "user",
  };
  const api = await harness({ sections: [section], profiles: [profile], builtinOrdersByName: {} });
  try {
    const { body } = await api.call("GET", "/preview?profileId=light&cwd=%2Fsession%2Fdir");
    assert.equal(
      body.sections[0].text,
      "cwd=/session/dir model={{model}} user={{username}} broken={{not a var}} upper={{userName}}",
      "only cwd is substituted; unknown, malformed and non-lowercase groups stay literal",
    );
    assert.deepEqual(
      body.variables,
      { cwd: "/session/dir", model: null, username: null },
      "used variables are reported; unknown ones are null (malformed names are not variables)",
    );
    const fallback = (await api.call("GET", "/preview?profileId=light")).body;
    assert.equal(fallback.variables.cwd, process.cwd(), "without a cwd query the host cwd is used");
  } finally {
    await api.cleanup();
  }
});

/** @purpose Disabled and empty sections are skipped with the shared runtime reasons. */
test("preview reports disabled and empty sections with the runtime reasons", async () => {
  const disabled = { id: "off", title: "Off", body: "B", rowId: "prompt-section-off", source: "user", disabled: true };
  const blank = { id: "empty", title: "Empty", body: " \n ", rowId: "prompt-section-empty", source: "user" };
  const profile = {
    id: "light",
    title: "Light",
    sections: [
      { id: "off", order: 1000, scope: "inherit" },
      { id: "empty", order: 1100, scope: "inherit" },
    ],
    rowId: "prompt-profile-light",
    source: "user",
  };
  const api = await harness({ sections: [disabled, blank], profiles: [profile] });
  try {
    const { body } = await api.call("GET", "/preview?profileId=light");
    assert.deepEqual(body.skipped, [
      { id: "off", title: "Off", reason: "section disabled" },
      { id: "empty", title: "Empty", reason: "empty body" },
    ]);
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_preview

// #region TEST_surfaceShape
/** @purpose The operation set is the ONLY surface the bundle publishes: no route table, and every method callable by name. */
test("createOperations returns the operation set and no transport table", async () => {
  const api = await harness();
  try {
    assert.deepEqual(
      Object.keys(api.ops).sort(),
      [
        "defaultSet",
        "last",
        "preview",
        "profileCreate",
        "profileDelete",
        "profileUpdate",
        "sectionCreate",
        "sectionDelete",
        "sectionRename",
        "sectionUpdate",
        "state",
      ],
      "the eleven operations, and nothing else",
    );
    for (const method of Object.values(api.ops)) assert.equal(typeof method, "function");
  } finally {
    await api.cleanup();
  }
});
// #endregion TEST_surfaceShape

// #region TEST_writeSerialization
/** @purpose Every mutating operation shares one serializer: concurrent writes never overlap. */
test("concurrent writes through the operations execute serially", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-api-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(patchPath, "# comment\n[]\n", { mode: 0o600 });
  const seen = [];
  const settings = {
    describe: () => [{ ns: "prompt-profiles", revision: 7 }],
    mutate: async (ns) => {
      seen.push({ ns, overlap: seen.some((entry) => !entry.end) });
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen[seen.length - 1].end = true;
    },
    replace: async (ns) => {
      seen.push({ ns, overlap: seen.some((entry) => !entry.end) });
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen[seen.length - 1].end = true;
    },
  };
  const service = {
    sections: () => [userSection],
    profiles: () => [userProfile],
    usedIn: () => [],
    builtinOrders: () => ({}),
    builtinOrdersByName: () => ({}),
    config: { default: { get: () => "" }, lastByWorkspace: { get: () => ({}) } },
  };
  const ctx = {
    settings,
    configEditor: { documentPath: patchPath },
    // Real cordis REFLECT: the operations read optional services through ctx.get.
    get: (name) => (name === "settings" ? settings : name === "configEditor" ? ctx.configEditor : undefined),
  };
  const { ops } = createOperations({ service, getService: (name) => ctx.get(name) });
  try {
    await Promise.all([
      ops.defaultSet({ default: "light" }),
      ops.last({ workspaceId: "w", profileId: "light" }),
      ops.sectionUpdate({ rowId: "prompt-section-tone", value: { title: "T", body: "b" } }),
    ]);
    assert.equal(seen.length, 3);
    assert.ok(
      seen.every((entry) => entry.overlap === false),
      "no overlapping write windows",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_writeSerialization
