/**
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve a session's chosen prompt profile and freeze its FINAL text,
 *   independently of Cordis.
 * @scope
 *  - Profile selection, seal-time interpolation and the snapshot builder.
 *  - Selection and insertion RULES live in domain/ordering.ts and are
 *    re-exported here for the consumers that reach them through this module.
 *  - NOT: durable storage (infra/session-snapshots.ts), workspace key
 *    resolution (infra/workspace-adapter.ts), plugin lifecycle.
 * @invariants
 *  - Sealed text is FINAL: interpolation resolved at seal time and inserted
 *    with `interpolate: false`.
 * @keywords profile selection, sealing, interpolation, snapshot
 * #endregion moduleContract
 */

import { errorMessage } from "./domain/errors.ts";
import type { Profile, Section, Snapshot, SnapshotSection } from "./domain/model.ts";
import { interpolationSkipReason, planInsertion, SKIP_REASONS, sectionSkipReason } from "./domain/ordering.ts";

export { planInsertion, sectionSkipReason };

// #region TYPE_agent
/** The part of a Cordis agent the subagent classification reads. */
export interface AgentLike {
  session?: { header?: { origin?: string; isSeeded?: boolean } };
}
// #endregion TYPE_agent

// #region FUNC_resolveProfileId
/**
 * @purpose Select a live profile by workspace override then default, rejecting
 *   stale ids without changing settings. Reads an ORDERED list of workspace
 *   candidates: the FIRST candidate PRESENT in `lastByWorkspace` decides — an
 *   explicit "" (none) beats the default, a valid id wins, and a
 *   present-but-stale id falls back to the default with `reset: true`. Only
 *   when NO candidate is present does `default` apply, so a choice stored
 *   under the UUID key and one stored under the cwd key for the same workspace
 *   are both reachable.
 */
export function resolveProfileId({
  lastByWorkspace = {},
  workspaceKey,
  workspaceKeys,
  defaultId,
  profileIds,
}: {
  lastByWorkspace?: Record<string, string>;
  workspaceKey?: string;
  workspaceKeys?: readonly string[];
  defaultId?: string;
  profileIds?: readonly string[];
}): { profileId: string | null; reset: boolean } {
  const ids = new Set(profileIds ?? []);
  const keys = Array.isArray(workspaceKeys) ? workspaceKeys : workspaceKey === undefined ? [] : [workspaceKey];
  const valid = (id: unknown): id is string => typeof id === "string" && id !== "" && ids.has(id);
  for (const key of keys) {
    if (!Object.hasOwn(lastByWorkspace ?? {}, key)) continue; // not decided under this candidate
    const last = lastByWorkspace[key];
    if (last === "") return { profileId: null, reset: false }; // explicit "none" beats default
    if (valid(last)) return { profileId: last, reset: false };
    return { profileId: valid(defaultId) ? defaultId : null, reset: true }; // stale choice
  }
  return { profileId: valid(defaultId) ? defaultId : null, reset: false };
}
// #endregion FUNC_resolveProfileId

// #region FUNC_isSubagent
/** @purpose Classify a delegated child from its durable session header, tolerating absent agent data. */
export function isSubagent(agent: AgentLike | null | undefined): boolean {
  return agent?.session?.header?.origin === "subagent";
}
// #endregion FUNC_isSubagent

// #region FUNC_isFork
/** @purpose Identify a seeded delegated child rather than an unrelated seeded root session. */
export function isFork(agent: AgentLike | null | undefined): boolean {
  return isSubagent(agent) && agent?.session?.header?.isSeeded === true;
}
// #endregion FUNC_isFork

// #region FUNC_interpolateSealedText
/**
 * Seal-time interpolation, byte-compatible with the engine
 * (dsh-system-prompt `interpolate`): strict `{{name}}` groups, `{{` without a
 * later `}}` is literal prose, and any malformed reference, unknown variable
 * or missing value THROWS.
 *
 * @purpose Freeze interpolation into the sealed text so the engine never
 *   re-interpolates it (insertion carries `interpolate: false`). Throwing here
 *   lets the sealer skip the section before unusable text is persisted.
 * @throws Error on unknown or malformed variable references.
 */
const GROUP_AT = /^\{\{([^{}]*)\}\}/;
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
export function interpolateSealedText(sectionId: string, text: string, variables?: Record<string, unknown>): string {
  const known = variables ?? {};
  let result = "";
  let last = 0;
  for (let open = text.indexOf("{{"); open >= 0; open = text.indexOf("{{", last)) {
    const group = GROUP_AT.exec(text.slice(open));
    if (group === null) {
      if (text.indexOf("}}", open + 2) >= 0) {
        throw new Error(
          `malformed prompt variable reference at "${text.slice(open, open + 16)}…" in section "${sectionId}" (references are complete simple {{name}} groups)`,
        );
      }
      result += text.slice(last, open + 2);
      last = open + 2;
      continue;
    }
    const name = group[0].slice(2, -2);
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(
        `malformed prompt variable reference "{{${name}}}" in section "${sectionId}" (variable names match ${String(VARIABLE_NAME)})`,
      );
    }
    if (!Object.hasOwn(known, name)) {
      throw new Error(
        `unknown prompt variable "{{${name}}}" in section "${sectionId}"; registered variables: ${Object.keys(known).join(", ") || "(none)"}`,
      );
    }
    const value = known[name];
    if (value === undefined) {
      throw new Error(`prompt variable "{{${name}}}" has no value for this assembly (section "${sectionId}")`);
    }
    result += text.slice(last, open) + String(value);
    last = open + group[0].length;
  }
  return result + text.slice(last);
}
// #endregion FUNC_interpolateSealedText

// #region FUNC_buildSnapshot
/**
 * @purpose Freeze the chosen sections' FINAL text (interpolation resolved and
 *   validated at seal time) and order at the first assembly, filtering scopes
 *   and absent/empty/uninterpolatable sections. A section whose body cannot be
 *   interpolated against this assembly's variables is SKIPPED with a warning
 *   instead of persisting text the engine would throw on forever.
 * @param options.onSkip diagnostics hook called for EVERY skipped reference
 *   with a short reason; a throwing sink is swallowed here.
 */
export function buildSnapshot({
  profile,
  sectionsById,
  isSubagent: subagent = false,
  isFork: fork = false,
  variables = {},
  warn = () => {},
  onSkip = () => {},
}: {
  profile?: Profile | null;
  sectionsById: Map<string, Section> | Record<string, Section | undefined>;
  isSubagent?: boolean;
  isFork?: boolean;
  variables?: Record<string, unknown>;
  warn?: (message: string, details?: unknown) => void;
  onSkip?: (skip: { id: string; reason: string }) => void;
}): Snapshot {
  const sections: SnapshotSection[] = [];
  const skip = (id: string, reason: string) => {
    try {
      onSkip({ id, reason });
    } catch {
      // diagnostics must never break the sealed decision
    }
  };
  for (const ref of profile?.sections ?? []) {
    const section = sectionsById instanceof Map ? sectionsById.get(ref.id) : sectionsById[ref.id];
    const reason = sectionSkipReason(ref, section, { subagent, fork });
    if (reason !== null || section === undefined) {
      // The rule reports an absent section itself; this guard only narrows the type.
      skip(ref.id, reason ?? SKIP_REASONS.sectionNotFound);
      continue;
    }
    let text: string;
    try {
      text = interpolateSealedText(ref.id, section.body, variables);
    } catch (error) {
      warn(`prompt-profiles section "${ref.id}" skipped: ${errorMessage(error)}`, { sectionId: ref.id });
      skip(ref.id, interpolationSkipReason(error));
      continue;
    }
    if (!text.trim()) {
      skip(ref.id, SKIP_REASONS.emptyAfterInterpolation);
      continue;
    }
    sections.push({ id: ref.id, title: section.title, order: ref.order, text });
  }
  return { profileId: profile?.id ?? null, sections };
}
// #endregion FUNC_buildSnapshot
