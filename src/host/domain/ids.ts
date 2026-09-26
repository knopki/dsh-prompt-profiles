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

import { randomUUID } from "node:crypto";
import {
  type ConfigId,
  type PatchId,
  PROFILE_ID_PREFIX,
  type RowId,
  type RowKind,
  SECTION_ID_PREFIX,
} from "./model.ts";

// #region CONST_token
/** Rule for the TOKEN part of a generated or explicit row id. */
export const ID_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** `section` → `prompt-section-`, the prefix of every full id of that kind. */
export function idPrefix(kind: RowKind): string {
  return kind === "section" ? SECTION_ID_PREFIX : PROFILE_ID_PREFIX;
}

/** Is `token` a well-formed id token (no prefix)? */
export function isValidToken(token: string): boolean {
  return ID_TOKEN_PATTERN.test(token);
}
// #endregion CONST_token

// #region FUNC_toPatchId
/**
 * @purpose Normalize ANY row identifier to the unqualified patch row id: strip
 *   a leading `<parent>:` qualification chain (`include:group:prompt-section-1`
 *   → `prompt-section-1`) and keep the last segment. THE low-level normalizer
 *   every other module imports.
 */
export function toPatchId(value: string): PatchId;
export function toPatchId(value: unknown): unknown;
export function toPatchId(value: unknown): unknown {
  if (typeof value !== "string" || value === "") return value;
  return value.slice(value.lastIndexOf(":") + 1);
}

/** The full row id of `token` under the frozen `prompt-<kind>-<token>` scheme. */
export function rowId(kind: RowKind, token: string): string {
  return `${idPrefix(kind)}${token}`;
}

/**
 * @purpose Normalize the NEW id of a create/rename payload to the canonical
 *   full `prompt-<kind>-<token>` form under the frozen decision «config.id ===
 *   full row id». Accepted inputs are all equivalent: a bare token, the full
 *   row id, or a qualified `include:` chain. Returns null when the input is not
 *   a string or reduces to the bare prefix — pattern checks stay with the
 *   caller, which reports a clear rejection.
 */
export function normalizeNewRowId(kind: RowKind, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bare = toPatchId(value);
  if (typeof bare !== "string" || bare === "") return null;
  const prefix = idPrefix(kind);
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}

/**
 * @purpose Normalize an EXPLICIT (caller-supplied) create/rename id: the same
 *   full form as normalizeNewRowId, but only when the token after the prefix is
 *   well-formed. null means "not a valid row id of this kind" — the caller
 *   reports it and nothing is written.
 */
export function normalizeExplicitRowId(kind: RowKind, value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const full = normalizeNewRowId(kind, value);
  if (full === null) return null;
  const token = full.slice(idPrefix(kind).length);
  return isValidToken(token) ? full : null;
}
// #endregion FUNC_toPatchId

// #region FUNC_findRow
/**
 * @purpose ONE place implementing the row id-matching rule. The registry
 *   stores the QUALIFIED loader entry rowId (`include:prompt-section-f01aa4a5`)
 *   while callers may send the unqualified patch row id. First hit wins:
 *   exact rowId, then `toPatchId`-normalized rowId (both directions), then the
 *   row's own `config.id` in either form.
 */
export function findRow<T extends { id?: ConfigId; rowId?: RowId | null }>(
  rows: readonly T[] | null | undefined,
  value: unknown,
): T | null {
  if (typeof value !== "string" || value === "") return null;
  const normalized = toPatchId(value);
  return (
    (rows ?? []).find(
      (candidate) =>
        candidate.rowId === value ||
        candidate.rowId === normalized ||
        toPatchId(candidate.rowId) === normalized ||
        candidate.id === value ||
        candidate.id === normalized,
    ) ?? null
  );
}
// #endregion FUNC_findRow

// #region CONST_tokenSource
/**
 * Injectable source of short random create tokens (8 lowercase hex chars).
 * @purpose Let tests force collisions deterministically (`tokenSource.next`)
 *   without monkey-patching crypto; production uses a crypto UUID.
 */
export const tokenSource = { next: (): string => randomUUID().replace(/-/g, "").slice(0, 8) };
// #endregion CONST_tokenSource

// #region FUNC_newRowId
/**
 * @purpose Mint a create id as a short random token instead of a
 *   title-derived slug: two ids derived from one title read as different rows
 *   and can collide with rows another bundle ships. Regenerates while the
 *   candidate is malformed or already in `taken` (any full id string or
 *   `config.id` a new row must not reuse).
 */
export function newRowId(kind: RowKind, taken: ReadonlySet<string>): string {
  for (;;) {
    const candidate = normalizeNewRowId(kind, tokenSource.next());
    if (candidate !== null && !taken.has(candidate)) return candidate;
  }
}
// #endregion FUNC_newRowId

// #region FUNC_takenIds
/**
 * Every FULL id string a NEW row of this kind must not reuse: the row ids and
 * config ids of the registered rows, raw and `toPatchId`-normalized (so both
 * the qualified `include:` form and the unqualified patch id are covered), plus
 * any caller-supplied ids (e.g. rows already present in the patch file).
 */
export function takenIds(
  rows: readonly { id?: ConfigId; rowId?: RowId | null }[],
  extra?: Iterable<string>,
): Set<string> {
  const taken = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string" || value === "") return;
    taken.add(value);
    const normalized = toPatchId(value);
    if (typeof normalized === "string" && normalized !== "") taken.add(normalized);
  };
  for (const row of rows) {
    add(row.rowId);
    add(row.id);
  }
  for (const value of extra ?? []) add(value);
  return taken;
}

/** Registered `config.id`s of `rows` — the ids an explicit new id must not duplicate. */
export function configIds(rows: readonly { id?: ConfigId }[]): Set<string> {
  return new Set(rows.map((row) => row.id).filter((id): id is ConfigId => typeof id === "string"));
}
// #endregion FUNC_takenIds
