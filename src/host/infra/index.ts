/**
 * #region moduleContract
 * @modulecontract
 * @purpose Offer every driven adapter of the prompt-profiles host from one
 *   import, plus the composition helper that turns the raw Cordis services
 *   into the `HostPorts` bag the operation set consumes.
 * @scope
 *  - Re-exports of the adapters in this directory and `createHostPorts`.
 *  - NOT: use cases (host/operations.ts) or the port interfaces themselves
 *    (host/application/ports.ts).
 * @invariants
 *  - Optional services are read at CALL time, so a late-appearing service is
 *    picked up and an absent/throwing one degrades per operation.
 *  - Every adapter shares the module-level patch mutex exported as `writeLock`.
 * @keywords infra, adapters, barrel, composition, ports
 * #endregion moduleContract
 */

import type {
  AgentPresetsPort,
  BuiltinOrdersPort,
  HostPorts,
  LoaderRegistryPort,
  LogPort,
  WarnFn,
  WorkspaceRegistryPort,
} from "../application/ports.ts";
import type { ConfigId, ProfileView, SectionView, UsedInEntry } from "../domain/model.ts";
import { createPatchPort, type PatchEditor, writeLock } from "./patch-writer.ts";
import { createSettingsPort, type RawSettingsService } from "./settings-adapter.ts";
import { createWorkspaceKeys } from "./workspace-adapter.ts";

export type { BuiltinOrdersMirror, BuiltinOrdersSeams, LoadBuiltinOrdersOptions } from "./builtin-orders.ts";
export {
  BUILTIN_ORDERS,
  builtinOrdersByName,
  loadBuiltinOrders,
  parseBuiltinOrders,
  unmappedBuiltinKeys,
} from "./builtin-orders.ts";
export { insertionIndex, PromptProfilesRegistry } from "./loader-registry.ts";
export type { PatchDocument, PatchEditor } from "./patch-writer.ts";
export {
  createPatchPort,
  disableRow,
  insertRow,
  listRowIds,
  provenance,
  readPatchRows,
  removeRow,
  renameSectionRow,
  setWriteGate,
  toPatchId,
  withPatchBatch,
  withWriteLock,
  writeLock,
} from "./patch-writer.ts";
export type { RetryingCache, SessionSnapshotsOptions, StorageDomainHandle } from "./session-snapshots.ts";
export { createSessionSnapshots, retryingCache, sealSnapshot } from "./session-snapshots.ts";
export type { RawSettingsService } from "./settings-adapter.ts";
export { createSettingsPort } from "./settings-adapter.ts";
export { createWorkspaceKeys, resolveWorkspaceKeys } from "./workspace-adapter.ts";

// #region TYPE_service
/** The `promptProfiles` service surface the composition helper reads. */
export interface RegistryService {
  sections(): SectionView[];
  profiles(): ProfileView[];
  usedIn(sectionId: ConfigId): UsedInEntry[];
  config: {
    default: { get(): string };
    lastByWorkspace: { get(): Record<string, string> | undefined };
  };
  builtinOrders(): Record<string, number>;
  builtinOrdersByName?(): Record<string, number>;
}

export interface HostPortsOptions {
  service: RegistryService;
  /** Cordis REFLECT reader for the optional driven services. */
  getService?: (name: string) => unknown;
  warn?: WarnFn;
  log?: LogPort;
}
// #endregion TYPE_service

// #region FUNC_createHostPorts
/**
 * @purpose Compose the `HostPorts` bag for one operation set from the
 *   registry service and a REFLECT reader. The registry and orders ports are
 *   thin views; settings, patch, presets and workspaces are wrapped in their
 *   adapters on EVERY read, which is what keeps late service appearance and
 *   per-call degradation intact.
 */
export function createHostPorts({ service, getService, warn, log }: HostPortsOptions): HostPorts {
  const read = (name: string): unknown => {
    try {
      return getService?.(name) ?? undefined;
    } catch {
      return undefined;
    }
  };
  const registry: LoaderRegistryPort = {
    sections: () => service.sections(),
    profiles: () => service.profiles(),
    usedIn: (sectionId) => service.usedIn(sectionId),
    defaultId: () => service.config.default.get(),
    lastByWorkspace: () => service.config.lastByWorkspace.get(),
  };
  const orders: BuiltinOrdersPort = {
    orders: () => service.builtinOrders(),
    ordersByName: () => service.builtinOrdersByName?.() ?? {},
  };
  return {
    registry,
    orders,
    lock: writeLock,
    settings: () => {
      const raw = read("settings");
      return raw ? createSettingsPort(raw as RawSettingsService) : undefined;
    },
    patch: () => {
      const raw = read("configEditor");
      return raw ? createPatchPort(raw as PatchEditor) : undefined;
    },
    presets: () => {
      const raw = read("agentPresets");
      return raw ? (raw as AgentPresetsPort) : undefined;
    },
    workspaces: () => createWorkspaceKeys(read("workspaceRegistry") as WorkspaceRegistryPort | undefined),
    warn,
    log,
  };
}
// #endregion FUNC_createHostPorts
