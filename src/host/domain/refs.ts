/**
 * #region moduleContract
 * @modulecontract
 * @purpose Centralize section-reference aliases, resolution, and usage reporting.
 * @scope Target construction, one-reference resolution, row alias matching, used-in feed;
 *   NOT patch-file reads or wire validation.
 * @invariants
 *  - Stored refs resolve to registered config ids; pending ids are the create-before-registration exception.
 * #endregion moduleContract
 */

import { isValidToken, normalizeNewRowId, toPatchId } from "./ids.ts";
import {
  type ConfigId,
  type Profile,
  type RowId,
  SECTION_ID_PREFIX,
  type Section,
  type SectionRef,
  type UsedInEntry,
} from "./model.ts";

// #region FUNC_sectionRefTargets
/**
 * @purpose Map every usable alias (config/row/token forms) to the config id to store; exact ids win.
 */
export function sectionRefTargets(
  rows: readonly (Pick<Section, "id"> & { rowId?: RowId | null })[],
): Map<string, ConfigId> {
  const targets = new Map<string, ConfigId>();
  const alias = (key: string, value: ConfigId) => {
    if (key !== "" && !targets.has(key)) targets.set(key, value);
  };
  for (const row of rows) {
    const id = row.id;
    if (typeof id !== "string" || id === "") continue;
    targets.set(id, id);
    const patch = typeof row.rowId === "string" ? toPatchId(row.rowId) : "";
    if (patch !== "") {
      alias(patch, id);
      alias(`include:${patch}`, id);
    }
    if (id.startsWith(SECTION_ID_PREFIX)) alias(id.slice(SECTION_ID_PREFIX.length), id);
    else alias(`${SECTION_ID_PREFIX}${id}`, id);
  }
  return targets;
}
// #endregion FUNC_sectionRefTargets

// #region FUNC_resolveSectionRefId
/**
 * @purpose Resolve one sections[].id to the id to store: registered or pending, else null on invalid/foreign id.
 */
export function resolveSectionRefId(
  raw: unknown,
  { targets, pending }: { targets: ReadonlyMap<string, ConfigId>; pending?: ReadonlySet<string> },
): ConfigId | null {
  if (typeof raw !== "string" || raw === "") return null;
  const direct = targets.get(raw) ?? targets.get(toPatchId(raw));
  if (direct !== undefined) return direct;
  const full = normalizeNewRowId("section", raw);
  if (full === null) return null;
  const registered = targets.get(full);
  if (registered !== undefined) return registered;
  const token = full.slice(SECTION_ID_PREFIX.length);
  if (token === "" || !isValidToken(token)) return null;
  return pending?.has(full) ? full : null;
}
// #endregion FUNC_resolveSectionRefId

// #region FUNC_rowAliases
/**
 * @purpose List every id that names one row: config id, patch row id, and bare token for full section ids.
 */
export function rowAliases(row: Pick<Section, "id"> & { rowId?: RowId | null }): Set<string> {
  const aliases = new Set<string>([row.id]);
  if (typeof row.rowId === "string" && row.rowId !== "") aliases.add(toPatchId(row.rowId));
  if (row.id.startsWith(SECTION_ID_PREFIX)) aliases.add(row.id.slice(SECTION_ID_PREFIX.length));
  return aliases;
}
// #endregion FUNC_rowAliases

// #region FUNC_refNamesRow
/**
 * @purpose Check whether a value names the row identified by an alias set, raw or normalized.
 */
export function refNamesRow(value: string, aliases: ReadonlySet<string>): boolean {
  return aliases.has(value) || aliases.has(toPatchId(value));
}
// #endregion FUNC_refNamesRow

// #region FUNC_usedIn
/**
 * @purpose Return one entry per matching reference, sorted by profile id.
 */
export function usedIn(
  profiles: readonly (Pick<Profile, "id"> & { sections?: SectionRef[] })[],
  sectionId: ConfigId,
): UsedInEntry[] {
  const uses: UsedInEntry[] = [];
  for (const profile of profiles) {
    for (const ref of profile.sections ?? []) {
      if (ref.id === sectionId) uses.push({ profileId: profile.id, scope: ref.scope ?? "inherit" });
    }
  }
  return uses.sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));
}
// #endregion FUNC_usedIn
