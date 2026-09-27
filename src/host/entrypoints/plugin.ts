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
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import z from "@deepseek-ai/schemastery";
import { z as zod } from "zod";
import { type AssemblyContext, createPromptAssembler, type PromptAssembly } from "../application/assembler.ts";
import type { HostPorts, PatchPort, WorkspaceRegistryPort } from "../application/ports.ts";
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
} from "../infra/index.ts";
import { registerRemote } from "./remote.ts";

// #region CONST_promptProfilesDomain
/**
 * Durable session snapshots; bad records are backed up and treated as absent.
 * `per-record` (the layout the platform's own per-session sidecar,
 * `session_projcache`, also uses) stores one document per session: a seal
 * rewrites only its own record instead of the whole unit, and the version
 * check applies per record, so a future schema change discards stale records
 * instead of failing the unit and losing every session's seal at once.
 *
 * The record carries ONLY the fields the insertion reads (`id`, `order`,
 * `text`). `title` and `profileId` were dropped because no reader ever used
 * them; an existing version-1 record still parses, because Zod objects strip
 * unknown keys, and the backend bootstraps the legacy whole-unit file into
 * per-record documents without a version bump.
 *
 * Record schemas are ZOD, not Schemastery: dsh-storage-domain reopens tables
 * through `tableSpec.valueSchema.parse(raw)` (Zod protocol), while Schemastery
 * has no `.nullable()` and is reserved for the plugin `Config`.
 */
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
// #endregion CONST_promptProfilesDomain

// #region TYPE_config
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
  config: { id: string } & Record<string, unknown>;
  source?: RowSource;
}

/** The dsh-settings call this bundle depends on. */
interface SettingsServiceLike {
  configure(config: unknown, fiber: unknown): () => void;
}

/** The `system-prompt/assemble` listener, whose event type lives in a host package this bundle does not depend on. */
type AssembleListener = (assembly: PromptAssembly, context: AssemblyContext, next: () => unknown) => unknown;
// #endregion TYPE_config

// #region FUNC_serviceViews
/** Read the optional `settings` service off an injected child context. */
const settingsOf = (ctx: Context): SettingsServiceLike => (ctx as Context & { settings: SettingsServiceLike }).settings;

/**
 * Read the optional `workspaceRegistry` service off an injected child context;
 * the service has no published typings in this bundle's dependency set.
 */
const workspaceRegistryOf = (ctx: Context): WorkspaceRegistryPort | undefined =>
  (ctx as Context & { workspaceRegistry?: WorkspaceRegistryPort }).workspaceRegistry;
// #endregion FUNC_serviceViews

// #region CLASS_PromptProfilesPlugin
/**
 * The `promptProfiles` service: registry of section/profile rows plus the
 * built-in orders mirror. Loader row `prompt-profiles` instantiates this.
 */
export class PromptProfilesPlugin extends Service {
  /** Mandatory injections — none: this row must mount before everything. */
  static inject: string[] = [];

  /**
   * Config schema for the main `prompt-profiles` row (SPEC §4).
   * @internal The schemastery volatile output type is not declaration-portable.
   */
  static Config = z.object({
    /** Profile id applied when no workspace-specific choice exists. */
    default: z.string().default("").volatile(),
    /** Last explicitly picked profile id per workspace id (SPEC §2 #11). */
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
    ctx.inject(["settings"], (child) => child.effect(() => settingsOf(child).configure({ auto: false }, ctx.fiber)));
    this._installAssembler(ctx);
    // Join the writer's raw file writes to dsh-hmr exclusivity when present,
    // so they serialize with config-editor/settings edits in this process (see
    // infra/patch-writer.ts setWriteGate). The gate is a MODULE singleton, so
    // it MUST be cleared on dispose: an HMR reload would otherwise leave the
    // old scope's `runExclusive` installed forever.
    ctx.effect(() => {
      try {
        const hmr = ctx.get?.("hmr");
        if (typeof hmr?.runExclusive === "function") setWriteGate((run) => hmr.runExclusive(run));
      } catch {
        // no hmr service: the writer's own module mutex still applies.
      }
      return () => setWriteGate(null);
    });
    // TYPERT REMOTE: the `typert` registry service is OPTIONAL — a profile
    // without it (older DSH, stripped host) keeps everything else; the missing
    // Remote surface is reported LOUDLY after the settle window instead of
    // silently, so "Running, zero endpoints, empty log" cannot happen.
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
        // A rejected open must NOT stay cached: the adapter drops the pending
        // promise on failure so the next assembly retries. Pinned per-session
        // decisions live in the adapter's memo: once a session's snapshot is
        // decided in memory it stays stable for this process even while
        // storage is down, so no later retry can activate a profile
        // mid-session after an unprofiled turn.
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

  // Trivial registry delegates (grace-lite: no regions on one-liners).

  /** Register one section row (SPEC §5.1); `source` resolved via provenance when unknown. */
  registerSection(row: RegisterRowInput): () => void {
    return this.registry.registerSection({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }

  /** Register one profile row (SPEC §5.1); `source` resolved via provenance when unknown. */
  registerProfile(row: RegisterRowInput): () => void {
    return this.registry.registerProfile({ ...row, source: row.source ?? this._resolveSource(row.rowId) });
  }

  sections(): SectionView[] {
    return this.registry.sections();
  }

  profiles(): ProfileView[] {
    return this.registry.profiles();
  }

  // #region METHOD_usedIn
  /**
   * Profiles referencing a section, with per-profile scope (editor feed).
   *
   * @purpose Serve the editor's read-only «используется в» field (SPEC §2 #26)
   *   and the Remote section views from one consistent dataset.
   */
  usedIn(sectionId: ConfigId): UsedInEntry[] {
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
  builtinOrders(): Record<string, number> {
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
  builtinOrdersByName(): Record<string, number> {
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
