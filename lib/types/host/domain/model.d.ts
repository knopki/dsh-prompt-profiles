/**
 * #region moduleContract
 * @modulecontract
 * @purpose Name the prompt-profile domain once: the two row kinds and their
 *   plugin names, scope values, the reference/row/snapshot shapes and the id
 *   forms every other host module speaks.
 * @scope
 *  - Types and frozen literals only — no logic, no I/O.
 *  - NOT: id algorithms (domain/ids.ts), ordering and skip rules
 *    (domain/ordering.ts), reference matching (domain/refs.ts), wire schemas
 *    (domain/validation.ts).
 * @invariants
 *  - Only the three SCOPES values change selection; any other scope string is
 *    reported as an unknown scope and never coerced.
 * @keywords prompt profiles, domain, model, scope, section ref, row id
 * #endregion moduleContract
 */
/** Kind of composition row this bundle owns. */
export type RowKind = "section" | "profile";
/** Loader plugin name of the `.../section` composition row. */
export declare const SECTION_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/section";
/** Loader plugin name of the `.../profile` composition row. */
export declare const PROFILE_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/profile";
/** Id prefix of every section row id this bundle mints (`prompt-section-<token>`). */
export declare const SECTION_ID_PREFIX = "prompt-section-";
/** Id prefix of every profile row id this bundle mints (`prompt-profile-<token>`). */
export declare const PROFILE_ID_PREFIX = "prompt-profile-";
/** The persona row whose `config.complete === true` collapses the prompt. */
export declare const PERSONA_PLUGIN_NAME = "@deepseek-ai/dsh-persona";
/** Scope values a profile reference may carry (SPEC §4). */
export declare const SCOPES: readonly ["inherit", "main-only", "subagents-only"];
export type Scope = (typeof SCOPES)[number];
/**
 * Loader-qualified entry id of a row: the registry keys on
 * `ctx.fiber.entry.id`, which is `<parent>:<rowId>` (any `:` chain).
 */
export type RowId = string;
/** Unqualified patch row id — the form the profile patch file addresses. */
export type PatchId = string;
/**
 * `config.id` of a row. Frozen id scheme: a row THIS bundle creates stores
 * its full row id as `config.id`; rows from other layers keep their own ids.
 */
export type ConfigId = string;
/** Which patch layer a row was proven to come from. */
export type RowSource = "user" | "bundle" | "unknown";
/**
 * One section reference inside a profile. `order` and `scope` belong to the
 * reference, not to the section; a `scope` outside SCOPES is preserved as
 * written and reported as unknown by the selection rule.
 */
export interface SectionRef {
    id: ConfigId;
    order: number;
    scope?: string;
}
/** A section as the selection and ordering rules read it. */
export interface Section {
    id: ConfigId;
    title: string;
    body: string;
    disabled?: boolean;
}
/** A profile as the selection and ordering rules read it. */
export interface Profile {
    id: ConfigId;
    title: string;
    sections: SectionRef[];
}
/** Which profiles reference a section (editor feed). */
export interface UsedInEntry {
    profileId: ConfigId;
    scope: string;
}
/** Registry row view of a section: its config plus row identity and source. */
export interface SectionView extends Section {
    rowId: RowId | null;
    source: RowSource;
    patchId?: PatchId;
    usedIn?: UsedInEntry[];
    emits?: boolean;
}
/** Registry row view of a profile: its config plus row identity and source. */
export interface ProfileView extends Profile {
    rowId: RowId | null;
    source: RowSource;
    patchId?: PatchId;
}
/** One sealed section: text frozen at seal time, never re-interpolated. */
export interface SnapshotSection {
    id: ConfigId;
    title: string;
    order: number;
    text: string;
}
/** A session's frozen profile decision (`profileId: null` means "none"). */
export interface Snapshot {
    profileId: ConfigId | null;
    sections: SnapshotSection[];
}
/** The part of an already-sorted assembly the insertion rules can anchor on. */
export interface AssemblySection {
    name: string;
}
/**
 * One planned insertion. `index` is a BASE index into the ORIGINAL assembly
 * array: consumers apply the plan by splicing from LAST to FIRST.
 */
export interface PlannedInsertion {
    name: string;
    text: string;
    interpolate: false;
    index: number;
}
