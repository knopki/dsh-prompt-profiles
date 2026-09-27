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
import { type Document, type Node, type YAMLSeq } from "yaml";
import type { PatchPort, PatchRowInput, PatchRowRecord, RowOwnership, SectionRenameRequest, WriteLockPort } from "../application/ports.ts";
import { toPatchId } from "../domain/ids.ts";
export { toPatchId };
/** A parsed patch document whose root is known to be a sequence. */
type PatchDocument = Omit<Document.Parsed, "contents"> & {
    contents: YAMLSeq<Node>;
};
/** One document mutation: a throw aborts the write, `false` means "unchanged". */
type PatchMutation = (document: PatchDocument) => unknown;
/**
 * @purpose The one in-process serializer for every file-mutating path, so
 *   concurrent calls cannot interleave read-modify-write cycles.
 */
declare function withMutex<T>(fn: () => Promise<T>): Promise<T>;
/**
 * Public alias shared with the operations' settings.mutate writes.
 * NOT reentrant — never call writer mutations from inside it.
 */
export declare const withWriteLock: typeof withMutex;
/** The write serializer as the `HostPorts.lock` port. */
export declare const writeLock: WriteLockPort;
type WriteGate = <T>(section: () => Promise<T>) => Promise<T>;
/** @purpose Install an optional host write gate around every raw write. */
export declare function setWriteGate(gate: WriteGate | null): void;
/**
 * @purpose Append a new `{ insert: [row] }` entry the loader can mount.
 * @throws on an unparseable file or any existing row with the same id.
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
 * @purpose Delete a bundle-provided row by upserting a bare
 *   `{ id, name, disabled: true }` override the loader then skips.
 * @returns whether the file was written.
 */
export declare function disableRow({ patchPath, rowId, name, }: {
    patchPath: string;
    rowId: string;
    name: string;
}): Promise<boolean>;
/**
 * @purpose Prove row ownership from this patch (sync): user, bundle, or unknown.
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
 * @purpose Read-only detail view of every row the patch claims. Never writes,
 *   never takes the mutex.
 * @throws on an unparseable file or a non-sequence root.
 */
export declare function readPatchRows({ patchPath }: {
    patchPath: string;
}): PatchRowRecord[];
/**
 * @purpose Single-commit section rename: insert the new row and remove (or
 *   disable, when bundle-owned) the old one. Profile references are left unchanged.
 * @returns whether the file was written.
 */
export declare function renameSectionRow({ patchPath, row, oldRowId, oldName, bundleOwned, }: {
    patchPath: string;
} & SectionRenameRequest): Promise<boolean>;
/**
 * @purpose Run a multi-step mutation as one unit under the mutex and the host
 *   gate. The backup is restored only when an edit actually wrote the file.
 * @throws the original error, after restoring the backup when a write happened.
 */
export declare function withPatchBatch<T>({ patchPath }: {
    patchPath: string;
}, run: (edit: (mutate: PatchMutation) => Promise<boolean>) => Promise<T>): Promise<T>;
/**
 * The part of `ctx.configEditor` the patch port reads.
 *
 * @purpose Adapt the raw config-editor service to the patch port.
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
