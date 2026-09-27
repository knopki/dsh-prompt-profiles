/**
 * #region moduleContract
 * @modulecontract
 * @purpose Create, remove, disable, and prove ownership of composition rows in
 *   the profile patch, behind the `PatchPort` the operation set consumes.
 * @scope
 *  - Parse/serialize with the `!!js` yaml dialect so comments and tag
 *    expressions survive round-trips; atomic writes plus backup-and-rollback batches.
 *  - NOT: editing configs of existing rows (settings/config-editor own those).
 * @invariants
 *  - Every mutation passes through one module-level mutex; the optional host
 *    gate wraps the whole read-modify-write. A parse or validation failure
 *    leaves the file byte-identical.
 *  - `insert:` entries never carry a patch-level `id`.
 * #endregion moduleContract
 */

import { randomBytes } from "node:crypto";
import { promises as fsp, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type Document, isMap, isSeq, type Node, parseDocument, type YAMLMap, type YAMLSeq } from "yaml";
import type {
  PatchPort,
  PatchRowInput,
  PatchRowRecord,
  RowOwnership,
  SectionRenameRequest,
  WriteLockPort,
} from "../application/ports.ts";
import { toPatchId } from "../domain/ids.ts";

export { toPatchId };

/** A parsed patch document whose root is known to be a sequence. */
type PatchDocument = Omit<Document.Parsed, "contents"> & { contents: YAMLSeq<Node> };

/** One document mutation: a throw aborts the write, `false` means "unchanged". */
type PatchMutation = (document: PatchDocument) => unknown;

/** The Loader's `!!js` dialect: tagged scalars round-trip verbatim. */
const parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value: string) => value }] };

let mutexTail: Promise<unknown> = Promise.resolve();

// #region FUNC_withMutex
/**
 * @purpose The one in-process serializer for every file-mutating path, so
 *   concurrent calls cannot interleave read-modify-write cycles.
 */
function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.then(
    () => {},
    () => {},
  );
  return run;
}
// #endregion FUNC_withMutex

/**
 * Public alias shared with the operations' settings.mutate writes.
 * NOT reentrant — never call writer mutations from inside it.
 */
export const withWriteLock = withMutex;

/** The write serializer as the `HostPorts.lock` port. */
export const writeLock: WriteLockPort = { run: (fn) => withMutex(fn) };

type WriteGate = <T>(section: () => Promise<T>) => Promise<T>;
let writeGate: WriteGate | null = null;
// #region FUNC_setWriteGate
/** @purpose Install an optional host write gate around every raw write. */
export function setWriteGate(gate: WriteGate | null): void {
  writeGate = gate;
}
// #endregion FUNC_setWriteGate

// #region FUNC_runGated
/** @purpose Run a whole critical section through the optional host gate. */
function runGated<T>(section: () => Promise<T>): Promise<T> {
  return writeGate ? writeGate(section) : section();
}
// #endregion FUNC_runGated

// #region FUNC_loadDocument
/**
 * @purpose Parse the profile patch (missing file = empty list). A leading BOM
 *   is stripped before parsing and never written back, so the first mutation
 *   repairs a BOM-prefixed file.
 */
function loadDocument(patchPath: string): { document: PatchDocument; text: string } {
  let text: string;
  try {
    text = readFileSync(patchPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    text = "[]\n";
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const document = parseDocument(text, parseOptions) as PatchDocument;
  if (document.errors.length > 0) throw document.errors[0];
  if (!isSeq(document.contents)) throw new Error("prompt-profiles writer: profile patch must be a YAML sequence");
  document.contents.flow = false;
  return { document, text };
}
// #endregion FUNC_loadDocument

// #region FUNC_writeAtomic
/** @purpose Temp file + rename so readers never observe a partial patch. */
async function writeAtomic(patchPath: string, text: string): Promise<void> {
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
function findInsertItem(document: PatchDocument, rowId: string): { entry: number; row: number } | null {
  const items = document.contents.items;
  for (let entry = 0; entry < items.length; entry++) {
    const holder = items[entry];
    const insert = isMap(holder) ? holder.get("insert") : undefined;
    if (!isSeq(insert)) continue;
    for (let row = 0; row < insert.items.length; row++) {
      const candidate = insert.items[row];
      if (isMap(candidate) && candidate.get("id") === rowId) return { entry, row };
    }
  }
  return null;
}
// #endregion FUNC_findInsertItem

// #region FUNC_findBareRow
/**
 * Locate the LAST bare (non-insert) override row for `rowId`; an optional
 * `name` guard ignores a row the loader would skip anyway.
 * @returns index into the top-level sequence, or null.
 */
function findBareRow(document: PatchDocument, rowId: string, name?: string): number | null {
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

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// #region FUNC_validateRow
/** @purpose Reject malformed/unsafe rows before the file is touched. */
function validateRow(row: PatchRowInput): void {
  if (!row || typeof row !== "object") throw new TypeError("writer: row must be an object");
  if (typeof row.id !== "string" || row.id === "") throw new TypeError("writer: row.id must be a non-empty string");
  if (!SAFE_ID.test(row.id) || row.id.includes("..")) {
    throw new TypeError(`writer: row.id must be a slug without '/', '\\' or '..' segments (got "${row.id}")`);
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
 */
function findExistingRowId(document: PatchDocument, rowId: string): { kind: "bare" | "insert" } | null {
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
 * @purpose Ungated read-modify-write core (caller holds the mutex and the
 *   gate). A throw from `mutate` skips the write; `false` means "unchanged".
 *   A uniformly CRLF source stays CRLF; output is always BOM-free.
 * @returns whether the file was written.
 */
async function editUnlocked(patchPath: string, mutate: PatchMutation): Promise<boolean> {
  const { document, text } = loadDocument(patchPath);
  if (mutate(document) === false) return false;
  let out = String(document);
  if (text.includes("\r\n")) out = out.replace(/\r?\n/g, "\r\n");
  await writeAtomic(patchPath, out);
  return true;
}
// #endregion FUNC_editUnlocked

// #region FUNC_insertMutation
/** Append `{ insert: [row] }` with a duplicate guard over the whole patch. */
function insertMutation(row: PatchRowInput): PatchMutation {
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
function preserveLeadingComment(document: PatchDocument, index: number): void {
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
function removeMutation(rowId: string): PatchMutation {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  return (document) => {
    const found = findInsertItem(document, rowId);
    if (found === null) return false; // no insert row: nothing written
    const holder = document.contents.items[found.entry];
    const insert = isMap(holder) ? holder.get("insert") : undefined;
    if (!isSeq(insert)) return false;
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
function disableMutation(rowId: string, name: string): PatchMutation {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  if (typeof name !== "string" || name === "") throw new TypeError("writer: name must be a non-empty string");
  return (document) => {
    const index = findBareRow(document, rowId, name);
    if (index === null) {
      document.add(document.createNode({ id: rowId, name, disabled: true }));
      return;
    }
    const item = document.contents.items[index];
    if (!isMap(item)) return false;
    if (item.get("disabled") === true) return false;
    item.set("name", name);
    item.set("disabled", true);
  };
}
// #endregion FUNC_disableMutation

// #region FUNC_insertRow
/**
 * @purpose Append a new `{ insert: [row] }` entry the loader can mount.
 * @throws on an unparseable file or any existing row with the same id.
 */
export function insertRow({ patchPath, row }: { patchPath: string; row: PatchRowInput }): Promise<boolean> {
  return withMutex(() => runGated(() => editUnlocked(patchPath, insertMutation(row))));
}
// #endregion FUNC_insertRow

// #region FUNC_removeRow
/**
 * Physically remove a row our writer created: the insert item plus any stale
 * bare overrides with the same id (stale overrides would make the loader warn
 * "entry not found"). Comments, `!!js`, and sibling rows are preserved.
 * @returns false when no insert row with this id exists.
 */
export function removeRow({ patchPath, rowId }: { patchPath: string; rowId: string }): Promise<boolean> {
  return withMutex(() => runGated(() => editUnlocked(patchPath, removeMutation(rowId))));
}
// #endregion FUNC_removeRow

// #region FUNC_disableRow
/**
 * @purpose Delete a bundle-provided row by upserting a bare
 *   `{ id, name, disabled: true }` override the loader then skips.
 * @returns whether the file was written.
 */
export function disableRow({
  patchPath,
  rowId,
  name,
}: {
  patchPath: string;
  rowId: string;
  name: string;
}): Promise<boolean> {
  return withMutex(() => runGated(() => editUnlocked(patchPath, disableMutation(rowId, name))));
}
// #endregion FUNC_disableRow

// #region FUNC_rowNamesId
/**
 * @purpose Whether one patch row names the queried row, raw or normalized.
 */
function rowNamesId(node: unknown, candidates: Set<string>): boolean {
  if (!isMap(node)) return false;
  const config = node.get("config");
  for (const value of [node.get("id"), isMap(config) ? config.get("id") : null]) {
    if (typeof value !== "string" || value === "") continue;
    if (candidates.has(value)) return true;
    const normalized = toPatchId(value);
    if (typeof normalized === "string" && normalized !== "" && candidates.has(normalized)) return true;
  }
  return false;
}
// #endregion FUNC_rowNamesId

// #region FUNC_provenance
/**
 * @purpose Prove row ownership from this patch (sync): user, bundle, or unknown.
 * @throws on an unparseable file (caller decides how to degrade).
 */
export function provenance({ patchPath, rowId }: { patchPath: string; rowId: string }): RowOwnership {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  const normalized = toPatchId(rowId);
  const candidates = new Set(typeof normalized === "string" && normalized !== "" ? [rowId, normalized] : [rowId]);
  const { document } = loadDocument(patchPath);
  let inserted = false;
  let overridden = false;
  for (const item of document.contents.items) {
    const insert = isMap(item) ? item.get("insert") : undefined;
    if (isSeq(insert)) {
      if (!inserted && insert.items.some((row) => rowNamesId(row, candidates))) inserted = true;
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
 * @throws on an unparseable file or a non-sequence root.
 */
export function listRowIds({ patchPath }: { patchPath: string }): Set<string> {
  const { document } = loadDocument(patchPath);
  const ids = new Set<string>();
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
        if (isMap(row)) {
          const id = row.get("id");
          if (typeof id === "string") ids.add(id);
        }
      }
    }
  }
  return ids;
}
// #endregion FUNC_listRowIds

// #region FUNC_readPatchRows
/**
 * @purpose Read-only detail view of every row the patch claims. Never writes,
 *   never takes the mutex.
 * @throws on an unparseable file or a non-sequence root.
 */
export function readPatchRows({ patchPath }: { patchPath: string }): PatchRowRecord[] {
  const { document } = loadDocument(patchPath);
  const rows: PatchRowRecord[] = [];
  const push = (row: unknown): void => {
    if (!isMap(row)) return;
    const config = row.get("config");
    const configMap: YAMLMap | null = isMap(config) ? config : null;
    rows.push({
      id: typeof row.get("id") === "string" ? (row.get("id") as string) : null,
      name: typeof row.get("name") === "string" ? (row.get("name") as string) : null,
      disabled: row.get("disabled") === true,
      hasConfig: configMap !== null,
      configId: configMap && typeof configMap.get("id") === "string" ? (configMap.get("id") as string) : null,
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
 * @purpose Single-commit section rename: insert the new row and remove (or
 *   disable, when bundle-owned) the old one. Profile references are left unchanged.
 * @returns whether the file was written.
 */
export function renameSectionRow({
  patchPath,
  row,
  oldRowId,
  oldName,
  bundleOwned,
}: { patchPath: string } & SectionRenameRequest): Promise<boolean> {
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
 * @purpose Run a multi-step mutation as one unit under the mutex and the host
 *   gate. The backup is restored only when an edit actually wrote the file.
 * @throws the original error, after restoring the backup when a write happened.
 */
export async function withPatchBatch<T>(
  { patchPath }: { patchPath: string },
  run: (edit: (mutate: PatchMutation) => Promise<boolean>) => Promise<T>,
): Promise<T> {
  return withMutex(() =>
    runGated(async () => {
      let backup: string;
      try {
        backup = await fsp.readFile(patchPath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
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

/**
 * The part of `ctx.configEditor` the patch port reads.
 *
 * @purpose Adapt the raw config-editor service to the patch port.
 */
export interface PatchEditor {
  documentPath?: string;
  entries?(): Array<{ options?: { id?: string } } | null | undefined>;
}

// #region FUNC_createPatchPort
/**
 * @purpose Bind the `PatchPort` to one config-editor service. The path and the
 *   entry list are read at CALL time, so a late-appearing or replaced editor
 *   is honoured; an undefined path is passed through to the file operations,
 *   which fail exactly as they did when the path was missing.
 */
export function createPatchPort(editor: PatchEditor): PatchPort {
  const path = (): string | undefined => editor.documentPath;
  return {
    path,
    rows: () => readPatchRows({ patchPath: path() as string }),
    rowIds: () => listRowIds({ patchPath: path() as string }),
    ownership: (rowId) => provenance({ patchPath: path() as string, rowId }),
    patchIdOf: (rowId) => {
      try {
        const entry = (editor.entries?.() ?? []).find((candidate) => {
          const id = candidate?.options?.id;
          return typeof id === "string" && (id === rowId || toPatchId(id) === toPatchId(rowId));
        });
        if (entry?.options?.id !== undefined) return toPatchId(entry.options.id) as string;
      } catch {
        // entries() unavailable or threw: fall through to the string fallback.
      }
      return toPatchId(rowId) as string;
    },
    insert: async (row) => {
      await insertRow({ patchPath: path() as string, row });
    },
    remove: (rowId) => removeRow({ patchPath: path() as string, rowId }),
    disable: async (rowId, name) => {
      await disableRow({ patchPath: path() as string, rowId, name });
    },
    renameSection: async (request) => {
      await renameSectionRow({ patchPath: path() as string, ...request });
    },
  };
}
// #endregion FUNC_createPatchPort
