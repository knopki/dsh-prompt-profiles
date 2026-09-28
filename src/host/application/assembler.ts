/**
 * #region moduleContract
 * @modulecontract
 * @purpose Seal each session's selected profile once, interpolate it, and
 *   splice its sections into the live assembly.
 * @scope Profile selection, seal-time interpolation, the snapshot builder,
 *   and the sealing use case.
 *  - NOT: durable storage, workspace key resolution, or plugin lifecycle.
 * @invariants
 *  - Sealed text is FINAL: interpolation resolves at seal time and inserts
 *    with `interpolate: false`.
 *  - Diagnostics go through a GUARDED sink: broken logging never fails an assembly.
 * #endregion moduleContract
 */

import { errorMessage } from "../domain/errors.ts";
import type { Profile, Section, Snapshot, SnapshotSection } from "../domain/model.ts";
import {
  interpolationSkipReason,
  planInsertion,
  SKIP_REASONS,
  type SkipReason,
  sectionSkipReason,
} from "../domain/ordering.ts";
import type {
  BuiltinOrdersPort,
  LoaderRegistryPort,
  LogPort,
  SessionSnapshotsPort,
  WorkspaceKeysPort,
} from "./ports.ts";

export { planInsertion, sectionSkipReason };

/** The part of a Cordis agent the subagent classification and key lookup read. */
interface AssemblyAgent {
  session?: {
    id?: string;
    header?: { cwd?: string | null; origin?: string; isSeeded?: boolean };
  };
}

/** The second argument of the `system-prompt/assemble` event. */
export interface AssemblyContext {
  agent?: AssemblyAgent | null;
}

/** One engine assembly entry; sections are identified by `name` only. */
interface AssemblyEntry {
  name: string;
  [key: string]: unknown;
}

/** The live assembly the sealing step reads and splices into. */
export interface PromptAssembly {
  sections: AssemblyEntry[];
  variables?: Record<string, unknown>;
}

// #region FUNC_resolveProfileId
/**
 * @purpose Select a live profile from the first present workspace candidate,
 *   with explicit-none beating the default and stale ids falling back
 *   without writes.
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
export function isSubagent(agent: AssemblyAgent | null | undefined): boolean {
  return agent?.session?.header?.origin === "subagent";
}
// #endregion FUNC_isSubagent

// #region FUNC_isFork
/** @purpose Identify a seeded delegated child rather than an unrelated seeded root session. */
export function isFork(agent: AssemblyAgent | null | undefined): boolean {
  return isSubagent(agent) && agent?.session?.header?.isSeeded === true;
}
// #endregion FUNC_isFork

const GROUP_AT = /^\{\{([^{}]*)\}\}/;
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;

// #region FUNC_interpolateSealedText
/**
 * @purpose Freeze interpolation into the sealed text so the engine never
 *   re-interpolates it. Strict `{{name}}` groups only: malformed, unknown, or
 *   missing values throw (letting the sealer skip the section), while a `{{`
 *   with no later `}}` stays literal prose.
 * @throws Error on unknown or malformed variable references.
 */
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
 * @purpose Freeze the chosen sections' FINAL text and order at the first
 *   assembly, filtering scopes and absent/empty/uninterpolatable sections.
 * @param options.onSkip diagnostics hook called for EVERY skipped reference;
 *   a throwing sink is swallowed here.
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
  onSkip?: (skip: { id: string; reason: string; detail?: string }) => void;
}): Snapshot {
  const sections: SnapshotSection[] = [];
  const skip = (id: string, reason: SkipReason) => {
    try {
      onSkip({ id, ...reason });
    } catch {
      // diagnostics must never break the sealed decision
    }
  };
  for (const ref of profile?.sections ?? []) {
    const section = sectionsById instanceof Map ? sectionsById.get(ref.id) : sectionsById[ref.id];
    const reason = sectionSkipReason(ref, section, { subagent, fork });
    if (reason !== null || section === undefined) {
      // The rule reports an absent section itself; this guard only narrows the type.
      skip(ref.id, reason ?? { reason: SKIP_REASONS.sectionNotFound });
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
      skip(ref.id, { reason: SKIP_REASONS.emptyAfterInterpolation });
      continue;
    }
    sections.push({ id: ref.id, order: ref.order, text });
  }
  return { sections };
}
// #endregion FUNC_buildSnapshot

/** Everything the sealing use case reads from the host. */
interface AssemblerPorts {
  registry: LoaderRegistryPort;
  orders: BuiltinOrdersPort;
  workspaces: WorkspaceKeysPort;
  snapshots: SessionSnapshotsPort;
  log?: LogPort;
}

/** One request of the sealing step: the agent behind it and the live assembly. */
interface SealRequest {
  agent?: AssemblyAgent | null;
  assembly: PromptAssembly;
}

// #region FUNC_createPromptAssembler
/**
 * @purpose Own the whole assembly step — workspace keys, profile selection,
 *   the once-per-session seal, and the ordered splice — behind one method.
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
    // #region METHOD_apply
    /** @purpose Seal the session's profile once and splice its sections into the live assembly. */
    async apply({ agent, assembly }: SealRequest): Promise<void> {
      const session = agent?.session;
      // #region BLOCK_validateRequest
      if (!session?.id || !Array.isArray(assembly?.sections)) {
        log("debug", "prompt-profiles assembly skipped: no session id or live sections", {
          sessionId: session?.id ?? null,
          hasSections: Array.isArray(assembly?.sections),
        });
        return;
      }
      // #endregion BLOCK_validateRequest
      try {
        // #region BLOCK_resolveWorkspace
        // Key candidates MUST include the one `/last` wrote (registry id,
        // then resolveByPath(cwd), then raw cwd); reading walks them in order.
        const cwd = session.header?.cwd ?? null;
        const workspaceKeys = await ports.workspaces.keys({ session, cwd });
        const workspaceKey = workspaceKeys[0] ?? "";
        // #endregion BLOCK_resolveWorkspace
        // #region BLOCK_sealSnapshot
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
            log("debug", "prompt-profiles stale workspace choice fell back", {
              sessionId: session.id,
              workspaceKey,
            });
          }
          const profile = profiles.find((row) => row.id === profileId);
          const sections = new Map(ports.registry.sections().map((row) => [row.id, row]));
          const sealed = buildSnapshot({
            profile,
            sectionsById: sections,
            isSubagent: isSubagent(agent),
            isFork: isFork(agent),
            variables: assembly.variables ?? {},
            warn: (message, details) => log("warn", message, details),
            onSkip: (skip) => skips.push(skip),
          });
          // Seal diagnostics include selected and skipped sections for troubleshooting.
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
        // #endregion BLOCK_sealSnapshot
        // #region BLOCK_planInsertion
        if (snapshot.sections.length) {
          const planned = planInsertion({
            snapshot,
            assemblySections: assembly.sections,
            builtinOrdersByName: ports.orders.ordersByName(),
          });
          // #endregion BLOCK_planInsertion
          // #region BLOCK_spliceSections
          // Descending splice keeps earlier base indices valid.
          for (let i = planned.length - 1; i >= 0; i--) {
            const { index, ...entry } = planned[i];
            assembly.sections.splice(index, 0, entry);
          }
          // #endregion BLOCK_spliceSections
          // #region BLOCK_reportAssembly
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
      // #endregion BLOCK_reportAssembly
    },
    // #endregion METHOD_apply
  };
}
// #endregion FUNC_createPromptAssembler
