/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin the SPEC §5.5 HTTP API (frozen live-bugfix contract: rowId OR
 *   patchId addressing, whole-object writes via settings.replace) against
 *   fake webServer/settings/configEditor services and a temp profile patch:
 *   validation-first writes, correct routing of each operation, error
 *   objects instead of throws, and failure logging.
 * @scope node:test with in-memory fakes; NOT: the real host webServer or settings.
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument, isSeq } from "yaml";
import { registerApi, tokenSource } from "../lib/api.js";
import { resolveProfileId, planInsertion } from "../lib/resolve.js";

const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };

// #region FUNC_fakes
/** @purpose Drive handlers without node sockets: minimal req/res stand-ins. */
function fakeRequest(method, path, body) {
  const listeners = {};
  const payload = Buffer.from(body === undefined ? "" : JSON.stringify(body));
  const request = {
    method,
    url: path,
    headers: { "content-length": String(payload.length) },
    on(event, callback) { listeners[event] = callback; return request; },
    resume() {}, destroy() {},
    emit(event, ...args) { listeners[event]?.(...args); },
  };
  request.deliver = () => {
    if (payload.length > 0) request.emit("data", payload);
    request.emit("end");
  };
  return request;
}

function fakeResponse() {
  const state = { statusCode: 200, headers: {}, body: null, done: null };
  state.finished = new Promise((resolve) => { state.done = resolve; });
  const response = {
    set statusCode(value) { state.statusCode = value; },
    get statusCode() { return state.statusCode; },
    setHeader(key, value) { state.headers[key] = value; },
    end(chunk) { state.body = chunk === undefined ? "" : String(chunk); state.done(); },
  };
  return { response, state };
}
// #endregion FUNC_fakes

// #region FUNC_harness
/**
 * @purpose Compose one API instance over fakes plus a temp patch file and
 *   return a `call(method, path, body)` driver. The fake settings records
 *   BOTH mutate ops and whole-object replace calls.
 */
async function harness({ sections = [], profiles = [], defaultId = "", lastByWorkspace = {}, agentPresets, entries, workspaceRegistry, builtinOrdersByName, beforeMutate, settingsRevision = true, configEditor: configEditorOverride, settings: settingsOverride } = {}) {
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
          ops, expected,
          bumpRevision: () => { revision += 1; },
          setLastByWorkspace: (value) => { lastByWorkspace = value; },
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
    usedIn: (id) => profiles.flatMap((profile) =>
      profile.sections.filter((ref) => ref.id === id).map((ref) => ({ profileId: profile.id, scope: ref.scope ?? "inherit" }))),
    builtinOrders: () => ({ TOOL_BASH: 1000 }),
    builtinOrdersByName: () => builtinOrdersByName ?? { "tool:bash": 1000 },
    config: { default: { get: () => defaultId }, lastByWorkspace: { get: () => lastByWorkspace } },
  };
  const routes = new Map();
  const ctx = {
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => routes.delete(route.path); } },
    settings,
    configEditor: configEditorOverride ?? (entries ? { documentPath: patchPath, entries } : { documentPath: patchPath }),
  };
  if (agentPresets !== undefined) ctx.agentPresets = agentPresets;
  // Reflect-style optional accessor the host context exposes for
  // workspaceRegistry (registerApi reads it without injecting it).
  ctx.get = (name) => (name === "workspaceRegistry" ? workspaceRegistry : undefined);
  const dispose = registerApi(ctx, {
    service,
    log: {
      warn: (message, details) => logs.push({ level: "warn", message, details }),
      error: (message, details) => logs.push({ level: "error", message, details }),
    },
  });
  return {
    patchPath, mutations, replacements, logs, dispose,
    configValues: () => ({ defaultId, lastByWorkspace }),
    async call(method, path, body) {
      const handler = routes.get(`/__dsh-prompt-profiles${path.split("?")[0]}`);
      assert.ok(handler, `route ${path} registered`);
      const request = fakeRequest(method, path, body);
      const { response, state } = fakeResponse();
      const pending = handler(request, response);
      request.deliver();
      await pending;
      await state.finished;
      return { status: state.statusCode, body: state.body === "" ? null : JSON.parse(state.body) };
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const userSection = { id: "tone", title: "Tone", body: "Be brief.", rowId: "prompt-section-tone", source: "user" };
const userProfile = { id: "light", title: "Light", sections: [{ id: "tone", order: 1050, scope: "inherit" }], rowId: "prompt-profile-light", source: "user" };
// #endregion FUNC_harness

// #region TEST_state
/** @purpose GET /state serves every field SPEC §5.5 lists PLUS patchId on every row (frozen contract). */
test("state returns profiles, sections with patchId, usedIn, builtinOrders, default, last, revision", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile], defaultId: "light", lastByWorkspace: { ws1: "light" } });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.deepEqual(body.profiles, [{ ...userProfile, patchId: "prompt-profile-light" }]);
    assert.deepEqual(body.sections, [{
      ...userSection, patchId: "prompt-section-tone",
      usedIn: [{ profileId: "light", scope: "inherit" }], emits: true,
    }]);
    assert.deepEqual(body.builtinOrders, { TOOL_BASH: 1000 });
    assert.deepEqual(body.modes, []);
    assert.equal(body.default, "light");
    assert.deepEqual(body.lastByWorkspace, { ws1: "light" });
    assert.equal(body.revision, 7);
  } finally { await api.cleanup(); }
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
  } finally { await api.cleanup(); }
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
      ["/profile/update", { rowId: "prompt-profile-light", value: { title: "T", sections: [{ id: "ghost", order: 1 }] } }],
      ["/profile/update", { rowId: "prompt-profile-light", value: { title: "T", sections: [{ id: "tone", order: "invalid" }] } }],
      ["/profile/update", { rowId: "prompt-profile-light", value: { title: "T", sections: [{ id: "tone", order: 1, scope: "everywhere" }] } }],
      ["/profile/update", { rowId: "prompt-profile-light", value: { title: "T", sections: "not-an-array" } }],
      ["/profile/update", { rowId: "prompt-profile-light", value: { title: "", sections: [] } }],
      ["/profile/create", { title: "T", sections: [{ id: "x", order: "many" }] }],
      ["/profile/create", { title: "T", sections: [{ id: "x", order: 1, scope: "everywhere" }] }],
      ["/default", {}],
      ["/default", { default: 42 }],
    ];
    for (const [path, body] of attacks) {
      const { status, payload } = await api.call("POST", path, body).then((result) => ({ status: result.status, payload: result.body }));
      assert.equal(status, 400, `${path} ${JSON.stringify(body)}`);
      assert.ok(payload.error.message);
    }
    assert.equal(await readFile(api.patchPath, "utf8"), before, "patch file byte-identical after validation failures");
    assert.equal(api.mutations.length, 0);
    assert.equal(api.replacements.length, 0);
    const wrongMethod = await api.call("GET", "/section/create");
    assert.equal(wrongMethod.status, 405);
  } finally { await api.cleanup(); }
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
    const profile = await api.call("POST", "/profile/create", { title: "Light", sections: [{ id: section.body.configId, order: 1050 }] });
    assert.match(profile.body.configId, /^prompt-profile-[0-9a-f]{8}$/);
    assert.equal(profile.body.rowId, profile.body.configId);
    assert.equal(profile.body.title, "Light");
    assert.deepEqual(profile.body.sections, [{ id: section.body.configId, order: 1050 }], "the full-id ref round-trips unchanged");
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const inserts = document.contents.items.filter((item) => item?.get?.("insert"));
    const rows = inserts.flatMap((item) => item.get("insert").items.map((row) => ({
      id: row.get("id"), configId: row.get("config").get("id"),
    })));
    assert.deepEqual(rows.map((row) => row.id).sort(), [profile.body.rowId, section.body.rowId].sort());
    for (const row of rows) assert.equal(row.configId, row.id, "stored config.id equals the full row id");
  } finally { await api.cleanup(); }
});

/** @purpose Create ids are short random tokens (SPEC §3/§5.5) carried IDENTICALLY by rowId and configId (full prefixed form), with no dependence on the title. */
test("create mints one full id used as rowId and configId, unique across creates", async (t) => {
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
    assert.deepEqual(ids.sort(), [
      profile.body.configId,
      again.body.configId,
      section.body.configId,
    ].sort());
  } finally { await api.cleanup(); }
});

/** @purpose A forced token collision (stubbed random source + pre-seeded patch row) regenerates instead of erroring. */
test("create regenerates the token on collision with an existing row id or config id", async (t) => {
  const api = await harness();
  // Pre-seed the patch with rows carrying the doomed token.
  await writeFile(api.patchPath, [
    "# comment",
    "- insert:",
    "    - id: prompt-section-deadbeef",
    "      name: '@knopki/dsh-prompt-profiles/section'",
    "      config: { id: deadbeef, title: Taken, body: x }",
  ].join("\n"), { mode: 0o600 });
  const original = tokenSource.next;
  const queue = ["deadbeef", "deadbeef", "cafebabe"];
  tokenSource.next = () => queue.shift() ?? "ffffffff";
  t.after(() => { tokenSource.next = original; });
  try {
    const created = await api.call("POST", "/section/create", { title: "Fresh", body: "y" });
    assert.equal(created.status, 200);
    assert.equal(created.body.configId, "prompt-section-cafebabe", "colliding tokens regenerated, not an error");
    assert.equal(created.body.rowId, created.body.configId);
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const ids = document.contents.items.map((item) => item?.get?.("insert")?.items?.[0]?.get("id")).filter(Boolean);
    assert.deepEqual(ids.sort(), ["prompt-section-cafebabe", "prompt-section-deadbeef"]);
  } finally { await api.cleanup(); }
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

    const qualified = await api.call("POST", "/profile/create", { id: "include:prompt-profile-qual", title: "Qual", sections: [] });
    assert.equal(qualified.body.configId, "prompt-profile-qual");
    assert.equal(qualified.body.rowId, "prompt-profile-qual");

    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const rows = document.contents.items
      .flatMap((item) => (isSeq(item?.get?.("insert")) ? item.get("insert").items : []))
      .map((row) => ({ id: row.get("id"), configId: row.get("config").get("id") }));
    assert.deepEqual(rows.map((row) => row.id).sort(), ["prompt-profile-qual", "prompt-section-alt", "prompt-section-tone"]);
    for (const row of rows) assert.equal(row.configId, row.id, "stored config.id === full row id");
  } finally { await api.cleanup(); }
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
  } finally { await api.cleanup(); }
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
    assert.deepEqual(created.body.sections.map((ref) => ref.id), ["prompt-section-tone", "prompt-section-tone", "prompt-section-tone"]);
    const updated = await api.call("POST", "/profile/update", {
      rowId: "light",
      value: { title: "Light", sections: [{ id: "tone", order: 900 }] },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(api.replacements.at(-1).value.sections[0].id, "prompt-section-tone", "bare token normalized to the registered full config.id");
  } finally { await api.cleanup(); }
});
// #endregion TEST_idScheme

// #region TEST_createDuplicate
/** @purpose Creating a section or profile whose id already exists maps the writer's duplicate guard to a clean 400 — never a 500. */
test("section and profile create with an existing id answer 400 with the error envelope", async () => {
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
  } finally { await api.cleanup(); }
});
// #endregion TEST_createDuplicate

// #region TEST_update
/** @purpose Updates replace the WHOLE config through settings.replace with the sent revision (task c). */
test("section update replaces the whole config through settings.replace", async () => {
  const api = await harness({ sections: [userSection] });
  try {
    const { status, body } = await api.call("POST", "/section/update", {
      rowId: "prompt-section-tone", revision: 7,
      value: { title: "New", body: "Shorter." },
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, rowId: "prompt-section-tone", patchId: "prompt-section-tone", emits: true });
    assert.deepEqual(api.replacements, [{
      ns: "prompt-section-tone",
      value: { title: "New", body: "Shorter." },
      expected: 7,
    }]);
    assert.equal(api.mutations.length, 0, "no per-op mutate calls anymore");
  } finally { await api.cleanup(); }
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
  } finally { await api.cleanup(); }
});

/** @purpose When the REGISTRY holds the qualified id, the settings ns is still the unqualified patch row id. */
test("update normalizes the settings ns when the registry rowId is qualified", async () => {
  const qualified = { ...userSection, rowId: "include:prompt-section-tone" };
  const api = await harness({ sections: [qualified] });
  try {
    const sent = await api.call("POST", "/section/update", {
      rowId: "include:prompt-section-tone", value: { title: "T", body: "b" },
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.rowId, "include:prompt-section-tone");
    assert.equal(api.replacements[0].ns, "prompt-section-tone");
    const unqualified = await api.call("POST", "/section/update", {
      rowId: "prompt-section-tone", value: { title: "T", body: "b" },
    });
    assert.equal(unqualified.status, 200, "the unqualified form addresses the same row");
    assert.equal(api.replacements[1].ns, "prompt-section-tone");
  } finally { await api.cleanup(); }
});

/** @purpose An unknown rowId answers a clear 404 envelope, never a bare 500 (task b). */
test("unknown rowIds answer 404 with the error envelope, not 500", async () => {
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
      const extra = path.endsWith("update") ? { value: { title: "T", body: "b" } } : path.endsWith("rename") ? { id: "new-id" } : {};
      const { status, body } = await api.call("POST", path, { rowId, ...extra });
      assert.equal(status, 404, `${path} ${rowId}`);
      assert.match(body.error.message, /is not registered/);
    }
  } finally { await api.cleanup(); }
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
  await writeFile(patchPath, [
    "- insert:",
    "  - id: prompt-section-new-section",
    "    name: \"@knopki/dsh-prompt-profiles/section\"",
    "    config: {id: new-section, title: New section, body: ''}",
    "- insert:",
    "  - id: prompt-profile-new-profile",
    "    name: \"@knopki/dsh-prompt-profiles/profile\"",
    "    config: {id: new-profile, title: New profile, sections: []}",
  ].join("\n"), { mode: 0o600 });
  const api = await harness({
    sections: [{ id: "new-section", title: "New section", body: "", rowId: "prompt-section-new-section", source: "user" }],
    profiles: [{ id: "new-profile", title: "New profile", sections: [], rowId: "prompt-profile-new-profile", source: "user" }],
    settings: realRulesSettings({ patchPath, composed }),
  });
  try {
    // EXACT captured live requests:
    const section = await api.call("POST", "/section/update", {
      rowId: "prompt-section-new-section",
      value: { title: "Тестовая секция 3", body: "Тестовая инструкция" },
    });
    assert.equal(section.status, 200, JSON.stringify(section.body));
    assert.deepEqual(section.body, { ok: true, rowId: "prompt-section-new-section", patchId: "prompt-section-new-section", emits: true });
    assert.deepEqual(composed[0].value, { title: "Тестовая секция 3", body: "Тестовая инструкция" }, "only volatile fields are replaced — no id key");
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
      replace: async () => { throw new Error('Config field "id" is not volatile'); },
    },
  });
  try {
    const { status, body } = await api.call("POST", "/section/update", { rowId: "prompt-section-tone", value: { title: "T", body: "b" } });
    assert.equal(status, 400);
    assert.match(body.error.message, /is not volatile/);
    assert.equal(api.logs.length, 1);
    assert.match(api.logs[0].details.error, /is not volatile/);
  } finally { await api.cleanup(); }
});

/** @purpose Task 3: a thrown NON-Error (plain string) still yields a readable message, one log line, and never an empty body. */
test("a thrown non-Error string produces a readable 500, one log line, and a non-empty message", async () => {
  const api = await harness({
    sections: [userSection],
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 7 }],
      mutate: async () => {},
      replace: async () => { throw "boom-string"; }, // eslint-disable-line no-throw-literal
    },
  });
  try {
    const { status, body } = await api.call("POST", "/section/update", { rowId: "include:prompt-section-tone", value: { title: "T", body: "b" } });
    assert.equal(status, 500);
    assert.equal(body.error.message, "internal error: boom-string");
    assert.ok(body.error.message.length > 0);
    assert.equal(api.logs.length, 1, "exactly one log line");
    assert.equal(api.logs[0].level, "error");
    assert.equal(api.logs[0].details.route, "POST /section/update");
    assert.equal(api.logs[0].details.rowId, "include:prompt-section-tone");
    assert.equal(api.logs[0].details.patchId, "prompt-section-tone");
    assert.equal(api.logs[0].details.error, "boom-string");
  } finally { await api.cleanup(); }
  // Even `throw undefined` keeps the envelope non-empty.
  const api2 = await harness({
    sections: [userSection],
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 7 }],
      mutate: async () => {},
      replace: async () => { throw undefined; }, // eslint-disable-line no-throw-literal
    },
  });
  try {
    const thrown = await api2.call("POST", "/section/update", { rowId: "prompt-section-tone", value: { title: "T", body: "b" } });
    assert.equal(thrown.status, 500);
    assert.equal(thrown.body.error.message, "internal error: undefined");
    assert.equal(api2.logs.length, 1);
  } finally { await api2.cleanup(); }
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
    } finally { await api2.cleanup(); }
  } finally { await api.cleanup(); }
});
// #endregion TEST_delete

// #region TEST_rename
/** @purpose Rename is ONE writer commit that changes the SECTION only: the new row lands, the old row goes, and every profile reference stays OLD — the response reports the affected profiles. */
test("rename creates the new row, leaves profile refs untouched, removes the old row, and reports affectedProfiles", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "Be brief." });
    await api.call("POST", "/profile/create", { id: "light", title: "Light", sections: [{ id: "tone", order: 1050, scope: "inherit" }] });
    const { status, body } = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    // The new id is the FULL prefixed form, plus the profiles left behind.
    assert.deepEqual(body, {
      ok: true,
      rowId: "prompt-section-short-tone", patchId: "prompt-section-short-tone", id: "prompt-section-short-tone",
      affectedProfiles: [{ profileId: "light", title: "Light" }],
    });
    assert.deepEqual(api.replacements, [], "rename performs no settings.replace calls");
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    assert.ok(isSeq(document.contents), "patch stays a valid YAML sequence");
    const inserted = document.contents.items.flatMap((item) => (isSeq(item?.get?.("insert")) ? item.get("insert").items : []));
    const renamed = inserted.find((row) => row.get("id") === "prompt-section-short-tone");
    assert.ok(renamed, "new section row present");
    assert.equal(renamed.get("config").get("id"), "prompt-section-short-tone", "renamed config.id is the full new row id");
    assert.ok(!inserted.some((row) => row.get("id") === "prompt-section-tone"), "old section row removed");
    assert.ok(!document.contents.items.some((item) => item?.get?.("id") === "prompt-profile-light"), "no bare override written");
    const profileRow = inserted.find((row) => row.get("id") === "prompt-profile-light");
    assert.deepEqual(profileRow.get("config").get("sections").toJS(document), [{ id: "tone", order: 1050, scope: "inherit" }],
      "profile refs are NOT rewritten: they still name the old id");
    const text = await readFile(api.patchPath, "utf8");
    assert.match(text, /prompt-section-short-tone/);
    assert.doesNotMatch(text, /prompt-section-tone\b/);
  } finally { await api.cleanup(); }
});

/** @purpose The QUALIFIED rowId works on rename too (task a). */
test("rename accepts the qualified include:… rowId", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "Be brief." });
    await api.call("POST", "/profile/create", { id: "light", title: "Light", sections: [{ id: "tone", order: 1050, scope: "inherit" }] });
    const { status, body } = await api.call("POST", "/section/rename", { rowId: "include:prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    assert.deepEqual(body.affectedProfiles, [{ profileId: "light", title: "Light" }]);
    const text = await readFile(api.patchPath, "utf8");
    assert.match(text, /prompt-section-short-tone/);
    assert.doesNotMatch(text, /prompt-section-tone\b/);
    assert.match(text, /id: tone/, "the profile ref keeps the old id");
  } finally { await api.cleanup(); }
});

/** @purpose A referencing profile from a LOWER layer is NEVER given a bare override from rename — it is reported instead. */
test("rename never writes a bare override for a foreign profile; it reports it", async () => {
  const api = await harness({
    sections: [userSection], profiles: [userProfile],
    entries: () => [{ options: { id: "prompt-profile-light", name: "@foreign/bundle/profile" } }],
  });
  try {
    await api.call("POST", "/section/create", { title: "Tone", body: "Be brief." });
    const { status, body } = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    assert.deepEqual(body.affectedProfiles, [{ profileId: "light", title: "Light" }]);
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    assert.ok(!document.contents.items.some((item) => item?.get?.("id") === "prompt-profile-light"),
      "no bare override written for the foreign profile");
    assert.equal(api.replacements.length, 0, "no settings.replace either");
  } finally { await api.cleanup(); }
});

/** @purpose A profile that cannot be named safely no longer refuses the rename — the section is renamed and the profile is reported. */
test("rename succeeds when a referencing profile cannot be named; affectedProfiles lists it", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { title: "Tone", body: "Be brief." });
    const { status, body } = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    assert.deepEqual(body.affectedProfiles, [{ profileId: "light", title: "Light" }]);
  } finally { await api.cleanup(); }
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
  } finally { await api.cleanup(); }
  const api2 = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api2.call("POST", "/section/create", { id: "taken", title: "Taken", body: "x" });
    const before2 = await readFile(api2.patchPath, "utf8");
    const failed = await api2.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "taken" });
    assert.equal(failed.status, 400, "duplicate section id rejected");
    assert.equal(await readFile(api2.patchPath, "utf8"), before2, "file byte-identical after rejected rename");
  } finally { await api2.cleanup(); }
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
    assert.deepEqual(api.mutations.map(({ ns, ops }) => ({ ns, ops })), [
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["default"], value: "light" }] },
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["default"], value: "" }] },
      // Per-key ops: only the caller's workspace key is written.
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace", "ws2"], value: "light" }] },
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace", "ws1"], value: "" }] },
    ]);
    const unknown = await api.call("POST", "/default", { default: "ghost" });
    assert.equal(unknown.status, 404);
  } finally { await api.cleanup(); }
});

/** @purpose End-to-end (API value + resolver): explicit none beats a configured default. */
test("explicit none stored by /last resolves to no profile even with a default set", async () => {
  const api = await harness({ profiles: [userProfile], defaultId: "light" });
  try {
    await api.call("POST", "/last", { workspaceId: "ws1", profileId: "" });
    const stored = api.configValues().lastByWorkspace;
    const resolved = resolveProfileId({
      lastByWorkspace: stored, workspaceKey: "ws1",
      defaultId: "light", profileIds: ["light"],
    });
    assert.deepEqual(resolved, { profileId: null, reset: false });
  } finally { await api.cleanup(); }
});

/** @purpose /last contract: {workspaceId?, cwd?, profileId} — cwd resolves through the SAME key the assembler uses. */
test("/last accepts cwd, resolves the workspace key, and rejects an addressless request", async () => {
  const resolved = [];
  const api = await harness({
    profiles: [userProfile],
    workspaceRegistry: {
      list: () => [],
      resolveByPath: async (path) => { resolved.push(path); return path === "/work" ? { id: "ws-resolved" } : undefined; },
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
  } finally { await api.cleanup(); }
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
    assert.deepEqual(cleanup.ops, [
      { op: "unset", path: ["lastByWorkspace", "ws1"] },
      { op: "unset", path: ["lastByWorkspace", "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75"] },
      { op: "set", path: ["default"], value: "" },
    ], "only the matching keys are unset (ws2 and its explicit none are kept)");
    assert.equal(cleanup.expected, 7, "cleanup uses the request revision");
    assert.deepEqual(api.configValues(), { defaultId: "", lastByWorkspace: { ws2: "" } });
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    assert.ok(isSeq(document.contents), "patch stays a valid YAML sequence");
    const row = document.contents.items.find((item) => item?.get?.("id") === "prompt-profile-light");
    assert.ok(row, "the profile row was deleted (disabled override written)");
  } finally { await api.cleanup(); }
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
    assert.deepEqual(api.configValues(), { defaultId: "light", lastByWorkspace: { ws1: "light" } }, "choice and default untouched");
  } finally { await api.cleanup(); }
});

/** @purpose Cleanup is best-effort: a failing settings write after a SUCCESSFUL delete is logged, not fatal. */
test("a successful delete whose cleanup fails keeps the row deleted and logs the failure", async () => {
  const api = await harness({
    profiles: [userProfile],
    defaultId: "light",
    lastByWorkspace: { ws1: "light" },
    beforeMutate: () => { throw new Error("settings down"); },
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
    assert.deepEqual(api.configValues().lastByWorkspace, { ws1: "light" }, "dangling choice remains — safe degradation");
  } finally { await api.cleanup(); }
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
      if (forcedConflicts > 0) { forcedConflicts -= 1; bumped += 1; bumpRevision(); }
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
    assert.deepEqual(api.configValues().lastByWorkspace, { "ws-a": "light", "ws-b": "light" },
      "both workspace choices survive the conflict and retry");
  } finally { await api.cleanup(); }
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
      if (!injected) { injected = true; setLastByWorkspace({ "ws-foreign": "light" }); }
    },
  });
  try {
    const [first, second] = await Promise.all([
      api.call("POST", "/last", { workspaceId: "ws-a", profileId: "light" }),
      api.call("POST", "/last", { workspaceId: "ws-b", profileId: "light" }),
    ]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.deepEqual(api.configValues().lastByWorkspace,
      { "ws-foreign": "light", "ws-a": "light", "ws-b": "light" },
      "no revision is required: per-key ops preserve every concurrent choice");
  } finally { await api.cleanup(); }
});

/** @purpose /last pruning: dangling profile values and stale UUID keys go, cwd keys and explicit none stay. */
test("/last prunes dangling profile values and stale workspace-id keys", async () => {
  const liveId = "2af243f0-f678-4ef8-9b9a-f79e4ea5bc75";
  const staleId = "00000000-0000-4000-8000-000000000000";
  const api = await harness({
    profiles: [userProfile],
    lastByWorkspace: {
      "ws-path": "ghost",                    // dangling value → dropped
      "ws-none": "",                         // explicit none → kept
      "/work/dir": "light",                  // cwd key → kept
      [liveId]: "light",                     // UUID the registry knows → kept
      [staleId]: "light",                    // UUID absent from the registry → dropped
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
  } finally { await api.cleanup(); }
  // Without a workspace registry a UUID key cannot be PROVEN stale: keep it.
  const api2 = await harness({
    profiles: [userProfile],
    lastByWorkspace: { [staleId]: "light" },
  });
  try {
    await api2.call("POST", "/last", { workspaceId: "ws-plain", profileId: "" });
    assert.deepEqual(api2.configValues().lastByWorkspace, { [staleId]: "light", "ws-plain": "" });
  } finally { await api2.cleanup(); }
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
  } finally { await api.cleanup(); }
  const api2 = await harness({ sections: [userSection] });
  try {
    const cleared = await api2.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      value: { title: "Tone", body: "" },
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body, { ok: true, rowId: "prompt-section-tone", patchId: "prompt-section-tone", emits: false });
  } finally { await api2.cleanup(); }
});
// #endregion TEST_emptyBody

// #region TEST_logging
/** @purpose Task 3: every route failure is logged with route, rowId as received, normalized patchId, and the underlying message. */
test("route failures are logged with route, rowId, normalized patchId, and the error message", async () => {
  const api = await harness({ sections: [userSection] });
  try {
    await api.call("POST", "/section/update", { rowId: "include:prompt-section-ghost", value: { title: "T", body: "b" } });
    const entry = api.logs.find((log) => log.details?.rowId === "include:prompt-section-ghost");
    assert.ok(entry, "failure was logged");
    assert.equal(entry.details.route, "POST /section/update");
    assert.equal(entry.details.patchId, "prompt-section-ghost");
    assert.match(entry.details.error, /is not registered/);
    assert.ok(entry.message.includes("request failed"));
    api.logs.length = 0;
  } finally { await api.cleanup(); }
  // 500s go to the error sink with the underlying message preserved.
  const api2 = await harness({
    sections: [userSection],
    settings: {
      describe: () => [{ ns: "prompt-profiles", revision: 7 }],
      mutate: async () => {},
      replace: async () => { throw new Error("settings failed"); },
    },
  });
  try {
    const boom = await api2.call("POST", "/section/update", { rowId: "include:prompt-section-tone", value: { title: "T", body: "b" } });
    assert.equal(boom.status, 500);
    assert.deepEqual(boom.body, { error: { message: "internal error: settings failed" } });
    const failure = api2.logs[0];
    assert.equal(failure.level, "error");
    assert.equal(failure.details.route, "POST /section/update");
    assert.equal(failure.details.rowId, "include:prompt-section-tone");
    assert.equal(failure.details.patchId, "prompt-section-tone");
    assert.match(failure.details.error, /settings failed/);
  } finally { await api2.cleanup(); }
});
// #endregion TEST_logging

// #region TEST_modes
/** @purpose state.modes derives complete flags from agentPresets documents (SPEC decision 21); absent service degrades to []. */
test("state modes mark complete presets and degrade without agentPresets", async () => {
  const completeYaml = [
    "- name: \"@deepseek-ai/dsh-persona\"",
    "  config:",
    "    complete: true",
  ].join("\n");
  const agentPresets = {
    list: async () => [{ id: "minimal" }, { id: "default", name: "Default" }],
    readDocument: async (id) => ({ agentPreset: id, content: id === "minimal" ? completeYaml : "- name: \"@deepseek-ai/dsh-persona\"\n" }),
  };
  const api = await harness({ agentPresets });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.deepEqual(body.modes, [
      { id: "minimal", title: "minimal", complete: true },
      { id: "default", title: "Default", complete: false },
    ]);
  } finally { await api.cleanup(); }
});
// #endregion TEST_modes

// #region TEST_preview
/** @purpose preview orders our sections, interpolates {{cwd}}, reports the profile's order verbatim (no +0.5), places built-in placeholders, and reports skipped refs with reasons. */
test("preview renders ordered sections with interpolation and skip reasons", async () => {
  const blank = { id: "blank", title: "Blank", body: " ", rowId: "prompt-section-blank", source: "user" };
  const cwdSection = { id: "cwd-note", title: "Cwd", body: "Work in {{cwd}} with {{model}}.", rowId: "prompt-section-cwd-note", source: "user" };
  const profile = {
    id: "light", title: "Light",
    sections: [
      // 1000 EQUALS the built-in tool:bash order: the preview must report 1000,
      // not a shifted 1000.5, and place the section BEFORE that built-in.
      { id: "cwd-note", order: 1000, scope: "inherit" },
      { id: "missing", order: 1100 },
      { id: "blank", order: 1200 },
    ],
    rowId: "prompt-profile-light", source: "user",
  };
  const api = await harness({ sections: [cwdSection, blank], profiles: [profile] });
  try {
    assert.equal((await api.call("GET", "/preview")).status, 400);
    assert.equal((await api.call("GET", "/preview?profileId=ghost")).status, 404);
    const { status, body } = await api.call("GET", "/preview?profileId=light");
    assert.equal(status, 200);
    assert.equal(body.title, "Light");
    assert.deepEqual(body.sections, [
      {
        id: "cwd-note", title: "Cwd", order: 1000, scope: "inherit",
        text: `Work in ${process.cwd()} with {{model}}.`, emits: true,
      },
      { kind: "builtin", name: "tool:bash", title: "tool:bash", order: 1000 },
    ], "our equal-order section stands BEFORE the built-in placeholder");
    assert.deepEqual(body.skipped, [
      { id: "missing", title: "missing", reason: "section not found" },
      { id: "blank", title: "Blank", reason: "empty body" },
    ]);
    assert.equal(body.variables.cwd, process.cwd());
    assert.equal(body.variables.model, null);
  } finally { await api.cleanup(); }
});

/** @purpose Preview applies the RUNTIME selection rule (main agent) and the SAME insertion plan: scope filtering, built-in placeholders, equal-order-before-builtin, planInsertion parity. */
test("preview filters scope like the runtime and merges built-in placeholders via planInsertion", async () => {
  const builtinOrdersByName = {
    "plan:policy": 500,
    "tool:bash": 1000,
    "deployment:persona-suffix": 10200,
  };
  const makeSection = (id, title, body) => ({ id, title, body, rowId: `prompt-section-${id}`, source: "user" });
  const profile = {
    id: "light", title: "Light",
    sections: [
      { id: "cwd-note", order: 1000, scope: "inherit" },   // equal to tool:bash
      { id: "main-note", order: 1200, scope: "main-only" }, // emitted for the main agent
      { id: "sub-note", order: 1300, scope: "subagents-only" }, // skipped
    ],
    rowId: "prompt-profile-light", source: "user",
  };
  const api = await harness({
    sections: [makeSection("cwd-note", "Cwd", "C"), makeSection("main-note", "Main", "M"), makeSection("sub-note", "Sub", "S")],
    profiles: [profile],
    builtinOrdersByName,
  });
  try {
    const { status, body } = await api.call("GET", "/preview?profileId=light");
    assert.equal(status, 200);
    const tags = body.sections.map((s) => (s.kind === "builtin" ? `builtin:${s.name}` : `ours:${s.id}`));
    // (а) subagents-only is skipped with a reason; (б) main-only is emitted;
    // (в) built-in placeholders sit in engine order; (г) our order==1000 section
    //     stands BEFORE tool:bash.
    assert.deepEqual(tags, [
      "builtin:plan:policy",
      "ours:cwd-note",
      "builtin:tool:bash",
      "ours:main-note",
      "builtin:deployment:persona-suffix",
    ]);
    assert.deepEqual(body.skipped, [
      { id: "sub-note", title: "Sub", reason: "scope subagents-only outside a plain subagent" },
    ]);
    assert.ok(body.sections.filter((s) => s.kind !== "builtin").every((s) => s.emits === true && typeof s.text === "string"),
      "emitted sections carry their text");
    // (д) our sections' order matches planInsertion on the same fixture.
    const assemblySections = Object.keys(builtinOrdersByName)
      .map((name) => ({ name, order: builtinOrdersByName[name] }))
      .sort((a, b) => a.order - b.order)
      .map(({ name }) => ({ name }));
    const plan = planInsertion({
      snapshot: { sections: [
        { id: "cwd-note", order: 1000, text: "C" },
        { id: "main-note", order: 1200, text: "M" },
      ] },
      assemblySections,
      builtinOrdersByName,
    });
    const merged = assemblySections.map(({ name }) => ({ kind: "builtin", name }));
    const expectedOurs = [{ id: "cwd-note" }, { id: "main-note" }];
    for (let i = plan.length - 1; i >= 0; i--) merged.splice(plan[i].index, 0, expectedOurs[i]);
    assert.deepEqual(
      body.sections.map((s) => (s.kind === "builtin" ? `builtin:${s.name}` : `ours:${s.id}`)),
      merged.map((s) => (s.kind === "builtin" ? `builtin:${s.name}` : `ours:${s.id}`)),
      "preview order equals planInsertion's result on the same fixture",
    );
  } finally { await api.cleanup(); }
});

/** @purpose Disabled and empty sections are skipped with the shared runtime reasons. */
test("preview reports disabled and empty sections with the runtime reasons", async () => {
  const disabled = { id: "off", title: "Off", body: "B", rowId: "prompt-section-off", source: "user", disabled: true };
  const blank = { id: "empty", title: "Empty", body: " \n ", rowId: "prompt-section-empty", source: "user" };
  const profile = {
    id: "light", title: "Light",
    sections: [{ id: "off", order: 1000, scope: "inherit" }, { id: "empty", order: 1100, scope: "inherit" }],
    rowId: "prompt-profile-light", source: "user",
  };
  const api = await harness({ sections: [disabled, blank], profiles: [profile] });
  try {
    const { body } = await api.call("GET", "/preview?profileId=light");
    assert.deepEqual(body.skipped, [
      { id: "off", title: "Off", reason: "section disabled" },
      { id: "empty", title: "Empty", reason: "empty body" },
    ]);
  } finally { await api.cleanup(); }
});
// #endregion TEST_preview

// #region TEST_writeSerialization
/** @purpose All mutating API paths share one serializer: concurrent writes never overlap. */
test("concurrent settings writes through the API execute serially", async () => {
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
    sections: () => [userSection], profiles: () => [userProfile], usedIn: () => [],
    builtinOrders: () => ({}), builtinOrdersByName: () => ({}),
    config: { default: { get: () => "" }, lastByWorkspace: { get: () => ({}) } },
  };
  const routes = new Map();
  const ctx = {
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {}; } },
    settings, configEditor: { documentPath: patchPath },
  };
  registerApi(ctx, { service });
  const call = async (path, body) => {
    const handler = routes.get(`/__dsh-prompt-profiles${path}`);
    const request = fakeRequest("POST", path, body);
    const { response, state } = fakeResponse();
    const pending = handler(request, response);
    request.deliver();
    await pending;
    await state.finished;
    return state.statusCode;
  };
  try {
    const statuses = await Promise.all([
      call("/default", { default: "light" }),
      call("/last", { workspaceId: "w", profileId: "light" }),
      call("/section/update", { rowId: "prompt-section-tone", value: { title: "T", body: "b" } }),
    ]);
    assert.deepEqual(statuses, [200, 200, 200]);
    assert.equal(seen.length, 3);
    assert.ok(seen.every((entry) => entry.overlap === false), "no overlapping write windows");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_writeSerialization
