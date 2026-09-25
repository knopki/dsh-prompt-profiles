/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the rules about which ids a profile reference may name and
 *   which profiles use a section, so ref resolution, the rename report and the
 *   registry's usedIn feed agree.
 * @scope
 *  - Reference targets of the registered sections, the alias set of one
 *    section, one-reference resolution to the id that must be STORED, and the
 *    usedIn computation.
 *  - NOT: reading the patch file (the caller supplies the pending ids), wire
 *    schemas (validation.ts), ordering (ordering.ts).
 * @invariants
 *  - A stored reference is ALWAYS the registered `config.id`, because runtime
 *    lookups key on it; an id that names no registered section is accepted
 *    only from the caller-supplied pending set.
 *  - An exact registered `config.id` wins over the convenience aliases.
 * @keywords section reference, alias, targets, usedIn, pending registration
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
 * Map every id a profile may use to name a registered section to the
 * `config.id` that must be STORED for the ref to resolve at runtime: the
 * config.id itself (old rows keep bare slug ids), its normalized and qualified
 * row-id forms, and the bare token of a full `prompt-section-<token>` config
 * id — plus the reverse mapping so an old bare config id stays addressable by
 * its full row-id form. Exact config ids always win over aliases.
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
 * @purpose Resolve one `sections[].id` to the id STORED in the profile: a
 *   registered section's config.id (verbatim — old rows keep bare slug ids),
 *   its full/qualified row id, or the bare token of a full
 *   `prompt-section-<token>` config id. A section HMR has not registered yet
 *   is accepted only when its row is already in the profile patch
 *   (`pending`) — the create-then-add flow. null rejects a typo or a foreign
 *   id on create and update alike.
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
 * Every id that names ONE row: its `config.id` (a new-scheme row's is already
 * the full id; old rows keep bare slugs), its patch row id, and — for a
 * section — the bare token of a full config.id.
 */
export function rowAliases(row: Pick<Section, "id"> & { rowId?: RowId | null }): Set<string> {
  const aliases = new Set<string>([row.id]);
  if (typeof row.rowId === "string" && row.rowId !== "") aliases.add(toPatchId(row.rowId));
  if (row.id.startsWith(SECTION_ID_PREFIX)) aliases.add(row.id.slice(SECTION_ID_PREFIX.length));
  return aliases;
}

/** Does `value` name the row identified by `aliases`, raw or normalized? */
export function refNamesRow(value: string, aliases: ReadonlySet<string>): boolean {
  return aliases.has(value) || aliases.has(toPatchId(value));
}
// #endregion FUNC_rowAliases

// #region FUNC_usedIn
/**
 * Profiles referencing a section, with the scope of each reference. A section
 * referenced twice by one profile contributes one entry per reference.
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
