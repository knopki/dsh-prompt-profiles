/**
 * Main host plugin: the `ctx.promptProfiles` service (registry + mirror).
 * #region moduleContract
 * @modulecontract
 * @purpose Give a DSH profile an independent "prompt profile" axis — named
 *   sets of extra system-prompt sections — without touching agent presets.
 * @scope
 *  - Expose the registry as `ctx.promptProfiles`, load the mirror lazily,
 *    seal each agent's first assembled prompt in a durable storage domain,
 *    resolve row provenance from the profile patch, and serve the SPEC §5.5
 *    HTTP API on web surfaces.
 *  - NOT: section/profile row registration (lib/section.js, lib/profile.js),
 *    patch-file mutation mechanics (lib/writer.js), route handlers
 *    (lib/api.js).
 * @invariants
 *  - The row mounts even when optional services (settings, profileContext)
 *    are absent; injection waits for storageDomain and workspaceRegistry.
 *  - A snapshot write finishes before any profile section reaches rendering.
 *  - `builtinOrders()` never throws; the mirror degrades to the frozen copy.
 * @dependencies
 *  - USES API: @deepseek-ai/cordis (Service), @deepseek-ai/schemastery (Config),
 *    zod (storage-domain record schemas — the Zod parse protocol), @deepseek-ai/dsh-storage-domain
 *    (defineDomain/domainTable), ctx.inject(['settings']), ctx.profileContext.dir (optional, best effort).
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
import z from "@deepseek-ai/schemastery";
import { z as zod } from "zod";
import { PromptProfilesRegistry } from "./registry.js";
import { loadBuiltinOrders } from "./mirror.js";
import { builtinOrdersByName } from "./builtin-orders.js";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { resolveProfileId, buildSnapshot, planInsertion, isSubagent, isFork, sealSnapshot, retryingCache } from "./resolve.js";
import { provenance, setWriteGate } from "./writer.js";
import { registerApi } from "./api.js";

// #region CONST_promptProfilesDomain
/**
 * Durable session snapshots; bad records are backed up and treated as absent.
 * Record schemas are ZOD, not Schemastery: dsh-storage-domain reopens tables
 * through `tableSpec.valueSchema.parse(raw)` (Zod protocol), while Schemastery
 * has no `.nullable()` and is reserved for the plugin `Config` (astra finding A).
 */
export const promptProfilesDomain = defineDomain({
  name: "prompt_profiles", version: 1, invalidRecords: "backup-and-skip",
  tables: { sessions: domainTable(zod.object({
    profileId: zod.string().nullable(),
    sections: zod.array(zod.object({
      id: zod.string(), title: zod.string(), order: zod.number(), text: zod.string(),
    })),
  })) },
});
// #endregion CONST_promptProfilesDomain

// #region CLASS_PromptProfilesPlugin
/**
 * The `promptProfiles` service: registry of section/profile rows plus the
 * built-in orders mirror. Loader row `prompt-profiles` instantiates this.
 *
 * @purpose Give every consumer (subpath rows, prompt sealing, HTTP API) one
 *   authoritative registry view of prompt-profile rows that survives
 *   duplicate ids and degrades instead of throwing.
 */
export class PromptProfilesPlugin extends Service {
  /** Mandatory injections — none: this row must mount before everything. */
  static inject = [];

  // #region CONST_Config
  /** Config schema for the main `prompt-profiles` row (SPEC §4). */
  static Config = z.object({
    /** Profile id applied when no workspace-specific choice exists. */
    default: z.string().default("").volatile(),
    /** Last explicitly picked profile id per workspace id (SPEC §2 #11). */
    lastByWorkspace: z.dict(z.string()).default({}).volatile(),
  });
  // #endregion CONST_Config

  /** Pure registry (also exposed for tests). */
  registry;

  /** @type {{ orders: Record<string, number>, origin: string, file: string|null } | null} */
  _mirror = null;

  // #region METHOD_constructor
  /**
   * Install the service and wire settings suppression.
   *
   * @purpose Mount the registry, the prompt assembler, and (on web surfaces)
   *   the CRUD API without requiring any optional service to exist.
   * @param {object} ctx - Cordis plugin context (fiber = the loader row).
   * @param {object} config - resolved Config (see CONST_Config).
   */
  constructor(ctx, config) {
    super(ctx, "promptProfiles");
    this.config = config;
    this.registry = new PromptProfilesRegistry({
      warn: (message, details) => ctx.logger?.warn?.(message, details ?? ""),
    });
    ctx.inject(["settings"], (child) =>
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)),
    );
    this._installAssembler(ctx);
    // Join the writer's raw file writes to dsh-hmr exclusivity when present,
    // so they serialize with config-editor/settings edits in this process
    // (verify-step4-sol defect 1; see writer.js FUNC_setWriteGate).
    try {
      const hmr = ctx.get?.("hmr");
      if (typeof hmr?.runExclusive === "function") setWriteGate((run) => hmr.runExclusive(run));
    } catch {
      // no hmr service: the writer's own module mutex still applies.
    }
    // SPEC §5.5: routes exist only where webServer (and its sibling services)
    // do; on other surfaces the callback never fires — silent skip by design.
    ctx.inject(["webServer", "settings", "configEditor"], (child) =>
      child.effect(() => registerApi(child, { service: this })),
    );
    ctx.logger?.debug?.("prompt-profiles service mounted", {
      default: config.default,
      lastByWorkspaceKeys: Object.keys(config.lastByWorkspace ?? {}),
    });
  }
  // #endregion METHOD_constructor

  // #region METHOD_installAssembler
  /** @purpose Register one unscoped waterfall listener whose snapshots outlive config edits and resumes. */
  _installAssembler(ctx) {
    ctx.inject(["storageDomain", "workspaceRegistry"], (child) => child.effect(() => {
      // A rejected open must NOT stay cached: retryingCache drops the pending
      // promise on failure so the next assembly retries (verify-step2b-glm defect 1).
      const open = retryingCache(() => child.storageDomain.open(promptProfilesDomain));
      const pending = new Map();
      // Pinned per-session decisions (astra finding G): once a session's
      // snapshot is decided in memory it stays stable for this process even
      // while storage is down, so no later retry can activate a profile
      // mid-session after an unprofiled turn.
      const decided = new Map();
      const dispose = child.on("system-prompt/assemble", async (assembly, context, next) => {
        const agent = context?.agent;
        const session = agent?.session;
        if (session?.id && Array.isArray(assembly?.sections)) {
          try {
            let sealed = pending.get(session.id);
            if (!sealed) {
              sealed = sealSnapshot({
                sessionId: session.id,
                memo: decided,
                openTable: async () => (await open()).table("sessions"),
                createSnapshot: () => {
                  const cwd = session.header?.cwd;
                  const workspaceKey = (cwd == null ? null : child.workspaceRegistry.resolveByPath(cwd))?.id ?? cwd ?? "";
                  const profiles = this.profiles();
                  const { profileId, reset } = resolveProfileId({
                    lastByWorkspace: this.config.lastByWorkspace.get(), workspaceKey,
                    defaultId: this.config.default.get(), profileIds: profiles.map((profile) => profile.id),
                  });
                  if (reset) child.logger?.debug?.("prompt-profiles stale workspace choice reset", { workspaceKey });
                  const profile = profiles.find((row) => row.id === profileId);
                  const sections = new Map(this.sections().map((row) => [row.id, row]));
                  for (const ref of profile?.sections ?? []) {
                    if (!sections.has(ref.id)) child.logger?.warn?.("prompt-profiles missing section", { profileId, sectionId: ref.id });
                  }
                  return buildSnapshot({
                    profile, sectionsById: sections, isSubagent: isSubagent(agent), isFork: isFork(agent),
                    // Seal-time interpolation (astra finding D): variables of
                    // THIS assembly, final text stored, never re-interpolated.
                    variables: assembly.variables ?? {},
                    warn: (message, details) => child.logger?.warn?.(message, details ?? ""),
                  });
                },
                warn: (message, details) => child.logger?.warn?.(message, details ?? ""),
              });
              pending.set(session.id, sealed);
              void sealed.finally(() => pending.delete(session.id)).catch(() => {});
            }
            const snapshot = await sealed;
            if (snapshot.sections.length) {
              // planInsertion returns BASE indices into the original array;
              // splicing from LAST to FIRST keeps earlier indices valid and
              // preserves ascending order (resolve.js FUNC_planInsertion).
              // The profile's order reaches the assembly UNCHANGED — equal
              // orders are never shifted.
              // interpolate:false: the sealed text is FINAL — the engine must
              // never interpolate (and never throw on) `{{...}}` again.
              const planned = planInsertion({
                snapshot, assemblySections: assembly.sections, builtinOrdersByName: this.builtinOrdersByName(),
              });
              for (let i = planned.length - 1; i >= 0; i--) {
                const { index, ...entry } = planned[i];
                assembly.sections.splice(index, 0, entry);
              }
            }
          } catch (error) {
            child.logger?.warn?.("prompt-profiles snapshot unavailable; prompt unchanged", { sessionId: session.id, error });
          }
        }
        return next();
      });
      return async () => {
        dispose();
        pending.clear();
        const cached = open.cached();
        if (cached) await cached.then((domain) => domain.close(), () => {});
      };
    }));
  }
  // #endregion METHOD_installAssembler

  // Trivial registry delegates (grace-lite: no regions on one-liners).

  /** Register one section row (SPEC §5.1); `source` resolved via provenance when unknown. */
  registerSection(row) {
    return this.registry.registerSection({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }

  /** Register one profile row (SPEC §5.1); `source` resolved via provenance when unknown. */
  registerProfile(row) {
    return this.registry.registerProfile({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }

  /** @returns {Array<object>} section views sorted by id. */
  sections() {
    return this.registry.sections();
  }

  /** @returns {Array<object>} profile views sorted by title. */
  profiles() {
    return this.registry.profiles();
  }

  // #region METHOD_usedIn
  /**
   * Profiles referencing a section, with per-profile scope (editor feed).
   *
   * @purpose Serve the editor's read-only «используется в» field (SPEC §2 #26)
   *   and the API's section views from one consistent dataset.
   * @param {string} sectionId
   * @returns {Array<{ profileId: string, scope: string }>}
   */
  usedIn(sectionId) {
    return this.registry.usedIn(sectionId);
  }
  // #endregion METHOD_usedIn

  // #region METHOD_builtinOrders
  /**
   * The mirror (SPEC §5.1/§5.2): SECTION_ORDERS keyed by placement key
   * (`TOOL_BASH` → 1000). Lazy, never throws, frozen result.
   *
   * @purpose Let the editor outline and insertionIndex reason about real
   *   built-in placement without hard-coding orders in the UI.
   * @returns {Record<string, number>}
   */
  builtinOrders() {
    return this._loadMirror().orders;
  }
  // #endregion METHOD_builtinOrders

  // #region METHOD_builtinOrdersByName
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
  builtinOrdersByName() {
    return builtinOrdersByName(this._loadMirror().orders);
  }
  // #endregion METHOD_builtinOrdersByName

  // #region METHOD_loadMirror
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
  _loadMirror() {
    if (this._mirror) return this._mirror;
    let resolveFrom;
    try {
      resolveFrom = this.ctx.profileContext?.dir ?? undefined;
    } catch {
      resolveFrom = undefined; // service absent (non-web surface): resolve from this module
    }
    this._mirror = loadBuiltinOrders({
      resolveFrom,
      warn: (message, details) => this.ctx.logger?.warn?.(message, details ?? ""),
    });
    return this._mirror;
  }
  // #endregion METHOD_loadMirror

  // #region METHOD_resolveSource
  /**
   * Prove row ownership from the profile patch (step-4 writer): a row inside
   * an `insert` entry is user-owned, anything else is bundle-provided.
   * `configEditor.configuration()` cannot prove this (step2b report), which
   * is why `source` was 'unknown' until now.
   *
   * @purpose Stop the registry from reporting 'unknown' provenance on web
   *   surfaces where the profile patch is readable.
   * @param {string|null} rowId
   * @returns {"user"|"bundle"|"unknown"} 'unknown' when configEditor is
   *   absent, the rowId is missing, or the patch cannot be parsed.
   */
  _resolveSource(rowId) {
    if (typeof rowId !== "string" || rowId === "") return "unknown";
    let patchPath;
    try {
      patchPath = this.ctx.configEditor?.documentPath;
    } catch {
      return "unknown"; // service absent (non-web surface)
    }
    if (typeof patchPath !== "string" || patchPath === "") return "unknown";
    try {
      return provenance({ patchPath, rowId }).source;
    } catch (error) {
      this.ctx.logger?.warn?.("prompt-profiles: provenance unavailable; source stays unknown", {
        rowId, error: error?.message ?? String(error),
      });
      return "unknown";
    }
  }
  // #endregion METHOD_resolveSource
}

export { PromptProfilesPlugin as default };
// #endregion CLASS_PromptProfilesPlugin
