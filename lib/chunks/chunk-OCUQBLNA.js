import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  usedIn
} from "./chunk-UFMJ35D5.js";

// src/host/infra/loader-registry.ts
var unwrapVolatile = (value) => {
  if (value != null && typeof value.get === "function") {
    return value.get();
  }
  return value;
};
function configView(config) {
  if (config == null || typeof config !== "object") return config;
  const view = {};
  for (const [key, value] of Object.entries(config)) view[key] = unwrapVolatile(value);
  return view;
}
var PromptProfilesRegistry = class {
  #warn;
  #sections;
  #profiles;
  #stacks;
  // #region METHOD_constructor
  /**
   * @purpose Initialize empty section/profile registries with the selected duplicate warning sink.
   */
  constructor({ warn = console.warn } = {}) {
    this.#warn = warn;
    this.#sections = /* @__PURE__ */ new Map();
    this.#profiles = /* @__PURE__ */ new Map();
    this.#stacks = /* @__PURE__ */ new Map();
  }
  // #endregion METHOD_constructor
  // #region METHOD_registerSection
  /**
   * @purpose Register a section and return a disposer that restores any shadowed registration.
   */
  registerSection(row) {
    return this.#register("section", this.#sections, row);
  }
  // #endregion METHOD_registerSection
  // #region METHOD_registerProfile
  /**
   * @purpose Register a profile and return a disposer that restores any shadowed registration.
   */
  registerProfile(row) {
    return this.#register("profile", this.#profiles, row);
  }
  // #endregion METHOD_registerProfile
  // #region METHOD_sections
  /** @purpose Return detached section views in stable id order. */
  sections() {
    return [...this.#sections.values()].map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  // #endregion METHOD_sections
  // #region METHOD_profiles
  /** @purpose Return detached profile views in title/id order. */
  profiles() {
    return [...this.#profiles.values()].map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source })).sort(
      (a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  }
  // #endregion METHOD_profiles
  // #region METHOD_usedIn
  /** @purpose Report each profile reference to the requested section with its scope. */
  usedIn(sectionId) {
    return usedIn(
      [...this.#profiles.values()].map((entry) => {
        const view = configView(entry.config);
        return {
          id: entry.config.id,
          sections: Array.isArray(view.sections) ? view.sections : []
        };
      }),
      sectionId
    );
  }
  // #endregion METHOD_usedIn
  /** Later registration wins; disposing it restores the prior live entry. */
  #register(kind, map, row) {
    const { rowId = null, config, source = "unknown" } = row;
    if (!config || typeof config.id !== "string" || config.id === "") {
      throw new TypeError(`prompt-profiles: ${kind} row ${rowId ?? "?"} has no valid config.id`);
    }
    const key = `${kind}:${config.id}`;
    const stack = this.#stacks.get(key) ?? [];
    const winner = stack[stack.length - 1];
    if (winner) {
      this.#warn(
        `prompt-profiles: duplicate ${kind} config.id "${config.id}" \u2014 row "${winner.rowId}" is overridden by row "${rowId}" (later registration wins)`
      );
    }
    const entry = { rowId, config, source };
    stack.push(entry);
    this.#stacks.set(key, stack);
    map.set(config.id, entry);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const live = this.#stacks.get(key);
      const index = live?.lastIndexOf(entry) ?? -1;
      if (live === void 0 || index < 0) return;
      live.splice(index, 1);
      if (live.length === 0) {
        this.#stacks.delete(key);
        if (map.get(config.id) === entry) map.delete(config.id);
        return;
      }
      if (map.get(config.id) === entry) map.set(config.id, live[live.length - 1]);
    };
  }
};

export {
  PromptProfilesRegistry
};
//# sourceMappingURL=chunk-OCUQBLNA.js.map
