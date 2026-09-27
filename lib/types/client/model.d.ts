/** #region moduleContract
 * @modulecontract
 * @purpose The client's view of the promptProfiles documents it renders.
 * @invariants
 *  - A row always carries its `title`; other fields fall back, never throw.
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
/** One `/state` row: only `title` is guaranteed; the rest is optional. */
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
interface ModeEntry {
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
interface PreviewSectionEntry {
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
interface PreviewSkippedEntry {
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
export {};
