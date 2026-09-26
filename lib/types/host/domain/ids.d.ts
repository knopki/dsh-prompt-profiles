/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own every rule about prompt-profile row identifiers: the accepted
 *   input forms, the frozen `prompt-<kind>-<token>` scheme, row matching and
 *   create-token generation — so no two modules can disagree about what names
 *   a row.
 * @scope
 *  - Normalization (`toPatchId`, `normalizeNewRowId`), row lookup (`findRow`),
 *    token generation (`tokenSource`, `newRowId`) and the taken-id sets.
 *  - NOT: the patch file (writer.ts), registry views (registry.ts), payload
 *    schemas (src/shared/wire-schemas.ts).
 * @invariants
 *  - A created row's `config.id` IS its full row id; the token part matches
 *    ID_TOKEN_PATTERN, and ids are never derived from a title.
 *  - `toPatchId` passes a non-string value through unchanged; every other
 *    normalizer returns null instead of throwing, leaving the message to the
 *    caller.
 * @keywords row id, patch id, config id, token, create id, find row
 * #endregion moduleContract
 */
import { type ConfigId, type PatchId, type RowId, type RowKind } from "./model.ts";
/** Rule for the TOKEN part of a generated or explicit row id. */
export declare const ID_TOKEN_PATTERN: RegExp;
/** `section` → `prompt-section-`, the prefix of every full id of that kind. */
export declare function idPrefix(kind: RowKind): string;
/** Is `token` a well-formed id token (no prefix)? */
export declare function isValidToken(token: string): boolean;
/**
 * @purpose Normalize ANY row identifier to the unqualified patch row id: strip
 *   a leading `<parent>:` qualification chain (`include:group:prompt-section-1`
 *   → `prompt-section-1`) and keep the last segment. THE low-level normalizer
 *   every other module imports.
 */
export declare function toPatchId(value: string): PatchId;
export declare function toPatchId(value: unknown): unknown;
/** The full row id of `token` under the frozen `prompt-<kind>-<token>` scheme. */
export declare function rowId(kind: RowKind, token: string): string;
/**
 * @purpose Normalize the NEW id of a create/rename payload to the canonical
 *   full `prompt-<kind>-<token>` form under the frozen decision «config.id ===
 *   full row id». Accepted inputs are all equivalent: a bare token, the full
 *   row id, or a qualified `include:` chain. Returns null when the input is not
 *   a string or reduces to the bare prefix — pattern checks stay with the
 *   caller, which reports a clear rejection.
 */
export declare function normalizeNewRowId(kind: RowKind, value: unknown): string | null;
/**
 * @purpose Normalize an EXPLICIT (caller-supplied) create/rename id: the same
 *   full form as normalizeNewRowId, but only when the token after the prefix is
 *   well-formed. null means "not a valid row id of this kind" — the caller
 *   reports it and nothing is written.
 */
export declare function normalizeExplicitRowId(kind: RowKind, value: unknown): string | null;
/**
 * @purpose ONE place implementing the row id-matching rule. The registry
 *   stores the QUALIFIED loader entry rowId (`include:prompt-section-f01aa4a5`)
 *   while callers may send the unqualified patch row id. First hit wins:
 *   exact rowId, then `toPatchId`-normalized rowId (both directions), then the
 *   row's own `config.id` in either form.
 */
export declare function findRow<T extends {
    id?: ConfigId;
    rowId?: RowId | null;
}>(rows: readonly T[] | null | undefined, value: unknown): T | null;
/**
 * Injectable source of short random create tokens (8 lowercase hex chars).
 * @purpose Let tests force collisions deterministically (`tokenSource.next`)
 *   without monkey-patching crypto; production uses a crypto UUID.
 */
export declare const tokenSource: {
    next: () => string;
};
/**
 * @purpose Mint a create id as a short random token instead of a
 *   title-derived slug: two ids derived from one title read as different rows
 *   and can collide with rows another bundle ships. Regenerates while the
 *   candidate is malformed or already in `taken` (any full id string or
 *   `config.id` a new row must not reuse).
 */
export declare function newRowId(kind: RowKind, taken: ReadonlySet<string>): string;
/**
 * Every FULL id string a NEW row of this kind must not reuse: the row ids and
 * config ids of the registered rows, raw and `toPatchId`-normalized (so both
 * the qualified `include:` form and the unqualified patch id are covered), plus
 * any caller-supplied ids (e.g. rows already present in the patch file).
 */
export declare function takenIds(rows: readonly {
    id?: ConfigId;
    rowId?: RowId | null;
}[], extra?: Iterable<string>): Set<string>;
/** Registered `config.id`s of `rows` — the ids an explicit new id must not duplicate. */
export declare function configIds(rows: readonly {
    id?: ConfigId;
}[]): Set<string>;
