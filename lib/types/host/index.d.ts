/**
 * Main host plugin: the `ctx.promptProfiles` service (registry + mirror).
 * #region moduleContract
 * @modulecontract
 * @purpose Give a DSH profile an independent "prompt profile" axis — named
 *   sets of extra system-prompt sections — without touching agent presets.
 * @scope
 *  - Expose the registry as `ctx.promptProfiles`, load the mirror lazily,
 *    seal each agent's first assembled prompt in a durable storage domain,
 *    resolve row provenance from the profile patch, and mount the Typert
 *    Remote surface (namespace `promptProfiles`) when the `typert` service
 *    exists.
 *  - NOT: section/profile row registration (lib/section.js, lib/profile.js)
 *    or patch-file mutation mechanics (infra/patch-writer.ts).
 * @invariants
 *  - The row mounts even when optional services (settings, profileContext)
 *    are absent; injection waits for storageDomain and workspaceRegistry.
 *  - A snapshot write finishes before any profile section reaches rendering.
 *  - `builtinOrders()` never throws; the mirror degrades to the frozen copy.
 *  - The profile choice is keyed by the SAME workspace key POST /last writes
 *    (infra/workspace-adapter.ts: registry session membership → awaited
 *    resolveByPath(cwd) id → raw cwd → workspaceId), so the chip reaches the
 *    prompt for both workspace-id and blank-session clients.
 *  - Seal diagnostics (session, workspace key, profile id, selected/skipped
 *    counts and reasons, insertion order) go through a GUARDED sink: broken
 *    logging can never fail an assembly.
 * @dependencies
 *  - USES API: @deepseek-ai/cordis (Service), @deepseek-ai/schemastery (Config),
 *    zod (storage-domain record schemas — the Zod parse protocol), @deepseek-ai/dsh-storage-domain
 *    (defineDomain/domainTable), ctx.inject(['settings']), ctx.profileContext.dir (optional, best effort),
 *    ctx.get('configEditor') / ctx.get('workspaceRegistry') for optional services (no inject requirement).
 * @rationale
 *  - Q: Why a Service subclass instead of ctx.set/provide calls in apply?
 *    A: Shipped packages (dsh-agent-preset-registry, dsh-session-projection)
 *    register the service by `super(ctx, 'name')` in the constructor; the
 *    loader instantiates class plugins with (ctx, config) and unregisters
 *    the service with the owning fiber automatically.
 *  - Q: Why is the mirror lazy?
 *    A: SPEC §5.2 needs it only for UI and insertion anchoring; resolving
 *    and reading the installed package must never block or crash plugin
 *    startup, especially when profileContext is absent (non-web surfaces).
 * @keywords prompt profiles, host plugin, service, registry, mirror, cordis
 * #endregion moduleContract
 */
import { Service } from "@deepseek-ai/cordis";
import { PromptProfilesRegistry } from "./infra/index.ts";
/**
 * Durable session snapshots; bad records are backed up and treated as absent.
 * Record schemas are ZOD, not Schemastery: dsh-storage-domain reopens tables
 * through `tableSpec.valueSchema.parse(raw)` (Zod protocol), while Schemastery
 * has no `.nullable()` and is reserved for the plugin `Config` (astra finding A).
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
/**
 * The `promptProfiles` service: registry of section/profile rows plus the
 * built-in orders mirror. Loader row `prompt-profiles` instantiates this.
 *
 * @purpose Give every consumer (subpath rows, prompt sealing, Remote surface)
 *   one authoritative registry view of prompt-profile rows that survives
 *   duplicate ids and degrades instead of throwing.
 */
export declare class PromptProfilesPlugin extends Service {
    /** Mandatory injections — none: this row must mount before everything. */
    static inject: never[];
    /** Pure registry (also exposed for tests). */
    registry: PromptProfilesRegistry;
    /** @type {{ orders: Record<string, number>, origin: string, file: string|null } | null} */
    _mirror: null;
    /**
     * @purpose Mount the registry, the prompt assembler, and (when the platform
     *   service exists) the Remote surface, without requiring any optional
     *   service to be present.
     * @param {object} ctx - Cordis plugin context (fiber = the loader row).
     * @param {object} config - resolved Config (see CONST_Config).
     */
    constructor(ctx: any, config: any);
    /** @purpose Register one unscoped waterfall listener whose snapshots outlive config edits and resumes. */
    _installAssembler(ctx: any): void;
    /** Register one section row (SPEC §5.1); `source` resolved via provenance when unknown. */
    registerSection(row: any): () => void;
    /** Register one profile row (SPEC §5.1); `source` resolved via provenance when unknown. */
    registerProfile(row: any): () => void;
    /** @returns {Array<object>} section views sorted by id. */
    sections(): import("./domain/model.ts").SectionView[];
    /** @returns {Array<object>} profile views sorted by title. */
    profiles(): import("./domain/model.ts").ProfileView[];
    /**
     * Profiles referencing a section, with per-profile scope (editor feed).
     *
     * @purpose Serve the editor's read-only «используется в» field (SPEC §2 #26)
     *   and the API's section views from one consistent dataset.
     * @param {string} sectionId
     * @returns {Array<{ profileId: string, scope: string }>}
     */
    usedIn(sectionId: any): import("./domain/model.ts").UsedInEntry[];
    /**
     * The mirror (SPEC §5.1/§5.2): SECTION_ORDERS keyed by placement key
     * (`TOOL_BASH` → 1000). Lazy, never throws, frozen result.
     *
     * @purpose Let the editor outline and insertionIndex reason about real
     *   built-in placement without hard-coding orders in the UI.
     * @returns {Record<string, number>}
     */
    builtinOrders(): any;
    /**
     * Name-keyed mirror view (`tool:bash` → 1000) for insertionIndex and the
     * editor outline. Extension beyond the SPEC §5.1 interface; the assembler
     * relies on it because assembly sections are identified by name only.
     *
     * @purpose Key the mirror the way assemblies actually identify sections
     *   (by dotted name), so insertion anchoring needs no key translation at
     *   the call site.
     * @returns {Record<string, number>}
     */
    builtinOrdersByName(): Record<string, number>;
    /**
     * Load the mirror once, on first use. `profileContext` is optional: read
     * through a guarded property access, fall back to resolving from this
     * module, and degrade to the frozen copy with a warning on any failure
     * (SPEC §7).
     *
     * @purpose Keep first mirror use cheap and crash-proof: resolution and
     *   parsing problems degrade to the frozen copy instead of breaking the
     *   service.
     * @returns {{ orders: Record<string, number>, origin: string, file: string|null }}
     */
    _loadMirror(): null;
    /**
     * Prove row ownership from the profile patch (step-4 writer): a row inside
     * an `insert` entry is user-owned, a bare override is bundle-provided, and
     * a row this patch says nothing about stays unknown.
     *
     * LIVE BUG this fixes: the service context never INJECTED configEditor, so
     * `this.ctx.configEditor` was undefined on the service's own context and
     * every row resolved to 'unknown'. `ctx.get(name)` reads a service WITHOUT
     * the inject requirement (cordis REFLECT), which is the correct optional
     * accessor here.
     *
     * @purpose Stop the registry from reporting 'unknown' provenance on web
     *   surfaces where the profile patch is readable.
     * @param {string|null} rowId
     * @returns {"user"|"bundle"|"unknown"} 'unknown' when configEditor is
     *   absent, the rowId is missing, or the patch cannot be parsed.
     */
    _resolveSource(rowId: any): any;
}
export { PromptProfilesPlugin as default };
