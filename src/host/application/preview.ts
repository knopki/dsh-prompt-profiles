/**
 * #region moduleContract
 * @modulecontract
 * @purpose Show what a profile would contribute BEFORE a session starts,
 *   without pretending to be the runtime text.
 * @scope The `preview` document only: selection, placeholders, ordered merge,
 *   and the variables actually used.
 *  - NOT: the sealed runtime text or any write.
 * @invariants
 *  - The preview is ILLUSTRATIVE: only a supplied `cwd` is filled host-side,
 *    every other variable stays literal with a `null` value.
 *  - Selection and splice order reuse the sealer's rules, so preview and
 *    runtime cannot disagree about which sections contribute.
 * #endregion moduleContract
 */

import {
  findRow,
  InvalidInputError,
  NotFoundError,
  planInsertion,
  SKIP_REASONS,
  sectionSkipReason,
  sortByOrder,
} from "../domain/index.ts";
import type { UseCaseEnv } from "./env.ts";

/** A section as the preview shows it: interpolated leniently, always emitting. */
interface PreviewSection {
  id: string;
  title: string;
  order: number;
  scope: string;
  text: string;
  emits: true;
}

/** A built-in placeholder at its real engine order. */
interface PreviewBuiltin {
  kind: "builtin";
  name: string;
  title: string;
  order: number;
}

/** One reference that contributes nothing, with the runtime reason. */
interface PreviewSkip {
  id: string;
  title: string;
  reason: string;
}

export interface PreviewResult {
  profileId: string;
  title: string;
  sections: Array<PreviewSection | PreviewBuiltin>;
  skipped: PreviewSkip[];
  variables: Record<string, string | null>;
}

/** The raw query/body fields `preview` reads; a missing profileId is rejected. */
export interface PreviewRequest {
  profileId?: unknown;
  cwd?: unknown;
}

// #region FUNC_previewResponse
/**
 * @purpose Build the ILLUSTRATIVE preview document for a profile: lenient
 *   interpolation (only a supplied cwd is substituted), malformed references
 *   kept literal with their section skipped, unknown variables reported null.
 */
function previewResponse(env: UseCaseEnv, profileId: string, { cwd }: { cwd?: unknown } = {}): PreviewResult {
  const { registry, orders } = env.ports;
  const profile = findRow(registry.profiles(), profileId);
  if (!profile) throw new NotFoundError(`profile "${profileId}" is not registered`);
  const sectionsById = new Map(registry.sections().map((row) => [row.id, row]));
  const builtinOrdersByName = orders.ordersByName();
  // No supplied cwd means no substitution and a null cwd variable — never the host cwd.
  const sessionCwd = typeof cwd === "string" && cwd !== "" ? cwd : undefined;
  // Variables actually referenced by the rendered text (null = substituted at session start).
  const usedVariables = new Set<string>();
  let malformedRefs: string[] = [];
  const interpolate = (text: string): string =>
    text.replace(/\{\{([^{}]*)\}\}/g, (match, name: string) => {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        malformedRefs.push(match);
        return match;
      }
      usedVariables.add(name);
      return name === "cwd" && sessionCwd !== undefined ? sessionCwd : match;
    });
  // Profile order = insertion order (stable on equal orders), the same sort
  // planInsertion performs.
  const planned = sortByOrder(profile.sections);
  const ours: PreviewSection[] = [];
  const skipped: PreviewSkip[] = [];
  for (const ref of planned) {
    const section = sectionsById.get(ref.id);
    // Runtime selection rule (main agent): inherit + main-only emit,
    // subagents-only is skipped with a reason.
    const reason = sectionSkipReason(ref, section, { subagent: false, fork: false });
    if (reason !== null || section === undefined) {
      skipped.push({ id: ref.id, title: section?.title ?? ref.id, reason: reason ?? SKIP_REASONS.sectionNotFound });
      continue;
    }
    malformedRefs = [];
    const text = interpolate(section.body);
    if (malformedRefs.length > 0) {
      skipped.push({
        id: ref.id,
        title: section.title,
        reason: `malformed prompt variable reference ${malformedRefs[0]} (references are complete simple {{name}} groups)`,
      });
      continue;
    }
    ours.push({
      id: section.id,
      title: section.title,
      order: ref.order,
      scope: ref.scope ?? "inherit",
      text,
      emits: true,
    });
  }
  // Built-in placeholders in ENGINE order (order, then name) — the order the
  // assembled array already has before our sections are spliced in.
  const builtins = Object.entries(builtinOrdersByName)
    .map(([name, order]) => ({ kind: "builtin" as const, name, title: name, order }))
    .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // Splice our sections with the SAME base-index plan the assembler uses
  // (descending, so earlier indices stay valid and equal indices keep the
  // profile order). `ours` is already in planInsertion's sort order, so
  // plan[i] corresponds to ours[i].
  const plan = planInsertion({
    snapshot: { sections: ours.map((row) => ({ id: row.id, order: row.order, text: row.text })) },
    assemblySections: builtins.map((row) => ({ name: row.name })),
    builtinOrdersByName,
  });
  const merged: Array<PreviewSection | PreviewBuiltin> = builtins.slice();
  for (let i = plan.length - 1; i >= 0; i--) merged.splice(plan[i].index, 0, ours[i]);
  const variables = Object.fromEntries(
    [...usedVariables].sort().map((name) => [name, name === "cwd" && sessionCwd !== undefined ? sessionCwd : null]),
  );
  return { profileId, title: profile.title, sections: merged, skipped, variables };
}
// #endregion FUNC_previewResponse

// #region FUNC_createPreviewCases
/** @purpose Build the preview use case over the shared environment. */
export function createPreviewCases(env: UseCaseEnv) {
  return {
    // #region METHOD_preview
    /** @purpose Illustrative preview of `profileId`, optionally against a session cwd. */
    preview: (input?: PreviewRequest): PreviewResult => {
      const profileId = input?.profileId;
      if (typeof profileId !== "string" || profileId === "") {
        throw new InvalidInputError('preview: query parameter "profileId" is required');
      }
      return previewResponse(env, profileId, { cwd: input?.cwd });
    },
    // #endregion METHOD_preview
  };
}
// #endregion FUNC_createPreviewCases
