/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give a DSH profile an independent "prompt profile" axis — named sets
 *   of extra system-prompt sections — without touching agent presets.
 * @scope
 *  - The Cordis driver: config, the `ctx.promptProfiles` service and its lazy
 *    built-in-orders mirror, the prompt-assembly listener, the Remote mount,
 *    and the `prompt_profiles` storage domain declaration.
 *  - NOT: the operations (host/application/), the adapters (host/infra/), or
 *    the composition rows (./section.ts, ./profile.ts).
 * @invariants
 *  - The row mounts even when optional services (settings, profileContext)
 *    are absent; injection waits for storageDomain and workspaceRegistry.
 *  - A snapshot write finishes before any profile section reaches rendering.
 *  - `builtinOrders()` never throws; the mirror degrades to the frozen copy.
 *  - The profile choice is keyed by the SAME workspace key `last` writes, so
 *    the chip reaches the prompt for both workspace-id and blank-session
 *    clients.
 * @dependencies
 *  - USES API: @deepseek-ai/cordis (Service), @deepseek-ai/schemastery
 *    (Config), zod and @deepseek-ai/dsh-storage-domain (the record schemas
 *    and the storage domain), plus the host services `settings`,
 *    `configEditor`, `workspaceRegistry` and `typert` through
 *    `ctx.inject`/`ctx.get`.
 * @keywords prompt profiles, host plugin, service, registry, mirror, cordis
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
import { Service } from "@deepseek-ai/cordis";
import type { HostPorts } from "../application/ports.ts";
import type { ConfigId, ProfileView, RowSource, SectionView, UsedInEntry } from "../domain/model.ts";
import { type BuiltinOrdersMirror, PromptProfilesRegistry } from "../infra/index.ts";
/**
 * Durable session snapshots; bad records are backed up and treated as absent.
 * Record schemas are ZOD, not Schemastery: dsh-storage-domain reopens tables
 * through `tableSpec.valueSchema.parse(raw)` (Zod protocol), while Schemastery
 * has no `.nullable()` and is reserved for the plugin `Config`.
 */
export declare const promptProfilesDomain: {
    name: string;
    version: number;
    invalidRecords: "backup-and-skip";
    tables: {
        sessions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            profileId: string | null;
            sections: {
                id: string;
                title: string;
                order: number;
                text: string;
            }[];
        }>;
    };
};
/** A schemastery `.volatile()` config field: the service reads it through `get()`. */
interface VolatileRef<T> {
    get(): T;
}
/** The resolved `prompt-profiles` row config (see the static `Config` schema). */
export interface PromptProfilesConfig {
    default: VolatileRef<string>;
    lastByWorkspace: VolatileRef<Record<string, string> | undefined>;
}
/** A row handed to the service by its composition row. */
export interface RegisterRowInput {
    rowId?: string | null;
    config: {
        id: string;
    } & Record<string, unknown>;
    source?: RowSource;
}
/**
 * The `promptProfiles` service: registry of section/profile rows plus the
 * built-in orders mirror. Loader row `prompt-profiles` instantiates this.
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
    /** Register one section row (SPEC §5.1); `source` resolved via provenance when unknown. */
    registerSection(row: RegisterRowInput): () => void;
    /** Register one profile row (SPEC §5.1); `source` resolved via provenance when unknown. */
    registerProfile(row: RegisterRowInput): () => void;
    sections(): SectionView[];
    profiles(): ProfileView[];
    /**
     * Profiles referencing a section, with per-profile scope (editor feed).
     *
     * @purpose Serve the editor's read-only «используется в» field (SPEC §2 #26)
     *   and the Remote section views from one consistent dataset.
     */
    usedIn(sectionId: ConfigId): UsedInEntry[];
    /**
     * The mirror (SPEC §5.1/§5.2): SECTION_ORDERS keyed by placement key
     * (`TOOL_BASH` → 1000). Lazy, never throws, frozen result.
     *
     * @purpose Let the editor outline and insertionIndex reason about real
     *   built-in placement without hard-coding orders in the UI.
     */
    builtinOrders(): Record<string, number>;
    /**
     * Name-keyed mirror view (`tool:bash` → 1000) for insertionIndex and the
     * editor outline. Extension beyond the SPEC §5.1 interface; the assembler
     * relies on it because assembly sections are identified by name only.
     *
     * @purpose Key the mirror the way assemblies actually identify sections (by
     *   dotted name), so insertion anchoring needs no key translation.
     */
    builtinOrdersByName(): Record<string, number>;
    /**
     * Load the mirror once, on first use. `profileContext` is optional: read
     * through the REFLECT reader, fall back to resolving from this module, and
     * degrade to the frozen copy with a warning on any failure (SPEC §7).
     *
     * @purpose Keep first mirror use cheap and crash-proof: resolution and
     *   parsing problems degrade to the frozen copy instead of breaking the
     *   service.
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
