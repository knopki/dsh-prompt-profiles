/**
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve and seal a session's chosen prompt profile into immutable-by-convention text, independently of Cordis.
 * @scope Profile selection, scope filtering, built-in-name insertion planning, durable-first sealing, and a retry-on-failure promise cache for storage opens; NOT: plugin lifecycle or storage implementation.
 * @invariants A persisted snapshot is never rebuilt from live configuration; only built-ins actually present in the assembly anchor insertion; planInsertion returns BASE indices — consumers apply them by splicing from LAST to FIRST (see FUNC_planInsertion).
 * #endregion moduleContract
 */

import { effectiveOrder, insertionIndex } from "./registry.js";

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

// #region FUNC_buildSnapshot
/** @purpose Freeze the chosen section text and order at the first assembly, filtering scopes and absent/empty sections. */
export function buildSnapshot({ profile, sectionsById, isSubagent: subagent = false, isFork: fork = false }) {
  const sections = [];
  for (const ref of profile?.sections ?? []) {
    const scope = ref.scope ?? "inherit";
    if (scope === "main-only" && subagent) continue;
    if (scope === "subagents-only" && (!subagent || fork)) continue;
    if (!["inherit", "main-only", "subagents-only"].includes(scope)) continue;
    const section = sectionsById instanceof Map ? sectionsById.get(ref.id) : sectionsById?.[ref.id];
    if (!section || section.disabled || typeof section.body !== "string" || !section.body.trim()) continue;
    sections.push({ id: ref.id, title: section.title, order: ref.order, text: section.body });
  }
  return { profileId: profile?.id ?? null, sections };
}
// #endregion FUNC_buildSnapshot

// #region FUNC_planInsertion
/**
 * @purpose Place sealed sections against known built-ins actually present, preserving profile order on equal orders.
 * @invariants Unknown/foreign entries never anchor; without an earlier known built-in, insertion starts at index zero.
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
  const orders = sorted.map(({ section }) => effectiveOrder(section.order, builtinOrdersByName));
  const anchors = insertionIndex(orders, names, builtinOrdersByName);
  return sorted.map(({ section }, position) => ({
    name: `prompt-profile:${section.id}`,
    text: section.text,
    index: anchors[position].index,
  }));
}
// #endregion FUNC_planInsertion

// #region FUNC_sealSnapshot
/** @purpose Read an existing snapshot or commit a newly built one before exposing its text for rendering. */
export async function sealSnapshot({ table, sessionId, createSnapshot }) {
  const saved = table.get(sessionId);
  if (saved !== undefined) return saved;
  const snapshot = createSnapshot();
  await table.put(sessionId, snapshot);
  return snapshot;
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
