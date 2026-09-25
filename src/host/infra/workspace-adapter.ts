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

import type {
  WorkspaceKeyRequest,
  WorkspaceKeysPort,
  WorkspaceOwner,
  WorkspaceRegistryPort,
} from "../application/ports.ts";

// #region FUNC_resolveWorkspaceKeys
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

/** The registry view a raw Cordis `workspaceRegistry` service satisfies. */
export type { WorkspaceOwner };
// #endregion FUNC_createWorkspaceKeys
