/**
 * Pure registry of prompt sections and profiles (no Cordis at import time).
 * #region moduleContract
 * @modulecontract
 * @purpose Own the authoritative in-memory view of every registered section
 *   and profile row so the service, the editor and the prompt-injection step
 *   all read one consistent, deterministically ordered dataset.
 * @scope
 *  - Registration/disposal with duplicate-config.id policy (SPEC §5.1),
 *    sorted views, usedIn lookup, effectiveOrder and insertionIndex helpers.
 *  - Pure data structure: no Cordis import, no filesystem, no clock.
 *  - NOT: mounting rows (lib/section.js, lib/profile.js), serving the
 *    registry on ctx (lib/index.js), prompt injection (PLAN step 3).
 * @invariants
 *  - views returned by sections()/profiles() are fresh shallow copies in a
 *    stable sort order; mutating them never affects the registry.
 *  - a duplicate config.id deterministically resolves to the registration
 *    that mounted LAST; disposing an overridden registration is a no-op.
 *  - effectiveOrder never returns a value equal to a known built-in order.
 * @dependencies USES API: none (pure). Consumers inject warn callbacks.
 * @rationale
 *  - Q: Why compute insertion indices against names, not section.order?
 *    A: Spike R1 proved assembled sections are sorted BEFORE the waterfall
 *    and their entries carry NO `order` field — only built-in NAMES present
 *    in the assembly can serve as anchors (see FUNC_insertionIndex).
 * @keywords registry, sections, profiles, duplicate, usedIn, effectiveOrder,
 *   insertionIndex, prompt profiles
 * #endregion moduleContract
 */

// #region CLASS_PromptProfilesRegistry
/**
 * Pure in-memory registry of section and profile rows.
 *
 * @purpose Let any number of bundles contribute sections/profiles through
 *   loader rows while consumers see one stable, duplicate-safe dataset.
 */
export class PromptProfilesRegistry {
  #warn;
  #sections;
  #profiles;
  #generations;

  // #region METHOD_constructor
  /**
   * @purpose Bind the warning sink and empty the kind maps so a fresh
   *   registry always presents zero rows and deterministic generation state.
   * @param {object} [options]
   * @param {(message: string, details?: unknown) => void} [options.warn]
   *   warning sink for duplicate ids (defaults to console.warn).
   */
  constructor({ warn = console.warn } = {}) {
    this.#warn = warn;
    this.#sections = new Map();
    this.#profiles = new Map();
    this.#generations = new Map();
  }
  // #endregion METHOD_constructor

  // #region METHOD_registerSection
  /**
   * Register one section row (SPEC §5.1).
   *
   * @purpose Make a `.../section` loader row visible to profiles and editors.
   * @param {object} row
   * @param {string} row.rowId - composition row id (for warnings/overrides).
   * @param {{ id: string, title: string, body: string }} row.config
   * @param {string} row.source - provenance tag (`'bundle' | 'user' | 'unknown'`).
   * @returns {() => void} disposer; a no-op when this registration was
   *   already overridden by a later row with the same config.id.
   */
  registerSection(row) {
    return this.#register("section", this.#sections, row);
  }
  // #endregion METHOD_registerSection

  // #region METHOD_registerProfile
  /**
   * Register one profile row (SPEC §5.1).
   *
   * @purpose Make a `.../profile` loader row visible to pickers and editors.
   * @param {object} row
   * @param {string} row.rowId
   * @param {{ id: string, title: string, sections: Array<{ id: string, order: number, scope?: string }> }} row.config
   * @param {string} row.source
   * @returns {() => void} disposer (same override semantics as registerSection).
   */
  registerProfile(row) {
    return this.#register("profile", this.#profiles, row);
  }
  // #endregion METHOD_registerProfile

  // #region METHOD_sections
  /**
   * @purpose Hand consumers a detached, deterministically id-sorted view of
   *   every registered section so snapshots and the editor agree on content
   *   and order.
   * @returns {Array<{ id, title, body, rowId, source }>} sorted by `id`
   *   (SPEC decision: sections sort by id).
   */
  sections() {
    return [...this.#sections.values()]
      .map((entry) => ({ ...entry.config, rowId: entry.rowId, source: entry.source }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  // #endregion METHOD_sections

  // #region METHOD_profiles
  /**
   * @purpose Hand consumers a detached, title-sorted view of every registered
   *   profile so pickers and editors render one stable list.
   * @returns {Array<{ id, title, sections, rowId, source }>} sorted by
   *   `title`, ties broken by `id` (SPEC decision 19: profiles sort by title).
   */
  profiles() {
    return [...this.#profiles.values()]
      .map((entry) => ({ ...entry.config, rowId: entry.rowId, source: entry.source }))
      .sort((a, b) => a.title.localeCompare(b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  // #endregion METHOD_profiles

  // #region METHOD_usedIn
  /**
   * Which profiles reference a section, with per-profile scope.
   *
   * @purpose Feed the editor's read-only «используется в» field (SPEC §2 #26).
   * @param {string} sectionId
   * @returns {Array<{ profileId: string, scope: string }>} sorted by profileId;
   *   a profile referencing the section twice contributes one entry per
   *   reference (scope may differ).
   */
  usedIn(sectionId) {
    const uses = [];
    for (const profile of this.#profiles.values()) {
      for (const ref of profile.config.sections ?? []) {
        if (ref.id === sectionId) {
          uses.push({ profileId: profile.config.id, scope: ref.scope ?? "inherit" });
        }
      }
    }
    return uses.sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));
  }
  // #endregion METHOD_usedIn

  // #region METHOD_register
  /**
   * Shared registration path with the duplicate policy of SPEC §5.1:
   * warn naming BOTH rowIds, later registration wins deterministically,
   * overridden disposals are no-ops.
   */
  #register(kind, map, { rowId, config, source = "unknown" }) {
    if (!config || typeof config.id !== "string" || config.id === "") {
      throw new TypeError(`prompt-profiles: ${kind} row ${rowId ?? "?"} has no valid config.id`);
    }
    const previous = map.get(config.id);
    if (previous) {
      const message = `prompt-profiles: duplicate ${kind} config.id "${config.id}"` +
        ` — row "${previous.rowId}" is overridden by row "${rowId}" (later registration wins)`;
      this.#warn(message);
    }
    const generation = (this.#generations.get(`${kind}:${config.id}`) ?? 0) + 1;
    this.#generations.set(`${kind}:${config.id}`, generation);
    map.set(config.id, { rowId, config, source });
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      if (map.get(config.id)?.rowId === rowId && this.#generations.get(`${kind}:${config.id}`) === generation) {
        map.delete(config.id);
      }
    };
  }
  // #endregion METHOD_register
}
// #endregion CLASS_PromptProfilesRegistry

// #region FUNC_effectiveOrder
/**
 * SPEC decision 7: a free-integer order colliding with a known built-in
 * order shifts by +0.5 so our section lands deterministically after the
 * built-in that claims the same slot.
 *
 * @purpose Guarantee our sections never tie a built-in order (ties are
 *   resolved by name comparison upstream — undesirable).
 * @param {number} order - the profile row's chosen order.
 * @param {Record<string, number>} builtinOrders - any known order table
 *   (values are compared; keys are irrelevant).
 * @returns {number} `order` unchanged, or `order + 0.5` on collision.
 */
export function effectiveOrder(order, builtinOrders) {
  if (!Number.isFinite(order)) throw new TypeError(`effectiveOrder: order must be finite, got ${order}`);
  const values = Object.values(builtinOrders ?? {});
  return values.includes(order) ? order + 0.5 : order;
}
// #endregion FUNC_effectiveOrder

// #region FUNC_insertionIndex
/**
 * Where our sections must be spliced into an already-sorted
 * `assembly.sections` array.
 *
 * Spike-proven constraints this encodes (R1, .spike/R1-R2-injection-and-patch.md):
 *  - assembled sections are sorted BEFORE the waterfall and never re-sorted;
 *  - assembled entries carry NO `order` field — only their `name`;
 *  - therefore only built-in NAMES PRESENT IN THAT ASSEMBLY can serve as
 *    anchors; a built-in known to the mirror but absent from this assembly
 *    must not influence placement, and foreign/unknown names have no knowable
 *    order at all.
 *
 * Placement rule: a section with effective order `o` is inserted immediately
 * AFTER the last array element whose mapped builtin order is known and `< o`
 * (0 when none). Elements with unknown names are skipped by the scan, so our
 * section lands relative to recognized built-ins only — the exact policy the
 * spike fixed for foreign sections.
 *
 * @purpose Compute pure, testable splice indices for the step-2b/3 waterfall
 *   listener.
 * @param {number[]} sectionOrders - our sections' EFFECTIVE orders (already
 *   sorted ascending — the listener sorts snapshot sections the same way).
 * @param {string[]} presentBuiltinNames - names of `assembly.sections`,
 *   IN ARRAY ORDER (unknown names may be interleaved; they occupy slots).
 * @param {Record<string, number>} builtinOrders - name→order map (see
 *   builtinOrdersByName; keys are dotted names like `tool:bash`).
 * @returns {Array<{ order: number, index: number }>} aligned with
 *   sectionOrders; index is a position in the ORIGINAL array.
 *   Splice from LAST to FIRST so earlier indices stay valid; equal indices
 *   preserve the input (ascending) order when spliced in reverse iteration.
 */
export function insertionIndex(sectionOrders, presentBuiltinNames, builtinOrders) {
  const names = [...(presentBuiltinNames ?? [])];
  const knownOrders = [];
  for (const name of names) {
    const order = builtinOrders?.[name];
    knownOrders.push(typeof order === "number" && Number.isFinite(order) ? order : null);
  }
  return [...(sectionOrders ?? [])].map((order) => {
    if (!Number.isFinite(order)) throw new TypeError(`insertionIndex: non-finite order ${order}`);
    let index = 0;
    for (let i = 0; i < knownOrders.length; i++) {
      if (knownOrders[i] !== null && knownOrders[i] < order) index = i + 1;
    }
    return { order, index };
  });
}
// #endregion FUNC_insertionIndex
