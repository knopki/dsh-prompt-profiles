/**
 * #region moduleContract
 * @modulecontract
 * @purpose Keep preview and sealing consistent about section eligibility and insertion.
 * @scope Selection, ordering, insertion; NOT interpolation or storage.
 * @invariants
 *  - Scope is evaluated before existence and state.
 *  - Planned indices address the original assembly array; consumers splice last to first.
 * #endregion moduleContract
 */
import type { AssemblySection, PlannedInsertion, Section, SectionRef, SnapshotSection } from "./model.ts";
export declare const SKIP_REASONS: {
    readonly mainOnlyInSubagent: "scope main-only in a subagent";
    readonly subagentsOnlyOutsidePlainSubagent: "scope subagents-only outside a plain subagent";
    readonly sectionNotFound: "section not found";
    readonly sectionDisabled: "section disabled";
    readonly emptyBody: "empty body";
    readonly emptyAfterInterpolation: "empty after interpolation";
};
/**
 * @purpose Explain a body that could not be interpolated against this assembly.
 */
export declare function interpolationSkipReason(error: unknown): string;
/**
 * @purpose Decide whether a section contributes text: true only for a string body with non-whitespace content.
 */
export declare function sectionEmits(section: Pick<Section, "body"> | null | undefined): boolean;
/**
 * @purpose Explain why a profile reference contributes nothing: scope/state eligibility, never interpolation.
 */
export declare function sectionSkipReason(ref: Pick<SectionRef, "id" | "scope"> | undefined, section: Section | undefined, { subagent, fork }?: {
    subagent?: boolean;
    fork?: boolean;
}): string | null;
/**
 * @purpose Return a detached copy in ascending order, keeping input order on ties.
 */
export declare function sortByOrder<T extends {
    order: number;
}>(rows: readonly T[]): T[];
/**
 * @purpose Map orders to base indices in the original assembly: after the last known built-in order below each.
 */
export declare function insertionIndex(sectionOrders: readonly number[], presentBuiltinNames: readonly string[] | null | undefined, builtinOrders: Record<string, number> | null | undefined): Array<{
    order: number;
    index: number;
}>;
/**
 * @purpose Place sealed sections against the built-ins actually present, preserving profile order on ties.
 */
export declare function planInsertion({ snapshot, assemblySections, builtinOrdersByName, }: {
    snapshot?: {
        sections: SnapshotSection[];
    } | null;
    assemblySections: readonly AssemblySection[];
    builtinOrdersByName?: Record<string, number> | null;
}): PlannedInsertion[];
