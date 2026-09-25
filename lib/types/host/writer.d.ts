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
declare function withMutex(fn: any): Promise<void>;
/**
 * Public alias shared with the API's settings.mutate writes (lib/api.js).
 * NOT reentrant — never call writer mutations from inside it.
 */
export declare const withWriteLock: typeof withMutex;
export declare function setWriteGate(gate: any): void;
/**
 * Append a NEW `{ insert: [row] }` entry the Loader can mount (config-editor
 * cannot create rows — SPEC §5.6). Deliberately NO patch-level id:
 * insert-with-id means "append into that group" (spike R2).
 * @returns {Promise<boolean>} whether the file was written (always true).
 * @throws on an unparseable file or ANY existing row with the same id.
 */
export declare function insertRow({ patchPath, row }: {
    patchPath: any;
    row: any;
}): Promise<void>;
/**
 * Physically remove a row our writer created: the insert item plus any stale
 * bare overrides with the same id (stale overrides would make the loader warn
 * "entry not found"). Comments, `!!js`, and sibling rows are preserved.
 * @returns {Promise<boolean>} false when no insert row with this id exists.
 */
export declare function removeRow({ patchPath, rowId }: {
    patchPath: any;
    rowId: any;
}): Promise<void>;
/**
 * "Delete" a bundle-provided row by upserting a bare
 * `{ id, name, disabled: true }` override in the profile layer (what
 * plugin-manager does); the loader then skips the row (SPEC §2 #17). A bare
 * row whose id no lower layer provides is skipped by the loader — by design.
 * @returns {Promise<boolean>} whether the file was written.
 */
export declare function disableRow({ patchPath, rowId, name }: {
    patchPath: any;
    rowId: any;
    name: any;
}): Promise<void>;
/**
 * Normalize ANY row identifier to the unqualified patch row id: strip a
 * leading `<parent>:` qualification chain (`include:group:prompt-section-1` →
 * `prompt-section-1`) and keep the last segment. An already-unqualified id —
 * or a non-string / empty value — passes through unchanged. THE low-level
 * normalizer; lib/api.js imports this instead of keeping a second copy.
 * @param {string} value - row id as received.
 * @returns {string} the last `:`-separated segment (value for non-strings).
 */
export declare function toPatchId(value: any): any;
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
export declare function provenance({ patchPath, rowId }: {
    patchPath: any;
    rowId: any;
}): {
    source: string;
    inserted: boolean;
    overridden: boolean;
};
/**
 * Every row id the patch claims (bare overrides, insert rows, grouped inserts).
 * Read-only: never writes, never takes the mutex. Lets the create routes avoid
 * colliding with an unregistered patch row.
 * @returns {Set<string>} every row id found in the file.
 * @throws on an unparseable file or a non-sequence root.
 */
export declare function listRowIds({ patchPath }: {
    patchPath: any;
}): Set<unknown>;
/**
 * Read-only detail view of every row the patch claims (bare overrides plus
 * `insert` rows): id, plugin `name`, `disabled`, and whether/which `config.id`
 * it carries. Lets the API decide whether a pending row is really one of OUR
 * rows (H5) and whether a profile still exists in the AUTHORITATIVE file rather
 * than in the HMR-lagged registry (B2). Never writes, never takes the mutex.
 * @returns {Array<{ id: string|null, name: string|null, disabled: boolean,
 *   hasConfig: boolean, configId: string|null }>}
 */
export declare function readPatchRows({ patchPath }: {
    patchPath: any;
}): any[];
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
export declare function renameSectionRow({ patchPath, row, oldRowId, oldName, bundleOwned }: {
    patchPath: any;
    row: any;
    oldRowId: any;
    oldName: any;
    bundleOwned: any;
}): Promise<void>;
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
export declare function withPatchBatch({ patchPath }: {
    patchPath: any;
}, run: any): Promise<void>;
export {};
