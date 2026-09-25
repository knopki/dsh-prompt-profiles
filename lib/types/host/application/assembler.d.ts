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
import type { Profile, Section, Snapshot } from "../domain/model.ts";
import { planInsertion, sectionSkipReason } from "../domain/ordering.ts";
import type { BuiltinOrdersPort, LoaderRegistryPort, LogPort, SessionSnapshotsPort, WorkspaceKeysPort } from "./ports.ts";
export { planInsertion, sectionSkipReason };
/** The part of a Cordis agent the subagent classification and key lookup read. */
export interface AssemblyAgent {
    session?: {
        id?: string;
        header?: {
            cwd?: string | null;
            origin?: string;
            isSeeded?: boolean;
        };
    };
}
/** The second argument of the `system-prompt/assemble` event. */
export interface AssemblyContext {
    agent?: AssemblyAgent | null;
}
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
export declare function isSubagent(agent: AssemblyAgent | null | undefined): boolean;
/** @purpose Identify a seeded delegated child rather than an unrelated seeded root session. */
export declare function isFork(agent: AssemblyAgent | null | undefined): boolean;
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
/**
 * @purpose Own the whole assembly step — workspace keys, profile selection,
 *   the once-per-session seal, and the ordered splice — so the Cordis
 *   entrypoint only reads the event arguments and calls one method.
 */
export declare function createPromptAssembler(ports: AssemblerPorts): {
    apply({ agent, assembly }: SealRequest): Promise<void>;
};
