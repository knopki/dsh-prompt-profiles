/**
 * #region moduleContract
 * @modulecontract
 * @purpose Offer every driven adapter from one import, plus the helper turning
 *   raw services into the `HostPorts` bag the operation set consumes.
 * @scope
 *  - Re-exports of the adapters in this directory and `createHostPorts`.
 *  - NOT: use cases or the application port interfaces themselves.
 * @invariants
 *  - Optional services are read at call time; every adapter shares the
 *    module-level patch mutex exported as `writeLock`.
 * #endregion moduleContract
 */
import type { HostPorts, LogPort, WarnFn } from "../application/ports.ts";
import type { ConfigId, ProfileView, SectionView, UsedInEntry } from "../domain/model.ts";
export type { BuiltinOrdersMirror, BuiltinOrdersSeams, LoadBuiltinOrdersOptions } from "./builtin-orders.ts";
export { BUILTIN_ORDERS, builtinOrdersByName, loadBuiltinOrders, parseBuiltinOrders, unmappedBuiltinKeys, } from "./builtin-orders.ts";
export { insertionIndex, PromptProfilesRegistry } from "./loader-registry.ts";
export type { PatchEditor } from "./patch-writer.ts";
export { createPatchPort, disableRow, insertRow, listRowIds, provenance, readPatchRows, removeRow, renameSectionRow, setWriteGate, toPatchId, withPatchBatch, withWriteLock, writeLock, } from "./patch-writer.ts";
export type { RetryingCache, SessionSnapshotsOptions, StorageDomainHandle } from "./session-snapshots.ts";
export { createSessionSnapshots, retryingCache, sealSnapshot } from "./session-snapshots.ts";
export type { RawSettingsService } from "./settings-adapter.ts";
export { createSettingsPort } from "./settings-adapter.ts";
export type { WorkspaceRegistryPort } from "./workspace-adapter.ts";
export { createWorkspaceKeys, resolveWorkspaceKeys } from "./workspace-adapter.ts";
/**
 * The `promptProfiles` service surface the composition helper reads.
 *
 * @purpose Describe the registry service `createHostPorts` adapts.
 */
export interface RegistryService {
    sections(): SectionView[];
    profiles(): ProfileView[];
    usedIn(sectionId: ConfigId): UsedInEntry[];
    config: {
        default: {
            get(): string;
        };
        lastByWorkspace: {
            get(): Record<string, string> | undefined;
        };
    };
    builtinOrders(): Record<string, number>;
    builtinOrdersByName?(): Record<string, number>;
}
/**
 * @purpose Options for composing the `HostPorts` bag.
 */
interface HostPortsOptions {
    service: RegistryService;
    /** Cordis REFLECT reader for the optional driven services. */
    getService?: (name: string) => unknown;
    warn?: WarnFn;
    log?: LogPort;
}
/** @purpose Compose the `HostPorts` bag from the registry service and a REFLECT reader. */
export declare function createHostPorts({ service, getService, warn, log }: HostPortsOptions): HostPorts;
