/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin the SPEC §5.5 HTTP API against fake webServer/settings/configEditor
 *   services and a temp profile patch: validation-first writes, correct
 *   routing of each operation, error objects instead of throws.
 * @scope node:test with in-memory fakes; NOT: the real host webServer or settings.
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { registerApi } from "../lib/api.js";

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
 *   return a `call(method, path, body)` driver.
 */
async function harness({ sections = [], profiles = [], defaultId = "", lastByWorkspace = {}, agentPresets } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-api-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(patchPath, "# comment\n[]\n", { mode: 0o600 });
  const mutations = [];
  let revision = 7;
  const settings = {
    describe: () => [{ ns: "prompt-profiles", revision }],
    mutate: async (ns, ops, expected) => {
      mutations.push({ ns, ops, expected });
      revision += 1;
    },
  };
  const service = {
    sections: () => sections,
    profiles: () => profiles,
    usedIn: (id) => profiles.flatMap((profile) =>
      profile.sections.filter((ref) => ref.id === id).map((ref) => ({ profileId: profile.id, scope: ref.scope ?? "inherit" }))),
    builtinOrders: () => ({ TOOL_BASH: 1000 }),
    builtinOrdersByName: () => ({ "tool:bash": 1000 }),
    config: { default: { get: () => defaultId }, lastByWorkspace: { get: () => lastByWorkspace } },
  };
  const routes = new Map();
  const ctx = {
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => routes.delete(route.path); } },
    settings,
    configEditor: { documentPath: patchPath },
  };
  if (agentPresets !== undefined) ctx.agentPresets = agentPresets;
  const dispose = registerApi(ctx, { service });
  return {
    patchPath, mutations, dispose,
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
/** @purpose GET /state serves every field SPEC §5.5 lists, incl. source/usedIn/emits and revision. */
test("state returns profiles, sections with usedIn, builtinOrders, default, last, revision", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile], defaultId: "light", lastByWorkspace: { ws1: "light" } });
  try {
    const { status, body } = await api.call("GET", "/state");
    assert.equal(status, 200);
    assert.deepEqual(body.profiles, [userProfile]);
    assert.deepEqual(body.sections, [{ ...userSection, usedIn: [{ profileId: "light", scope: "inherit" }], emits: true }]);
    assert.deepEqual(body.builtinOrders, { TOOL_BASH: 1000 });
    assert.deepEqual(body.modes, []);
    assert.equal(body.default, "light");
    assert.deepEqual(body.lastByWorkspace, { ws1: "light" });
    assert.equal(body.revision, 7);
  } finally { await api.cleanup(); }
});
// #endregion TEST_state

// #region TEST_validation
/** @purpose Bad payloads fail with a clean error object and no file write. */
test("create rejects a bad id slug, empty title, and non-numeric order without writing", async () => {
  const api = await harness();
  try {
    for (const [path, bad] of [
      ["/section/create", { id: "Bad_Id", title: "T", body: "B" }],
      ["/section/create", { id: "ok-id", title: "  ", body: "B" }],
      ["/profile/create", { id: "ok-id", title: "T", sections: [{ id: "x", order: "many" }] }],
      ["/profile/create", { id: "ok-id", title: "T", sections: [{ id: "x", order: 1, scope: "everywhere" }] }],
    ]) {
      const { status, body } = await api.call("POST", path, bad);
      assert.equal(status, 400, `${path} ${JSON.stringify(bad)}`);
      assert.ok(body.error.message);
    }
    assert.equal(await readFile(api.patchPath, "utf8"), "# comment\n[]\n");
    assert.equal(api.mutations.length, 0);
    const wrongMethod = await api.call("GET", "/section/create");
    assert.equal(wrongMethod.status, 405);
  } finally { await api.cleanup(); }
});
// #endregion TEST_validation

// #region TEST_create
/** @purpose section/profile create write insert rows through the writer. */
test("section and profile create append insert rows to the patch", async () => {
  const api = await harness();
  try {
    const section = await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "Be brief." });
    assert.equal(section.status, 200);
    assert.deepEqual(section.body, { ok: true, rowId: "prompt-section-tone", emits: true });
    const profile = await api.call("POST", "/profile/create", { id: "light", title: "Light", sections: [{ id: "tone", order: 1050 }] });
    assert.deepEqual(profile.body, { ok: true, rowId: "prompt-profile-light" });
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const inserts = document.contents.items.filter((item) => item?.get?.("insert"));
    assert.deepEqual(inserts.map((item) => item.get("insert").items[0].get("id")), ["prompt-section-tone", "prompt-profile-light"]);
  } finally { await api.cleanup(); }
});
// #endregion TEST_create

// #region TEST_update
/** @purpose Existing-row edits go through settings.mutate with the sent revision. */
test("section update routes through settings.mutate with ops and revision", async () => {
  const api = await harness({ sections: [userSection] });
  try {
    const ops = [{ op: "set", path: ["body"], value: "Shorter." }];
    const { status, body } = await api.call("POST", "/section/update", { rowId: "prompt-section-tone", revision: 7, ops });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, emits: true });
    assert.deepEqual(api.mutations, [{ ns: "prompt-section-tone", ops, expected: 7 }]);
    const missing = await api.call("POST", "/section/update", { rowId: "prompt-section-ghost", ops });
    assert.equal(missing.status, 404);
  } finally { await api.cleanup(); }
});
// #endregion TEST_update

// #region TEST_delete
/** @purpose Delete removes user rows physically and disables bundle rows. */
test("delete removes a user insert row; a bundle row gets a bare disabled override", async () => {
  const api = await harness({ sections: [userSection] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "B" });
    const removed = await api.call("POST", "/section/delete", { rowId: "prompt-section-tone" });
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
/** @purpose Rename is the batch: new insert row, profile refs rewritten, old row gone. */
test("rename creates the new row, rewrites profile refs, and removes the old row", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "Be brief." });
    const { status, body } = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, rowId: "prompt-section-short-tone", id: "short-tone" });
    assert.deepEqual(api.mutations, [{
      ns: "prompt-profile-light",
      ops: [{ op: "set", path: ["sections"], value: [{ id: "short-tone", order: 1050, scope: "inherit" }] }],
      expected: undefined,
    }]);
    const text = await readFile(api.patchPath, "utf8");
    assert.match(text, /prompt-section-short-tone/);
    assert.doesNotMatch(text, /prompt-section-tone\b/);
  } finally { await api.cleanup(); }
});
// #endregion TEST_rename

// #region TEST_defaults
/** @purpose default and last write volatile fields through settings.mutate. */
test("default and last write through settings.mutate on the main row", async () => {
  const api = await harness({ profiles: [userProfile], lastByWorkspace: { ws1: "light" } });
  try {
    assert.equal((await api.call("POST", "/default", { default: "light" })).status, 200);
    assert.equal((await api.call("POST", "/default", { default: "" })).status, 200);
    assert.equal((await api.call("POST", "/last", { workspaceId: "ws2", profileId: "light" })).status, 200);
    assert.equal((await api.call("POST", "/last", { workspaceId: "ws1", profileId: "" })).status, 200);
    assert.deepEqual(api.mutations.map(({ ns, ops }) => ({ ns, ops })), [
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["default"], value: "light" }] },
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["default"], value: "" }] },
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace"], value: { ws1: "light", ws2: "light" } }] },
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace"], value: {} }] },
    ]);
    const unknown = await api.call("POST", "/default", { default: "ghost" });
    assert.equal(unknown.status, 404);
  } finally { await api.cleanup(); }
});
// #endregion TEST_defaults

// #region TEST_opsAllowlist
/** @purpose Update ops are allowlisted per row kind; bad paths/values/types never reach settings (verify-step4-sol defect 3). */
test("update ops allowlist rejects id writes, bad orders, unknown sections, non-numeric revision, and silent default clears", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    const attacks = [
      ["/section/update", { rowId: "prompt-section-tone", ops: [{ op: "set", path: ["id"], value: "wrong-domain" }] }],
      ["/section/update", { rowId: "prompt-section-tone", revision: "not-a-number", ops: [{ op: "set", path: ["body"], value: "x" }] }],
      ["/section/update", { rowId: "prompt-section-tone", ops: [{ op: "unset", path: ["body"] }] }],
      ["/profile/update", { rowId: "prompt-profile-light", ops: [{ op: "set", path: ["sections"], value: [{ id: "tone", order: "invalid" }] }] }],
      ["/profile/update", { rowId: "prompt-profile-light", ops: [{ op: "set", path: ["sections"], value: [{ id: "ghost", order: 1 }] }] }],
      ["/profile/update", { rowId: "prompt-profile-light", ops: [{ op: "set", path: ["sections"], value: [{ id: "tone", order: 1, scope: "everywhere" }] }] }],
      ["/profile/update", { rowId: "prompt-profile-light", ops: [{ op: "set", path: ["sections"], value: "not-an-array" }] }],
      ["/default", {}],
      ["/default", { default: 42 }],
    ];
    for (const [path, body] of attacks) {
      const { status, payload } = await api.call("POST", path, body).then((result) => ({ status: result.status, payload: result.body }));
      assert.equal(status, 400, `${path} ${JSON.stringify(body)}`);
      assert.ok(payload.error.message);
    }
    assert.equal(api.mutations.length, 0, "no write happened");
    const valid = await api.call("POST", "/profile/update", {
      rowId: "prompt-profile-light",
      ops: [{ op: "set", path: ["sections"], value: [{ id: "tone", order: 2000, scope: "main-only" }] }],
    });
    assert.equal(valid.status, 200);
    assert.equal(api.mutations.length, 1);
  } finally { await api.cleanup(); }
});
// #endregion TEST_opsAllowlist

// #region TEST_emptyBody
/** @purpose Empty/whitespace section bodies are legal (SPEC §7) and marked emits:false (verify-step4-sol defect 5). */
test("empty body is accepted on create and update and reported as non-emitting", async () => {
  const api = await harness();
  try {
    const blank = await api.call("POST", "/section/create", { id: "blank", title: "Blank", body: "  \n " });
    assert.equal(blank.status, 200);
    assert.deepEqual(blank.body, { ok: true, rowId: "prompt-section-blank", emits: false });
    const filled = await api.call("POST", "/section/create", { id: "filled", title: "Filled", body: "text" });
    assert.equal(filled.body.emits, true);
  } finally { await api.cleanup(); }
  const api2 = await harness({ sections: [userSection] });
  try {
    const cleared = await api2.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      ops: [{ op: "set", path: ["body"], value: "" }],
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body, { ok: true, emits: false });
    const titled = await api2.call("POST", "/section/update", {
      rowId: "prompt-section-tone",
      ops: [{ op: "set", path: ["title"], value: "New" }],
    });
    assert.deepEqual(titled.body, { ok: true });
  } finally { await api2.cleanup(); }
});
// #endregion TEST_emptyBody

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
/** @purpose preview orders our sections, interpolates {{cwd}}, and reports skipped refs with reasons. */
test("preview renders ordered sections with interpolation and skip reasons", async () => {
  const blank = { id: "blank", title: "Blank", body: " ", rowId: "prompt-section-blank", source: "user" };
  const cwdSection = { id: "cwd-note", title: "Cwd", body: "Work in {{cwd}} with {{model}}.", rowId: "prompt-section-cwd-note", source: "user" };
  const profile = {
    id: "light", title: "Light",
    sections: [
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
    assert.deepEqual(body.sections, [{
      id: "cwd-note", title: "Cwd", order: 1000.5, scope: "inherit",
      text: `Work in ${process.cwd()} with {{model}}.`, emits: true,
    }]);
    assert.deepEqual(body.skipped, [
      { id: "missing", reason: "section not found" },
      { id: "blank", reason: "empty body" },
    ]);
    assert.equal(body.variables.cwd, process.cwd());
    assert.equal(body.variables.model, null);
  } finally { await api.cleanup(); }
});
// #endregion TEST_preview

// #region TEST_writeSerialization
/** @purpose All mutating API paths share one serializer: concurrent mutates never overlap (verify-step4-sol defect 1). */
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
  };
  const service = {
    sections: () => [], profiles: () => [userProfile], usedIn: () => [],
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
    ]);
    assert.deepEqual(statuses, [200, 200]);
    assert.equal(seen.length, 2);
    assert.ok(seen.every((entry) => entry.overlap === false), "no overlapping mutate windows");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_writeSerialization
