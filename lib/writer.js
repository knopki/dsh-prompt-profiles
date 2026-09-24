/**
 * Writer for prompt-profile rows in the profile patch (PLAN step 4).
 * #region moduleContract
 * @modulecontract
 * @purpose Let the API create, remove, disable, and prove ownership of
 *   composition rows in the user's cordis.patch.yml — operations the
 *   config-editor cannot do, because it can only override existing rows
 *   (SPEC §5.6, decision 18).
 * @scope
 *  - Parse/serialize the profile patch with eemeli `yaml` `parseDocument`
 *    using the same `!!js` customTag as config-editor, so comments and
 *    tag expressions survive every round-trip.
 *  - `insertRow` / `removeRow` / `disableRow` / `provenance` and the batch
 *    helper `withPatchBatch` (in-memory backup + rollback).
 *  - Atomic write (temp file + rename, mode 0o600) serialized by one
 *    in-process mutex.
 *  - NOT: updating configs of existing rows — that goes through
 *    ctx.settings.mutate / configEditor (SPEC §2 #19).
 * @invariants
 *  - Every mutation of the profile patch by THIS bundle (writer operations
 *    and the API's settings.mutate calls via `withWriteLock`) passes through
 *    one module-level mutex; a validation or parse failure leaves the file
 *    byte-identical. When a host write gate is installed (`setWriteGate`,
 *    dsh-hmr runExclusive) the gate wraps the ENTIRE read-modify-write of
 *    every writer operation and the WHOLE batch (backup, steps, rollback),
 *    not just the final write, so raw writes serialize against
 *    config-editor/settings edits in this process (astra finding C). HMR
 *    transactions cannot be nested: nothing that takes hmr exclusivity
 *    itself (settings.mutate, configEditor.edit) may run inside the gate.
 *    RESIDUAL WINDOW: other plugins' direct configEditor writes when hmr is
 *    absent, and any second DSH process (no cross-process lock by design).
 *  - `insert:` entries written here NEVER carry a patch-level `id` — an
 *    insert WITH `id` means "append into that group" (spike R2,
 *    applyEntryPatches insert branch), a different operation.
 *  - A bare override for an id unknown to every lower layer is skipped by
 *    the loader ("patch: entry %C not found") — disableRow therefore only
 *    makes sense for ids a bundle actually provides.
 * @dependencies
 *  - READS/WRITES: the profile patch (ctx.configEditor.documentPath, passed
 *    in as `patchPath` by callers; tests use temp files).
 *  - USES API: node:fs (sync read for provenance, promises for writes),
 *    node:crypto random temp names, eemeli `yaml`.
 * @rationale
 *  - Q: Why a module mutex plus an optional hmr gate instead of the
 *    cross-process `withFileLock` dsh-atomic-write provides?
 *    A: The bundle must stay installable without extra host packages. The
 *    module mutex serializes all of THIS bundle's writes (writer + the API's
 *    settings.mutate calls); the optional hmr gate (installed by the plugin
 *    when dsh-hmr is present) additionally serializes raw file writes against
 *    config-editor/settings edits in the same process, which run under the
 *    same exclusivity. CAVEAT (cross-process): a second DSH process editing
 *    the same profile concurrently can still interleave with this writer; the
 *    atomic rename keeps the file always parseable, and HMR recomposes from
 *    whatever landed last.
 *  - Q: Why does provenance treat ANY insert entry as user ownership?
 *    A: This file IS the profile layer; whatever was inserted here was
 *    inserted for the user (by our writer or by hand), regardless of which
 *    plugin name the row carries. configEditor.configuration() cannot prove
 *    this (step2b report) — only insert ownership can.
 * @keywords writer, insert row, remove row, disable row, provenance,
 *   profile patch, yaml, mutex, rollback
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { isMap, isSeq, parseDocument } from "yaml";

// #region CONST_parseOptions
/**
 * The `!!js` expression dialect of the Loader entry list (same customTag as
 * config-editor and plugin-manager use): tagged scalars round-trip verbatim.
 */
const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
// #endregion CONST_parseOptions

// #region FUNC_withMutex
/**
 * @purpose Serialize EVERY file-mutating path of this bundle (writer
 *   operations AND the API's settings.mutate writes, which import
 *   `withWriteLock`) inside this process so concurrent API calls cannot
 *   interleave read-modify-write cycles on one file (verify-step4-sol
 *   defect 1).
 * @param {() => Promise<any>} fn - critical section; errors propagate to the
 *   caller without poisoning later entries.
 * @returns {Promise<any>} the fn result.
 */
let mutexTail = Promise.resolve();
function withMutex(fn) {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.then(() => {}, () => {});
  return run;
}
/**
 * Public alias: the ONE in-process serializer shared by the writer and the
 * HTTP API's settings.mutate writes (lib/api.js routes every mutation through
 * it). NOT reentrant — never call writer mutations from inside it.
 */
export const withWriteLock = withMutex;
// #endregion FUNC_withMutex

// #region FUNC_setWriteGate
/**
 * Install an additional host write gate (dsh-hmr `runExclusive`) around every
 * raw file write, so writer writes also serialize against config-editor /
 * settings edits in this process — they run under the same hmr exclusivity
 * (config-editor precedent: `hmr.runExclusive(run)`).
 *
 * @purpose Close the same-process lost-update window between this writer and
 *   configEditor. Residual windows (documented): without a gate (hmr absent)
 *   the module mutex still serializes this bundle's own writes but not other
 *   plugins' direct configEditor edits; cross-process interleaving remains
 *   possible by design (atomic rename keeps the file parseable).
 * @param {(fn: () => Promise<any>) => Promise<any>} gate
 */
let writeGate = null;
export function setWriteGate(gate) {
  writeGate = gate;
}
// #endregion FUNC_setWriteGate

// #region FUNC_runGated
/**
 * Run a whole critical section through the optional host gate (dsh-hmr
 * `runExclusive`). The gate — when installed — must wrap the ENTIRE
 * read-modify-write, not just the final write: a gate held only for the write
 * lets a queued call commit a stale document over an edit that landed after
 * our read (astra finding C). NOTE: hmr transactions CANNOT be nested
 * ("HMR transactions cannot be nested"), so nothing that itself takes hmr
 * exclusivity (settings.mutate / configEditor.edit) may run inside.
 *
 * @purpose Close the same-process lost-update window between this writer and
 *   config-editor/settings edits.
 * @param {() => Promise<any>} section - full RMW critical section.
 */
function runGated(section) {
  return writeGate ? writeGate(section) : section();
}
// #endregion FUNC_runGated

// #region FUNC_loadDocument
/**
 * Parse the profile patch, accepting a missing file as an empty list
 * (config-editor/plugin-manager precedent). Throws descriptive errors on
 * parse failures or a non-sequence document BEFORE anything is written.
 *
 * @purpose Guarantee the writer only ever edits a document it fully
 *   understood — a corrupt file must fail loudly, not be overwritten.
 * @param {string} patchPath
 * @returns {{ document: object, text: string }}
 */
function loadDocument(patchPath) {
  let text;
  try {
    text = readFileSync(patchPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    text = "[]\n";
  }
  const document = parseDocument(text, parseOptions);
  if (document.errors.length > 0) throw document.errors[0];
  if (!isSeq(document.contents)) throw new Error("prompt-profiles writer: profile patch must be a YAML sequence");
  document.contents.flow = false;
  return { document, text };
}
// #endregion FUNC_loadDocument

// #region FUNC_writeAtomic
/**
 * @purpose Keep readers (loader, HMR) observing either the old or the new
 *   complete content, never a partial file (SPEC §5.6 step 3).
 * @param {string} patchPath
 * @param {string} text - full serialized document.
 * @returns {Promise<void>}
 */
async function writeAtomic(patchPath, text) {
  const directory = dirname(patchPath);
  const temp = join(directory, `.${basename(patchPath)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const handle = await fsp.open(temp, "wx", 0o600);
    try {
      await handle.writeFile(text, "utf8");
    } finally {
      await handle.close();
    }
    await fsp.rename(temp, patchPath);
  } catch (error) {
    await fsp.rm(temp, { force: true });
    throw error;
  }
}
// #endregion FUNC_writeAtomic

// #region FUNC_findInsertItem
/**
 * Locate the top-level patch entry whose `insert` array carries `rowId`.
 *
 * @purpose Give removeRow/provenance one shared, order-independent lookup
 *   over every `insert` entry in the file.
 * @param {object} document - parsed YAML document (seq root).
 * @param {string} rowId
 * @returns {{ entry: number, row: number } | null} indices into the document.
 */
function findInsertItem(document, rowId) {
  const items = document.contents.items;
  for (let entry = 0; entry < items.length; entry++) {
    const insert = items[entry]?.get?.("insert");
    if (!isSeq(insert)) continue;
    for (let row = 0; row < insert.items.length; row++) {
      if (isMap(insert.items[row]) && insert.items[row].get("id") === rowId) return { entry, row };
    }
  }
  return null;
}
// #endregion FUNC_findInsertItem

// #region FUNC_findBareRow
/**
 * Locate the LAST bare (non-insert) override row for `rowId` — the same
 * matching rule config-editor uses (id, optional name guard).
 *
 * @purpose Find the override row a disableRow must update instead of
 *   duplicating.
 * @param {object} document
 * @param {string} rowId
 * @param {string} [name] - when given, a row carrying a different `name` is
 *   ignored (the loader would skip such an override anyway).
 * @returns {number | null} index into the top-level sequence.
 */
function findBareRow(document, rowId, name) {
  const items = document.contents.items;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (!isMap(item) || item.has("insert") || item.get("id") !== rowId) continue;
    const expectedName = item.get("name");
    if (name != null && expectedName != null && expectedName !== name) continue;
    return index;
  }
  return null;
}
// #endregion FUNC_findBareRow

// #region FUNC_validateRow
/**
 * @purpose Reject malformed or unsafe rows before the file is touched so the
 *   patch can never gain an entry the loader would warn about or the UI could
 *   not address. Ids must be slugs: no path separators, no `..`, no absolute
 *   paths (verify-step4-sol: `../evil`, `a/b`, `/tmp/evil` were accepted).
 * @param {{ id: string, name: string, config?: object }} row
 * @returns {void}
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function validateRow(row) {
  if (!row || typeof row !== "object") throw new TypeError("writer: row must be an object");
  if (typeof row.id !== "string" || row.id === "") throw new TypeError("writer: row.id must be a non-empty string");
  if (!SAFE_ID.test(row.id) || row.id.includes("..")) {
    throw new TypeError(`writer: row.id must be a slug without '/', '\' or '..' segments (got "${row.id}")`);
  }
  if (typeof row.name !== "string" || row.name === "") throw new TypeError("writer: row.name must be a non-empty string");
}
// #endregion FUNC_validateRow

// #region FUNC_findExistingRowId
/**
 * Find ANY row in the composed profile patch that already claims `rowId`:
 * bare override rows (top-level `id`), rows inside any `insert` array, and
 * rows inside grouped inserts (`insert` WITH a patch-level `id`).
 *
 * @purpose Make the insertRow duplicate guard cover the whole loader id
 *   domain (verify-step4-sol defect 2: inserting an id that exists as a bare
 *   row produced two rows with one loader id, which can redirect the
 *   override and lose the previous configuration).
 * @param {object} document
 * @param {string} rowId
 * @returns {{ kind: "bare" | "insert" } | null}
 */
function findExistingRowId(document, rowId) {
  const items = document.contents.items;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!isMap(item)) continue;
    if (item.get("id") === rowId && !item.has("insert")) return { kind: "bare" };
    const insert = item.get("insert");
    if (isSeq(insert)) {
      for (const row of insert.items) {
        if (isMap(row) && row.get("id") === rowId) return { kind: "insert" };
      }
    }
  }
  return null;
}
// #endregion FUNC_findExistingRowId

// #region FUNC_editUnlocked
/**
 * Shared ungated mutation core (caller must already hold the mutex AND, for
 * exclusivity against config-editor, the gate): parse, mutate, serialize,
 * atomic write. A throw from `mutate` skips the write entirely. The READ and
 * the WRITE live in one critical section (astra finding C) — the caller
 * decides the exclusivity scope around both.
 *
 * @purpose Make every single-row operation atomic-by-skip: invalid input
 *   never reaches the filesystem, and no external edit can land between the
 *   read and the write when the caller gates the whole call.
 * @param {string} patchPath
 * @param {(document: object) => boolean | void} mutate - return false to
 *   signal "nothing changed" (no write).
 * @returns {Promise<boolean>} whether the file was written.
 */
async function editUnlocked(patchPath, mutate) {
  const { document } = loadDocument(patchPath);
  if (mutate(document) === false) return false;
  await writeAtomic(patchPath, String(document));
  return true;
}
// #endregion FUNC_editUnlocked

// #region FUNC_insertMutation
/**
 * @purpose Shared document mutation behind insertRow and the batch ops:
 *   append a fresh top-level `{ insert: [row] }` entry with a duplicate guard
 *   over the WHOLE composed patch (bare rows, inserts, grouped inserts).
 */
function insertMutation(row) {
  validateRow(row);
  return (document) => {
    const existing = findExistingRowId(document, row.id);
    if (existing !== null) {
      throw new Error(`writer: row id "${row.id}" already exists in the profile patch (as a ${existing.kind} row)`);
    }
    document.add(document.createNode({ insert: [row] }));
  };
}
// #endregion FUNC_insertMutation

// #region FUNC_preserveLeadingComment
/**
 * Re-attach the leading comments of a to-be-deleted top-level entry: a
 * file-leading comment is stored as `commentBefore` on the FIRST entry, so
 * removing that entry (e.g. a rename that removes the old section row) used
 * to drop it (verify-fixes-glm defect 4). The comments move to the next
 * surviving entry, or to the document itself when none remain.
 *
 * @purpose Keep document-level leading comments alive across removals.
 * @param {object} document - parsed YAML document (seq root).
 * @param {number} index - index of the entry about to be deleted.
 * @returns {void}
 */
function preserveLeadingComment(document, index) {
  const comment = document.contents.items[index]?.commentBefore;
  if (typeof comment !== "string" || comment === "") return;
  const next = document.contents.items[index + 1];
  if (next) next.commentBefore = next.commentBefore ? `${comment}\n${next.commentBefore}` : comment;
  else document.contents.commentBefore = document.contents.commentBefore
    ? `${document.contents.commentBefore}\n${comment}`
    : comment;
}
// #endregion FUNC_preserveLeadingComment

// #region FUNC_removeMutation
/**
 * @purpose Shared document mutation behind removeRow and the batch ops: drop
 *   the insert item plus stale bare overrides for the same id, re-attaching
 *   any file-leading comments the removed entries carried.
 */
function removeMutation(rowId) {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  return (document) => {
    const found = findInsertItem(document, rowId);
    if (found === null) return false; // no insert row: nothing written
    const insert = document.contents.items[found.entry].get("insert");
    insert.delete(found.row);
    if (insert.items.length === 0) {
      preserveLeadingComment(document, found.entry);
      document.delete(found.entry);
    }
    for (let index = document.contents.items.length - 1; index >= 0; index--) {
      const item = document.contents.items[index];
      if (isMap(item) && !item.has("insert") && item.get("id") === rowId) {
        preserveLeadingComment(document, index);
        document.delete(index);
      }
    }
  };
}
// #endregion FUNC_removeMutation

// #region FUNC_disableMutation
/**
 * @purpose Shared document mutation behind disableRow and the batch ops:
 *   upsert a bare `{ id, name, disabled: true }` override row.
 */
function disableMutation(rowId, name) {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  if (typeof name !== "string" || name === "") throw new TypeError("writer: name must be a non-empty string");
  return (document) => {
    const index = findBareRow(document, rowId, name);
    if (index === null) {
      document.add(document.createNode({ id: rowId, name, disabled: true }));
      return;
    }
    const item = document.contents.items[index];
    if (item.get("disabled") === true) return false;
    item.set("name", name);
    item.set("disabled", true);
  };
}
// #endregion FUNC_disableMutation

// #region FUNC_insertRow
/**
 * Append a NEW top-level patch entry `{ insert: [row] }`.
 *
 * @purpose Let the API create section/profile rows the Loader can mount
 *   (config-editor cannot create rows — SPEC §5.6). The entry deliberately
 *   has NO patch-level id: insert-with-id means "append into that group"
 *   (spike R2), a different operation.
 * @param {object} options
 * @param {string} options.patchPath - profile patch file to edit.
 * @param {{ id: string, name: string, config?: object }} options.row -
 *   row shape per SPEC §3 (`prompt-section-<id>` / `prompt-profile-<id>`).
 * @returns {Promise<boolean>} whether the file was written (always true).
 * @throws on unparseable file, non-sequence root, or ANY existing row (bare,
 *   insert, grouped insert) with the same id (duplicate guard) — the file
 *   stays untouched.
 */
export function insertRow({ patchPath, row }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, insertMutation(row))));
}
// #endregion FUNC_insertRow

// #region FUNC_removeRow
/**
 * Physically remove a row created by our own writer: the `insert` entry item
 * plus any bare override rows the same id accumulated (stale overrides for a
 * removed row would make the loader warn "entry not found").
 *
 * @purpose Delete user-created rows cleanly while preserving everything else
 *   (comments, !!js, sibling rows).
 * @param {object} options
 * @param {string} options.patchPath
 * @param {string} options.rowId - id of the insert-row to remove.
 * @returns {Promise<boolean>} true when the row was found and removed;
 *   false when no insert row with this id exists (nothing written).
 */
export function removeRow({ patchPath, rowId }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, removeMutation(rowId))));
}
// #endregion FUNC_removeRow

// #region FUNC_disableRow
/**
 * Disable a row that came from a bundle: add or update a bare override
 * `{ id, name, disabled: true }` in the profile layer (exactly what
 * plugin-manager does for bundle-provided rows). The loader then skips the
 * row entirely; a bare row for an id no lower layer provides is skipped with
 * "patch: entry %C not found" — by design (SPEC §2 #17).
 *
 * @purpose Implement "delete" for bundle-owned rows without rewriting the
 *   bundle.
 * @param {object} options
 * @param {string} options.patchPath
 * @param {string} options.rowId
 * @param {string} options.name - plugin name of the row (kept in the
 *   override; a mismatched name would be skipped by the loader).
 * @returns {Promise<boolean>} whether the file was written.
 */
export function disableRow({ patchPath, rowId, name }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, disableMutation(rowId, name))));
}
// #endregion FUNC_disableRow

// #region FUNC_provenance
/**
 * Prove row ownership from the profile patch itself (sync — called from row
 * registration): a row appearing inside ANY `insert` entry of this file is
 * user-owned; a row present only as a bare override, or absent from the file
 * entirely, is bundle-provided. `configEditor.configuration()` cannot prove
 * this (step2b report) — insert ownership is the only reliable signal.
 *
 * @purpose Feed the registry's `source` so the editor can show 'user' vs
 *   'bundle' honestly instead of 'unknown'.
 * @param {object} options
 * @param {string} options.patchPath
 * @param {string} options.rowId
 * @returns {{ source: "user"|"bundle", inserted: boolean, overridden: boolean }}
 * @throws on an unparseable file (caller decides how to degrade).
 */
export function provenance({ patchPath, rowId }) {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  const { document } = loadDocument(patchPath);
  const inserted = findInsertItem(document, rowId) !== null;
  const overridden = !inserted && findBareRow(document, rowId) !== null;
  return { source: inserted ? "user" : "bundle", inserted, overridden };
}
// #endregion FUNC_provenance

// #region FUNC_listRowIds
/**
 * List EVERY row id the composed profile patch currently claims: bare
 * override rows (top-level `id`), rows inside any `insert` array, and rows
 * inside grouped inserts (`insert` with a patch-level `id`).
 *
 * @purpose Let the API's create routes generate slug ids that cannot collide
 *   with an unregistered patch row (the insertRow duplicate guard would 400).
 *   Read-only: never writes, never takes the mutex.
 * @param {object} options
 * @param {string} options.patchPath - profile patch file to inspect.
 * @returns {Set<string>} every row id found in the file.
 * @throws on an unparseable file or a non-sequence root (caller decides how
 *   to degrade).
 */
export function listRowIds({ patchPath }) {
  const { document } = loadDocument(patchPath);
  const ids = new Set();
  for (const item of document.contents.items) {
    if (!isMap(item)) continue;
    if (!item.has("insert")) {
      const id = item.get("id");
      if (typeof id === "string") ids.add(id);
      continue;
    }
    const insert = item.get("insert");
    if (isSeq(insert)) {
      for (const row of insert.items) {
        if (isMap(row) && typeof row.get("id") === "string") ids.add(row.get("id"));
      }
    }
  }
  return ids;
}
// #endregion FUNC_listRowIds

// #region FUNC_setProfileSectionsMutation
/**
 * Upsert the composed `sections` array of one profile row inside a document:
 * update the row's config when it lives in this file (insert item or bare
 * override), otherwise append a bare override `{id, name, config:{sections}}`
 * — the same wholesale-array semantics settings.mutate produces, but without
 * leaving the batch's single critical section (astra finding C: rename
 * commits once, under one gate).
 *
 * @purpose Let the rename batch rewrite profile references with ONE
 *   read-modify-write instead of interleaved settings.mutate calls.
 */
function setProfileSectionsMutation({ rowId: profileRowId, name, sections }) {
  if (typeof profileRowId !== "string" || profileRowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  if (!Array.isArray(sections)) throw new TypeError("writer: sections must be an array");
  return (document) => {
    const found = findInsertItem(document, profileRowId);
    if (found !== null) {
      const item = document.contents.items[found.entry].get("insert").items[found.row];
      let config = item.get("config");
      if (!isMap(config)) {
        config = document.createNode({});
        item.set("config", config);
      }
      config.set("sections", document.createNode(sections));
      return;
    }
    const bare = findBareRow(document, profileRowId, name);
    if (bare !== null) {
      const item = document.contents.items[bare];
      item.delete("disabled");
      let config = item.get("config");
      if (!isMap(config)) {
        config = document.createNode({});
        item.set("config", config);
      }
      config.set("sections", document.createNode(sections));
      return;
    }
    document.add(document.createNode({ id: profileRowId, name, config: { sections } }));
  };
}
// #endregion FUNC_setProfileSectionsMutation

// #region FUNC_renameSectionRow
/**
 * Single-commit section rename (SPEC §2 #16, astra finding C): insert the new
 * row, upsert every referencing profile's `sections` array, and remove or
 * disable the old row — all applied to ONE parsed document and committed with
 * ONE atomic write inside ONE gated critical section (mutex + optional hmr
 * exclusivity around the whole unit). Any failure restores the pre-batch
 * backup; settings.mutate is deliberately not involved (hmr transactions
 * cannot be nested, the shared mutex is not reentrant).
 *
 * @purpose Make rename atomic against both this bundle's writes and
 *   same-process config-editor/settings edits.
 * @param {object} options
 * @param {string} options.patchPath
 * @param {{ id: string, name: string, config?: object }} options.row - the NEW section row.
 * @param {string} options.oldRowId - row id of the section being renamed.
 * @param {string} options.oldName - plugin name of the old row (for disable).
 * @param {boolean} options.bundleOwned - disable the old row instead of removing it.
 * @param {Array<{ rowId: string, name: string, sections: Array<object> }>} options.profileUpdates
 * @returns {Promise<boolean>} whether the file was written.
 */
export function renameSectionRow({ patchPath, row, oldRowId, oldName, bundleOwned, profileUpdates = [] }) {
  return withPatchBatch({ patchPath }, async (ops) => ops.edit((document) => {
    insertMutation(row)(document);
    for (const update of profileUpdates) setProfileSectionsMutation(update)(document);
    if (bundleOwned) disableMutation(oldRowId, oldName)(document);
    else removeMutation(oldRowId)(document);
  }));
}
// #endregion FUNC_renameSectionRow

// #region FUNC_withPatchBatch
/**
 * Run a multi-step mutation (e.g. section rename: new row → profile refs →
 * old row) as one unit: the module mutex AND — when a host write gate is
 * installed — hmr exclusivity are held around the ENTIRE batch (backup, every
 * step, and the rollback), so no config-editor/settings edit can interleave
 * and a rollback can never restore a backup over a concurrent commit (astra
 * finding C). Because hmr transactions cannot be nested, batch steps must
 * NOT call settings.mutate/configEditor.edit; compose all file changes
 * through `ops.edit` so the batch performs a SINGLE read-modify-write commit
 * whenever possible.
 *
 * @purpose Keep batch operations from leaving half-renamed state (SPEC §5.6
 *   "перед батч-операциями — снимок файла в памяти и восстановление при
 *   ошибке") while holding exclusivity around the whole unit.
 * @param {object} options - `{ patchPath }`.
 * @param {(ops: {
 *   insertRow: (o: { row: object }) => Promise<boolean>,
 *   removeRow: (o: { rowId: string }) => Promise<boolean>,
 *   disableRow: (o: { rowId: string, name: string }) => Promise<boolean>,
 *   setProfileSections: (o: { rowId: string, name: string, sections: Array<object> }) => Promise<boolean>,
 *   edit: (mutate: (document: object) => boolean | void) => Promise<boolean>,
 * }) => Promise<any>} run - batch body; the ops are mutex- and gate-free
 *   because the batch itself already holds both.
 * @returns {Promise<any>} the run result.
 * @throws the original error after the backup was restored.
 */
export async function withPatchBatch({ patchPath }, run) {
  return withMutex(() => runGated(async () => {
    let backup;
    try {
      backup = await fsp.readFile(patchPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      backup = "[]\n";
    }
    const ops = {
      insertRow: ({ row }) => editUnlocked(patchPath, insertMutation(row)),
      removeRow: ({ rowId }) => editUnlocked(patchPath, removeMutation(rowId)),
      disableRow: ({ rowId, name }) => editUnlocked(patchPath, disableMutation(rowId, name)),
      setProfileSections: (options) => editUnlocked(patchPath, setProfileSectionsMutation(options)),
      edit: (mutate) => editUnlocked(patchPath, mutate),
    };
    try {
      return await run(ops);
    } catch (error) {
      await writeAtomic(patchPath, backup);
      throw error;
    }
  }));
}
// #endregion FUNC_withPatchBatch
