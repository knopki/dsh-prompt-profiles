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
 *    schemas (src/shared/wire-schemas.ts), ordering (ordering.ts).
 * @invariants
 *  - A stored reference is ALWAYS the registered `config.id`, because runtime
 *    lookups key on it; an id that names no registered section is accepted
 *    only from the caller-supplied pending set.
 *  - An exact registered `config.id` wins over the convenience aliases.
 * @keywords section reference, alias, targets, usedIn, pending registration
 * #endregion moduleContract
 */
import { type ConfigId, type Profile, type RowId, type Section, type SectionRef, type UsedInEntry } from "./model.ts";
/**
 * Map every id a profile may use to name a registered section to the
 * `config.id` that must be STORED for the ref to resolve at runtime: the
 * config.id itself (old rows keep bare slug ids), its normalized and qualified
 * row-id forms, and the bare token of a full `prompt-section-<token>` config
 * id — plus the reverse mapping so an old bare config id stays addressable by
 * its full row-id form. Exact config ids always win over aliases.
 */
export declare function sectionRefTargets(rows: readonly (Pick<Section, "id"> & {
    rowId?: RowId | null;
})[]): Map<string, ConfigId>;
/**
 * @purpose Resolve one `sections[].id` to the id STORED in the profile: a
 *   registered section's config.id (verbatim — old rows keep bare slug ids),
 *   its full/qualified row id, or the bare token of a full
 *   `prompt-section-<token>` config id. A section HMR has not registered yet
 *   is accepted only when its row is already in the profile patch
 *   (`pending`) — the create-then-add flow. null rejects a typo or a foreign
 *   id on create and update alike.
 */
export declare function resolveSectionRefId(raw: unknown, { targets, pending }: {
    targets: ReadonlyMap<string, ConfigId>;
    pending?: ReadonlySet<string>;
}): ConfigId | null;
/**
 * Every id that names ONE row: its `config.id` (a new-scheme row's is already
 * the full id; old rows keep bare slugs), its patch row id, and — for a
 * section — the bare token of a full config.id.
 */
export declare function rowAliases(row: Pick<Section, "id"> & {
    rowId?: RowId | null;
}): Set<string>;
/** Does `value` name the row identified by `aliases`, raw or normalized? */
export declare function refNamesRow(value: string, aliases: ReadonlySet<string>): boolean;
/**
 * Profiles referencing a section, with the scope of each reference. A section
 * referenced twice by one profile contributes one entry per reference.
 */
export declare function usedIn(profiles: readonly (Pick<Profile, "id"> & {
    sections?: SectionRef[];
})[], sectionId: ConfigId): UsedInEntry[];
