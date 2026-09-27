/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin the profile-patch writer: comment and !!js preservation,
 *   insert/remove/disable round-trips, provenance, atomicity, and batch
 *   rollback — all on temp files, never on a real profile.
 * @scope node:test with os.tmpdir workspaces; NOT: loader/HMR behavior
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isSeq, parseDocument } from "yaml";
import {
  disableRow,
  insertRow,
  provenance,
  removeRow,
  renameSectionRow,
  setWriteGate,
  toPatchId,
  withPatchBatch,
} from "../lib/infra/patch-writer.js";

const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
const SECTION_NAME = "@knopki/dsh-prompt-profiles/section";

/** Unit-pin the shared normalizer: strip `<parent>:` chains, keep the last segment, pass unqualified/non-string values through. */
test("toPatchId strips qualified prefix chains and passes unqualified ids through", () => {
  assert.equal(toPatchId("include:prompt-section-1"), "prompt-section-1");
  assert.equal(toPatchId("include:group:prompt-section-1"), "prompt-section-1");
  assert.equal(toPatchId("prompt-section-1"), "prompt-section-1");
  assert.equal(toPatchId(""), "");
  assert.equal(toPatchId(null), null);
});

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
  return document.contents.items.map((item) => item?.get?.("id")).filter((id) => id !== undefined);
};

const sectionRow = (id) => ({
  id: `prompt-section-${id}`,
  name: SECTION_NAME,
  config: { id, title: `Title ${id}`, body: "Line one\nLine two" },
});

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

/** @purpose insert → remove restores the file; disable leaves a bare override row. */
test("insert, remove, disable round-trip", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await insertRow({ patchPath, row: sectionRow("tone") });
    await disableRow({ patchPath, rowId: "ui-settings-general", name: "@deepseek-ai/dsh-client-ui-settings-general" });
    let after = await readFile(patchPath, "utf8");
    const disabled = parseDocument(after, parseOptions).contents.items.find(
      (item) => item?.get?.("id") === "ui-settings-general",
    );
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

/** @purpose Duplicate and unsafe id guards reject before the file is touched. */
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

/** @purpose Prove user (insert) vs bundle (bare override) vs unknown (absent) ownership, across every id form a caller may pass. */
test("provenance distinguishes user inserts, bundle overrides, and unresolved rows", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await insertRow({ patchPath, row: sectionRow("mine") });
    await disableRow({ patchPath, rowId: "bundle-row", name: "some-bundle-plugin" });
    // Insert row reached by its unqualified id.
    assert.deepEqual(provenance({ patchPath, rowId: "prompt-section-mine" }), {
      source: "user",
      inserted: true,
      overridden: false,
    });
    // …by the QUALIFIED loader entry id (what the registry passes live).
    assert.deepEqual(provenance({ patchPath, rowId: "include:prompt-section-mine" }), {
      source: "user",
      inserted: true,
      overridden: false,
    });
    // …by its config.id (bare token).
    assert.deepEqual(provenance({ patchPath, rowId: "mine" }), { source: "user", inserted: true, overridden: false });
    // A bare override row is bundle-provided (we only disabled/overrode it).
    assert.deepEqual(provenance({ patchPath, rowId: "bundle-row" }), {
      source: "bundle",
      inserted: false,
      overridden: true,
    });
    // A row this patch says nothing about cannot be proven: unknown.
    assert.deepEqual(provenance({ patchPath, rowId: "never-seen" }), {
      source: "unknown",
      inserted: false,
      overridden: false,
    });
    assert.throws(() => provenance({ patchPath, rowId: "" }), /non-empty/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** @purpose Old slug-scheme rows (row id prompt-section-<slug>, config.id <slug>) keep proving as user. */
test("provenance matches old slug ids in either form", async () => {
  const { dir, patchPath } = await workspace();
  try {
    await insertRow({ patchPath, row: sectionRow("old-slug") });
    assert.deepEqual(provenance({ patchPath, rowId: "include:prompt-section-old-slug" }), {
      source: "user",
      inserted: true,
      overridden: false,
    });
    assert.deepEqual(provenance({ patchPath, rowId: "old-slug" }), {
      source: "user",
      inserted: true,
      overridden: false,
    });
    assert.deepEqual(provenance({ patchPath, rowId: "prompt-section-old-slug" }), {
      source: "user",
      inserted: true,
      overridden: false,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** @purpose A bare row for an unknown id carries no insert entry, so the loader skips it. */
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

/** @purpose Batch rollback restores the in-memory backup when a later step throws. */
test("withPatchBatch restores the backup when a step throws", async () => {
  const { dir, patchPath } = await workspace();
  const addRow = (row) => (document) => {
    document.add(document.createNode({ insert: [row] }));
  };
  try {
    const before = await readFile(patchPath, "utf8");
    await assert.rejects(
      withPatchBatch({ patchPath }, async (edit) => {
        await edit(addRow(sectionRow("doomed")));
        throw new Error("later step failed");
      }),
      /later step failed/,
    );
    assert.equal(await readFile(patchPath, "utf8"), before);
    const ok = await withPatchBatch({ patchPath }, async (edit) => {
      await edit(addRow(sectionRow("kept")));
      return "done";
    });
    assert.equal(ok, "done");
    assert.match(await readFile(patchPath, "utf8"), /prompt-section-kept/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
/** @purpose A batch that throws BEFORE any write must not rewrite/restore the file (no needless HMR, no foreign-commit clobber). */
test("withPatchBatch leaves the file untouched when a step fails before writing", async () => {
  const { dir, patchPath } = await workspace();
  try {
    const before = await readFile(patchPath, "utf8");
    const inodeBefore = (await stat(patchPath)).ino;
    await assert.rejects(
      withPatchBatch({ patchPath }, async (edit) => {
        await edit(() => {
          throw new Error("validation failed before any write");
        });
        return "unreachable";
      }),
      /validation failed before any write/,
    );
    assert.equal(await readFile(patchPath, "utf8"), before);
    assert.equal((await stat(patchPath)).ino, inodeBefore, "no atomic rewrite happened (same inode)");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

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

/** @purpose The exclusivity gate wraps the ENTIRE
 *  read-modify-write, so a queued writer re-reads the file AFTER external
 *  (configEditor-style) edits already on disk instead of committing a stale
 *  full document over them. */
test("a queued writer does not commit over an external edit that landed first", async () => {
  const { dir, patchPath } = await workspace("[]\n");
  // hmr-style exclusive queue: strictly one runner, FIFO (runExclusive shape).
  let tail = Promise.resolve();
  const gate = (fn) => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => {},
      () => {},
    );
    return run;
  };
  setWriteGate(gate);
  try {
    // The external actor (configEditor/settings) holds the first gate slot
    // and lands an edit on disk while our writer is queued behind it.
    const external = gate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await writeFile(patchPath, "- id: external-edit\n  name: some/plugin\n", "utf8");
    });
    const ours = insertRow({ patchPath, row: sectionRow("tone") });
    await Promise.all([external, ours]);
    const document = parseDocument(await readFile(patchPath, "utf8"), parseOptions);
    const ids = document.contents.items.flatMap((item) =>
      item?.get?.("insert") ? item.get("insert").items.map((row) => row.get("id")) : [item.get("id")],
    );
    assert.ok(ids.includes("external-edit"), "the external edit is not lost");
    assert.ok(ids.includes("prompt-section-tone"), "our row landed too");
  } finally {
    setWriteGate(null);
    await rm(dir, { recursive: true, force: true });
  }
});

/** @purpose The batch (and its rollback) is ONE gate section: a concurrent
 *  external edit is never clobbered by a backup restore, and a failing batch
 *  leaves external edits intact. */
test("a failing batch never restores a stale backup over an external edit", async () => {
  const { dir, patchPath } = await workspace("[]\n");
  let tail = Promise.resolve();
  const gate = (fn) => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => {},
      () => {},
    );
    return run;
  };
  setWriteGate(gate);
  try {
    const external = gate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await writeFile(patchPath, "- id: external-edit\n  name: some/plugin\n", "utf8");
    });
    const ours = assert.rejects(
      withPatchBatch({ patchPath }, async (edit) => {
        await edit((document) => {
          document.add(document.createNode({ insert: [sectionRow("doomed")] }));
        });
        throw new Error("later step failed");
      }),
      /later step failed/,
    );
    const [, failed] = await Promise.all([external, ours]);
    assert.ok(failed === undefined);
    const ids = entryIds(await readFile(patchPath, "utf8"));
    assert.deepEqual(ids, ["external-edit"], "rollback kept the external edit and dropped the batch's row");
  } finally {
    setWriteGate(null);
    await rm(dir, { recursive: true, force: true });
  }
});

/** @purpose renameSectionRow is a SINGLE commit — one read, one write, one
 *  gate section — and it touches the SECTION ONLY: the new row and the old
 *  row's removal land (or roll back) together, while profile refs are left
 *  EXACTLY as they were (rename never rewrites profiles). */
test("renameSectionRow inserts the new row and drops the old one in one commit, leaving profile refs untouched", async () => {
  const { dir, patchPath } = await workspace("[]\n");
  try {
    await insertRow({ patchPath, row: sectionRow("tone") });
    await insertRow({
      patchPath,
      row: {
        id: "prompt-profile-light",
        name: "@knopki/dsh-prompt-profiles/profile",
        config: { id: "light", title: "Light", sections: [{ id: "tone", order: 1050, scope: "main-only" }] },
      },
    });
    await renameSectionRow({
      patchPath,
      row: {
        id: "prompt-section-short-tone",
        name: SECTION_NAME,
        config: { id: "prompt-section-short-tone", title: "Title tone", body: "Line one\nLine two" },
      },
      oldRowId: "prompt-section-tone",
      oldName: SECTION_NAME,
      bundleOwned: false,
    });
    const document = parseDocument(await readFile(patchPath, "utf8"), parseOptions);
    const ids = [];
    for (const item of document.contents.items) {
      if (item?.get?.("insert")) for (const row of item.get("insert").items) ids.push(row.get("id"));
      else ids.push(item.get("id"));
    }
    assert.deepEqual([...ids].sort(), ["prompt-profile-light", "prompt-section-short-tone"]);
    const profileEntry = document.contents.items.find((item) =>
      item?.get?.("insert")?.items?.some((row) => row.get("id") === "prompt-profile-light"),
    );
    const profile = profileEntry.get("insert").items.find((row) => row.get("id") === "prompt-profile-light");
    assert.deepEqual(
      profile.get("config").get("sections").toJS(document),
      [{ id: "tone", order: 1050, scope: "main-only" }],
      "profile refs keep the OLD id — rename never rewrites profiles",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** @purpose A file-leading comment attached to the removed FIRST entry must
 *  survive a rename/remove: it re-attaches to the next surviving entry, or to
 *  the document itself when none remain. */
test("rename and removeRow keep the file-leading comment of a removed first entry", async () => {
  const header = "# File-leading header comment:\n# keep me across renames.\n";
  const firstEntry = (rowId, id) =>
    `- insert:\n    - id: ${rowId}\n      name: "@knopki/dsh-prompt-profiles/section"\n      config:\n        id: ${id}\n        title: T\n        body: B\n`;
  const { dir, patchPath } = await workspace(
    header + firstEntry("prompt-section-tone", "tone") + firstEntry("prompt-section-other", "other"),
  );
  try {
    await renameSectionRow({
      patchPath,
      row: { id: "prompt-section-short-tone", name: SECTION_NAME, config: { id: "short-tone", title: "T", body: "B" } },
      oldRowId: "prompt-section-tone",
      oldName: SECTION_NAME,
      bundleOwned: false,
    });
    const after = await readFile(patchPath, "utf8");
    assert.match(after, /# File-leading header comment:/, "leading comment survives the rename");
    assert.match(after, /# keep me across renames\./);
    const document = parseDocument(after, parseOptions);
    // The comment now leads the FIRST surviving entry (or the document).
    const carried = document.contents.items[0].commentBefore ?? document.contents.commentBefore;
    assert.match(String(carried), /keep me across renames/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  // Sole entry: the comment becomes a document-level comment.
  const { dir: dir2, patchPath: patchPath2 } = await workspace(header + firstEntry("prompt-section-tone", "tone"));
  try {
    await removeRow({ patchPath: patchPath2, rowId: "prompt-section-tone" });
    const after = await readFile(patchPath2, "utf8");
    assert.match(after, /keep me across renames/, "comment survives removing the only entry");
  } finally {
    await rm(dir2, { recursive: true, force: true });
  }
});

/** @purpose A BOM-prefixed patch still parses: the first write succeeds, the file is BOM-free after it, and a second write succeeds too. */
test("insertRow on a BOM-prefixed patch succeeds and leaves the file BOM-free", async () => {
  const { dir, patchPath } = await workspace(`\uFEFF${samplePatch}`);
  try {
    await insertRow({ patchPath, row: sectionRow("bom") });
    const after = await readFile(patchPath, "utf8");
    assert.equal(after.charCodeAt(0) === 0xfeff, false, "no BOM in the written file");
    assert.ok(!after.includes("\uFEFF"), "no BOM anywhere in the written file");
    assert.match(after, /prompt-section-bom/);
    await insertRow({ patchPath, row: sectionRow("bom-two") });
    const twice = await readFile(patchPath, "utf8");
    assert.equal(twice.charCodeAt(0) === 0xfeff, false, "still BOM-free after the second write");
    assert.match(twice, /prompt-section-bom-two/);
    assert.deepEqual(entryIds(twice), ["ui-settings-general"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** @purpose Line endings follow the source: a CRLF patch round-trips CRLF (comments and !!js intact) while an LF patch stays LF. */
test("a CRLF patch round-trips CRLF; an LF patch stays LF", async () => {
  const { dir, patchPath } = await workspace(samplePatch.replaceAll("\n", "\r\n"));
  try {
    await insertRow({ patchPath, row: sectionRow("crlf") });
    const after = await readFile(patchPath, "utf8");
    assert.match(after, /# Your patch layer for this dsh profile/);
    assert.match(after, /!!js "process\.env\.DSH_WEB_URL/);
    assert.match(after, /id: prompt-section-crlf/);
    assert.ok(!after.replaceAll("\r\n", "").includes("\n"), "every linefeed is a CRLF pair");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const { dir: dir2, patchPath: patchPath2 } = await workspace();
  try {
    await insertRow({ patchPath: patchPath2, row: sectionRow("lf") });
    const after = await readFile(patchPath2, "utf8");
    assert.ok(!after.includes("\r"), "no carriage return leaks into an LF patch");
  } finally {
    await rm(dir2, { recursive: true, force: true });
  }
});
