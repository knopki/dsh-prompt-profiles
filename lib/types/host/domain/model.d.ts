/**
 * #region moduleContract
 * @modulecontract
 * @purpose Define the shared host vocabulary and data shapes for prompt profiles.
 * @scope Domain types/literals only; NOT id algorithms, reference resolution, ordering, or wire schemas.
 * #endregion moduleContract
 */
export type RowKind = "section" | "profile";
export declare const SECTION_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/section";
export declare const PROFILE_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/profile";
export declare const SECTION_ID_PREFIX = "prompt-section-";
export declare const PROFILE_ID_PREFIX = "prompt-profile-";
export declare const PERSONA_PLUGIN_NAME = "@deepseek-ai/dsh-persona";
export declare const SCOPES: readonly ["inherit", "main-only", "subagents-only"];
export type Scope = (typeof SCOPES)[number];
/** @purpose Loader-qualified identity used by registry rows. */
export type RowId = string;
export type PatchId = string;
export type ConfigId = string;
export type RowSource = "user" | "bundle" | "unknown";
/**
 * One section reference inside a profile. `order`/`scope` stay on the reference
 * so one section can be placed and filtered differently per profile.
 */
export interface SectionRef {
    id: ConfigId;
    order: number;
    scope?: string;
}
export interface Section {
    id: ConfigId;
    title: string;
    body: string;
    disabled?: boolean;
}
export interface Profile {
    id: ConfigId;
    title: string;
    sections: SectionRef[];
}
export interface UsedInEntry {
    profileId: ConfigId;
    scope: string;
}
/** @purpose Registry row view of a section: config plus row identity and source. */
export interface SectionView extends Section {
    rowId: RowId | null;
    source: RowSource;
    patchId?: PatchId;
    usedIn?: UsedInEntry[];
    emits?: boolean;
}
/** @purpose Registry row view of a profile: config plus row identity and source. */
export interface ProfileView extends Profile {
    rowId: RowId | null;
    source: RowSource;
    patchId?: PatchId;
}
/** @purpose Frozen section text and placement captured when a session is sealed. */
export interface SnapshotSection {
    id: ConfigId;
    order: number;
    text: string;
}
export interface Snapshot {
    sections: SnapshotSection[];
}
export interface AssemblySection {
    name: string;
}
/** @purpose Insertion at a base index in the original assembly; consumers splice in descending index order. */
export interface PlannedInsertion {
    name: string;
    text: string;
    interpolate: false;
    index: number;
}
