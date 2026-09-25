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

import { errorMessage } from "./errors.ts";
import type { AssemblySection, PlannedInsertion, Section, SectionRef, SnapshotSection } from "./model.ts";

// #region CONST_skipReasons
/** The exact reason strings a skipped reference carries. */
export const SKIP_REASONS = {
  mainOnlyInSubagent: "scope main-only in a subagent",
  subagentsOnlyOutsidePlainSubagent: "scope subagents-only outside a plain subagent",
  sectionNotFound: "section not found",
  sectionDisabled: "section disabled",
  emptyBody: "empty body",
  emptyAfterInterpolation: "empty after interpolation",
} as const;

// #endregion CONST_skipReasons

// #region FUNC_skipReasonText
/** Reason for a scope value outside the domain vocabulary. */
export function unknownScopeReason(scope: string): string {
  return `unknown scope "${scope}"`;
}

/** Reason for a body that could not be interpolated against this assembly. */
export function interpolationSkipReason(error: unknown): string {
  return `interpolation failed: ${errorMessage(error)}`;
}
// #endregion FUNC_skipReasonText

// #region FUNC_sectionSkipReason
/**
 * THE shared selection rule: why a profile reference contributes NOTHING to an
 * assembly, or null when it does contribute. Interpolation is NOT part of this
 * predicate — the sealer resolves it against live variables and skips on
 * failure while the preview interpolates leniently.
 */
export function sectionSkipReason(
  ref: Pick<SectionRef, "id" | "scope"> | undefined,
  section: Section | undefined,
  { subagent = false, fork = false }: { subagent?: boolean; fork?: boolean } = {},
): string | null {
  const scope = ref?.scope ?? "inherit";
  if (scope === "main-only" && subagent) return SKIP_REASONS.mainOnlyInSubagent;
  if (scope === "subagents-only" && (!subagent || fork)) return SKIP_REASONS.subagentsOnlyOutsidePlainSubagent;
  if (scope !== "inherit" && scope !== "main-only" && scope !== "subagents-only") return unknownScopeReason(scope);
  if (!section) return SKIP_REASONS.sectionNotFound;
  if (section.disabled) return SKIP_REASONS.sectionDisabled;
  if (typeof section.body !== "string" || !section.body.trim()) return SKIP_REASONS.emptyBody;
  return null;
}
// #endregion FUNC_sectionSkipReason

// #region FUNC_sortByOrder
/** Detached copy in ascending `order`, ties keeping the input order. */
export function sortByOrder<T extends { order: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.order - b.order);
}
// #endregion FUNC_sortByOrder

// #region FUNC_insertionIndex
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
export function insertionIndex(
  sectionOrders: readonly number[],
  presentBuiltinNames: readonly string[] | null | undefined,
  builtinOrders: Record<string, number> | null | undefined,
): Array<{ order: number; index: number }> {
  const knownOrders: Array<number | null> = [];
  for (const name of presentBuiltinNames ?? []) {
    const order = builtinOrders?.[name];
    knownOrders.push(typeof order === "number" && Number.isFinite(order) ? order : null);
  }
  return [...(sectionOrders ?? [])].map((order) => {
    if (!Number.isFinite(order)) throw new TypeError(`insertionIndex: non-finite order ${order}`);
    let index = 0;
    for (let i = 0; i < knownOrders.length; i++) {
      const known = knownOrders[i];
      if (known !== null && known < order) index = i + 1;
    }
    return { order, index };
  });
}
// #endregion FUNC_insertionIndex

// #region FUNC_planInsertion
/**
 * @purpose Place sealed sections against the built-ins actually present,
 *   preserving profile order on equal orders. Unknown/foreign entries never
 *   anchor; without an earlier known built-in, insertion starts at index zero.
 */
export function planInsertion({
  snapshot,
  assemblySections,
  builtinOrdersByName,
}: {
  snapshot?: { sections: SnapshotSection[] } | null;
  assemblySections: readonly AssemblySection[];
  builtinOrdersByName?: Record<string, number> | null;
}): PlannedInsertion[] {
  if (!snapshot?.sections?.length) return [];
  const names = assemblySections.map((section) => section.name);
  const sorted = snapshot.sections
    .map((section, position) => ({ section, position }))
    .sort((a, b) => a.section.order - b.section.order || a.position - b.position);
  const orders = sorted.map(({ section }) => section.order);
  const anchors = insertionIndex(orders, names, builtinOrdersByName);
  return sorted.map(({ section }, position) => ({
    name: `prompt-profile:${section.id}`,
    text: section.text,
    // Sealed text is final: the engine must not interpolate it again, so a
    // literal `{{` in the body can never break rendering.
    interpolate: false as const,
    index: anchors[position].index,
  }));
}
// #endregion FUNC_planInsertion
