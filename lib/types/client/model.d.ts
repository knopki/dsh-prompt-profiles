/** #region moduleContract
 * @modulecontract
 * @purpose The client's view of the promptProfiles documents it renders: the
 *   `/state` and `preview` responses plus the row/title/reference shapes the
 *   chip and the settings page read.
 * @scope
 *  - View interfaces only — no logic, no I/O.
 *  - NOT: the wire schemas themselves (src/shared/wire-schemas.ts) or the api
 *    facade (src/client/remote.ts).
 * @invariants
 *  - A row always carries its `title` (every host view has one); every other
 *    field is optional, and a missing value renders a fallback rather than
 *    throwing.
 * @keywords client model, state document, preview, profile row, section row
 * #endregion moduleContract */
/** The id surfaces of one row — `idOf` reads them in this order. */
export interface RowIdentity {
    configId?: string;
    patchId?: string;
    rowId?: string;
    id?: string;
}
/** One section reference inside a profile value. */
export interface SectionRef {
    id: string;
    order?: number;
    scope?: string;
}
/** Which profiles reference a section (the editor's «Used in» feed). */
export interface UsedInEntry {
    profileId: string;
    scope: string;
}
/**
 * One `/state` row. The wire declares open-shaped record views (jsonRow in
 * wire-schemas), so this is the union of the fields the UI reads; only
 * `title` is guaranteed, because every host view carries one.
 */
export interface RowEntry extends RowIdentity {
    title: string;
    /** The unqualified patch id every write addresses; always present on a mounted row. */
    patchId: string;
    body?: string;
    source?: string;
    usedIn?: UsedInEntry[];
    emits?: boolean;
    order?: number;
    sections?: SectionRef[];
}
/** One agent-preset mode from `/state`, with the complete-mode flag. */
export interface ModeEntry {
    id: string;
    title?: string;
    complete?: boolean;
}
export interface StateDocument {
    profiles?: RowEntry[];
    sections?: RowEntry[];
    builtinOrders?: Record<string, number>;
    modes?: ModeEntry[];
    default?: string;
    lastByWorkspace?: Record<string, string>;
    revision?: number | null;
}
/** One section as the host preview reports it (ours or a collapsed built-in). */
export interface PreviewSectionEntry {
    id?: string;
    title?: string;
    name?: string;
    order?: number;
    text?: string;
    body?: string;
    builtin?: boolean;
    kind?: string;
    ours?: boolean;
}
export interface PreviewSkippedEntry {
    id?: string;
    title?: string;
    reason?: string;
}
export interface PreviewResponse {
    profileId?: string;
    title?: string;
    sections?: PreviewSectionEntry[];
    skipped?: PreviewSkippedEntry[];
    variables?: Record<string, string | null> | null;
}
/** The create responses the flows feed back into the local state optimistically. */
export interface CreateResponse extends RowIdentity {
    title?: string;
    body?: string;
    sections?: SectionRef[];
}
/** The rename response: which profiles still name the old id. */
export interface RenameResponse {
    affectedProfiles?: Array<{
        profileId?: string;
        title?: string;
    }>;
}
