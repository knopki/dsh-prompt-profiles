/**
 * #region moduleContract
 * @modulecontract
 * @purpose Name the driven concerns of the operation set as interfaces.
 * @scope Interfaces and plain data shapes only. NOT implementations or services.
 * @invariants
 *  - Optional services resolve per call, so late services are picked up.
 * #endregion moduleContract
 */
import type { ConfigId, ProfileView, SectionView, Snapshot, UsedInEntry } from "../domain/model.ts";
/** Registry rows and live volatile config of the `promptProfiles` service. */
export interface LoaderRegistryPort {
    sections(): SectionView[];
    profiles(): ProfileView[];
    usedIn(sectionId: ConfigId): UsedInEntry[];
    /** Current `default` profile id (`""` = none). */
    defaultId(): string;
    /** Current per-workspace last choices, `undefined` when never set. */
    lastByWorkspace(): Record<string, string> | undefined;
}
/** Built-in section orders: raw placement keys and the assembled-name view. */
export interface BuiltinOrdersPort {
    orders(): Record<string, number>;
    ordersByName(): Record<string, number>;
}
/** One row the profile patch claims, as read-only queries report it. */
export interface PatchRowRecord {
    id: string | null;
    name: string | null;
    disabled: boolean;
    hasConfig: boolean;
    configId: string | null;
}
/** A row to append as a new `{ insert: [row] }` entry. */
export interface PatchRowInput {
    id: string;
    name: string;
    config: Record<string, unknown>;
}
/** Where a patch row was proven to come from. */
export interface RowOwnership {
    source: "user" | "bundle" | "unknown";
    inserted: boolean;
    overridden: boolean;
}
/** The one-commit section rename: insert the new row, remove or disable the old. */
export interface SectionRenameRequest {
    row: PatchRowInput;
    oldRowId: string;
    oldName: string;
    bundleOwned: boolean;
}
/**
 * The user's profile patch file: read-only authority queries plus the row
 * mutations config-editor cannot perform. Mutating calls serialize on the shared write lock.
 */
export interface PatchPort {
    /** Absolute patch path, or `undefined` when the editor has none. */
    path(): string | undefined;
    rows(): PatchRowRecord[];
    rowIds(): Set<string>;
    ownership(rowId: string): RowOwnership;
    /** Canonical patch row id for a registry rowId (editor entries first). */
    patchIdOf(rowId: string): string;
    insert(row: PatchRowInput): Promise<void>;
    remove(rowId: string): Promise<boolean>;
    disable(rowId: string, name: string): Promise<void>;
    renameSection(request: SectionRenameRequest): Promise<void>;
}
/** One per-key settings mutation (`mutate`), applied against the value read at write time. */
export interface SettingsOp {
    op: "set" | "unset";
    path: string[];
    value?: unknown;
}
/** The `prompt-profiles` volatile settings: revision read plus replace/mutate. */
export interface SettingsPort {
    /** Current `prompt-profiles` revision, `undefined` when unreported. */
    revision(): number | undefined;
    replace(namespace: string, value: unknown, expectedRevision?: number): Promise<unknown>;
    mutate(namespace: string, ops: SettingsOp[], expectedRevision?: number): Promise<unknown>;
}
/** The workspace record fields key resolution reads. */
export interface WorkspaceOwner {
    id?: string;
    sessionIds?: readonly string[];
}
/** How a session's workspace is named at write and read time. */
export interface WorkspaceKeyRequest {
    session?: {
        id?: string;
    } | null;
    workspaceId?: string;
    cwd?: string | null;
}
/** Ordered workspace key candidates plus registry membership for pruning. */
export interface WorkspaceKeysPort {
    keys(request: WorkspaceKeyRequest): Promise<string[]>;
    /** Whether the registry vouches for an id; `undefined` when it cannot answer. */
    knows(id: string): boolean | undefined;
}
/** Durable per-session snapshot decisions for the process. */
export interface SessionSnapshotsPort {
    /** Decide and persist a session's snapshot exactly once per process. */
    seal(sessionId: string, createSnapshot: () => Snapshot): Promise<Snapshot>;
    close(): Promise<void>;
}
/** Roster entry of one agent preset. */
export interface AgentPresetRecord {
    id: string;
    name?: string;
}
/** The agent-preset roster and its declared composition documents. */
export interface AgentPresetsPort {
    list(): Promise<AgentPresetRecord[]>;
    readDocument(id: string): Promise<{
        content?: string;
    }>;
}
/** Diagnostics sink; every call is optional and guarded by the caller. */
export interface LogPort {
    debug?(message: string, details?: unknown): void;
    info?(message: string, details?: unknown): void;
    warn?(message: string, details?: unknown): void;
    error?(message: string, details?: unknown): void;
}
/** Warning-only sink used by the read paths. */
export type WarnFn = (message: string, details?: unknown) => void;
/**
 * The bundle's ONE in-process serializer for file and settings mutations.
 * Not reentrant: nothing that takes its own exclusivity may run inside.
 */
export interface WriteLockPort {
    run<T>(fn: () => Promise<T>): Promise<T>;
}
/** Everything the operation set reads from the host, resolved per call. */
export interface HostPorts {
    registry: LoaderRegistryPort;
    orders: BuiltinOrdersPort;
    lock: WriteLockPort;
    settings(): SettingsPort | undefined;
    patch(): PatchPort | undefined;
    presets(): AgentPresetsPort | undefined;
    workspaces(): WorkspaceKeysPort;
    warn?: WarnFn;
    log?: LogPort;
}
