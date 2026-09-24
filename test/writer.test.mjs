/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin the profile-patch writer: comment and !!js preservation,
 *   insert/remove/disable round-trips, provenance, atomicity, and batch
 *   rollback — all on temp files, never on a real profile.
 * @scope node:test with os.tmpdir workspaces; NOT: loader/HMR behavior
 *   (spike R2 proved those against the real loader).
 * #endregion moduleContract
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument, isSeq } from "yaml";
import { insertRow, removeRow, disableRow, provenance, withPatchBatch } from "../lib/writer.js";

const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
const SECTION_NAME = "@knopki/dsh-prompt-profiles/section";

const samplePatch = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
- id: ui-settings-general
  name: "@deepseek-ai/dsh-client-ui-settings-general"
  config:
    welcomeNoticeVersion: 2026-08-13.1
    startup:
      url: !!js "process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080'"
`;

async function workspace(text = samplePatch) {
  const dir = await mkdtemp(join(tmpdir(), "dsh-pp-writer-"));
  const patchPath = join(dir, "cordis.patch.yml");
  await writeFile(patchPath, text, { mode: 0o600 });
  return { dir, patchPath };
}

const entryIds = (text) => {
  const document = parseDocument(text, parseOptions);
  assert.ok(isSeq(document.contents), "patch stays a YAML sequence");
  return document.contents.items
    .map((item) => item?.get?.("id"))
    .filter((id) => id !== undefined);
};

const sectionRow = (id) => ({
  id: `prompt-section-${id}`,
  name: SECTION_NAME,
  config: { id, title: `Title ${id}`, body: "Line one\nLine two" },
});

// #region TEST_preservation
/** @purpose Comments and !!js expressions must survive every writer round-trip. */
test("insertRow preserves comments and !!js expressions", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await insertRow({ patchPath, row: sectionRow("light-tone") });
    const after = await readFile(patchPath, "utf8");
    assert.match(after, /# Your patch layer for this dsh profile/);
    assert.match(after, /# overrides, disables, and insert lists/);
    assert.match(after, /!!js "process\.env\.DSH_WEB_URL \?\? 'http:\/\/127\.0\.0\.1:3080'"/);
    assert.match(after, /insert:/);
    assert.match(after, /id: prompt-section-light-tone/);
    assert.deepEqual(entryIds(after), ["ui-settings-general"]);
    assert.equal((await stat(patchPath)).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_preservation

// #region TEST_roundtrip
/** @purpose insert → remove restores the file; disable leaves a bare override row. */
test("insert, remove, disable round-trip", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await insertRow({ patchPath, row: sectionRow("tone") });
    await disableRow({ patchPath, rowId: "ui-settings-general", name: "@deepseek-ai/dsh-client-ui-settings-general" });
    let after = await readFile(patchPath, "utf8");
    const disabled = parseDocument(after, parseOptions).contents.items
      .find((item) => item?.get?.("id") === "ui-settings-general");
    assert.equal(disabled.get("disabled"), true);
    assert.equal(disabled.get("name"), "@deepseek-ai/dsh-client-ui-settings-general");
    assert.equal(disabled.get("config").get("welcomeNoticeVersion"), "2026-08-13.1");
    const removed = await removeRow({ patchPath, rowId: "prompt-section-tone" });
    assert.equal(removed, true);
    after = await readFile(patchPath, "utf8");
    assert.doesNotMatch(after, /insert:/);
    assert.doesNotMatch(after, /prompt-section-tone/);
    assert.equal(await removeRow({ patchPath, rowId: "prompt-section-tone" }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// #endregion TEST_roundtrip

// #region TEST_guards
/** @purpose Duplicate and unsafe id guards reject before the file is touched (verify-step4-sol defects 2 and 4). */
test("insertRow refuses a duplicate id and leaves the file untouched", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await insertRow({ patchPath, row: sectionRow("tone") });
    const before = await readFile(patchPath, "utf8");
    await assert.rejects(insertRow({ patchPath, row: sectionRow("tone") }), /already exists/);
    assert.equal(await readFile(patchPath, "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("insertRow refuses an id that already exists as a bare override row", async () => {
  const { dir, patchPath } = await workspace();
  try {
    const before = await readFile(patchPath, "utf8");
    await assert.rejects(
      insertRow({ patchPath, row: { id: "ui-settings-general", name: "x/y", config: { id: "z" } } }),
      /already exists in the profile patch \(as a bare row\)/,
    );
    assert.equal(await readFile(patchPath, "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("insertRow refuses unsafe ids (path separators, traversal, absolute)", async () => {
  const { dir, patchPath } = await workspace();
  try {
    const before = await readFile(patchPath, "utf8");
    for (const id of ["../evil", "a/b", "/tmp/evil", ".."]) {
      await assert.rejects(insertRow({ patchPath, row: { id, name: "x/y" } }), /must be a slug/);
    }
    assert.equal(await readFile(patchPath, "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_guards

// #region TEST_provenance
/** @purpose Prove user (insert) vs bundle (bare override / absent) ownership. */
test("provenance distinguishes user inserts, bundle overrides, and absent rows", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await insertRow({ patchPath, row: sectionRow("mine") });
    await disableRow({ patchPath, rowId: "bundle-row", name: "some-bundle-plugin" });
    assert.deepEqual(provenance({ patchPath, rowId: "prompt-section-mine" }), { source: "user", inserted: true, overridden: false });
    assert.deepEqual(provenance({ patchPath, rowId: "bundle-row" }), { source: "bundle", inserted: false, overridden: true });
    assert.deepEqual(provenance({ patchPath, rowId: "never-seen" }), { source: "bundle", inserted: false, overridden: false });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_provenance

// #region TEST_loaderShape
/** @purpose A bare row for an unknown id is the shape the loader skips ("entry not found", spike R2). */
test("disableRow for an unknown id yields a bare (non-insert) row the loader skips", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await disableRow({ patchPath, rowId: "ghost-row", name: "some-plugin" });
    const document = parseDocument(await readFile(patchPath, "utf8"), parseOptions);
    const ghost = document.contents.items.find((item) => item?.get?.("id") === "ghost-row");
    assert.ok(ghost, "bare row exists");
    assert.equal(ghost.has("insert"), false, "bare row carries no insert");
    assert.equal(ghost.get("disabled"), true);
    assert.equal(ghost.get("name"), "some-plugin");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_loaderShape

// #region TEST_batch
/** @purpose Batch rollback restores the in-memory backup when a later step throws. */
test("withPatchBatch restores the backup when a step throws", async () => {
  const { dir, patchPath } = await workspace();
  try {
    const before = await readFile(patchPath, "utf8");
    await assert.rejects(withPatchBatch({ patchPath }, async (ops) => {
      await ops.insertRow({ row: sectionRow("doomed") });
      await ops.disableRow({ rowId: "ui-settings-general", name: "@deepseek-ai/dsh-client-ui-settings-general" });
      throw new Error("later step failed");
    }), /later step failed/);
    assert.equal(await readFile(patchPath, "utf8"), before);
    const ok = await withPatchBatch({ patchPath }, async (ops) => {
      await ops.insertRow({ row: sectionRow("kept") });
      return "done";
    });
    assert.equal(ok, "done");
    assert.match(await readFile(patchPath, "utf8"), /prompt-section-kept/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_batch

// #region TEST_mutex
/** @purpose Concurrent mutations serialize; both land and the file stays parseable. */
test("concurrent insertRows serialize without losing rows", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await Promise.all([
      insertRow({ patchPath, row: sectionRow("one") }),
      insertRow({ patchPath, row: sectionRow("two") }),
      insertRow({ patchPath, row: sectionRow("three") }),
    ]);
    const document = parseDocument(await readFile(patchPath, "utf8"), parseOptions);
    const inserted = document.contents.items
      .filter((item) => item?.get?.("insert"))
      .flatMap((item) => item.get("insert").items.map((row) => row.get("id")));
    assert.deepEqual([...inserted].sort(), ["prompt-section-one", "prompt-section-three", "prompt-section-two"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// #endregion TEST_mutex
