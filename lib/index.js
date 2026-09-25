import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  registerRemote
} from "./chunks/chunk-J5QPTTFP.js";
import "./chunks/chunk-H5XK4436.js";
import {
  buildSnapshot,
  isFork,
  isSubagent,
  resolveProfileId
} from "./chunks/chunk-76XK6KH2.js";
import {
  external_exports
} from "./chunks/chunk-FEAYNPVI.js";
import {
  createHostPorts
} from "./chunks/chunk-USPPIARP.js";
import {
  createWorkspaceKeys
} from "./chunks/chunk-S7DFAC3W.js";
import {
  setWriteGate
} from "./chunks/chunk-TL6MLFAW.js";
import "./chunks/chunk-EU4N3AP7.js";
import {
  PromptProfilesRegistry
} from "./chunks/chunk-UW2VMHPB.js";
import "./chunks/chunk-CTYVKZTO.js";
import {
  planInsertion
} from "./chunks/chunk-M5XL7FMX.js";
import "./chunks/chunk-PYSVU6K5.js";
import {
  builtinOrdersByName,
  loadBuiltinOrders
} from "./chunks/chunk-I6HEPGQQ.js";
import {
  createSessionSnapshots
} from "./chunks/chunk-2ZVOWXCH.js";
import "./chunks/chunk-JXN3JPCQ.js";
import "./chunks/chunk-EU2VRU6C.js";

// src/host/index.ts
import { Service } from "@deepseek-ai/cordis";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import z from "@deepseek-ai/schemastery";
var promptProfilesDomain = defineDomain({
  name: "prompt_profiles",
  version: 1,
  invalidRecords: "backup-and-skip",
  tables: {
    sessions: domainTable(
      external_exports.object({
        profileId: external_exports.string().nullable(),
        sections: external_exports.array(
          external_exports.object({
            id: external_exports.string(),
            title: external_exports.string(),
            order: external_exports.number(),
            text: external_exports.string()
          })
        )
      })
    )
  }
});
var PromptProfilesPlugin = class extends Service {
  /** Mandatory injections — none: this row must mount before everything. */
  static inject = [];
  // #region CONST_Config
  /** Config schema for the main `prompt-profiles` row (SPEC §4). */
  /** @internal Phase 0: schemastery's Dict is not declaration-portable under pnpm. */
  static Config = z.object({
    /** Profile id applied when no workspace-specific choice exists. */
    default: z.string().default("").volatile(),
    /** Last explicitly picked profile id per workspace id (SPEC §2 #11). */
    lastByWorkspace: z.dict(z.string()).default({}).volatile()
  });
  // #endregion CONST_Config
  /** Pure registry (also exposed for tests). */
  registry;
  /** @type {{ orders: Record<string, number>, origin: string, file: string|null } | null} */
  _mirror = null;
  // #region METHOD_constructor
  /**
   * @purpose Mount the registry, the prompt assembler, and (when the platform
   *   service exists) the Remote surface, without requiring any optional
   *   service to be present.
   * @param {object} ctx - Cordis plugin context (fiber = the loader row).
   * @param {object} config - resolved Config (see CONST_Config).
   */
  constructor(ctx, config) {
    super(ctx, "promptProfiles");
    this.config = config;
    this.registry = new PromptProfilesRegistry({
      warn: (message, details) => ctx.logger?.warn?.(message, details ?? "")
    });
    this._ports = createHostPorts({
      service: this,
      getService: (name) => {
        try {
          return ctx.get?.(name) ?? void 0;
        } catch {
          return void 0;
        }
      },
      warn: (message, details) => ctx.logger?.warn?.(message, details ?? "")
    });
    ctx.inject(["settings"], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)));
    this._installAssembler(ctx);
    ctx.effect(() => {
      try {
        const hmr = ctx.get?.("hmr");
        if (typeof hmr?.runExclusive === "function") setWriteGate((run) => hmr.runExclusive(run));
      } catch {
      }
      return () => setWriteGate(null);
    });
    let noTypertTimer = null;
    ctx.inject(
      ["typert"],
      (child) => child.effect(() => {
        if (noTypertTimer !== null) {
          clearTimeout(noTypertTimer);
          noTypertTimer = null;
        }
        return registerRemote(child, { service: this });
      })
    );
    noTypertTimer = setTimeout(() => {
      noTypertTimer = null;
      try {
        if (ctx.get?.("typert")) return;
        ctx.logger?.error?.("prompt-profiles remote: mounted ZERO remote endpoints (typert service absent)", {});
      } catch {
      }
    }, 200);
    noTypertTimer.unref?.();
    ctx.logger?.debug?.("prompt-profiles service mounted", {
      default: config.default,
      lastByWorkspaceKeys: Object.keys(config.lastByWorkspace ?? {})
    });
  }
  // #endregion METHOD_constructor
  // #region METHOD_installAssembler
  /** @purpose Register one unscoped waterfall listener whose snapshots outlive config edits and resumes. */
  _installAssembler(ctx) {
    ctx.inject(
      ["storageDomain", "workspaceRegistry"],
      (child) => child.effect(() => {
        const log = (level, message, details) => {
          try {
            const sink = child.logger?.[level];
            if (typeof sink === "function") sink.call(child.logger, message, details ?? "");
          } catch {
          }
        };
        const snapshots = createSessionSnapshots({
          openDomain: () => child.storageDomain.open(promptProfilesDomain),
          warn: (message, details) => log("warn", message, details)
        });
        const workspaces = createWorkspaceKeys(child.workspaceRegistry);
        const dispose = child.on("system-prompt/assemble", async (assembly, context, next) => {
          const agent = context?.agent;
          const session = agent?.session;
          if (session?.id && Array.isArray(assembly?.sections)) {
            try {
              const cwd = session.header?.cwd ?? null;
              const workspaceKeys = await workspaces.keys({ session, cwd });
              const workspaceKey = workspaceKeys[0] ?? "";
              const snapshot = await snapshots.seal(session.id, () => {
                const skips = [];
                const profiles = this.profiles();
                const { profileId, reset } = resolveProfileId({
                  lastByWorkspace: this.config.lastByWorkspace.get(),
                  workspaceKeys,
                  defaultId: this.config.default.get(),
                  profileIds: profiles.map((profile2) => profile2.id)
                });
                if (reset)
                  log("debug", "prompt-profiles stale workspace choice reset", {
                    sessionId: session.id,
                    workspaceKey
                  });
                const profile = profiles.find((row) => row.id === profileId);
                const sections = new Map(this.sections().map((row) => [row.id, row]));
                for (const ref of profile?.sections ?? []) {
                  if (!sections.has(ref.id))
                    log("warn", "prompt-profiles missing section", { profileId, sectionId: ref.id });
                }
                const sealed = buildSnapshot({
                  profile,
                  sectionsById: sections,
                  isSubagent: isSubagent(agent),
                  isFork: isFork(agent),
                  // Seal-time interpolation (astra finding D): variables of
                  // THIS assembly, final text stored, never re-interpolated.
                  variables: assembly.variables ?? {},
                  warn: (message, details) => log("warn", message, details),
                  // Per-reference skip reasons for the seal diagnostics below.
                  onSkip: (skip) => skips.push(skip)
                });
                log("info", "prompt-profiles seal", {
                  sessionId: session.id,
                  workspaceKey,
                  profileId: sealed.profileId,
                  selected: sealed.sections.length,
                  skipped: skips.length,
                  skipReasons: skips,
                  sectionIds: sealed.sections.map((section) => section.id)
                });
                return sealed;
              });
              if (snapshot.sections.length) {
                const planned = planInsertion({
                  snapshot,
                  assemblySections: assembly.sections,
                  builtinOrdersByName: this.builtinOrdersByName()
                });
                for (let i = planned.length - 1; i >= 0; i--) {
                  const { index, ...entry } = planned[i];
                  assembly.sections.splice(index, 0, entry);
                }
                log("debug", "prompt-profiles inserted", {
                  sessionId: session.id,
                  workspaceKey,
                  profileId: snapshot.profileId,
                  inserted: planned.map((entry) => ({ name: entry.name, index: entry.index })),
                  assemblySections: assembly.sections.length
                });
              } else {
                log("info", "prompt-profiles: no sections to insert", {
                  sessionId: session.id,
                  workspaceKey,
                  profileId: snapshot.profileId,
                  assemblySections: assembly.sections.length
                });
              }
            } catch (error) {
              log("warn", "prompt-profiles snapshot unavailable; prompt unchanged", { sessionId: session.id, error });
            }
          }
          return next();
        });
        return async () => {
          dispose();
          await snapshots.close();
        };
      })
    );
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
      resolveFrom = this.ctx.profileContext?.dir ?? void 0;
    } catch {
      resolveFrom = void 0;
    }
    this._mirror = loadBuiltinOrders({
      resolveFrom,
      warn: (message, details) => this.ctx.logger?.warn?.(message, details ?? "")
    });
    return this._mirror;
  }
  // #endregion METHOD_loadMirror
  // #region METHOD_resolveSource
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
  _resolveSource(rowId) {
    if (typeof rowId !== "string" || rowId === "") return "unknown";
    let patch;
    try {
      patch = this._ports.patch();
    } catch {
      patch = void 0;
    }
    let patchPath;
    try {
      patchPath = patch?.path();
    } catch {
      return "unknown";
    }
    if (typeof patchPath !== "string" || patchPath === "") return "unknown";
    try {
      return patch.ownership(rowId).source;
    } catch (error) {
      this.ctx.logger?.warn?.("prompt-profiles: provenance unavailable; source stays unknown", {
        rowId,
        error: error?.message ?? String(error)
      });
      return "unknown";
    }
  }
  // #endregion METHOD_resolveSource
};
export {
  PromptProfilesPlugin,
  PromptProfilesPlugin as default,
  promptProfilesDomain
};
//# sourceMappingURL=index.js.map
