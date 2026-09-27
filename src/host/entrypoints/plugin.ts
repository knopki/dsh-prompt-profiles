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
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import z from "@deepseek-ai/schemastery";
import { z as zod } from "zod";
import { type AssemblyContext, createPromptAssembler, type PromptAssembly } from "../application/assembler.ts";
import type { HostPorts, PatchPort } from "../application/ports.ts";
import type { ConfigId, ProfileView, RowSource, SectionView, UsedInEntry } from "../domain/model.ts";
import {
  type BuiltinOrdersMirror,
  builtinOrdersByName,
  createHostPorts,
  createSessionSnapshots,
  createWorkspaceKeys,
  loadBuiltinOrders,
  PromptProfilesRegistry,
  type StorageDomainHandle,
  setWriteGate,
  type WorkspaceRegistryPort,
} from "../infra/index.ts";
import { registerRemote } from "./remote.ts";
import { suppressAutoSettings } from "./row-support.ts";

/** Session snapshots are isolated per session; invalid records are backed up and skipped. The Zod schema matches the storage-domain parser protocol. */
export const promptProfilesDomain = defineDomain({
  name: "prompt_profiles",
  version: 1,
  layout: "per-record",
  invalidRecords: "backup-and-skip",
  tables: {
    sessions: domainTable(
      zod.object({
        sections: zod.array(
          zod.object({
            id: zod.string(),
            order: zod.number(),
            text: zod.string(),
          }),
        ),
      }),
    ),
  },
});

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
  config: { id: string } & Record<string, unknown>;
  source?: RowSource;
}

type AssembleListener = (assembly: PromptAssembly, context: AssemblyContext, next: () => unknown) => unknown;

const workspaceRegistryOf = (ctx: Context): WorkspaceRegistryPort | undefined =>
  (ctx as Context & { workspaceRegistry?: WorkspaceRegistryPort }).workspaceRegistry;

// #region CLASS_PromptProfilesPlugin
/**
 * @purpose Own the section/profile registry plus the built-in orders mirror.
 */
export class PromptProfilesPlugin extends Service {
  /** Mandatory injections — none: this row must mount before everything. */
  static inject: string[] = [];

  /**
   * Config schema for the main prompt-profiles row.
   * @internal The schemastery volatile output type is not declaration-portable.
   */
  static Config = z.object({
    /** Profile id applied when no workspace-specific choice exists. */
    default: z.string().default("").volatile(),
    /** Last explicitly selected profile id by workspace. */
    lastByWorkspace: z.dict(z.string()).default({}).volatile(),
  });

  config: PromptProfilesConfig;
  /** Pure registry (also exposed for tests). */
  registry: PromptProfilesRegistry;
  _mirror: BuiltinOrdersMirror | null = null;
  _ports: HostPorts;

  // #region METHOD_constructor
  /**
   * @purpose Mount the registry, the prompt assembler, and (when the platform
   *   service exists) the Remote surface, without requiring any optional
   *   service to be present.
   */
  constructor(ctx: Context, config: PromptProfilesConfig) {
    super(ctx, "promptProfiles");
    this.config = config;
    this.registry = new PromptProfilesRegistry({
      warn: (message, details) => ctx.logger?.warn?.(message, details ?? ""),
    });
    // Driven ports for this service: the registry/orders views are itself, the
    // optional services are read per call through the platform REFLECT reader.
    this._ports = createHostPorts({
      service: this,
      getService: (name) => {
        try {
          return ctx.get?.(name) ?? undefined;
        } catch {
          return undefined; // absent/throwing service: degrade, never block
        }
      },
      warn: (message, details) => ctx.logger?.warn?.(message, details ?? ""),
    });
    suppressAutoSettings(ctx, ctx.fiber);
    this._installAssembler(ctx);
    // Join the writer's raw file writes to dsh-hmr exclusivity when present.
    // Serialize profile patch writes with config-editor/settings edits when
    // HMR exposes an exclusivity gate. The gate is a module singleton, so it
    // is cleared on dispose to avoid leaking the old scope's runner.
    ctx.effect(() => {
      try {
        const hmr = ctx.get?.("hmr");
        if (typeof hmr?.runExclusive === "function") setWriteGate((run) => hmr.runExclusive(run));
      } catch {
        // no hmr service: the writer's own module mutex still applies.
      }
      return () => setWriteGate(null);
    });
    // `typert` is optional: older or stripped hosts keep everything else, and
    // the missing Remote surface is reported after the settle window.
    let noTypertTimer: ReturnType<typeof setTimeout> | null = null;
    ctx.inject(["typert"], (child) =>
      child.effect(() => {
        if (noTypertTimer !== null) {
          clearTimeout(noTypertTimer);
          noTypertTimer = null;
        }
        return registerRemote(child, { service: this });
      }),
    );
    noTypertTimer = setTimeout(() => {
      noTypertTimer = null;
      try {
        if (ctx.get?.("typert")) return;
        ctx.logger?.error?.("prompt-profiles remote: mounted ZERO remote endpoints (typert service absent)", {});
      } catch {
        // diagnostics only
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
      lastByWorkspaceKeys: Object.keys(config.lastByWorkspace ?? {}),
    });
  }
  // #endregion METHOD_constructor

  // #region METHOD_installAssembler
  /** @purpose Own one unscoped assembly listener whose snapshots outlive config edits and resumes. */
  _installAssembler(ctx: Context): void {
    ctx.inject(["storageDomain", "workspaceRegistry"], (child) =>
      child.effect(() => {
        /**
         * Diagnostics sink: every call is guarded so a broken logger can never
         * take an assembly (and therefore the prompt) down.
         */
        const log = (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): void => {
          try {
            const sink = child.logger?.[level];
            if (typeof sink === "function") sink.call(child.logger, message, details ?? "");
          } catch {
            // diagnostics only
          }
        };
        // A rejected open is not cached, so the next assembly retries; decided
        // per-session snapshots stay pinned in memory, so no later retry can
        // activate a profile mid-session after an unprofiled turn.
        const snapshots = createSessionSnapshots({
          openDomain: () => child.storageDomain.open(promptProfilesDomain) as Promise<StorageDomainHandle>,
          warn: (message, details) => log("warn", message, details),
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
            error: (message, details) => log("error", message, details),
          },
        });
        // The `system-prompt/assemble` event is declared by a host package this
        // bundle does not depend on, so the local view carries its listener type
        // while the runtime call stays `ctx.on` (the events mixin).
        const events = child as unknown as {
          on(name: "system-prompt/assemble", listener: AssembleListener): () => boolean;
        };
        const dispose = events.on("system-prompt/assemble", async (assembly, context, next) => {
          await assembler.apply({ agent: context?.agent, assembly });
          return next();
        });
        return async () => {
          dispose();
          await snapshots.close();
        };
      }),
    );
  }
  // #endregion METHOD_installAssembler

  /** @purpose Register a section row; resolve unknown source through patch ownership. */
  registerSection(row: RegisterRowInput): () => void {
    return this.registry.registerSection({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }

  /** @purpose Register a profile row; resolve unknown source through patch ownership. */
  registerProfile(row: RegisterRowInput): () => void {
    return this.registry.registerProfile({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }

  /** @purpose List the registered section views. */
  sections(): SectionView[] {
    return this.registry.sections();
  }

  /** @purpose List the registered profile views. */
  profiles(): ProfileView[] {
    return this.registry.profiles();
  }

  // #region METHOD_usedIn
  /**
   * @purpose Provide one consistent read-only profile-reference view to the editor and Remote API.
   */
  usedIn(sectionId: ConfigId): UsedInEntry[] {
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
  builtinOrders(): Record<string, number> {
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
  builtinOrdersByName(): Record<string, number> {
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
  _loadMirror(): BuiltinOrdersMirror {
    if (this._mirror) return this._mirror;
    let resolveFrom: string | undefined;
    try {
      const profileContext: { dir?: string } | undefined = this.ctx.get("profileContext");
      resolveFrom = profileContext?.dir ?? undefined;
    } catch {
      resolveFrom = undefined; // service absent (non-web surface): resolve from this module
    }
    const mirror = loadBuiltinOrders({
      resolveFrom,
      warn: (message, details) => this.ctx.logger?.warn?.(message, details ?? ""),
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
  _resolveSource(rowId: string | null | undefined): RowSource {
    if (typeof rowId !== "string" || rowId === "") return "unknown";
    let patch: PatchPort | undefined;
    try {
      patch = this._ports.patch();
    } catch {
      patch = undefined;
    }
    let patchPath: string | undefined;
    try {
      patchPath = patch?.path();
    } catch {
      return "unknown"; // documentPath getter failed: service unusable
    }
    if (typeof patchPath !== "string" || patchPath === "") return "unknown";
    try {
      return patch?.ownership(rowId).source ?? "unknown";
    } catch (error) {
      this.ctx.logger?.warn?.("prompt-profiles: provenance unavailable; source stays unknown", {
        rowId,
        error: (error as { message?: string } | null)?.message ?? String(error),
      });
      return "unknown";
    }
  }
  // #endregion METHOD_resolveSource
}

export { PromptProfilesPlugin as default };
// #endregion CLASS_PromptProfilesPlugin
