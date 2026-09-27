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

import { errorMessage } from "./errors.ts";
import type { AssemblySection, PlannedInsertion, Section, SectionRef, SnapshotSection } from "./model.ts";

export const SKIP_REASONS = {
  mainOnlyInSubagent: "scope main-only in a subagent",
  subagentsOnlyOutsidePlainSubagent: "scope subagents-only outside a plain subagent",
  sectionNotFound: "section not found",
  sectionDisabled: "section disabled",
  emptyBody: "empty body",
  emptyAfterInterpolation: "empty after interpolation",
} as const;

// #region FUNC_interpolationSkipReason
/**
 * @purpose Explain a body that could not be interpolated against this assembly.
 */
export function interpolationSkipReason(error: unknown): string {
  return `interpolation failed: ${errorMessage(error)}`;
}
// #endregion FUNC_interpolationSkipReason

// #region FUNC_sectionEmits
/**
 * @purpose Decide whether a section contributes text: true only for a string body with non-whitespace content.
 */
export function sectionEmits(section: Pick<Section, "body"> | null | undefined): boolean {
  return typeof section?.body === "string" && section.body.trim() !== "";
}
// #endregion FUNC_sectionEmits

// #region FUNC_sectionSkipReason
/**
 * @purpose Explain why a profile reference contributes nothing: scope/state eligibility, never interpolation.
 */
export function sectionSkipReason(
  ref: Pick<SectionRef, "id" | "scope"> | undefined,
  section: Section | undefined,
  { subagent = false, fork = false }: { subagent?: boolean; fork?: boolean } = {},
): string | null {
  const scope = ref?.scope ?? "inherit";
  if (scope === "main-only" && subagent) return SKIP_REASONS.mainOnlyInSubagent;
  if (scope === "subagents-only" && (!subagent || fork)) return SKIP_REASONS.subagentsOnlyOutsidePlainSubagent;
  if (scope !== "inherit" && scope !== "main-only" && scope !== "subagents-only") return `unknown scope "${scope}"`;
  if (!section) return SKIP_REASONS.sectionNotFound;
  if (section.disabled) return SKIP_REASONS.sectionDisabled;
  if (!sectionEmits(section)) return SKIP_REASONS.emptyBody;
  return null;
}
// #endregion FUNC_sectionSkipReason

// #region FUNC_sortByOrder
/**
 * @purpose Return a detached copy in ascending order, keeping input order on ties.
 */
export function sortByOrder<T extends { order: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.order - b.order);
}
// #endregion FUNC_sortByOrder

// #region FUNC_insertionIndex
/**
 * @purpose Map orders to base indices in the original assembly: after the last known built-in order below each.
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
 * @purpose Place sealed sections against the built-ins actually present, preserving profile order on ties.
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
    // Sealed text is final: the engine must not interpolate it again.
    interpolate: false as const,
    index: anchors[position].index,
  }));
}
// #endregion FUNC_planInsertion
