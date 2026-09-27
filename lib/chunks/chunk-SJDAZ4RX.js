import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  usedIn
} from "./chunk-NDVCKZMT.js";

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
  /** @param options.warn duplicate-id sink (defaults to console.warn). */
  constructor({ warn = console.warn } = {}) {
    this.#warn = warn;
    this.#sections = /* @__PURE__ */ new Map();
    this.#profiles = /* @__PURE__ */ new Map();
    this.#stacks = /* @__PURE__ */ new Map();
  }
  /**
   * Register one `.../section` row (SPEC §5.1).
   * @returns disposer; a no-op when a later row with the same config.id
   *   already overrode this registration.
   */
  registerSection(row) {
    return this.#register("section", this.#sections, row);
  }
  /** Register one `.../profile` row; same disposer semantics as registerSection. */
  registerProfile(row) {
    return this.#register("profile", this.#profiles, row);
  }
  /** Detached view of every section, sorted by `id`. */
  sections() {
    return [...this.#sections.values()].map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  /** Detached view of every profile, sorted by `title` then `id` (SPEC decision 19). */
  profiles() {
    return [...this.#profiles.values()].map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source })).sort(
      (a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  }
  /**
   * Which profiles reference a section, with per-profile scope — feeds the
   * editor's read-only «используется в» field (SPEC §2 #26). A section
   * referenced twice contributes one entry per reference.
   */
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
  /**
   * Shared registration path (SPEC §5.1). Each kind/id keeps a STACK of live
   * registrations; the per-kind Map exposes the top of the stack (later
   * registration wins deterministically). Disposing the top reveals the next
   * surviving registration, so an HMR teardown of an overriding row RESTORES
   * the still-mounted one instead of dropping the id from prompts.
   */
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
//# sourceMappingURL=chunk-SJDAZ4RX.js.map
