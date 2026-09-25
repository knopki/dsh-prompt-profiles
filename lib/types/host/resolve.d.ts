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
import type { Profile, Section, Snapshot } from "./domain/model.ts";
import { planInsertion, sectionSkipReason } from "./domain/ordering.ts";
export { planInsertion, sectionSkipReason };
/** The part of a Cordis agent the subagent classification reads. */
export interface AgentLike {
    session?: {
        header?: {
            origin?: string;
            isSeeded?: boolean;
        };
    };
}
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
export declare function resolveProfileId({ lastByWorkspace, workspaceKey, workspaceKeys, defaultId, profileIds, }: {
    lastByWorkspace?: Record<string, string>;
    workspaceKey?: string;
    workspaceKeys?: readonly string[];
    defaultId?: string;
    profileIds?: readonly string[];
}): {
    profileId: string | null;
    reset: boolean;
};
/** The optional workspace registry the key resolution reads (structural port). */
export interface WorkspaceRegistryLike {
    list?: () => Array<{
        id?: string;
        sessionIds?: readonly string[];
    }>;
    resolveByPath?: (path: string) => Promise<{
        id?: string;
    } | null | undefined> | {
        id?: string;
    } | null | undefined;
}
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
export declare function resolveWorkspaceKeys({ workspaceRegistry, session, workspaceId, cwd, }?: {
    workspaceRegistry?: WorkspaceRegistryLike | null;
    session?: {
        id?: string;
    } | null;
    workspaceId?: string;
    cwd?: string | null;
}): Promise<string[]>;
/** @purpose Classify a delegated child from its durable session header, tolerating absent agent data. */
export declare function isSubagent(agent: AgentLike | null | undefined): boolean;
/** @purpose Identify a seeded delegated child rather than an unrelated seeded root session. */
export declare function isFork(agent: AgentLike | null | undefined): boolean;
export declare function interpolateSealedText(sectionId: string, text: string, variables?: Record<string, unknown>): string;
/**
 * @purpose Freeze the chosen sections' FINAL text (interpolation resolved and
 *   validated at seal time) and order at the first assembly, filtering scopes
 *   and absent/empty/uninterpolatable sections. A section whose body cannot be
 *   interpolated against this assembly's variables is SKIPPED with a warning
 *   instead of persisting text the engine would throw on forever.
 * @param options.onSkip diagnostics hook called for EVERY skipped reference
 *   with a short reason; a throwing sink is swallowed here.
 */
export declare function buildSnapshot({ profile, sectionsById, isSubagent: subagent, isFork: fork, variables, warn, onSkip, }: {
    profile?: Profile | null;
    sectionsById: Map<string, Section> | Record<string, Section | undefined>;
    isSubagent?: boolean;
    isFork?: boolean;
    variables?: Record<string, unknown>;
    warn?: (message: string, details?: unknown) => void;
    onSkip?: (skip: {
        id: string;
        reason: string;
    }) => void;
}): Snapshot;
/**
 * @purpose Decide a session's snapshot EXACTLY ONCE and keep it stable: an
 *   already-persisted record — EMPTY INCLUDED — is the session's final
 *   decision, so a session that started without a profile never receives one
 *   mid-session. A fresh decision is memoized and written durable-first (an
 *   explicit empty record for "no profile"); storage failures degrade to the
 *   in-memory decision and are retried on the next assembly.
 */
export declare function sealSnapshot<T>({ sessionId, createSnapshot, memo, openTable, warn, }: {
    sessionId: string;
    createSnapshot: () => T;
    memo: Map<string, {
        snapshot: T;
        persisted: boolean;
    }>;
    openTable: () => Promise<{
        get(key: string): T | undefined;
        put(key: string, value: T): unknown;
    }>;
    warn?: (message: string, details?: unknown) => void;
}): Promise<T>;
/** A cached async getter that also exposes the pending promise without starting one. */
export type RetryingCache<T> = (() => Promise<T>) & {
    cached: () => Promise<T> | null;
};
/**
 * @purpose Cache a pending asynchronous open (storage domain) but DROP the
 *   cache on rejection, so a transient failure disables nothing permanently —
 *   the next call starts a fresh attempt.
 * @invariants A fulfilled promise stays cached forever; a rejected one is
 *   removed synchronously before the rejection propagates.
 */
export declare function retryingCache<T>(create: () => Promise<T>): RetryingCache<T>;
