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
