/**
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve and seal a session's chosen prompt profile into immutable-by-convention text, independently of Cordis.
 * @scope Profile selection, scope filtering, seal-time interpolation, built-in-name insertion planning, once-per-session decision pinning, and a retry-on-failure promise cache for storage opens; NOT: plugin lifecycle or storage implementation.
 * @invariants A persisted snapshot is never rebuilt from live configuration; sealed text is FINAL (interpolation resolved at seal time, inserted with interpolate:false); the per-session decision is made once per process and survives storage outages; only built-ins actually present in the assembly anchor insertion; planInsertion returns BASE indices — consumers apply them by splicing from LAST to FIRST (see FUNC_planInsertion).
 * #endregion moduleContract
 */

import { insertionIndex } from "./registry.js";

// #region FUNC_resolveProfileId
/** @purpose Select a live profile by workspace override then default, rejecting stale ids without changing settings. */
export function resolveProfileId({ lastByWorkspace = {}, workspaceKey, defaultId, profileIds }) {
  const ids = new Set(profileIds ?? []);
  const last = lastByWorkspace?.[workspaceKey];
  const explicit = Object.hasOwn(lastByWorkspace ?? {}, workspaceKey);
  const valid = (id) => typeof id === "string" && id !== "" && ids.has(id);
  if (explicit && last === "") return { profileId: null, reset: false }; // explicit "none" beats default
  if (explicit && valid(last)) return { profileId: last, reset: false };
  return { profileId: valid(defaultId) ? defaultId : null, reset: explicit && !!last };
}
// #endregion FUNC_resolveProfileId

// #region FUNC_isSubagent
/** @purpose Classify a delegated child from its durable session header, tolerating absent agent data. */
export function isSubagent(agent) {
  return agent?.session?.header?.origin === "subagent";
}
// #endregion FUNC_isSubagent

// #region FUNC_isFork
/** @purpose Identify a seeded delegated child rather than an unrelated seeded root session. */
export function isFork(agent) {
  return isSubagent(agent) && agent?.session?.header?.isSeeded === true;
}
// #endregion FUNC_isFork

// #region FUNC_interpolateSealedText
/**
 * Seal-time interpolation, byte-compatible with the engine
 * (dsh-system-prompt lib/index.js `interpolate`): strict `{{name}}` groups,
 * `{{` without a later `}}` is literal prose, any unknown/malformed variable
 * or missing value THROWS. Throwing here (instead of at every render) lets
 * the sealer skip the section before unusable text is persisted (astra
 * finding D).
 *
 * @purpose Freeze interpolation into the sealed text so the engine never
 *   re-interpolates it (insertion carries `interpolate: false`).
 * @param {string} sectionId - for error attribution.
 * @param {string} text - raw section body.
 * @param {Record<string, unknown>} variables - assembly variables.
 * @returns {string} final text with every reference resolved.
 * @throws Error on unknown or malformed variable references.
 */
const GROUP_AT = /^\{\{([^{}]*)\}\}/;
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
export function interpolateSealedText(sectionId, text, variables) {
  const known = variables ?? {};
  let result = "";
  let last = 0;
  for (let open = text.indexOf("{{"); open >= 0; open = text.indexOf("{{", last)) {
    const group = GROUP_AT.exec(text.slice(open));
    if (group === null) {
      if (text.indexOf("}}", open + 2) >= 0) {
        throw new Error(`malformed prompt variable reference at "${text.slice(open, open + 16)}…" in section "${sectionId}" (references are complete simple {{name}} groups)`);
      }
      result += text.slice(last, open + 2);
      last = open + 2;
      continue;
    }
    const name = group[0].slice(2, -2);
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(`malformed prompt variable reference "{{${name}}}" in section "${sectionId}" (variable names match ${String(VARIABLE_NAME)})`);
    }
    if (!Object.hasOwn(known, name)) {
      throw new Error(`unknown prompt variable "{{${name}}}" in section "${sectionId}"; registered variables: ${Object.keys(known).join(", ") || "(none)"}`);
    }
    const value = known[name];
    if (value === undefined) {
      throw new Error(`prompt variable "{{${name}}}" has no value for this assembly (section "${sectionId}")`);
    }
    result += text.slice(last, open) + value;
    last = open + group[0].length;
  }
  return result + text.slice(last);
}
// #endregion FUNC_interpolateSealedText

// #region FUNC_buildSnapshot
/**
 * @purpose Freeze the chosen section's FINAL text (interpolation resolved and
 *   validated at seal time) and order at the first assembly, filtering scopes
 *   and absent/empty/uninterpolatable sections. A section whose body cannot
 *   be interpolated against this assembly's variables is SKIPPED with a
 *   warning instead of persisting text the engine would throw on forever
 *   (astra finding D).
 */
export function buildSnapshot({ profile, sectionsById, isSubagent: subagent = false, isFork: fork = false, variables = {}, warn = () => {} }) {
  const sections = [];
  for (const ref of profile?.sections ?? []) {
    const scope = ref.scope ?? "inherit";
    if (scope === "main-only" && subagent) continue;
    if (scope === "subagents-only" && (!subagent || fork)) continue;
    if (!["inherit", "main-only", "subagents-only"].includes(scope)) continue;
    const section = sectionsById instanceof Map ? sectionsById.get(ref.id) : sectionsById?.[ref.id];
    if (!section || section.disabled || typeof section.body !== "string" || !section.body.trim()) continue;
    let text;
    try {
      text = interpolateSealedText(ref.id, section.body, variables);
    } catch (error) {
      warn(`prompt-profiles section "${ref.id}" skipped: ${error?.message ?? String(error)}`, { sectionId: ref.id });
      continue;
    }
    if (!text.trim()) continue;
    sections.push({ id: ref.id, title: section.title, order: ref.order, text });
  }
  return { profileId: profile?.id ?? null, sections };
}
// #endregion FUNC_buildSnapshot

// #region FUNC_planInsertion
/**
 * @purpose Place sealed sections against known built-ins actually present,
 *   preserving profile order on equal orders.
 * @invariants The profile's order is used EXACTLY as stated — an order equal
 *   to a built-in (or to a peer) is never shifted or normalized; it just
 *   anchors before the equal built-in. Unknown/foreign entries never anchor;
 *   without an earlier known built-in, insertion starts at index zero.
 * @returns Array of rows in insertion (ascending) order; each `index` is a BASE index into the ORIGINAL
 *   assembly array — no positional offsets are baked in. Apply by splicing from LAST to FIRST: descending
 *   application keeps earlier indices valid and equal indices preserve ascending order. Splicing ascending
 *   without adding the row's position would interleave wrongly — the offset responsibility stays with the
 *   consumer by contract.
 */
export function planInsertion({ snapshot, assemblySections, builtinOrdersByName }) {
  if (!snapshot?.sections?.length) return [];
  const names = assemblySections.map((section) => section.name);
  const sorted = snapshot.sections.map((section, position) => ({ section, position }))
    .sort((a, b) => a.section.order - b.section.order || a.position - b.position);
  const orders = sorted.map(({ section }) => section.order);
  const anchors = insertionIndex(orders, names, builtinOrdersByName);
  return sorted.map(({ section }, position) => ({
    name: `prompt-profile:${section.id}`,
    text: section.text,
    // Sealed text is final: the engine must not interpolate it again (astra
    // finding D) — literal `{{` can never break rendering.
    interpolate: false,
    index: anchors[position].index,
  }));
}
// #endregion FUNC_planInsertion

// #region FUNC_sealSnapshot
/**
 * @purpose Decide a session's snapshot EXACTLY ONCE per process and keep that
 *   decision stable while storage is down (astra finding G): prefer an
 *   already-persisted copy, otherwise build from live config once, memoize,
 *   and keep re-using (and retrying the put) until persistence succeeds. A
 *   storage failure therefore degrades to an in-memory decision — never to an
 *   unprofiled first turn followed by mid-session activation on retry.
 * @param {object} options
 * @param {string} options.sessionId
 * @param {() => object} options.createSnapshot - builds from live config; runs at most once per memo entry.
 * @param {Map<string, { snapshot: object, persisted: boolean }>} options.memo - caller-owned, lives with the plugin.
 * @param {() => Promise<object>} options.openTable - resolves the domain table; may reject while storage is down.
 * @param {(message: string, details?: unknown) => void} [options.warn]
 * @returns {Promise<object>} the sealed snapshot (persisted when possible, memoized always).
 */
export async function sealSnapshot({ sessionId, createSnapshot, memo, openTable, warn = () => {} }) {
  if (!memo.has(sessionId)) {
    let snapshot;
    let persisted = false;
    try {
      const table = await openTable();
      const saved = table.get(sessionId);
      if (saved !== undefined) {
        snapshot = saved;
        persisted = true;
      } else {
        snapshot = createSnapshot();
      }
    } catch (error) {
      warn("prompt-profiles storage unavailable; snapshot decision pinned in memory", { sessionId, error });
      snapshot = createSnapshot();
    }
    memo.set(sessionId, { snapshot, persisted });
  }
  const entry = memo.get(sessionId);
  if (!entry.persisted) {
    try {
      const table = await openTable();
      if (table.get(sessionId) === undefined) await table.put(sessionId, entry.snapshot);
      entry.persisted = true;
    } catch {
      // Still down: the in-memory decision stays authoritative; retried on
      // the next assembly.
    }
  }
  return entry.snapshot;
}
// #endregion FUNC_sealSnapshot

// #region FUNC_retryingCache
/**
 * @purpose Cache a pending asynchronous open (storage domain) but DROP the
 *   cache on rejection, so a transient failure disables nothing permanently —
 *   the next call starts a fresh attempt (verify-step2b-glm defect 1).
 * @invariants a fulfilled promise stays cached forever; a rejected one is
 *   removed synchronously before the rejection propagates.
 * @param {() => Promise<any>} create - starts the cached operation.
 * @returns {(() => Promise<any>) & { cached: () => Promise<any> | null }} the
 *   getter, plus `cached()` to peek WITHOUT starting (used by disposers).
 */
export function retryingCache(create) {
  let cached = null;
  const get = () => {
    cached ??= Promise.resolve().then(create).then(
      (value) => value,
      (error) => {
        cached = null;
        throw error;
      },
    );
    return cached;
  };
  get.cached = () => cached;
  return get;
}
// #endregion FUNC_retryingCache
