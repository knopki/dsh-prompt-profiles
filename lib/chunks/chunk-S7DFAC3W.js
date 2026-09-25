import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/infra/workspace-adapter.ts
async function resolveWorkspaceKeys({
  workspaceRegistry,
  session,
  workspaceId,
  cwd
} = {}) {
  const path = typeof cwd === "string" && cwd !== "" ? cwd : null;
  const candidates = [];
  const add = (value) => {
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
    }
  }
  if (path !== null && typeof workspaceRegistry?.resolveByPath === "function") {
    try {
      const owner = await workspaceRegistry.resolveByPath(path);
      add(owner?.id);
    } catch {
    }
  }
  add(path);
  add(workspaceId);
  return candidates.length > 0 ? candidates : [""];
}
function createWorkspaceKeys(registry) {
  return {
    keys: (request) => resolveWorkspaceKeys({
      workspaceRegistry: registry,
      session: request.session,
      workspaceId: request.workspaceId,
      cwd: request.cwd
    }),
    knows: (id) => {
      if (typeof registry?.get !== "function") return void 0;
      try {
        return Boolean(registry.get(id));
      } catch {
        return void 0;
      }
    }
  };
}

export {
  resolveWorkspaceKeys,
  createWorkspaceKeys
};
//# sourceMappingURL=chunk-S7DFAC3W.js.map
