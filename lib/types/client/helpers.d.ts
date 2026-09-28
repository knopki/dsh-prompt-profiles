/** #region moduleContract
 * @modulecontract
 * @purpose Pure view helpers shared by the chip and the settings page: row
 *   identity, outline ordering, preview planning and the profile-changed signal.
 * @scope
 *  - Ids and refs, the outline, the preview plan and the changed signal.
 *  - NOT: api calls, flows or components.
 * @invariants
 *  - `idOf` reads `configId → patchId → rowId → id`; orders stay integers.
 * #endregion moduleContract */
import type { Translate } from "./i18n.ts";
import type { PreviewResponse, RowEntry, RowIdentity, SectionRef, StateDocument } from "./model.ts";
/** @purpose Stable display/key id of a /state entry: configId first. */
export declare function idOf(entry: RowIdentity | null | undefined): string | null;
/** @purpose The domain id for section refs: the configId verbatim, never re-prefixed. */
export declare function refIdOf(entry: RowIdentity | null | undefined): string | null;
/** @purpose Collapse a doubled row-id prefix to a single one; single prefixes pass through. */
export declare function dedupeRowPrefix(id: unknown): string;
/**
 * @purpose Guard for a profile's section refs before they are sent: each
 *   ref keeps the configId it came with; only a doubled prefix (the old
 *   mangling bug) is collapsed.
 */
export declare function normalizeSections(refs?: ReadonlyArray<SectionRef> | null): SectionRef[];
/**
 * @purpose Append picked section ids to a profile's refs: ids VERBATIM
 *   (they come from configId), orders stepped +100 past the current
 *   maximum, default scope inherit.
 */
export declare function addSectionsToRefs(refs: ReadonlyArray<SectionRef> | null | undefined, ids: ReadonlyArray<string> | null | undefined, step?: number): SectionRef[];
/**
 * @purpose Human label for a profile: its title, else its id (bundle rows can
 *   carry an empty title), else the "(no title)" dictionary string — so a made
 *   choice never reads as "None".
 */
export declare function profileLabel(profile: (RowIdentity & {
    title?: string;
}) | null | undefined, t: Translate): string;
/** The key-event surface the Escape guard and the drag grip read (a plain object in tests). */
export interface KeyEventLike {
    key?: string;
    target?: unknown;
    preventDefault?: () => void;
}
/** The window-like root the Escape guard asks for an open overlay. */
interface DrillRootLike {
    document?: {
        querySelector?: (selector: string) => unknown;
    } | null;
}
/**
 * @purpose Whether an Escape keydown should close the current drill-down.
 *   It must NOT fire while the user is typing (input/textarea/select or a
 *   contenteditable node) and must not fight an open dialog/menu — otherwise
 *   Esc during typing discarded the user's place.
 */
export declare function escapesDrillDown(event: KeyEventLike | null | undefined, root?: DrillRootLike | null): boolean;
/** The part of an outline row the boundary rule reads. */
interface BoundaryRow {
    kind: string;
    order?: number;
}
/** One built-in row from the mirror: rendered grey and read-only. */
interface BuiltinOutlineRow {
    kind: "builtin";
    key: string;
    name: string;
    order?: number;
}
/** One of the profile's own refs. */
export interface OursOutlineRow {
    kind: "ours";
    key: string;
    ref: SectionRef;
    section: RowEntry;
    order?: number;
    seq: number;
}
/** A ref that names no registered section. */
interface BrokenOutlineRow {
    kind: "broken";
    key: string;
    ref: SectionRef;
    order?: number;
    seq: number;
}
/** One rendered outline row: a built-in, one of our refs, or a broken ref. */
export type OutlineRow = BuiltinOutlineRow | OursOutlineRow | BrokenOutlineRow;
/** A row lookup the guard accepts: a Map (any realm) or a plain record. */
type SectionsLookup = Map<string, RowEntry> | Record<string, RowEntry> | null | undefined;
/**
 * @purpose Orders for the drag-and-drop insertion gaps: entry i is the gap
 *   before `rows[i]`, the last entry the gap after the final row.
 * @invariants Integers only, never a midpoint. Dropping below a built-in
 *   yields its order + 1 so the host rule cannot hoist the row above it.
 */
export declare function insertionOrders(rows: ReadonlyArray<BoundaryRow> | null | undefined): number[];
/** @purpose Autosave gate: only a confirmed row with a non-empty title may be written. */
export declare function canSaveSection(title: unknown, confirmed: unknown): boolean;
/**
 * @purpose Which `source` badge to render: only `bundle` and `unknown` are
 *   worth showing; `user` rows are the calm default and get no badge.
 */
export declare function sourceKindOf(source: unknown): "bundle" | "unknown" | null;
/**
 * @purpose Resolve a used-in profile reference to its human title, falling
 *   back to the raw id when the profile is missing from /state.
 */
export declare function usedInProfileName(state: StateDocument | null | undefined, profileId: string): string;
/**
 * @purpose Render a count with the noun form the number demands: the Slavic
 *   rule (one for 1/21/31…, few for 2–4/22–24…, many otherwise). English
 *   carries one value for `few` and `many`, Chinese the same value in all
 *   three, so one rule serves every dictionary.
 */
export declare function countLabel(n: number, t: Translate, base: "sections" | "broken"): string;
/** @purpose Locale key for a section-ref scope value (single mapping shared
 *   by the scope menu and the used-in line, so none render the raw enum). */
export declare function scopeKeyOf(scope: string | null | undefined): "scopeMainOnly" | "scopeSubagentsOnly" | "scopeInherit";
/** @purpose Post-rename notice listing profiles still pointing at the old id, if any. */
export declare function renameNotice(result: {
    affectedProfiles?: ReadonlyArray<{
        profileId?: string;
        title?: string;
    }>;
} | null | undefined, t: Translate): string | null;
/**
 * @purpose Merge a profile's refs with the built-in mirror into an ordered
 *   outline. Orders are the persisted ones; equal-to-built-in is normal.
 */
export declare function outlineRows(profile: {
    sections?: ReadonlyArray<SectionRef>;
} | null | undefined, sectionsById: SectionsLookup, builtinOrders: Record<string, number> | null | undefined): OutlineRow[];
/** @purpose Case-insensitive search over section title and id. */
export declare function filterSections(sections: ReadonlyArray<RowEntry>, query: unknown): RowEntry[];
/** A collapsed run of built-in entries. */
interface BuiltinsPreviewPlanItem {
    kind: "builtins";
    names: string[];
}
/** One of our sections, in final order. */
interface OursPreviewPlanItem {
    kind: "ours";
    id?: string;
    title?: string;
    order?: number;
    text?: string;
}
/** One render-plan entry: a collapsed run of built-ins or one of our sections. */
type PreviewPlanItem = BuiltinsPreviewPlanItem | OursPreviewPlanItem;
export interface PreviewPlan {
    plan: PreviewPlanItem[];
    skipped: Array<{
        id?: string;
        title: string;
        reason: string;
        detail?: string;
    }>;
    variables: Record<string, string | null> | null;
}
/**
 * @purpose Map the host preview response into a render plan: consecutive
 *   built-in entries collapse into one placeholder group, ours sections
 *   keep order/title/text, skipped sections carry their reason.
 */
export declare function previewPlan(response: PreviewResponse | null | undefined): PreviewPlan;
/**
 * @purpose Names that make a preview item illustrative rather than exact:
 *   sessionless assembly means a used value cannot be proven exact.
 */
export declare function previewVariableNotice(text: unknown, body: unknown, variables?: Record<string, string | null> | null, sessionValues?: Record<string, string> | null): string[] | null;
/** How long a burst of mutations is coalesced before the chip re-reads /state. */
export declare const PROFILES_REFRESH_DEBOUNCE_MS = 150;
/** @purpose Fire the profiles-changed signal after a successful mutation. */
export declare function notifyProfilesChanged(): void;
/** @purpose Subscribe to the profiles-changed signal; returns the unsubscribe. */
export declare function subscribeProfilesChanged(listener: (seq: number) => void): () => void;
/** @purpose Duck-typed error message (cross-realm-safe, unlike instanceof). */
export declare function errText(err: unknown): string;
/**
 * @purpose Localize one skipped-reference reason: the id through the
 *   dictionary, its value appended when the host sent one.
 */
export declare function skipReasonText(reason: unknown, detail: unknown, t: Translate): string;
export declare const helpers: {
    insertionOrders: typeof insertionOrders;
    outlineRows: typeof outlineRows;
    filterSections: typeof filterSections;
    previewPlan: typeof previewPlan;
    idOf: typeof idOf;
    refIdOf: typeof refIdOf;
    dedupeRowPrefix: typeof dedupeRowPrefix;
    normalizeSections: typeof normalizeSections;
    addSectionsToRefs: typeof addSectionsToRefs;
    canSaveSection: typeof canSaveSection;
    sourceKindOf: typeof sourceKindOf;
    usedInProfileName: typeof usedInProfileName;
    renameNotice: typeof renameNotice;
    scopeKeyOf: typeof scopeKeyOf;
    profileLabel: typeof profileLabel;
    escapesDrillDown: typeof escapesDrillDown;
    previewVariableNotice: typeof previewVariableNotice;
    notifyProfilesChanged: typeof notifyProfilesChanged;
    subscribeProfilesChanged: typeof subscribeProfilesChanged;
};
export {};
