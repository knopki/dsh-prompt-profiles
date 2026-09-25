/**
 * Pure registry of prompt sections and profiles (no Cordis at import time).
 * #region moduleContract
 * @modulecontract
 * @purpose Own the authoritative in-memory view of every registered section and
 *   profile row so the service, the editor and the prompt-injection step all
 *   read one consistent, deterministically ordered dataset.
 * @scope
 *  - Registration/disposal with the duplicate-config.id policy (SPEC §5.1),
 *    sorted views, usedIn lookup, and insertionIndex.
 *  - Pure data structure: no Cordis, no filesystem, no clock.
 *  - NOT: mounting rows (section.js/profile.js), serving the registry on ctx
 *    (index.js), prompt injection (PLAN step 3).
 * @invariants
 *  - Views are fresh shallow copies in a stable order; mutating one never
 *    affects the registry. Volatile `.get()` fields are unwrapped at READ time
 *    so live settings edits keep flowing (astra finding B).
 *  - A duplicate config.id resolves to the registration mounted LAST;
 *    disposing an overridden registration is a no-op.
 *  - A section's order is used EXACTLY as the profile states it — equal orders
 *    (with a built-in or a peer) are legal and never normalized.
 * @dependencies USES API: none (pure). Consumers inject warn callbacks.
 * @rationale Q: Why anchor insertion on built-in NAMES, not section.order?
 *   A: Spike R1 proved assembled sections are sorted BEFORE the waterfall and
 *   carry NO `order` field — only names present in that assembly can anchor.
 * @keywords registry, sections, profiles, duplicate, usedIn,
 *   insertionIndex, prompt profiles
 * #endregion moduleContract
 */

// #region FUNC_unwrapVolatile
/**
 * Cordis/Schemastery volatile fields arrive as `.get()` wrapper refs. Unwrap
 * AT READ TIME (never once at registration) so live settings edits keep
 * flowing into views (astra finding B); plain values pass through.
 */
const unwrapVolatile = (value) => (value != null && typeof value.get === "function" ? value.get() : value);
// #endregion FUNC_unwrapVolatile

// #region FUNC_configView
/** Project a stored config into a plain, one-level read view with CURRENT values. */
function configView(config) {
  if (config == null || typeof config !== "object") return config;
  const view = {};
  for (const [key, value] of Object.entries(config)) view[key] = unwrapVolatile(value);
  return view;
}
// #endregion FUNC_configView

// #region CLASS_PromptProfilesRegistry
/** Pure in-memory registry of section and profile rows. */
export class PromptProfilesRegistry {
  #warn;
  #sections;
  #profiles;
  #generations;

  // #region METHOD_constructor
  /**
   * @param {object} [options]
   * @param {(message: string, details?: unknown) => void} [options.warn]
   *   duplicate-id sink (defaults to console.warn).
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
    return [...this.#sections.values()]
      .map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  // #endregion METHOD_sections

  // #region METHOD_profiles
  /** Detached view of every profile, sorted by `title` then `id` (SPEC decision 19). */
  profiles() {
    return [...this.#profiles.values()]
      .map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source }))
      .sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
    return uses.sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));
  }
  // #endregion METHOD_usedIn

  // #region METHOD_register
  /**
   * Shared registration path (SPEC §5.1): warn naming BOTH rowIds, later
   * registration wins deterministically, overridden disposals are no-ops.
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

// #region FUNC_insertionIndex
/**
 * Where our sections must be spliced into an already-sorted
 * `assembly.sections` array. Spike R1 (R1-R2-injection-and-patch.md): the
 * assembly is sorted BEFORE the waterfall and never re-sorted, and its entries
 * carry NO `order` — only a built-in NAME present in that assembly can anchor,
 * so a mirror entry absent from the assembly and foreign names never count.
 *
 * Rule: order `o` goes immediately AFTER the last element whose built-in order
 * is known and `< o` (0 when none). An order EQUAL to a present built-in is NOT
 * shifted — it lands just before that built-in, which keeps the position
 * deterministic (the engine sorts by order, then name).
 *
 * @param {number[]} sectionOrders - our orders EXACTLY as the profile states
 *   them, already ascending (the listener sorts the same way; equal orders keep
 *   profile order).
 * @param {string[]} presentBuiltinNames - names of `assembly.sections` IN ARRAY
 *   ORDER (unknown names are skipped by the scan but occupy slots).
 * @param {Record<string, number>} builtinOrders - name→order map (dotted names
 *   like `tool:bash`; see builtinOrdersByName).
 * @returns {Array<{ order: number, index: number }>} aligned with
 *   sectionOrders; `index` is a position in the ORIGINAL array. Splice from
 *   LAST to FIRST so earlier indices stay valid; equal indices preserve the
 *   input (ascending) order.
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
