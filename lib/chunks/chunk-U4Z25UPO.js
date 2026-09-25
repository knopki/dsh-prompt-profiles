import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/registry.ts
var unwrapVolatile = (value) => value != null && typeof value.get === "function" ? value.get() : value;
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
   * @param {object} [options]
   * @param {(message: string, details?: unknown) => void} [options.warn]
   *   duplicate-id sink (defaults to console.warn).
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
   * Register one `.../section` row (SPEC §5.1). `source` is
   * `'bundle' | 'user' | 'unknown'`.
   * @returns {() => void} disposer; a no-op when a later row with the same
   *   config.id already overrode this registration.
   */
  registerSection(row) {
    return this.#register("section", this.#sections, row);
  }
  // #endregion METHOD_registerSection
  // #region METHOD_registerProfile
  /**
   * Register one `.../profile` row (SPEC §5.1); same disposer semantics as
   * {@link registerSection}.
   */
  registerProfile(row) {
    return this.#register("profile", this.#profiles, row);
  }
  // #endregion METHOD_registerProfile
  // #region METHOD_sections
  /** Detached view of every section, sorted by `id` (SPEC decision). */
  sections() {
    return [...this.#sections.values()].map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  // #endregion METHOD_sections
  // #region METHOD_profiles
  /** Detached view of every profile, sorted by `title` then `id` (SPEC decision 19). */
  profiles() {
    return [...this.#profiles.values()].map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source })).sort(
      (a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  }
  // #endregion METHOD_profiles
  // #region METHOD_usedIn
  /**
   * Which profiles reference a section, with per-profile scope — feeds the
   * editor's read-only «используется в» field (SPEC §2 #26).
   * @returns {Array<{ profileId: string, scope: string }>} sorted by
   *   profileId; a section referenced twice contributes one entry per ref.
   */
  usedIn(sectionId) {
    const uses = [];
    for (const profile of this.#profiles.values()) {
      for (const ref of configView(profile.config).sections ?? []) {
        if (ref.id === sectionId) {
          uses.push({ profileId: profile.config.id, scope: ref.scope ?? "inherit" });
        }
      }
    }
    return uses.sort((a, b) => a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0);
  }
  // #endregion METHOD_usedIn
  // #region METHOD_register
  /**
   * Shared registration path (SPEC §5.1). Each kind/id keeps a STACK of live
   * registrations; the per-kind Map exposes the top of the stack (later
   * registration wins deterministically). Disposing the top reveals the next
   * surviving registration, so an HMR teardown of an overriding row RESTORES
   * the still-mounted one instead of dropping the id from prompts.
   */
  #register(kind, map, { rowId, config, source = "unknown" }) {
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
      if (index < 0) return;
      live.splice(index, 1);
      if (live.length === 0) {
        this.#stacks.delete(key);
        if (map.get(config.id) === entry) map.delete(config.id);
        return;
      }
      if (map.get(config.id) === entry) map.set(config.id, live[live.length - 1]);
    };
  }
  // #endregion METHOD_register
};
function insertionIndex(sectionOrders, presentBuiltinNames, builtinOrders) {
  const names = [...presentBuiltinNames ?? []];
  const knownOrders = [];
  for (const name of names) {
    const order = builtinOrders?.[name];
    knownOrders.push(typeof order === "number" && Number.isFinite(order) ? order : null);
  }
  return [...sectionOrders ?? []].map((order) => {
    if (!Number.isFinite(order)) throw new TypeError(`insertionIndex: non-finite order ${order}`);
    let index = 0;
    for (let i = 0; i < knownOrders.length; i++) {
      if (knownOrders[i] !== null && knownOrders[i] < order) index = i + 1;
    }
    return { order, index };
  });
}

export {
  PromptProfilesRegistry,
  insertionIndex
};
//# sourceMappingURL=chunk-U4Z25UPO.js.map
