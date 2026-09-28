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
import type { Profile, Section, Snapshot } from "../domain/model.ts";
import { planInsertion, sectionSkipReason } from "../domain/ordering.ts";
import type { BuiltinOrdersPort, LoaderRegistryPort, LogPort, SessionSnapshotsPort, WorkspaceKeysPort } from "./ports.ts";
export { planInsertion, sectionSkipReason };
/** The part of a Cordis agent the subagent classification and key lookup read. */
interface AssemblyAgent {
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
interface AssemblyEntry {
    name: string;
    [key: string]: unknown;
}
/** The live assembly the sealing step reads and splices into. */
export interface PromptAssembly {
    sections: AssemblyEntry[];
    variables?: Record<string, unknown>;
}
/**
 * @purpose Select a live profile from the first present workspace candidate,
 *   with explicit-none beating the default and stale ids falling back
 *   without writes.
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
/**
 * @purpose Freeze interpolation into the sealed text so the engine never
 *   re-interpolates it. Strict `{{name}}` groups only: malformed, unknown, or
 *   missing values throw (letting the sealer skip the section), while a `{{`
 *   with no later `}}` stays literal prose.
 * @throws Error on unknown or malformed variable references.
 */
export declare function interpolateSealedText(sectionId: string, text: string, variables?: Record<string, unknown>): string;
/**
 * @purpose Freeze the chosen sections' FINAL text and order at the first
 *   assembly, filtering scopes and absent/empty/uninterpolatable sections.
 * @param options.onSkip diagnostics hook called for EVERY skipped reference;
 *   a throwing sink is swallowed here.
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
        detail?: string;
    }) => void;
}): Snapshot;
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
/**
 * @purpose Own the whole assembly step — workspace keys, profile selection,
 *   the once-per-session seal, and the ordered splice — behind one method.
 */
export declare function createPromptAssembler(ports: AssemblerPorts): {
    /** @purpose Seal the session's profile once and splice its sections into the live assembly. */
    apply({ agent, assembly }: SealRequest): Promise<void>;
};
