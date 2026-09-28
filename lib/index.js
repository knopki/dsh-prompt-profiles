import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  suppressAutoSettings
} from "./chunks/chunk-6IVLYWYW.js";
import {
  registerRemote
} from "./chunks/chunk-UTYPDFPM.js";
import {
  external_exports
} from "./chunks/chunk-6BZY5ZFF.js";
import {
  createPromptAssembler
} from "./chunks/chunk-K6DUPC42.js";
import "./chunks/chunk-DBECJ2WB.js";
import {
  createHostPorts
} from "./chunks/chunk-JGTVG7U5.js";
import {
  setWriteGate
} from "./chunks/chunk-USWVTYB5.js";
import {
  PromptProfilesRegistry
} from "./chunks/chunk-OCUQBLNA.js";
import {
  builtinOrdersByName,
  loadBuiltinOrders
} from "./chunks/chunk-EIBM6T4X.js";
import {
  createSessionSnapshots
} from "./chunks/chunk-KJGZXZ4S.js";
import "./chunks/chunk-5QYDOFDS.js";
import {
  createWorkspaceKeys
} from "./chunks/chunk-QCPT2F4L.js";
import "./chunks/chunk-EU4N3AP7.js";
import "./chunks/chunk-UFMJ35D5.js";
import "./chunks/chunk-SFN6MAAN.js";
import "./chunks/chunk-ZZMRWLSP.js";
import "./chunks/chunk-EU2VRU6C.js";

// src/host/entrypoints/plugin.ts
import { Service } from "@deepseek-ai/cordis";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import z from "@deepseek-ai/schemastery";
var promptProfilesDomain = defineDomain({
  name: "prompt_profiles",
  version: 1,
  layout: "per-record",
  invalidRecords: "backup-and-skip",
  tables: {
    sessions: domainTable(
      external_exports.object({
        sections: external_exports.array(
          external_exports.object({
            id: external_exports.string(),
            order: external_exports.number(),
            text: external_exports.string()
          })
        )
      })
    )
  }
});
var workspaceRegistryOf = (ctx) => ctx.workspaceRegistry;
var PromptProfilesPlugin = class extends Service {
  /** Mandatory injections — none: this row must mount before everything. */
  static inject = [];
  /**
   * Config schema for the main prompt-profiles row.
   * @internal The schemastery volatile output type is not declaration-portable.
   */
  static Config = z.object({
    /** Profile id applied when no workspace-specific choice exists. */
    default: z.string().default("").volatile(),
    /** Last explicitly selected profile id by workspace. */
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
    suppressAutoSettings(ctx, ctx.fiber);
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
    ctx.effect(() => () => {
      if (noTypertTimer !== null) {
        clearTimeout(noTypertTimer);
        noTypertTimer = null;
      }
    });
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
  /** @purpose Register a section row; resolve unknown source through patch ownership. */
  registerSection(row) {
    return this.registry.registerSection({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }
  /** @purpose Register a profile row; resolve unknown source through patch ownership. */
  registerProfile(row) {
    return this.registry.registerProfile({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }
  /** @purpose List the registered section views. */
  sections() {
    return this.registry.sections();
  }
  /** @purpose List the registered profile views. */
  profiles() {
    return this.registry.profiles();
  }
  // #region METHOD_usedIn
  /**
   * @purpose Provide one consistent read-only profile-reference view to the editor and Remote API.
   */
  usedIn(sectionId) {
    return this.registry.usedIn(sectionId);
  }
  // #endregion METHOD_usedIn
  // #region METHOD_builtinOrders
  /**
   * The mirror maps placement keys (for example, `TOOL_BASH`) to built-in orders. It is lazy, non-throwing, and frozen.
   *
   * @purpose Let the editor outline and insertionIndex reason about real
   *   built-in placement without hard-coding orders in the UI.
   */
  builtinOrders() {
    return this._loadMirror().orders;
  }
  // #endregion METHOD_builtinOrders
  // #region METHOD_builtinOrdersByName
  /**
   * Name-keyed mirror view (`tool:bash` → 1000) for insertionIndex and the
   * editor outline; assemblies identify sections by dotted name.
   *
   * @purpose Key the mirror the way assemblies actually identify sections (by
   *   dotted name), so insertion anchoring needs no key translation.
   */
  builtinOrdersByName() {
    return builtinOrdersByName(this._loadMirror().orders);
  }
  // #endregion METHOD_builtinOrdersByName
  // #region METHOD_loadMirror
  /**
   * Load the mirror once, on first use; resolution and parsing problems
   * degrade to the frozen copy instead of breaking the service.
   *
   * @purpose Keep first mirror use cheap and crash-proof.
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
