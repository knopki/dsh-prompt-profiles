// @ts-nocheck
// TODO(phase 1): remove after typing
/**
 * Writer for prompt-profile rows in the profile patch (PLAN step 4).
 * #region moduleContract
 * @modulecontract
 * @purpose Create, remove, disable, and prove ownership of composition rows in
 *   the user's cordis.patch.yml — operations config-editor cannot do, as it
 *   only overrides existing rows (SPEC §5.6, decision 18).
 * @scope
 *  - Parse/serialize with eemeli `yaml` using the same `!!js` customTag as
 *    config-editor, so comments and tag expressions survive round-trips.
 *  - `insertRow` / `removeRow` / `disableRow` / `provenance` plus the
 *    backup-and-rollback batch helper `withPatchBatch`, and the read-only
 *    `listRowIds` / `readPatchRows` queries (the authoritative patch view the
 *    API uses for pending-ref and profile-validity checks).
 *  - Atomic write (temp file + rename, mode 0o600) under ONE in-process mutex.
 *  - NOT: updating configs of existing rows (ctx.settings.mutate /
 *    configEditor — SPEC §2 #19).
 * @invariants
 *  - Every mutation by THIS bundle (writer ops and the API's settings.mutate
 *    via `withWriteLock`) passes through one module-level mutex; a validation
 *    or parse failure leaves the file byte-identical. When the host gate is
 *    installed (`setWriteGate`, dsh-hmr runExclusive) it wraps the ENTIRE
 *    read-modify-write — the whole batch, backup and rollback included — so
 *    raw writes serialize against config-editor/settings edits in this process
 *    (astra finding C). HMR transactions CANNOT be nested: nothing that takes
 *    hmr exclusivity itself (settings.mutate, configEditor.edit) may run
 *    inside the gate. RESIDUAL: other plugins' direct configEditor writes when
 *    hmr is absent, and any second DSH process (no cross-process lock).
 *  - `insert:` entries NEVER carry a patch-level `id`: insert-with-id means
 *    "append into that group" (spike R2), a different operation.
 *  - A bare override for an id no lower layer provides is skipped by the
 *    loader ("patch: entry %C not found"); disableRow only makes sense for ids
 *    a bundle actually provides.
 * @dependencies READS/WRITES the profile patch (ctx.configEditor.documentPath,
 *   passed in as `patchPath`); node:fs, node:crypto, eemeli `yaml`.
 * @rationale
 *  - Q: Why a module mutex plus an optional hmr gate, not dsh-atomic-write's
 *    cross-process withFileLock? A: the bundle must install without extra host
 *    packages; the atomic rename keeps the file parseable even when a second
 *    DSH process interleaves.
 *  - Q: Why is ANY insert entry user ownership? A: this file IS the profile
 *    layer; configEditor.configuration() cannot prove layer ownership (step2b
 *    report), insert ownership can.
 * @keywords writer, insert row, remove row, disable row, provenance,
 *   profile patch, yaml, mutex, rollback
 * #endregion moduleContract
 */

import { randomBytes } from "node:crypto";
import { promises as fsp, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isMap, isSeq, parseDocument } from "yaml";
import { toPatchId } from "./domain/ids.ts";

export { toPatchId };

// #region CONST_parseOptions
/** The Loader's `!!js` dialect: tagged scalars round-trip verbatim. */
const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
// #endregion CONST_parseOptions

// #region FUNC_withMutex
/**
 * @purpose The ONE in-process serializer for every file-mutating path of this
 *   bundle, so concurrent API calls cannot interleave read-modify-write
 *   cycles. Errors propagate without poisoning later entries.
 * @param {() => Promise<any>} fn - critical section.
 * @returns {Promise<any>} the fn result.
 */
let mutexTail = Promise.resolve();
function withMutex(fn) {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.then(
    () => {},
    () => {},
  );
  return run;
}
/**
 * Public alias shared with the operations' settings.mutate writes.
 * NOT reentrant — never call writer mutations from inside it.
 */
export const withWriteLock = withMutex;
// #endregion FUNC_withMutex

// #region FUNC_setWriteGate
/**
 * Install an optional host write gate (dsh-hmr `runExclusive`) around every
 * raw write, serializing against config-editor/settings edits in this process.
 * The module mutex still serializes this bundle's own writes when it is absent;
 * cross-process interleaving stays possible by design.
 */
let writeGate = null;
export function setWriteGate(gate) {
  writeGate = gate;
}
// #endregion FUNC_setWriteGate

// #region FUNC_runGated
/**
 * Run a WHOLE critical section through the optional host gate: holding it only
 * for the final write would let a queued call commit a stale document over an
 * edit that landed after our read (astra finding C). HMR transactions cannot
 * be nested, so nothing that takes hmr exclusivity itself
 * (settings.mutate / configEditor.edit) may run inside.
 */
function runGated(section) {
  return writeGate ? writeGate(section) : section();
}
// #endregion FUNC_runGated

// #region FUNC_loadDocument
/**
 * Parse the profile patch (missing file = empty list). A parse failure or a
 * non-sequence root throws BEFORE anything is written: the writer only edits a
 * document it fully understood.
 */
function loadDocument(patchPath) {
  // biome-ignore lint/suspicious/noImplicitAnyLet: assigned in the try below before use
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
/** Temp file + rename so readers never observe a partial patch (SPEC §5.6). */
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
/** Locate the top-level `insert` entry carrying `rowId` (order-independent). */
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
 * Locate the LAST bare (non-insert) override row for `rowId`; an optional
 * `name` guard ignores a row the loader would skip anyway.
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
 * Reject malformed/unsafe rows BEFORE the file is touched: ids must be slugs
 * (no `/`, `\`, `..`, no absolute paths) or the loader/UI could not address
 * the row.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function validateRow(row) {
  if (!row || typeof row !== "object") throw new TypeError("writer: row must be an object");
  if (typeof row.id !== "string" || row.id === "") throw new TypeError("writer: row.id must be a non-empty string");
  if (!SAFE_ID.test(row.id) || row.id.includes("..")) {
    throw new TypeError(`writer: row.id must be a slug without '/', '' or '..' segments (got "${row.id}")`);
  }
  if (typeof row.name !== "string" || row.name === "")
    throw new TypeError("writer: row.name must be a non-empty string");
}
// #endregion FUNC_validateRow

// #region FUNC_findExistingRowId
/**
 * Find ANY row claiming `rowId`: bare overrides, `insert` array rows, and
 * grouped inserts. The duplicate guard must cover the whole loader id domain,
 * or one id could end up on two rows and the override lose its config.
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
 * Ungated RMW core (caller already holds the mutex and, for config-editor
 * exclusivity, the gate): parse → mutate → serialize → atomic write. A throw
 * from `mutate` skips the write; `mutate` returning false means "unchanged".
 * Read and write stay in one critical section (astra finding C).
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
/** Append `{ insert: [row] }` with a duplicate guard over the whole patch. */
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
 * Re-attach the leading comments of a removed top-level entry to the next
 * surviving entry (or the document): a file-leading comment lives as
 * `commentBefore` on the FIRST entry and would otherwise be dropped.
 */
function preserveLeadingComment(document, index) {
  const comment = document.contents.items[index]?.commentBefore;
  if (typeof comment !== "string" || comment === "") return;
  const next = document.contents.items[index + 1];
  if (next) next.commentBefore = next.commentBefore ? `${comment}\n${next.commentBefore}` : comment;
  else
    document.contents.commentBefore = document.contents.commentBefore
      ? `${document.contents.commentBefore}\n${comment}`
      : comment;
}
// #endregion FUNC_preserveLeadingComment

// #region FUNC_removeMutation
/** Remove the insert item plus stale bare overrides for the same id. */
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
/** Upsert a bare `{ id, name, disabled: true }` override row. */
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
 * Append a NEW `{ insert: [row] }` entry the Loader can mount (config-editor
 * cannot create rows — SPEC §5.6). Deliberately NO patch-level id:
 * insert-with-id means "append into that group" (spike R2).
 * @returns {Promise<boolean>} whether the file was written (always true).
 * @throws on an unparseable file or ANY existing row with the same id.
 */
export function insertRow({ patchPath, row }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, insertMutation(row))));
}
// #endregion FUNC_insertRow

// #region FUNC_removeRow
/**
 * Physically remove a row our writer created: the insert item plus any stale
 * bare overrides with the same id (stale overrides would make the loader warn
 * "entry not found"). Comments, `!!js`, and sibling rows are preserved.
 * @returns {Promise<boolean>} false when no insert row with this id exists.
 */
export function removeRow({ patchPath, rowId }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, removeMutation(rowId))));
}
// #endregion FUNC_removeRow

// #region FUNC_disableRow
/**
 * "Delete" a bundle-provided row by upserting a bare
 * `{ id, name, disabled: true }` override in the profile layer (what
 * plugin-manager does); the loader then skips the row (SPEC §2 #17). A bare
 * row whose id no lower layer provides is skipped by the loader — by design.
 * @returns {Promise<boolean>} whether the file was written.
 */
export function disableRow({ patchPath, rowId, name }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, disableMutation(rowId, name))));
}
// #endregion FUNC_disableRow

// #region FUNC_provenance
/**
 * Does one patch row name the queried row? A row is named by its loader `id`
 * OR its `config.id`, compared raw and `toPatchId`-normalized — so callers
 * may pass the qualified loader id (`include:prompt-section-x`), the row id,
 * or the config id (old slug scheme).
 * @param {object} node - YAML map node for a patch row.
 * @param {Set<string>} candidates - raw + normalized query forms.
 * @returns {boolean}
 */
function rowNamesId(node, candidates) {
  for (const value of [node?.get?.("id"), node?.get?.("config")?.get?.("id")]) {
    if (typeof value !== "string" || value === "") continue;
    if (candidates.has(value)) return true;
    const normalized = toPatchId(value);
    if (typeof normalized === "string" && normalized !== "" && candidates.has(normalized)) return true;
  }
  return false;
}

/**
 * Prove row ownership from this patch (sync). An id inside ANY `insert` entry
 * is USER-owned; a row present only as a bare override is BUNDLE-provided; a
 * row this file says nothing about is UNKNOWN. `configEditor.configuration()`
 * cannot prove layer ownership — insert ownership can.
 * @param {{ patchPath: string, rowId: string }} options - rowId in any
 *   accepted form (qualified row id, unqualified row id, or config.id).
 * @returns {{ source: "user"|"bundle"|"unknown", inserted: boolean, overridden: boolean }}
 * @throws on an unparseable file (caller decides how to degrade).
 */
export function provenance({ patchPath, rowId }) {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  const normalized = toPatchId(rowId);
  const candidates = new Set(typeof normalized === "string" && normalized !== "" ? [rowId, normalized] : [rowId]);
  const { document } = loadDocument(patchPath);
  let inserted = false;
  let overridden = false;
  for (const item of document.contents.items) {
    const insert = item?.get?.("insert");
    if (isSeq(insert)) {
      if (!inserted && insert.items.some((row) => isMap(row) && rowNamesId(row, candidates))) inserted = true;
      continue;
    }
    if (!overridden && isMap(item) && rowNamesId(item, candidates)) overridden = true;
  }
  return {
    source: inserted ? "user" : overridden ? "bundle" : "unknown",
    inserted,
    overridden,
  };
}
// #endregion FUNC_provenance

// #region FUNC_listRowIds
/**
 * Every row id the patch claims (bare overrides, insert rows, grouped inserts).
 * Read-only: never writes, never takes the mutex. Lets the create routes avoid
 * colliding with an unregistered patch row.
 * @returns {Set<string>} every row id found in the file.
 * @throws on an unparseable file or a non-sequence root.
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

// #region FUNC_readPatchRows
/**
 * Read-only detail view of every row the patch claims (bare overrides plus
 * `insert` rows): id, plugin `name`, `disabled`, and whether/which `config.id`
 * it carries. Lets the API decide whether a pending row is really one of OUR
 * rows (H5) and whether a profile still exists in the AUTHORITATIVE file rather
 * than in the HMR-lagged registry (B2). Never writes, never takes the mutex.
 * @returns {Array<{ id: string|null, name: string|null, disabled: boolean,
 *   hasConfig: boolean, configId: string|null }>}
 */
export function readPatchRows({ patchPath }) {
  const { document } = loadDocument(patchPath);
  const rows = [];
  const push = (row) => {
    if (!isMap(row)) return;
    const config = row.get("config");
    const configMap = isMap(config) ? config : null;
    rows.push({
      id: typeof row.get("id") === "string" ? row.get("id") : null,
      name: typeof row.get("name") === "string" ? row.get("name") : null,
      disabled: row.get("disabled") === true,
      hasConfig: configMap !== null,
      configId: configMap && typeof configMap.get("id") === "string" ? configMap.get("id") : null,
    });
  };
  for (const item of document.contents.items) {
    if (!isMap(item)) continue;
    const insert = item.get("insert");
    if (isSeq(insert)) {
      for (const row of insert.items) push(row);
      continue;
    }
    push(item);
  }
  return rows;
}
// #endregion FUNC_readPatchRows

// #region FUNC_renameSectionRow
/**
 * Single-commit section rename: insert the new row and remove (or disable,
 * when bundle-owned) the old one — ONE document, ONE atomic write, ONE gated
 * critical section; any failure restores the backup. settings.mutate is
 * deliberately not involved (hmr transactions cannot nest, the mutex is not
 * reentrant). PROFILE REFERENCES ARE NOT TOUCHED (frozen decision): rewriting
 * bundle profiles is impossible anyway, so the API reports the affected
 * profiles instead.
 * @returns {Promise<boolean>} whether the file was written.
 */
export function renameSectionRow({ patchPath, row, oldRowId, oldName, bundleOwned }) {
  return withPatchBatch({ patchPath }, (edit) =>
    edit((document) => {
      insertMutation(row)(document);
      if (bundleOwned) disableMutation(oldRowId, oldName)(document);
      else removeMutation(oldRowId)(document);
    }),
  );
}
// #endregion FUNC_renameSectionRow

// #region FUNC_withPatchBatch
/**
 * Run a multi-step mutation as one unit: the module mutex AND the optional host
 * gate are held around the ENTIRE batch — backup, every step, and the rollback
 * — so no config-editor/settings edit can interleave and a rollback can never
 * restore a backup over a concurrent commit (astra finding C). HMR transactions
 * cannot be nested: batch steps must NOT call settings.mutate/configEditor.edit
 * and must compose all file changes through the single `edit` callback.
 *
 * The backup is restored ONLY when an edit actually WROTE the file (M1): a
 * validation error before the first write leaves the bytes untouched, so
 * there is no needless rewrite/HMR (and no risk of clobbering a foreign
 * commit in the cross-process case).
 * @param {{ patchPath: string }} options
 * @param {(edit: (mutate: (document: object) => boolean | void) => Promise<boolean>) => Promise<any>} run
 * @returns {Promise<any>} the run result.
 * @throws the original error, after the backup was restored when a write happened.
 */
export async function withPatchBatch({ patchPath }, run) {
  return withMutex(() =>
    runGated(async () => {
      // biome-ignore lint/suspicious/noImplicitAnyLet: assigned in the try below before use
      let backup;
      try {
        backup = await fsp.readFile(patchPath, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        backup = "[]\n";
      }
      let wrote = false;
      try {
        return await run(async (mutate) => {
          const result = await editUnlocked(patchPath, mutate);
          if (result === true) wrote = true;
          return result;
        });
      } catch (error) {
        if (wrote) await writeAtomic(patchPath, backup);
        throw error;
      }
    }),
  );
}
// #endregion FUNC_withPatchBatch
