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

import { randomUUID } from "node:crypto";
import {
  type ConfigId,
  type PatchId,
  PROFILE_ID_PREFIX,
  type RowId,
  type RowKind,
  SECTION_ID_PREFIX,
} from "./model.ts";

const ID_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// #region FUNC_idPrefix
/**
 * @purpose Map a row kind to the prefix of every full id of that kind.
 */
export function idPrefix(kind: RowKind): string {
  return kind === "section" ? SECTION_ID_PREFIX : PROFILE_ID_PREFIX;
}
// #endregion FUNC_idPrefix

// #region FUNC_isValidToken
/**
 * @purpose Check a bare id token (no prefix) for well-formedness.
 */
export function isValidToken(token: string): boolean {
  return ID_TOKEN_PATTERN.test(token);
}
// #endregion FUNC_isValidToken

// #region FUNC_toPatchId
/**
 * @purpose Strip loader qualification so patch operations use the unqualified id.
 */
export function toPatchId(value: string): PatchId;
export function toPatchId(value: unknown): unknown;
export function toPatchId(value: unknown): unknown {
  if (typeof value !== "string" || value === "") return value;
  return value.slice(value.lastIndexOf(":") + 1);
}
// #endregion FUNC_toPatchId

// #region FUNC_normalizeNewRowId
/**
 * @purpose Normalize a create/rename id to its full kind-prefixed form; return null for non-string/empty input.
 */
export function normalizeNewRowId(kind: RowKind, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bare = toPatchId(value);
  if (typeof bare !== "string" || bare === "") return null;
  const prefix = idPrefix(kind);
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}
// #endregion FUNC_normalizeNewRowId

// #region FUNC_normalizeExplicitRowId
/**
 * @purpose Accept only a kind-prefixed id with a valid token.
 */
export function normalizeExplicitRowId(kind: RowKind, value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const full = normalizeNewRowId(kind, value);
  if (full === null) return null;
  const token = full.slice(idPrefix(kind).length);
  return isValidToken(token) ? full : null;
}
// #endregion FUNC_normalizeExplicitRowId

// #region FUNC_findRow
/**
 * @purpose Match a registry row by qualified/unqualified row id or config id.
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

/**
 * Injectable token source so tests force collisions without patching crypto.
 */
export const tokenSource = { next: (): string => randomUUID().replace(/-/g, "").slice(0, 8) };

// #region FUNC_newRowId
/**
 * @purpose Mint a random unused id, retrying on malformed or taken candidates.
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
 * @purpose Return every full id a new row must not reuse: row/config ids plus extras.
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
// #endregion FUNC_takenIds

// #region FUNC_configIds
/**
 * @purpose Return the registered config ids an explicit new id must not duplicate.
 */
export function configIds(rows: readonly { id?: ConfigId }[]): Set<string> {
  return new Set(rows.map((row) => row.id).filter((id): id is ConfigId => typeof id === "string"));
}
// #endregion FUNC_configIds
