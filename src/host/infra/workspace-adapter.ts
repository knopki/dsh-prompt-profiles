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

import type { WorkspaceKeyRequest, WorkspaceKeysPort, WorkspaceOwner } from "../application/ports.ts";

/** The optional workspace registry behind key resolution and pruning. */
export interface WorkspaceRegistryPort {
  get?(id: string): unknown;
  list?(): WorkspaceOwner[];
  resolveByPath?(path: string): WorkspaceOwner | null | undefined | Promise<WorkspaceOwner | null | undefined>;
}

// #region FUNC_resolveWorkspaceKeys
/**
 * @purpose Derive the ordered keys a workspace choice is written under and
 *   read from. Order: registry membership, canonical path, cwd, explicit id;
 *   unique, first wins.
 */
export async function resolveWorkspaceKeys({
  workspaceRegistry,
  session,
  workspaceId,
  cwd,
}: {
  workspaceRegistry?: WorkspaceRegistryPort | null;
  session?: { id?: string } | null;
  workspaceId?: string;
  cwd?: string | null;
} = {}): Promise<string[]> {
  const path = typeof cwd === "string" && cwd !== "" ? cwd : null;
  const candidates: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value !== "" && !candidates.includes(value)) candidates.push(value);
  };
  const sessionId = session?.id;
  if (typeof sessionId === "string" && sessionId !== "" && typeof workspaceRegistry?.list === "function") {
    try {
      const owner = workspaceRegistry.list().find((workspace) => {
        const ids = workspace?.sessionIds;
        return Array.isArray(ids) && ids.includes(sessionId);
      });
      add(owner?.id);
    } catch {
      // registry unavailable/opaque: fall through to path resolution
    }
  }
  if (path !== null && typeof workspaceRegistry?.resolveByPath === "function") {
    try {
      const owner = await workspaceRegistry.resolveByPath(path);
      add(owner?.id);
    } catch {
      // nonexistent/unregistered path: the raw cwd is the fallback key
    }
  }
  add(path);
  add(workspaceId);
  return candidates.length > 0 ? candidates : [""];
}
// #endregion FUNC_resolveWorkspaceKeys

// #region FUNC_createWorkspaceKeys
/** @purpose Bind `WorkspaceKeysPort` to one (possibly absent) registry service. */
export function createWorkspaceKeys(registry: WorkspaceRegistryPort | null | undefined): WorkspaceKeysPort {
  return {
    keys: (request: WorkspaceKeyRequest) =>
      resolveWorkspaceKeys({
        workspaceRegistry: registry,
        session: request.session,
        workspaceId: request.workspaceId,
        cwd: request.cwd,
      }),
    knows: (id: string): boolean | undefined => {
      if (typeof registry?.get !== "function") return undefined;
      try {
        return Boolean(registry.get(id));
      } catch {
        return undefined; // unreadable registry: do not drop a possibly-live key
      }
    },
  };
}
// #endregion FUNC_createWorkspaceKeys
