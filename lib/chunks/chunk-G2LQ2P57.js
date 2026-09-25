import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/infra/session-snapshots.ts
function retryingCache(create) {
  let cached = null;
  const get = () => {
    cached ??= Promise.resolve().then(create).then(
      (value) => value,
      (error) => {
        cached = null;
        throw error;
      }
    );
    return cached;
  };
  return Object.assign(get, { cached: () => cached });
}
async function sealSnapshot({
  sessionId,
  createSnapshot,
  memo,
  openTable,
  warn = () => {
  }
}) {
  let entry = memo.get(sessionId);
  if (entry === void 0) {
    let snapshot;
    let persisted = false;
    try {
      const table = await openTable();
      const saved = table.get(sessionId);
      if (saved !== void 0) {
        snapshot = saved;
        persisted = true;
      } else {
        snapshot = createSnapshot();
      }
    } catch (error) {
      warn("prompt-profiles storage unavailable; snapshot decision pinned in memory", { sessionId, error });
      snapshot = createSnapshot();
    }
    entry = { snapshot, persisted };
    memo.set(sessionId, entry);
  }
  if (!entry.persisted) {
    try {
      const table = await openTable();
      if (table.get(sessionId) === void 0) await table.put(sessionId, entry.snapshot);
      entry.persisted = true;
    } catch {
    }
  }
  return entry.snapshot;
}
function createSessionSnapshots({ openDomain, warn }) {
  const open = retryingCache(openDomain);
  const pending = /* @__PURE__ */ new Map();
  const decided = /* @__PURE__ */ new Map();
  return {
    seal(sessionId, createSnapshot) {
      let sealed = pending.get(sessionId);
      if (sealed === void 0) {
        sealed = sealSnapshot({
          sessionId,
          createSnapshot,
          memo: decided,
          openTable: async () => (await open()).table("sessions"),
          warn
        });
        pending.set(sessionId, sealed);
        void sealed.finally(() => pending.delete(sessionId)).catch(() => {
        });
      }
      return sealed;
    },
    async close() {
      pending.clear();
      const cached = open.cached();
      if (cached)
        await cached.then(
          (domain) => domain.close(),
          () => {
          }
        );
    }
  };
}

export {
  retryingCache,
  sealSnapshot,
  createSessionSnapshots
};
//# sourceMappingURL=chunk-G2LQ2P57.js.map
