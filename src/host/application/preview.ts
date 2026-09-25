/**
 * #region moduleContract
 * @modulecontract
 * @purpose Show the user what a profile would contribute BEFORE a session
 *   starts, without pretending to be the runtime text.
 * @scope
 *  - The `preview` document only: selection via the shared skip predicate,
 *    built-in placeholders, ordered merge, and the variables actually used.
 *  - NOT: the sealed runtime text (assembler.ts) or any write.
 * @invariants
 *  - The preview is ILLUSTRATIVE: only `{{cwd}}` is filled host-side, every
 *    other variable stays literal and is reported with a `null` value, and
 *    unknown or malformed references are NOT rejected.
 *  - Selection and splice order reuse the SAME rules the sealer applies
 *    (domain/ordering.ts), so preview and runtime cannot disagree about which
 *    sections contribute.
 * @keywords preview, illustrative, variables, cwd, insertion
 * #endregion moduleContract
 */

import {
  findRow,
  InvalidInputError,
  interpolationSkipReason,
  NotFoundError,
  planInsertion,
  SKIP_REASONS,
  sectionSkipReason,
  sortByOrder,
} from "../domain/index.ts";
import type { UseCaseEnv } from "./env.ts";

// #region TYPE_preview
/** A section as the preview shows it: interpolated leniently, always emitting. */
export interface PreviewSection {
  id: string;
  title: string;
  order: number;
  scope: string;
  text: string;
  emits: true;
}

/** A built-in placeholder at its real engine order. */
export interface PreviewBuiltin {
  kind: "builtin";
  name: string;
  title: string;
  order: number;
}

/** One reference that contributes nothing, with the runtime reason. */
export interface PreviewSkip {
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
// #endregion TYPE_preview

// #region FUNC_previewResponse
/**
 * @purpose Build the preview document for `preview({profileId, cwd?})`: an
 *   ILLUSTRATIVE preview, not the runtime text. Built-in sections appear as
 *   `{kind:"builtin", name, order}` placeholders interleaved with our sections
 *   in final order; selection reuses `sectionSkipReason` (the same predicate
 *   `buildSnapshot` applies for the main agent) and the merge reuses
 *   `planInsertion`, BUT interpolation is lenient: `{{cwd}}` is filled with
 *   the session cwd when the input supplies one (otherwise `process.cwd()`),
 *   every other variable stays literal, and unknown or malformed references
 *   are NOT rejected. Real values are substituted when the session starts, so
 *   the response reports exactly which variables were used and what (if
 *   anything) was substituted — `null` means unknown — for the client to flag
 *   as illustrative. The sealed snapshot remains the ONLY runtime truth.
 */
function previewResponse(env: UseCaseEnv, profileId: string, { cwd }: { cwd?: unknown } = {}): PreviewResult {
  const { registry, orders } = env.ports;
  const profile = findRow(registry.profiles(), profileId);
  if (!profile) throw new NotFoundError(`profile "${profileId}" is not registered`);
  const sectionsById = new Map(registry.sections().map((row) => [row.id, row]));
  const builtinOrdersByName = orders.ordersByName();
  const sessionCwd = typeof cwd === "string" && cwd !== "" ? cwd : process.cwd();
  // Variables actually referenced by the rendered text, with the value the
  // preview substituted (null = unknown host-side / substituted at session start).
  const usedVariables = new Set<string>();
  const interpolate = (text: string) =>
    text.replace(/\{\{([^{}]*)\}\}/g, (match, name: string) => {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) return match; // malformed: left literal
      usedVariables.add(name);
      return name === "cwd" ? sessionCwd : match; // only cwd is known host-side
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
    let text = "";
    try {
      text = interpolate(section.body);
    } catch (error) {
      skipped.push({ id: ref.id, title: section.title, reason: interpolationSkipReason(error) });
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
    snapshot: { sections: ours.map((row) => ({ id: row.id, title: row.title, order: row.order, text: row.text })) },
    assemblySections: builtins.map((row) => ({ name: row.name })),
    builtinOrdersByName,
  });
  const merged: Array<PreviewSection | PreviewBuiltin> = builtins.slice();
  for (let i = plan.length - 1; i >= 0; i--) merged.splice(plan[i].index, 0, ours[i]);
  const variables = Object.fromEntries(
    [...usedVariables].sort().map((name) => [name, name === "cwd" ? sessionCwd : null]),
  );
  return { profileId, title: profile.title, sections: merged, skipped, variables };
}
// #endregion FUNC_previewResponse

// #region FUNC_createPreviewCases
/** @purpose Build the preview use case over the shared environment. */
export function createPreviewCases(env: UseCaseEnv) {
  return {
    /** Illustrative preview of `profileId`, optionally against a session cwd. */
    preview: (input?: PreviewRequest): PreviewResult => {
      const profileId = input?.profileId;
      if (typeof profileId !== "string" || profileId === "") {
        throw new InvalidInputError('preview: query parameter "profileId" is required');
      }
      return previewResponse(env, profileId, { cwd: input?.cwd });
    },
  };
}
// #endregion FUNC_createPreviewCases
