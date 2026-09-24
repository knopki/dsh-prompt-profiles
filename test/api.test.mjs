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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument, isSeq } from "yaml";
import { registerApi, toPatchId } from "../lib/api.js";
import { resolveProfileId } from "../lib/resolve.js";

const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };

// #region FUNC_toPatchId_unit
/** @purpose Unit-pin the normalization helper: strip `<parent>:` chains, keep the last segment, pass through unqualified ids. */
test("toPatchId strips qualified prefix chains and passes unqualified ids through", () => {
  assert.equal(toPatchId("include:prompt-section-1"), "prompt-section-1");
  assert.equal(toPatchId("include:group:prompt-section-1"), "prompt-section-1");
  assert.equal(toPatchId("prompt-section-1"), "prompt-section-1");
  assert.equal(toPatchId(""), "");
  assert.equal(toPatchId(null), null);
});
// #endregion FUNC_toPatchId_unit

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
async function harness({ sections = [], profiles = [], defaultId = "", lastByWorkspace = {}, agentPresets, entries, settings: settingsOverride } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-api-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(patchPath, "# comment\n[]\n", { mode: 0o600 });
  const mutations = [];
  const replacements = [];
  const logs = [];
  let revision = 7;
  const settings = settingsOverride ?? {
    describe: () => [{ ns: "prompt-profiles", revision }],
    mutate: async (ns, ops, expected) => {
      mutations.push({ ns, ops, expected });
      revision += 1;
      // Apply volatile writes back so successive /last calls build on each
      // other, like the real settings service does.
      for (const op of ops) {
        if (op.op !== "set") continue;
        if (op.path[0] === "default") defaultId = op.value;
        if (op.path[0] === "lastByWorkspace") lastByWorkspace = op.value;
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
    builtinOrdersByName: () => ({ "tool:bash": 1000 }),
    config: { default: { get: () => defaultId }, lastByWorkspace: { get: () => lastByWorkspace } },
  };
  const routes = new Map();
  const ctx = {
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => routes.delete(route.path); } },
    settings,
    configEditor: entries ? { documentPath: patchPath, entries } : { documentPath: patchPath },
  };
  if (agentPresets !== undefined) ctx.agentPresets = agentPresets;
  const dispose = registerApi(ctx, {
    service,
    log: {
      warn: (message, details) => logs.push({ level: "warn", message, details }),
      error: (message, details) => logs.push({ level: "error", message, details }),
    },
  });
  return {
    patchPath, mutations, replacements, logs, dispose,
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
    assert.deepEqual(section.body, {
      ok: true, rowId: "prompt-section-tone", patchId: "prompt-section-tone", configId: "tone",
      title: "Tone", body: "Be brief.", emits: true,
    });
    const profile = await api.call("POST", "/profile/create", { title: "Light", sections: [{ id: "tone", order: 1050 }] });
    assert.deepEqual(profile.body, {
      ok: true, rowId: "prompt-profile-light", patchId: "prompt-profile-light", configId: "light",
      title: "Light", sections: [{ id: "tone", order: 1050 }],
    });
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const inserts = document.contents.items.filter((item) => item?.get?.("insert"));
    assert.deepEqual(inserts.map((item) => item.get("insert").items[0].get("id")), ["prompt-section-tone", "prompt-profile-light"]);
  } finally { await api.cleanup(); }
});

/** @purpose The server generates unique slug ids: ASCII slugs, Cyrillic → numeric fallback (live bug 2's `prompt-section-1`), collision → -2 suffix. */
test("create generates the slug id server-side and avoids collisions", async () => {
  const api = await harness({ sections: [userSection] });
  try {
    const cyrillic = await api.call("POST", "/section/create", { title: "Тестовая секция", body: "x" });
    assert.equal(cyrillic.status, 200);
    assert.equal(cyrillic.body.configId, "section-1");
    assert.equal(cyrillic.body.rowId, "prompt-section-section-1");
    assert.equal(cyrillic.body.patchId, "prompt-section-section-1");
    const again = await api.call("POST", "/section/create", { title: "Тестовая секция", body: "y" });
    assert.equal(again.body.configId, "section-2");
    // "tone" is a REGISTERED section id → slug gets a -2 suffix, never a duplicate
    const clash = await api.call("POST", "/section/create", { title: "Tone", body: "z" });
    assert.equal(clash.body.configId, "tone-2");
    // default title allowed
    const untitled = await api.call("POST", "/section/create", { body: "b" });
    assert.equal(untitled.status, 200);
    assert.equal(untitled.body.title, "Section");
  } finally { await api.cleanup(); }
});
// #endregion TEST_create

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
      value: { id: "tone", title: "New", body: "Shorter." },
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
/** @purpose Rename is ONE writer commit: new insert row, referencing profile rows rewritten in the same document, old row gone. */
test("rename creates the new row, rewrites profile refs, and removes the old row in one commit", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { id: "tone", title: "Tone", body: "Be brief." });
    await api.call("POST", "/profile/create", { id: "light", title: "Light", sections: [{ id: "tone", order: 1050, scope: "inherit" }] });
    const { status, body } = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, rowId: "prompt-section-short-tone", patchId: "prompt-section-short-tone", id: "short-tone" });
    assert.deepEqual(api.replacements, [], "rename performs no settings.replace calls");
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const profileEntry = document.contents.items.find((item) => {
      const insert = item?.get?.("insert");
      return isSeq(insert) && insert.items.some((row) => row.get("id") === "prompt-profile-light");
    });
    assert.ok(profileEntry, "profile insert row rewritten in place");
    const profileRow = profileEntry.get("insert").items.find((row) => row.get("id") === "prompt-profile-light");
    assert.deepEqual(profileRow.get("config").get("sections").toJS(document), [{ id: "short-tone", order: 1050, scope: "inherit" }]);
    assert.ok(!document.contents.items.some((item) => item?.get?.("id") === "prompt-profile-light"), "no bare override written for the insert-owned profile");
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
    const { status } = await api.call("POST", "/section/rename", { rowId: "include:prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    const text = await readFile(api.patchPath, "utf8");
    assert.match(text, /prompt-section-short-tone/);
    assert.doesNotMatch(text, /prompt-section-tone\b/);
  } finally { await api.cleanup(); }
});

/** @purpose A referencing profile from a LOWER layer is rewritten as a bare override carrying its REAL plugin name from configEditor.entries(). */
test("rename names a foreign profile from configEditor.entries() for its bare override", async () => {
  const foreignName = "@foreign/bundle/profile";
  const api = await harness({
    sections: [userSection], profiles: [userProfile],
    entries: () => [{ options: { id: "prompt-profile-light", name: foreignName } }],
  });
  try {
    await api.call("POST", "/section/create", { title: "Tone", body: "Be brief." });
    const { status } = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "short-tone" });
    assert.equal(status, 200);
    const document = parseDocument(await readFile(api.patchPath, "utf8"), parseOptions);
    const bare = document.contents.items.find((item) => item?.get?.("id") === "prompt-profile-light");
    assert.ok(bare, "bare override written for the foreign profile");
    assert.equal(bare.get("name"), foreignName, "override carries the real plugin name");
    assert.deepEqual(bare.get("config").get("sections").toJS(document), [{ id: "short-tone", order: 1050, scope: "inherit" }]);
  } finally { await api.cleanup(); }
});

/** @purpose When a referencing profile can be named NOWHERE, the rename is refused with 409 and the patch is untouched. */
test("rename is refused when a referencing profile cannot be named safely", async () => {
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    await api.call("POST", "/section/create", { title: "Tone", body: "Be brief." });
    const before = await readFile(api.patchPath, "utf8");
    const { status, body } = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "short-tone" });
    assert.equal(status, 409);
    assert.match(body.error.message, /could not name every referencing profile/);
    assert.equal(await readFile(api.patchPath, "utf8"), before, "file untouched by the refused rename");
  } finally { await api.cleanup(); }
});

/** @purpose Any failure inside the single-commit rename leaves the patch file byte-identical. */
test("rename rolls the patch file back byte-identically when a batch step fails", async () => {
  const before = "# comment\n[]\n"; // harness's initial patch file, byte-for-byte
  const api = await harness({ sections: [userSection], profiles: [userProfile] });
  try {
    const duplicate = await api.call("POST", "/section/rename", { rowId: "prompt-section-tone", id: "tone" });
    assert.equal(duplicate.status, 200, "renaming onto the same id is a no-op success");
    const missing = await api.call("POST", "/section/rename", { rowId: "prompt-section-ghost", id: "whatever" });
    assert.equal(missing.status, 404);
    assert.equal(await readFile(api.patchPath, "utf8"), before);
  } finally { await api.cleanup(); }
  const api2 = await harness({
    sections: [userSection], profiles: [userProfile],
    entries: () => [{ options: { id: "prompt-profile-light", name: "@knopki/dsh-prompt-profiles/profile" } }],
  });
  try {
    await api2.call("POST", "/section/create", { title: "Taken", body: "x" });
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
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace"], value: { ws1: "light", ws2: "light" } }] },
      { ns: "prompt-profiles", ops: [{ op: "set", path: ["lastByWorkspace"], value: { ws1: "", ws2: "light" } }] },
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
    const stored = api.mutations.at(-1).ops[0].value;
    const resolved = resolveProfileId({
      lastByWorkspace: stored, workspaceKey: "ws1",
      defaultId: "light", profileIds: ["light"],
    });
    assert.deepEqual(resolved, { profileId: null, reset: false });
  } finally { await api.cleanup(); }
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
    assert.deepEqual(boom.body, { error: { message: "internal error" } });
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
