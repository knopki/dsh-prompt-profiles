/**
 * #region moduleContract
 * @modulecontract
 * @purpose Mount the prompt-profiles service: registry, assembly listener,
 *   Remote surface, and session snapshot storage.
 * @scope
 *  - The Cordis driver and the `prompt_profiles` storage domain declaration.
 *  - NOT: operations (host/application/), adapters (host/infra/), rows.
 * @invariants
 *  - Snapshot writes finish before profile sections reach rendering.
 *  - Optional services degrade; injection waits for storage and workspace keys.
 *  - The profile choice is keyed by the same workspace key `last` writes.
 *  - `builtinOrders()` never throws; the mirror degrades to the frozen copy.
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
import { Service } from "@deepseek-ai/cordis";
import type { HostPorts } from "../application/ports.ts";
import type { ConfigId, ProfileView, RowSource, SectionView, UsedInEntry } from "../domain/model.ts";
import { type BuiltinOrdersMirror, PromptProfilesRegistry } from "../infra/index.ts";
/** Session snapshots are isolated per session; invalid records are backed up and skipped. The Zod schema matches the storage-domain parser protocol. */
export declare const promptProfilesDomain: {
    name: string;
    version: number;
    layout: "per-record";
    invalidRecords: "backup-and-skip";
    tables: {
        sessions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            sections: {
                id: string;
                order: number;
                text: string;
            }[];
        }>;
    };
};
interface VolatileRef<T> {
    get(): T;
}
/**
 * @purpose Resolved config of the main prompt-profiles row.
 */
interface PromptProfilesConfig {
    default: VolatileRef<string>;
    lastByWorkspace: VolatileRef<Record<string, string> | undefined>;
}
/**
 * @purpose A composition row handed to the service for registration.
 */
interface RegisterRowInput {
    rowId?: string | null;
    config: {
        id: string;
    } & Record<string, unknown>;
    source?: RowSource;
}
/**
 * @purpose Own the section/profile registry plus the built-in orders mirror.
 */
export declare class PromptProfilesPlugin extends Service {
    /** Mandatory injections — none: this row must mount before everything. */
    static inject: string[];
    config: PromptProfilesConfig;
    /** Pure registry (also exposed for tests). */
    registry: PromptProfilesRegistry;
    _mirror: BuiltinOrdersMirror | null;
    _ports: HostPorts;
    /**
     * @purpose Mount the registry, the prompt assembler, and (when the platform
     *   service exists) the Remote surface, without requiring any optional
     *   service to be present.
     */
    constructor(ctx: Context, config: PromptProfilesConfig);
    /** @purpose Own one unscoped assembly listener whose snapshots outlive config edits and resumes. */
    _installAssembler(ctx: Context): void;
    /** @purpose Register a section row; resolve unknown source through patch ownership. */
    registerSection(row: RegisterRowInput): () => void;
    /** @purpose Register a profile row; resolve unknown source through patch ownership. */
    registerProfile(row: RegisterRowInput): () => void;
    /** @purpose List the registered section views. */
    sections(): SectionView[];
    /** @purpose List the registered profile views. */
    profiles(): ProfileView[];
    /**
     * @purpose Provide one consistent read-only profile-reference view to the editor and Remote API.
     */
    usedIn(sectionId: ConfigId): UsedInEntry[];
    /**
     * The mirror maps placement keys (for example, `TOOL_BASH`) to built-in orders. It is lazy, non-throwing, and frozen.
     *
     * @purpose Let the editor outline and insertionIndex reason about real
     *   built-in placement without hard-coding orders in the UI.
     */
    builtinOrders(): Record<string, number>;
    /**
     * Name-keyed mirror view (`tool:bash` → 1000) for insertionIndex and the
     * editor outline; assemblies identify sections by dotted name.
     *
     * @purpose Key the mirror the way assemblies actually identify sections (by
     *   dotted name), so insertion anchoring needs no key translation.
     */
    builtinOrdersByName(): Record<string, number>;
    /**
     * Load the mirror once, on first use; resolution and parsing problems
     * degrade to the frozen copy instead of breaking the service.
     *
     * @purpose Keep first mirror use cheap and crash-proof.
     */
    _loadMirror(): BuiltinOrdersMirror;
    /**
     * Prove row ownership from the profile patch: a row inside an `insert` entry
     * is user-owned, a bare override is bundle-provided, and a row this patch
     * says nothing about stays unknown.
     *
     * @purpose Stop the registry from reporting 'unknown' provenance on web
     *   surfaces where the profile patch is readable, without requiring the
     *   configEditor injection.
     */
    _resolveSource(rowId: string | null | undefined): RowSource;
}
export { PromptProfilesPlugin as default };
