import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  createPatchPort,
  writeLock
} from "./chunk-USWVTYB5.js";
import {
  createSettingsPort
} from "./chunk-5QYDOFDS.js";
import {
  createWorkspaceKeys
} from "./chunk-QCPT2F4L.js";

// src/host/infra/index.ts
function createHostPorts({ service, getService, warn, log }) {
  const read = (name) => {
    try {
      return getService?.(name) ?? void 0;
    } catch {
      return void 0;
    }
  };
  const registry = {
    sections: () => service.sections(),
    profiles: () => service.profiles(),
    usedIn: (sectionId) => service.usedIn(sectionId),
    defaultId: () => service.config.default.get(),
    lastByWorkspace: () => service.config.lastByWorkspace.get()
  };
  const orders = {
    orders: () => service.builtinOrders(),
    ordersByName: () => service.builtinOrdersByName?.() ?? {}
  };
  return {
    registry,
    orders,
    lock: writeLock,
    settings: () => {
      const raw = read("settings");
      return raw ? createSettingsPort(raw) : void 0;
    },
    patch: () => {
      const raw = read("configEditor");
      return raw ? createPatchPort(raw) : void 0;
    },
    presets: () => {
      const raw = read("agentPresets");
      return raw ? raw : void 0;
    },
    workspaces: () => createWorkspaceKeys(read("workspaceRegistry")),
    warn,
    log
  };
}

export {
  createHostPorts
};
//# sourceMappingURL=chunk-JGTVG7U5.js.map
