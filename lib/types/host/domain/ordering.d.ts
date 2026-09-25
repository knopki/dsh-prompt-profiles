/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the pure ordering rules — which reference contributes nothing
 *   to an assembly and where the contributing text is spliced in — so the
 *   runtime sealer and the host preview can never disagree about selection or
 *   placement.
 * @scope
 *  - The section skip predicate and its reason vocabulary, order-preserving
 *    sorting, and built-in-anchored insertion planning (BASE indices).
 *  - NOT: interpolation itself (the sealer and the preview interpolate by
 *    their own strictness rule), the assembly, storage, or the plugin.
 * @invariants
 *  - Scope is evaluated BEFORE existence and state, so a scope-filtered
 *    reference is skipped for the same reason the runtime would give.
 *  - A reference's order is used EXACTLY as stated: an order equal to a
 *    built-in or to a peer is never shifted or normalized.
 *  - planInsertion returns BASE indices into the ORIGINAL assembly array;
 *    consumers splice from LAST to FIRST.
 * @keywords skip reason, scope, insertion index, order, planning
 * #endregion moduleContract
 */
import type { AssemblySection, PlannedInsertion, Section, SectionRef, SnapshotSection } from "./model.ts";
/** The exact reason strings a skipped reference carries. */
export declare const SKIP_REASONS: {
    readonly mainOnlyInSubagent: "scope main-only in a subagent";
    readonly subagentsOnlyOutsidePlainSubagent: "scope subagents-only outside a plain subagent";
    readonly sectionNotFound: "section not found";
    readonly sectionDisabled: "section disabled";
    readonly emptyBody: "empty body";
    readonly emptyAfterInterpolation: "empty after interpolation";
};
/** Reason for a scope value outside the domain vocabulary. */
export declare function unknownScopeReason(scope: string): string;
/** Reason for a body that could not be interpolated against this assembly. */
export declare function interpolationSkipReason(error: unknown): string;
/**
 * THE shared selection rule: why a profile reference contributes NOTHING to an
 * assembly, or null when it does contribute. Interpolation is NOT part of this
 * predicate — the sealer resolves it against live variables and skips on
 * failure while the preview interpolates leniently.
 */
export declare function sectionSkipReason(ref: Pick<SectionRef, "id" | "scope"> | undefined, section: Section | undefined, { subagent, fork }?: {
    subagent?: boolean;
    fork?: boolean;
}): string | null;
/** Detached copy in ascending `order`, ties keeping the input order. */
export declare function sortByOrder<T extends {
    order: number;
}>(rows: readonly T[]): T[];
/**
 * Where our sections must be spliced into an already-sorted
 * `assembly.sections` array. Assembly entries carry no `order` — only a
 * built-in NAME present in that assembly can anchor, so a mirror entry absent
 * from the assembly and foreign names never count.
 *
 * Rule: order `o` goes immediately AFTER the last element whose built-in order
 * is known and `< o` (0 when none); an order EQUAL to a present built-in lands
 * just before it.
 *
 * @returns rows aligned with `sectionOrders`, each `index` a position in the
 *   ORIGINAL array — splice from LAST to FIRST.
 */
export declare function insertionIndex(sectionOrders: readonly number[], presentBuiltinNames: readonly string[] | null | undefined, builtinOrders: Record<string, number> | null | undefined): Array<{
    order: number;
    index: number;
}>;
/**
 * @purpose Place sealed sections against the built-ins actually present,
 *   preserving profile order on equal orders. Unknown/foreign entries never
 *   anchor; without an earlier known built-in, insertion starts at index zero.
 */
export declare function planInsertion({ snapshot, assemblySections, builtinOrdersByName, }: {
    snapshot?: {
        sections: SnapshotSection[];
    } | null;
    assemblySections: readonly AssemblySection[];
    builtinOrdersByName?: Record<string, number> | null;
}): PlannedInsertion[];
