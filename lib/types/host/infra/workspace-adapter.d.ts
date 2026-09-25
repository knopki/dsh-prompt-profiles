/**
 * #region moduleContract
 * @modulecontract
 * @purpose Make the write side of the chip choice (`/last`) and the assembler
 *   derive the SAME ordered workspace keys — and answer whether a stored
 *   workspace id is still known — behind the `WorkspaceKeysPort`.
 * @scope
 *  - Key candidate resolution over the optional workspace registry, with the
 *    registry read guarded at every step.
 *  - NOT: reading or writing the choice itself (settings adapter + operations).
 * @invariants
 *  - Nothing derivable degrades to [""], so a blank session still has a key.
 *  - An unreadable registry never drops a possibly-live id: an unresolvable
 *    membership question answers `undefined`, not false.
 * @keywords workspace keys, workspace registry, resolution, adapter
 * #endregion moduleContract
 */
import type { WorkspaceKeysPort, WorkspaceOwner, WorkspaceRegistryPort } from "../application/ports.ts";
/**
 * @purpose Derive the ordered keys a workspace choice is written under and
 *   read from, so an explicit choice reaches `resolveProfileId` and the prompt
 *   across both key shapes. The first candidate is where NEW choices are
 *   written; reading walks the whole list, so a choice stored under a UUID key
 *   and one stored under the cwd key for the same workspace are both honoured.
 *
 * RESOLUTION ORDER (duplicates removed, first hit wins): the workspace
 * registry's membership for THIS session (`list()` + `sessionIds`), the
 * canonical workspace id owning `cwd` (`resolveByPath`), the raw `cwd`, an
 * explicit `workspaceId`.
 */
export declare function resolveWorkspaceKeys({ workspaceRegistry, session, workspaceId, cwd, }?: {
    workspaceRegistry?: WorkspaceRegistryPort | null;
    session?: {
        id?: string;
    } | null;
    workspaceId?: string;
    cwd?: string | null;
}): Promise<string[]>;
/** @purpose Bind `WorkspaceKeysPort` to one (possibly absent) registry service. */
export declare function createWorkspaceKeys(registry: WorkspaceRegistryPort | null | undefined): WorkspaceKeysPort;
/** The registry view a raw Cordis `workspaceRegistry` service satisfies. */
export type { WorkspaceOwner };
