/**
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve and seal a session's chosen prompt profile into
 *   immutable-by-convention text, independently of Cordis.
 * @scope
 *  - Profile selection, seal-time interpolation, once-per-session decision
 *    pinning, and a retry-on-failure promise cache for storage opens.
 *  - Selection and insertion RULES live in domain/ordering.ts and are
 *    re-exported here for the consumers that reach them through this module.
 *  - NOT: plugin lifecycle or storage implementation.
 * @invariants
 *  - A persisted snapshot is NEVER rebuilt from live configuration — an EMPTY
 *    one included, so a session that started without a profile stays
 *    unprofiled (SPEC §2 decision 9).
 *  - Sealed text is FINAL: interpolation resolved at seal time and inserted
 *    with `interpolate: false`.
 *  - The per-session decision is made once per process and survives storage
 *    outages.
 * @keywords profile selection, workspace keys, sealing, interpolation, snapshot
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

// #region TYPE_workspaceRegistry
/** The optional workspace registry the key resolution reads (structural port). */
export interface WorkspaceRegistryLike {
  list?: () => Array<{ id?: string; sessionIds?: readonly string[] }>;
  resolveByPath?: (path: string) => Promise<{ id?: string } | null | undefined> | { id?: string } | null | undefined;
}
// #endregion TYPE_workspaceRegistry

// #region FUNC_resolveWorkspaceKeys
/**
 * @purpose Make the write side of the chip choice (`last` operation) and the
 *   assembler derive the SAME ordered keys, so an explicit choice reaches
 *   `resolveProfileId` and the prompt across both key shapes. The first
 *   candidate is where NEW choices are written; reading walks the whole list,
 *   so a choice stored under a UUID key and one stored under the cwd key for
 *   the same workspace are both honoured.
 *
 * RESOLUTION ORDER (duplicates removed, first hit wins): the workspace
 * registry's membership for THIS session (`list()` + `sessionIds`), the
 * canonical workspace id owning `cwd` (`resolveByPath`), the raw `cwd`, an
 * explicit `workspaceId`. Nothing derivable degrades to [""].
 */
export async function resolveWorkspaceKeys({
  workspaceRegistry,
  session,
  workspaceId,
  cwd,
}: {
  workspaceRegistry?: WorkspaceRegistryLike | null;
  session?: { id?: string } | null;
  workspaceId?: string;
  cwd?: string | null;
} = {}): Promise<string[]> {
  const path = typeof cwd === "string" && cwd !== "" ? cwd : null;
  const candidates: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value !== "" && !candidates.includes(value)) candidates.push(value);
  };
  const sessionId = session?.id;
  if (typeof sessionId === "string" && sessionId !== "" && typeof workspaceRegistry?.list === "function") {
    try {
      const owner = workspaceRegistry.list().find((workspace) => {
        const ids = workspace?.sessionIds;
        return Array.isArray(ids) && ids.includes(sessionId);
      });
      add(owner?.id);
    } catch {
      // registry unavailable/opaque: fall through to path resolution
    }
  }
  if (path !== null && typeof workspaceRegistry?.resolveByPath === "function") {
    try {
      const owner = await workspaceRegistry.resolveByPath(path);
      add(owner?.id);
    } catch {
      // nonexistent/unregistered path: the raw cwd is the fallback key
    }
  }
  add(path);
  add(workspaceId);
  return candidates.length > 0 ? candidates : [""];
}
// #endregion FUNC_resolveWorkspaceKeys

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

// #region FUNC_sealSnapshot
/**
 * @purpose Decide a session's snapshot EXACTLY ONCE and keep it stable: an
 *   already-persisted record — EMPTY INCLUDED — is the session's final
 *   decision, so a session that started without a profile never receives one
 *   mid-session. A fresh decision is memoized and written durable-first (an
 *   explicit empty record for "no profile"); storage failures degrade to the
 *   in-memory decision and are retried on the next assembly.
 */
export async function sealSnapshot<T>({
  sessionId,
  createSnapshot,
  memo,
  openTable,
  warn = () => {},
}: {
  sessionId: string;
  createSnapshot: () => T;
  memo: Map<string, { snapshot: T; persisted: boolean }>;
  openTable: () => Promise<{ get(key: string): T | undefined; put(key: string, value: T): unknown }>;
  warn?: (message: string, details?: unknown) => void;
}): Promise<T> {
  let entry = memo.get(sessionId);
  if (entry === undefined) {
    let snapshot: T;
    let persisted = false;
    try {
      const table = await openTable();
      const saved = table.get(sessionId);
      if (saved !== undefined) {
        // Any persisted record — empty included — is the final decision.
        snapshot = saved;
        persisted = true;
      } else {
        snapshot = createSnapshot();
      }
    } catch (error) {
      warn("prompt-profiles storage unavailable; snapshot decision pinned in memory", { sessionId, error });
      snapshot = createSnapshot();
    }
    entry = { snapshot, persisted };
    memo.set(sessionId, entry);
  }
  if (!entry.persisted) {
    try {
      const table = await openTable();
      // Never clobber a record that landed concurrently.
      if (table.get(sessionId) === undefined) await table.put(sessionId, entry.snapshot);
      entry.persisted = true;
    } catch {
      // Still down: the in-memory decision stays authoritative, retried on the
      // next assembly.
    }
  }
  return entry.snapshot;
}
// #endregion FUNC_sealSnapshot

// #region FUNC_retryingCache
/** A cached async getter that also exposes the pending promise without starting one. */
export type RetryingCache<T> = (() => Promise<T>) & { cached: () => Promise<T> | null };

/**
 * @purpose Cache a pending asynchronous open (storage domain) but DROP the
 *   cache on rejection, so a transient failure disables nothing permanently —
 *   the next call starts a fresh attempt.
 * @invariants A fulfilled promise stays cached forever; a rejected one is
 *   removed synchronously before the rejection propagates.
 */
export function retryingCache<T>(create: () => Promise<T>): RetryingCache<T> {
  let cached: Promise<T> | null = null;
  const get = () => {
    cached ??= Promise.resolve()
      .then(create)
      .then(
        (value) => value,
        (error) => {
          cached = null;
          throw error;
        },
      );
    return cached;
  };
  return Object.assign(get, { cached: () => cached });
}
// #endregion FUNC_retryingCache
