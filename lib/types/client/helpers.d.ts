/** #region moduleContract
 * @modulecontract
 * @purpose The client's pure view helpers: row identity and reference
 *   normalisation, outline ordering, preview planning and the small
 *   cross-surface signals the chip and the settings page share. Everything
 *   here is render-free, so the shim test can assert it directly.
 * @scope
 *  - Ids and refs, the outline (built-ins + ours + broken refs), the preview
 *    plan and the profile-changed signal.
 *  - NOT: api calls (src/client/remote.ts), flows (src/client/flows.ts) or any
 *    component.
 * @invariants
 *  - `idOf` prefers the unqualified `configId`; a ref always carries the
 *    configId VERBATIM, and `dedupeRowPrefix` only collapses a doubled prefix.
 *  - Orders are the persisted integers: no half-step is ever computed.
 * @keywords helpers, ids, outline, preview, signal
 * #endregion moduleContract */
import type { Translate } from "./i18n.ts";
import type { PreviewResponse, RowEntry, RowIdentity, SectionRef, StateDocument } from "./model.ts";
/** @purpose Stable display/key id of a /state entry: configId first. */
export declare function idOf(entry: RowIdentity | null | undefined): string | null;
/**
 * @purpose The domain id of a /state entry for use in section refs: the
 *   configId VERBATIM (in this bundle configId IS the full row-id string,
 *   prefix included). The client must never prepend or strip a prefix —
 *   the historical bug was the client doubling the prefix
 *   ("prompt-section-prompt-section-…"), which the host rejects.
 */
export declare function refIdOf(entry: RowIdentity | null | undefined): string | null;
/**
 * @purpose Collapse an accidentally DOUBLED row-id prefix to a single one
 *   ("prompt-section-prompt-section-x" → "prompt-section-x"). A single
 *   prefix and a bare id pass through untouched — refs carry configId
 *   verbatim, so this is a guard, not a transformation.
 */
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
/** The keyboard-event surface the Escape guard reads (a plain object in tests). */
export interface KeyEventLike {
    key?: string;
    target?: unknown;
}
/** The window-like root the Escape guard asks for an open overlay. */
export interface DrillRootLike {
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
export interface BoundaryRow {
    kind: string;
    order?: number;
}
/** One built-in row from the mirror: rendered grey and read-only. */
export interface BuiltinOutlineRow {
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
export interface BrokenOutlineRow {
    kind: "broken";
    key: string;
    ref: SectionRef;
    order?: number;
    seq: number;
}
/** One rendered outline row: a built-in, one of our refs, or a broken ref. */
export type OutlineRow = BuiltinOutlineRow | OursOutlineRow | BrokenOutlineRow;
/** A row lookup the guard accepts: a Map (any realm) or a plain record. */
export type SectionsLookup = Map<string, RowEntry> | Record<string, RowEntry> | null | undefined;
/**
 * @purpose Orders for the drag-and-drop INSERTION BOUNDARIES of an outline:
 *   entry i is the gap before `rows[i]`, and the last entry is the gap after
 *   the final row — so built-in rows are valid neighbours/targets too.
 * @invariants Integers only — never a midpoint/`.5`. Copying a built-in's
 *   order would let the host's "our section before the built-in at equal
 *   order" rule hoist it above that built-in, so dropping BELOW a built-in
 *   yields its order + 1. A result equal to the NEXT row's order is fine:
 *   equal orders are legal and `dropAt` also moves the ref in the profile,
 *   so the tie-break resolves to the dropped position.
 */
export declare function insertionOrders(rows: ReadonlyArray<BoundaryRow> | null | undefined): number[];
/**
 * @purpose Gate for the section autosave: only a row CONFIRMED in /state and
 *   carrying a NON-EMPTY (trimmed) title may be written. The empty-title
 *   request (`value.title must be a non-empty string`) and the pre-poll
 *   write are both blocked here.
 */
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
/** @purpose Locale key for a section-ref scope value (single mapping shared
 *   by the scope menu and the used-in line, so none render the raw enum). */
export declare function scopeKeyOf(scope: string | null | undefined): "scopeMainOnly" | "scopeSubagentsOnly" | "scopeInherit";
/**
 * @purpose Build the post-rename notice. The host no longer rewrites profile
 *   references, so a successful rename reports any profile that still points
 *   at the old id (title, id fallback). An empty, non-array or ABSENT
 *   `affectedProfiles` (older host response) means there is nothing to flag:
 *   the rename itself is the confirmation and no notice is shown.
 */
export declare function renameNotice(result: {
    affectedProfiles?: ReadonlyArray<{
        profileId?: string;
        title?: string;
    }>;
} | null | undefined, t: Translate): string | null;
/**
 * @purpose Merge a profile's section refs with the built-in mirror into an
 *   ordered outline: builtin rows (grey, read-only), ours rows, broken refs
 *   (missing/disabled). Orders are the PERSISTED ones — no +0.5 half-step is
 *   computed or displayed; an order equal to a built-in is normal.
 */
export declare function outlineRows(profile: {
    sections?: ReadonlyArray<SectionRef>;
} | null | undefined, sectionsById: SectionsLookup, builtinOrders: Record<string, number> | null | undefined): OutlineRow[];
/** @purpose Case-insensitive search over section title and id. */
export declare function filterSections(sections: ReadonlyArray<RowEntry>, query: unknown): RowEntry[];
/** A collapsed run of built-in entries. */
export interface BuiltinsPreviewPlanItem {
    kind: "builtins";
    names: string[];
}
/** One of our sections, in final order. */
export interface OursPreviewPlanItem {
    kind: "ours";
    id?: string;
    title?: string;
    order?: number;
    text?: string;
}
/** One render-plan entry: a collapsed run of built-ins or one of our sections. */
export type PreviewPlanItem = BuiltinsPreviewPlanItem | OursPreviewPlanItem;
export interface PreviewPlan {
    plan: PreviewPlanItem[];
    skipped: Array<{
        id?: string;
        title: string;
        reason: string;
    }>;
    variables: Record<string, string | null> | null;
}
/**
 * @purpose Map the host preview response into a render plan: consecutive
 *   built-in entries collapse into one placeholder group, ours sections
 *   keep order/title/text, skipped sections carry their reason.
 */
export declare function previewPlan(response: PreviewResponse | null | undefined): PreviewPlan;
/** @purpose The `{{name}}` variables a piece of text references (unique, ordered). */
export declare function previewVariableNames(text: unknown): string[];
/**
 * @purpose Which interpolation variables make this preview item
 *   ILLUSTRATIVE rather than exact. A preview is assembled without the
 *   session, so the host substitutes its OWN cwd and leaves `{{model}}`
 *   literal: the value it used cannot be proven equal to the session's (and
 *   `null`/absent means unknown). Returns the names to flag, or `null` when
 *   the item uses no variables — never a made-up value.
 */
export declare function previewVariableNotice(text: unknown, body: unknown, variables?: Record<string, string | null> | null, sessionValues?: Record<string, string> | null): string[] | null;
/** How long a burst of mutations is coalesced before the chip re-reads /state. */
export declare const PROFILES_REFRESH_DEBOUNCE_MS = 150;
export declare function notifyProfilesChanged(): void;
export declare function subscribeProfilesChanged(listener: (seq: number) => void): () => void;
/** @purpose Duck-typed error message (cross-realm-safe, unlike instanceof). */
export declare function errText(err: unknown): string;
/** The pure helpers, exported on the module object for the shim test. */
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
