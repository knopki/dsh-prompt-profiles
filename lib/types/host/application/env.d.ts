/**
 * #region moduleContract
 * @modulecontract
 * @purpose Hold what the operation use cases share — payload helpers, row
 *   addressing, id sets, settings writes and the delete path — so each
 *   per-domain use case module stays a thin statement of what it does.
 * @scope
 *  - Shared helpers and their port wiring only; the operations themselves live
 *    in state.ts, preview.ts, sections.ts, profiles.ts and assembler.ts.
 *  - NOT: the ports (ports.ts), the adapters (infra/), or any surface.
 * @invariants
 *  - Every payload is validated BEFORE anything is written, so a refused call
 *    leaves the patch file byte-identical.
 *  - Mutations run inside the bundle's one write lock, so operation updates
 *    never interleave with writer mutations in this process.
 *  - Optional services are resolved per call through the ports, so a
 *    late-appearing service is picked up and a missing one degrades per
 *    operation.
 * @keywords use cases, environment, validation, row addressing, write lock
 * #endregion moduleContract
 */
import type { ConfigId, ProfileView, RowKind, SectionView } from "../domain/model.ts";
import type { HostPorts, LoaderRegistryPort, PatchPort, SettingsOp, SettingsPort } from "./ports.ts";
/** One addressed registry row plus the normalized patch id every write uses. */
export interface AddressedRow<Row> {
    row: Row;
    patchId: string;
}
/** Result of a delete path: `true` when the row could only be disabled. */
export interface DeleteResult {
    disabled: boolean;
}
/** Everything an operation use case module receives. */
export interface UseCaseEnv {
    ports: HostPorts;
    registry: LoaderRegistryPort;
    /**
     * The canonical patch row id for a registry view row; the view type allows a
     * null rowId for a row mounted outside a composition row.
     */
    patchIdOf(rowId: string | null): string;
    sectionTargets(): Map<string, ConfigId>;
    pendingSectionIds(): Set<string>;
    /** Every id a NEW row of `kind` must not reuse. */
    idsInUse(kind: RowKind): Set<string>;
    /** Registered config ids of `kind` an explicit new id must not duplicate. */
    registeredConfigIds(kind: RowKind): Set<string>;
    resolveSection(received: string): AddressedRow<SectionView>;
    resolveProfile(received: string): AddressedRow<ProfileView>;
    /** Can this profile still be chosen, per the authoritative patch? */
    profileSelectable(profileId: string): boolean;
    requireSettings(): SettingsPort;
    requireStorage(): {
        settings: SettingsPort;
        patch: PatchPort;
    };
    settingsWrite(namespace: string, value: unknown, revision?: number): Promise<void>;
    mutateWithRetry(buildOps: (state: {
        revisionAvailable: boolean;
    }) => SettingsOp[], options?: {
        clientRevision?: number;
    }): Promise<boolean>;
    deleteRow(patchId: string, name: string): Promise<DeleteResult>;
    mapDuplicate(error: unknown): never;
}
/** Title with a DEFAULT allowed (frozen contract): missing or blank uses the fallback. */
export declare function titleOrDefault(value: string | undefined, fallback: string): string;
/**
 * Normalize an EXPLICIT create/rename id to the full `prompt-<kind>-<token>`
 * form, or null when the payload named no id (the server mints one). A
 * malformed id is rejected here, before anything is written.
 */
export declare function explicitRowId(label: string, kind: RowKind, value: unknown): string | null;
/**
 * @purpose Build the shared use-case environment over one driven-ports bag.
 *   The environment is created once per surface; every optional service is
 *   still read per call, so a late-appearing service is honoured.
 */
export declare function createUseCaseEnv(ports: HostPorts): UseCaseEnv;
