/**
 * #region moduleContract
 * @modulecontract
 * @purpose Centralize row-id normalization, matching, and creation rules.
 * @scope Normalization, lookup, token generation; NOT storage or wire validation.
 * @invariants
 *  - Normalizers return null for malformed input instead of throwing.
 *  - Ids are never derived from a title.
 * #endregion moduleContract
 */
import { type ConfigId, type PatchId, type RowId, type RowKind } from "./model.ts";
/**
 * @purpose Map a row kind to the prefix of every full id of that kind.
 */
export declare function idPrefix(kind: RowKind): string;
/**
 * @purpose Check a bare id token (no prefix) for well-formedness.
 */
export declare function isValidToken(token: string): boolean;
/**
 * @purpose Strip loader qualification so patch operations use the unqualified id.
 */
export declare function toPatchId(value: string): PatchId;
export declare function toPatchId(value: unknown): unknown;
/**
 * @purpose Normalize a create/rename id to its full kind-prefixed form; return null for non-string/empty input.
 */
export declare function normalizeNewRowId(kind: RowKind, value: unknown): string | null;
/**
 * @purpose Accept only a kind-prefixed id with a valid token.
 */
export declare function normalizeExplicitRowId(kind: RowKind, value: unknown): string | null;
/**
 * @purpose Match a registry row by qualified/unqualified row id or config id.
 */
export declare function findRow<T extends {
    id?: ConfigId;
    rowId?: RowId | null;
}>(rows: readonly T[] | null | undefined, value: unknown): T | null;
/**
 * Injectable token source so tests force collisions without patching crypto.
 */
export declare const tokenSource: {
    next: () => string;
};
/**
 * @purpose Mint a random unused id, retrying on malformed or taken candidates.
 */
export declare function newRowId(kind: RowKind, taken: ReadonlySet<string>): string;
/**
 * @purpose Return every full id a new row must not reuse: row/config ids plus extras.
 */
export declare function takenIds(rows: readonly {
    id?: ConfigId;
    rowId?: RowId | null;
}[], extra?: Iterable<string>): Set<string>;
/**
 * @purpose Return the registered config ids an explicit new id must not duplicate.
 */
export declare function configIds(rows: readonly {
    id?: ConfigId;
}[]): Set<string>;
