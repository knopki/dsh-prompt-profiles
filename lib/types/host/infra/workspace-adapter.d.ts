/**
 * #region moduleContract
 * @modulecontract
 * @purpose Derive the same ordered workspace keys for the chip choice and the
 *   assembler, and answer whether a stored workspace id is still known.
 * @scope
 *  - Key candidate resolution over the optional workspace registry.
 *  - NOT: reading or writing the choice itself.
 * @invariants
 *  - Nothing derivable degrades to [""]. An unreadable registry answers
 *    `undefined`, never dropping a possibly-live id.
 * #endregion moduleContract
 */
import type { WorkspaceKeysPort, WorkspaceOwner } from "../application/ports.ts";
/** The optional workspace registry behind key resolution and pruning. */
export interface WorkspaceRegistryPort {
    get?(id: string): unknown;
    list?(): WorkspaceOwner[];
    resolveByPath?(path: string): WorkspaceOwner | null | undefined | Promise<WorkspaceOwner | null | undefined>;
}
/**
 * @purpose Derive the ordered keys a workspace choice is written under and
 *   read from. Order: registry membership, canonical path, cwd, explicit id;
 *   unique, first wins.
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
