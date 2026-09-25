import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/infra/settings-adapter.ts
function createSettingsPort(settings) {
  return {
    revision: () => settings.describe?.().find((entry) => entry.ns === "prompt-profiles")?.revision,
    replace: async (namespace, value, expectedRevision) => settings.replace(namespace, value, expectedRevision),
    mutate: async (namespace, ops, expectedRevision) => settings.mutate(namespace, ops, expectedRevision)
  };
}

export {
  createSettingsPort
};
//# sourceMappingURL=chunk-JXN3JPCQ.js.map
