/**
 * #region moduleContract
 * @modulecontract
 * @purpose Turn the configured profiles into a session's FINAL prompt text:
 *   pick the profile, seal its sections once per session, and splice them into
 *   the live assembly.
 * @scope
 *  - Profile selection, seal-time interpolation, the snapshot builder, and the
 *    sealing use case that owns the whole assembly step.
 *  - Selection and insertion RULES live in domain/ordering.ts and are
 *    re-exported here for the consumers that reach them through this module.
 *  - NOT: durable storage (infra/session-snapshots.ts), workspace key
 *    resolution (infra/workspace-adapter.ts), plugin lifecycle
 *    (entrypoints/plugin.ts).
 * @invariants
 *  - Sealed text is FINAL: interpolation is resolved at seal time and inserted
 *    with `interpolate: false`.
 *  - A session's decision is made once and survives a storage outage.
 *  - Diagnostics go through a GUARDED sink: broken logging can never fail an
 *    assembly.
 * @keywords profile selection, sealing, interpolation, snapshot, assembler
 * #endregion moduleContract
 */

import { errorMessage } from "../domain/errors.ts";
import type { Profile, Section, Snapshot, SnapshotSection } from "../domain/model.ts";
import { interpolationSkipReason, planInsertion, SKIP_REASONS, sectionSkipReason } from "../domain/ordering.ts";
import type {
  BuiltinOrdersPort,
  LoaderRegistryPort,
  LogPort,
  SessionSnapshotsPort,
  WorkspaceKeysPort,
} from "./ports.ts";

export { planInsertion, sectionSkipReason };

// #region TYPE_agent
/** The part of a Cordis agent the subagent classification and key lookup read. */
export interface AssemblyAgent {
  session?: {
    id?: string;
    header?: { cwd?: string | null; origin?: string; isSeeded?: boolean };
  };
}

/** The second argument of the `system-prompt/assemble` event. */
export interface AssemblyContext {
  agent?: AssemblyAgent | null;
}
// #endregion TYPE_agent

// #region TYPE_assembly
/** One engine assembly entry; sections are identified by `name` only. */
export interface AssemblyEntry {
  name: string;
  [key: string]: unknown;
}

/** The live assembly the sealing step reads and splices into. */
export interface PromptAssembly {
  sections: AssemblyEntry[];
  variables?: Record<string, unknown>;
}
// #endregion TYPE_assembly

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

// #region FUNC_classify
/** @purpose Classify a delegated child from its durable session header, tolerating absent agent data. */
export function isSubagent(agent: AssemblyAgent | null | undefined): boolean {
  return agent?.session?.header?.origin === "subagent";
}

/** @purpose Identify a seeded delegated child rather than an unrelated seeded root session. */
export function isFork(agent: AssemblyAgent | null | undefined): boolean {
  return isSubagent(agent) && agent?.session?.header?.isSeeded === true;
}
// #endregion FUNC_classify

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
    sections.push({ id: ref.id, order: ref.order, text });
  }
  return { sections };
}
// #endregion FUNC_buildSnapshot

// #region TYPE_assembler
/** Everything the sealing use case reads from the host. */
export interface AssemblerPorts {
  registry: LoaderRegistryPort;
  orders: BuiltinOrdersPort;
  workspaces: WorkspaceKeysPort;
  snapshots: SessionSnapshotsPort;
  log?: LogPort;
}

/** One request of the sealing step: the agent behind it and the live assembly. */
export interface SealRequest {
  agent?: AssemblyAgent | null;
  assembly: PromptAssembly;
}
// #endregion TYPE_assembler

// #region FUNC_createPromptAssembler
/**
 * @purpose Own the whole assembly step — workspace keys, profile selection,
 *   the once-per-session seal, and the ordered splice — so the Cordis
 *   entrypoint only reads the event arguments and calls one method.
 */
export function createPromptAssembler(ports: AssemblerPorts) {
  const log = (level: keyof LogPort, message: string, details?: unknown): void => {
    try {
      ports.log?.[level]?.(message, details ?? "");
    } catch {
      // diagnostics only
    }
  };

  return {
    async apply({ agent, assembly }: SealRequest): Promise<void> {
      const session = agent?.session;
      if (!session?.id || !Array.isArray(assembly?.sections)) return;
      try {
        // The workspace key candidates MUST include the one `/last` wrote (see
        // infra/workspace-adapter.ts): registry membership first, then the
        // ASYNC resolveByPath(cwd) id, then the raw cwd. Reading walks them in
        // order, so a legacy path-keyed choice is still found.
        const cwd = session.header?.cwd ?? null;
        const workspaceKeys = await ports.workspaces.keys({ session, cwd });
        const workspaceKey = workspaceKeys[0] ?? "";
        const snapshot = await ports.snapshots.seal(session.id, () => {
          const skips: Array<{ id: string; reason: string }> = [];
          const profiles = ports.registry.profiles();
          const { profileId, reset } = resolveProfileId({
            lastByWorkspace: ports.registry.lastByWorkspace(),
            workspaceKeys,
            defaultId: ports.registry.defaultId(),
            profileIds: profiles.map((profile) => profile.id),
          });
          if (reset) {
            log("debug", "prompt-profiles stale workspace choice reset", {
              sessionId: session.id,
              workspaceKey,
            });
          }
          const profile = profiles.find((row) => row.id === profileId);
          const sections = new Map(ports.registry.sections().map((row) => [row.id, row]));
          for (const ref of profile?.sections ?? []) {
            if (!sections.has(ref.id)) log("warn", "prompt-profiles missing section", { profileId, sectionId: ref.id });
          }
          const sealed = buildSnapshot({
            profile,
            sectionsById: sections,
            isSubagent: isSubagent(agent),
            isFork: isFork(agent),
            // Seal-time interpolation: variables of THIS assembly, final text
            // stored, never re-interpolated.
            variables: assembly.variables ?? {},
            warn: (message, details) => log("warn", message, details),
            onSkip: (skip) => skips.push(skip),
          });
          // Kept deliberately: the user can send these lines when a chip choice
          // does not reach the prompt.
          log("info", "prompt-profiles seal", {
            sessionId: session.id,
            workspaceKey,
            profileId,
            selected: sealed.sections.length,
            skipped: skips.length,
            skipReasons: skips,
            sectionIds: sealed.sections.map((section) => section.id),
          });
          return sealed;
        });
        if (snapshot.sections.length) {
          // planInsertion returns BASE indices into the original array; splicing
          // from LAST to FIRST keeps earlier indices valid and preserves
          // ascending order. The profile's order reaches the assembly
          // UNCHANGED — equal orders are never shifted.
          const planned = planInsertion({
            snapshot,
            assemblySections: assembly.sections,
            builtinOrdersByName: ports.orders.ordersByName(),
          });
          for (let i = planned.length - 1; i >= 0; i--) {
            const { index, ...entry } = planned[i];
            assembly.sections.splice(index, 0, entry);
          }
          log("debug", "prompt-profiles inserted", {
            sessionId: session.id,
            workspaceKey,
            inserted: planned.map((entry) => ({ name: entry.name, index: entry.index })),
            assemblySections: assembly.sections.length,
          });
        } else {
          log("info", "prompt-profiles: no sections to insert", {
            sessionId: session.id,
            workspaceKey,
            assemblySections: assembly.sections.length,
          });
        }
      } catch (error) {
        log("warn", "prompt-profiles snapshot unavailable; prompt unchanged", { sessionId: session.id, error });
      }
    },
  };
}
// #endregion FUNC_createPromptAssembler
