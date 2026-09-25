/**
 * #region moduleContract
 * @modulecontract
 * @purpose Create, remove, disable, and prove ownership of composition rows in
 *   the user's cordis.patch.yml — operations config-editor cannot do, as it
 *   only overrides existing rows (SPEC §5.6, decision 18) — behind the
 *   `PatchPort` the operation set consumes.
 * @scope
 *  - Parse/serialize with eemeli `yaml` using the same `!!js` customTag as
 *    config-editor, so comments and tag expressions survive round-trips.
 *  - `insertRow` / `removeRow` / `disableRow` / `provenance` plus the
 *    backup-and-rollback batch helper `withPatchBatch`, and the read-only
 *    `listRowIds` / `readPatchRows` queries (the authoritative patch view the
 *    API uses for pending-ref and profile-validity checks).
 *  - Atomic write (temp file + rename, mode 0o600) under ONE in-process mutex,
 *    exported as the shared `writeLock` port.
 *  - NOT: updating configs of existing rows (ctx.settings.mutate /
 *    configEditor.edit — SPEC §2 #19).
 * @invariants
 *  - Every mutation by THIS bundle (writer ops and the API's settings.mutate
 *    via `writeLock`) passes through one module-level mutex; a validation
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
 * @dependencies READS/WRITES the profile patch (configEditor.documentPath,
 *   read at call time); node:fs, node:crypto, eemeli `yaml`.
 * @keywords writer, patch port, insert row, remove row, disable row,
 *   provenance, mutex, rollback
 * #endregion moduleContract
 */
import { type Document, type Node, type YAMLSeq } from "yaml";
import type { PatchPort, PatchRowInput, PatchRowRecord, RowOwnership, SectionRenameRequest, WriteLockPort } from "../application/ports.ts";
import { toPatchId } from "../domain/ids.ts";
export { toPatchId };
/** A parsed patch document whose root is known to be a sequence. */
export type PatchDocument = Omit<Document.Parsed, "contents"> & {
    contents: YAMLSeq<Node>;
};
/** One document mutation: a throw aborts the write, `false` means "unchanged". */
type PatchMutation = (document: PatchDocument) => unknown;
declare function withMutex<T>(fn: () => Promise<T>): Promise<T>;
/**
 * Public alias shared with the operations' settings.mutate writes.
 * NOT reentrant — never call writer mutations from inside it.
 */
export declare const withWriteLock: typeof withMutex;
/** The write serializer as the `HostPorts.lock` port. */
export declare const writeLock: WriteLockPort;
/**
 * Install an optional host write gate (dsh-hmr `runExclusive`) around every
 * raw write, serializing against config-editor/settings edits in this process.
 * The module mutex still serializes this bundle's own writes when it is absent;
 * cross-process interleaving stays possible by design.
 */
type WriteGate = <T>(section: () => Promise<T>) => Promise<T>;
export declare function setWriteGate(gate: WriteGate | null): void;
/**
 * Append a NEW `{ insert: [row] }` entry the Loader can mount (config-editor
 * cannot create rows — SPEC §5.6). Deliberately NO patch-level id:
 * insert-with-id means "append into that group" (spike R2).
 * @throws on an unparseable file or ANY existing row with the same id.
 */
export declare function insertRow({ patchPath, row }: {
    patchPath: string;
    row: PatchRowInput;
}): Promise<boolean>;
/**
 * Physically remove a row our writer created: the insert item plus any stale
 * bare overrides with the same id (stale overrides would make the loader warn
 * "entry not found"). Comments, `!!js`, and sibling rows are preserved.
 * @returns false when no insert row with this id exists.
 */
export declare function removeRow({ patchPath, rowId }: {
    patchPath: string;
    rowId: string;
}): Promise<boolean>;
/**
 * "Delete" a bundle-provided row by upserting a bare
 * `{ id, name, disabled: true }` override in the profile layer (what
 * plugin-manager does); the loader then skips the row (SPEC §2 #17). A bare
 * row whose id no lower layer provides is skipped by the loader — by design.
 * @returns whether the file was written.
 */
export declare function disableRow({ patchPath, rowId, name, }: {
    patchPath: string;
    rowId: string;
    name: string;
}): Promise<boolean>;
/**
 * Prove row ownership from this patch (sync). An id inside ANY `insert` entry
 * is USER-owned; a row present only as a bare override is BUNDLE-provided; a
 * row this file says nothing about is UNKNOWN. `configEditor.configuration()`
 * cannot prove layer ownership — insert ownership can.
 * @param options.rowId in any accepted form (qualified row id, unqualified row
 *   id, or config.id).
 * @throws on an unparseable file (caller decides how to degrade).
 */
export declare function provenance({ patchPath, rowId }: {
    patchPath: string;
    rowId: string;
}): RowOwnership;
/**
 * Every row id the patch claims (bare overrides, insert rows, grouped inserts).
 * Read-only: never writes, never takes the mutex. Lets the create routes avoid
 * colliding with an unregistered patch row.
 * @throws on an unparseable file or a non-sequence root.
 */
export declare function listRowIds({ patchPath }: {
    patchPath: string;
}): Set<string>;
/**
 * Read-only detail view of every row the patch claims (bare overrides plus
 * `insert` rows): id, plugin `name`, `disabled`, and whether/which `config.id`
 * it carries. Lets the API decide whether a pending row is really one of OUR
 * rows (H5) and whether a profile still exists in the AUTHORITATIVE file rather
 * than in the HMR-lagged registry. Never writes, never takes the mutex.
 */
export declare function readPatchRows({ patchPath }: {
    patchPath: string;
}): PatchRowRecord[];
/**
 * Single-commit section rename: insert the new row and remove (or disable,
 * when bundle-owned) the old one — ONE document, ONE atomic write, ONE gated
 * critical section; any failure restores the backup. settings.mutate is
 * deliberately not involved (hmr transactions cannot nest, the mutex is not
 * reentrant). PROFILE REFERENCES ARE NOT TOUCHED (frozen decision): rewriting
 * bundle profiles is impossible anyway, so the API reports the affected
 * profiles instead.
 * @returns whether the file was written.
 */
export declare function renameSectionRow({ patchPath, row, oldRowId, oldName, bundleOwned, }: {
    patchPath: string;
} & SectionRenameRequest): Promise<boolean>;
/**
 * Run a multi-step mutation as one unit: the module mutex AND the optional host
 * gate are held around the ENTIRE batch — backup, every step, and the rollback
 * — so no config-editor/settings edit can interleave and a rollback can never
 * restore a backup over a concurrent commit (astra finding C). HMR transactions
 * cannot be nested: batch steps must NOT call settings.mutate/configEditor.edit
 * and must compose all file changes through the single `edit` callback.
 *
 * The backup is restored ONLY when an edit actually WROTE the file (M1): a
 * validation error before the first write leaves the bytes untouched, so there
 * is no needless rewrite/HMR (and no risk of clobbering a foreign commit in the
 * cross-process case).
 * @throws the original error, after the backup was restored when a write happened.
 */
export declare function withPatchBatch<T>({ patchPath }: {
    patchPath: string;
}, run: (edit: (mutate: PatchMutation) => Promise<boolean>) => Promise<T>): Promise<T>;
/**
 * The part of `ctx.configEditor` the patch port reads: the document path and
 * the loader entry list used to canonicalize a row id.
 */
export interface PatchEditor {
    documentPath?: string;
    entries?(): Array<{
        options?: {
            id?: string;
        };
    } | null | undefined>;
}
/**
 * @purpose Bind the `PatchPort` to one config-editor service. The path and the
 *   entry list are read at CALL time, so a late-appearing or replaced editor
 *   is honoured; an undefined path is passed through to the file operations,
 *   which fail exactly as they did when the path was missing.
 */
export declare function createPatchPort(editor: PatchEditor): PatchPort;
