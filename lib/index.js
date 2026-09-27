import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  registerRemote
} from "./chunks/chunk-KMBIRBQX.js";
import {
  external_exports
} from "./chunks/chunk-ONT2GV5D.js";
import {
  createPromptAssembler
} from "./chunks/chunk-VHHPWZQJ.js";
import "./chunks/chunk-DBECJ2WB.js";
import {
  createHostPorts
} from "./chunks/chunk-UDLXXLUD.js";
import {
  setWriteGate
} from "./chunks/chunk-TQ6XALAJ.js";
import {
  PromptProfilesRegistry
} from "./chunks/chunk-LF67QRO6.js";
import {
  builtinOrdersByName,
  loadBuiltinOrders
} from "./chunks/chunk-F6D7DTTJ.js";
import {
  createSessionSnapshots
} from "./chunks/chunk-G2LQ2P57.js";
import "./chunks/chunk-JXN3JPCQ.js";
import {
  createWorkspaceKeys
} from "./chunks/chunk-S7DFAC3W.js";
import "./chunks/chunk-UZCDPWEP.js";
import "./chunks/chunk-6RN5PND4.js";
import "./chunks/chunk-NG7OBEWS.js";
import "./chunks/chunk-M5XL7FMX.js";
import "./chunks/chunk-EU2VRU6C.js";

// src/host/entrypoints/plugin.ts
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
var settingsOf = (ctx) => ctx.settings;
var workspaceRegistryOf = (ctx) => ctx.workspaceRegistry;
var PromptProfilesPlugin = class extends Service {
  /** Mandatory injections — none: this row must mount before everything. */
  static inject = [];
  /**
   * Config schema for the main `prompt-profiles` row (SPEC §4).
   * @internal The schemastery volatile output type is not declaration-portable.
   */
  static Config = z.object({
    /** Profile id applied when no workspace-specific choice exists. */
    default: z.string().default("").volatile(),
    /** Last explicitly picked profile id per workspace id (SPEC §2 #11). */
    lastByWorkspace: z.dict(z.string()).default({}).volatile()
  });
  config;
  /** Pure registry (also exposed for tests). */
  registry;
  _mirror = null;
  _ports;
  // #region METHOD_constructor
  /**
   * @purpose Mount the registry, the prompt assembler, and (when the platform
   *   service exists) the Remote surface, without requiring any optional
   *   service to be present.
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
    ctx.inject(["settings"], (child) => child.effect(() => settingsOf(child).configure({ auto: false }, ctx.fiber)));
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
  /** @purpose Own one unscoped assembly listener whose snapshots outlive config edits and resumes. */
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
        const workspaces = createWorkspaceKeys(workspaceRegistryOf(child));
        const assembler = createPromptAssembler({
          registry: this._ports.registry,
          orders: this._ports.orders,
          workspaces,
          snapshots,
          log: {
            debug: (message, details) => log("debug", message, details),
            info: (message, details) => log("info", message, details),
            warn: (message, details) => log("warn", message, details),
            error: (message, details) => log("error", message, details)
          }
        });
        const events = child;
        const dispose = events.on("system-prompt/assemble", async (assembly, context, next) => {
          await assembler.apply({ agent: context?.agent, assembly });
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
  sections() {
    return this.registry.sections();
  }
  profiles() {
    return this.registry.profiles();
  }
  // #region METHOD_usedIn
  /**
   * Profiles referencing a section, with per-profile scope (editor feed).
   *
   * @purpose Serve the editor's read-only «используется в» field (SPEC §2 #26)
   *   and the Remote section views from one consistent dataset.
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
   */
  builtinOrders() {
    return this._loadMirror().orders;
  }
  /**
   * Name-keyed mirror view (`tool:bash` → 1000) for insertionIndex and the
   * editor outline. Extension beyond the SPEC §5.1 interface; the assembler
   * relies on it because assembly sections are identified by name only.
   *
   * @purpose Key the mirror the way assemblies actually identify sections (by
   *   dotted name), so insertion anchoring needs no key translation.
   */
  builtinOrdersByName() {
    return builtinOrdersByName(this._loadMirror().orders);
  }
  // #endregion METHOD_builtinOrders
  // #region METHOD_loadMirror
  /**
   * Load the mirror once, on first use. `profileContext` is optional: read
   * through the REFLECT reader, fall back to resolving from this module, and
   * degrade to the frozen copy with a warning on any failure (SPEC §7).
   *
   * @purpose Keep first mirror use cheap and crash-proof: resolution and
   *   parsing problems degrade to the frozen copy instead of breaking the
   *   service.
   */
  _loadMirror() {
    if (this._mirror) return this._mirror;
    let resolveFrom;
    try {
      const profileContext = this.ctx.get("profileContext");
      resolveFrom = profileContext?.dir ?? void 0;
    } catch {
      resolveFrom = void 0;
    }
    const mirror = loadBuiltinOrders({
      resolveFrom,
      warn: (message, details) => this.ctx.logger?.warn?.(message, details ?? "")
    });
    this._mirror = mirror;
    return mirror;
  }
  // #endregion METHOD_loadMirror
  // #region METHOD_resolveSource
  /**
   * Prove row ownership from the profile patch: a row inside an `insert` entry
   * is user-owned, a bare override is bundle-provided, and a row this patch
   * says nothing about stays unknown.
   *
   * @purpose Stop the registry from reporting 'unknown' provenance on web
   *   surfaces where the profile patch is readable, without requiring the
   *   configEditor injection.
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
      return patch?.ownership(rowId).source ?? "unknown";
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
