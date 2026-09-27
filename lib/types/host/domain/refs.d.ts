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
import { type ConfigId, type Profile, type RowId, type Section, type SectionRef, type UsedInEntry } from "./model.ts";
/**
 * @purpose Map every usable alias (config/row/token forms) to the config id to store; exact ids win.
 */
export declare function sectionRefTargets(rows: readonly (Pick<Section, "id"> & {
    rowId?: RowId | null;
})[]): Map<string, ConfigId>;
/**
 * @purpose Resolve one sections[].id to the id to store: registered or pending, else null on invalid/foreign id.
 */
export declare function resolveSectionRefId(raw: unknown, { targets, pending }: {
    targets: ReadonlyMap<string, ConfigId>;
    pending?: ReadonlySet<string>;
}): ConfigId | null;
/**
 * @purpose List every id that names one row: config id, patch row id, and bare token for full section ids.
 */
export declare function rowAliases(row: Pick<Section, "id"> & {
    rowId?: RowId | null;
}): Set<string>;
/**
 * @purpose Check whether a value names the row identified by an alias set, raw or normalized.
 */
export declare function refNamesRow(value: string, aliases: ReadonlySet<string>): boolean;
/**
 * @purpose Return one entry per matching reference, sorted by profile id.
 */
export declare function usedIn(profiles: readonly (Pick<Profile, "id"> & {
    sections?: SectionRef[];
})[], sectionId: ConfigId): UsedInEntry[];
