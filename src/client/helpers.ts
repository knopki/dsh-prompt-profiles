/** #region moduleContract
 * @modulecontract
 * @purpose Pure view helpers shared by the chip and the settings page: row
 *   identity, outline ordering, preview planning and the profile-changed signal.
 * @scope
 *  - Ids and refs, the outline, the preview plan and the changed signal.
 *  - NOT: api calls, flows or components.
 * @invariants
 *  - `idOf` reads `configId → patchId → rowId → id`; orders stay integers.
 * #endregion moduleContract */

import type { Translate } from "./i18n.ts";
import type { PreviewResponse, RowEntry, RowIdentity, SectionRef, StateDocument } from "./model.ts";

// #region FUNC_idOf
/** @purpose Stable display/key id of a /state entry: configId first. */
export function idOf(entry: RowIdentity | null | undefined): string | null {
  return entry?.configId ?? entry?.patchId ?? entry?.rowId ?? entry?.id ?? null;
}
// #endregion FUNC_idOf

// #region FUNC_refIdOf
/** @purpose The domain id for section refs: the configId verbatim, never re-prefixed. */
export function refIdOf(entry: RowIdentity | null | undefined): string | null {
  return idOf(entry);
}
// #endregion FUNC_refIdOf

// #region FUNC_dedupeRowPrefix
/** @purpose Collapse a doubled row-id prefix to a single one; single prefixes pass through. */
export function dedupeRowPrefix(id: unknown): string {
  return String(id ?? "").replace(/^(prompt-(?:section|profile)-)(?:prompt-(?:section|profile)-)+/, "$1");
}
// #endregion FUNC_dedupeRowPrefix

// #region FUNC_normalizeSections
/**
 * @purpose Guard for a profile's section refs before they are sent: each
 *   ref keeps the configId it came with; only a doubled prefix (the old
 *   mangling bug) is collapsed.
 */
export function normalizeSections(refs?: ReadonlyArray<SectionRef> | null): SectionRef[] {
  return (refs ?? []).map((ref) => (ref ? { ...ref, id: dedupeRowPrefix(ref.id) } : ref));
}
// #endregion FUNC_normalizeSections

// #region FUNC_addSectionsToRefs
/**
 * @purpose Append picked section ids to a profile's refs: ids VERBATIM
 *   (they come from configId), orders stepped +100 past the current
 *   maximum, default scope inherit.
 */
export function addSectionsToRefs(
  refs: ReadonlyArray<SectionRef> | null | undefined,
  ids: ReadonlyArray<string> | null | undefined,
  step = 100,
): SectionRef[] {
  const base = normalizeSections(refs);
  const maxOrder = base.reduce((max, ref) => Math.max(max, ref.order ?? 0), 0);
  return [
    ...base,
    ...(ids ?? []).map((id, i) => ({
      id: dedupeRowPrefix(id),
      order: maxOrder + step * (i + 1),
      scope: "inherit",
    })),
  ];
}
// #endregion FUNC_addSectionsToRefs

// #region FUNC_profileLabel
/**
 * @purpose Human label for a profile: its title, else its id (bundle rows can
 *   carry an empty title), else the "(no title)" dictionary string — so a made
 *   choice never reads as "None".
 */
export function profileLabel(profile: (RowIdentity & { title?: string }) | null | undefined, t: Translate): string {
  if (!profile) return t("none");
  return profile.title || idOf(profile) || t("untitled");
}
// #endregion FUNC_profileLabel

/** The key-event surface the Escape guard and the drag grip read (a plain object in tests). */
export interface KeyEventLike {
  key?: string;
  target?: unknown;
  preventDefault?: () => void;
}
/** The window-like root the Escape guard asks for an open overlay. */
interface DrillRootLike {
  document?: { querySelector?: (selector: string) => unknown } | null;
}

// #region FUNC_escapesDrillDown
/**
 * @purpose Whether an Escape keydown should close the current drill-down.
 *   It must NOT fire while the user is typing (input/textarea/select or a
 *   contenteditable node) and must not fight an open dialog/menu — otherwise
 *   Esc during typing discarded the user's place.
 */
export function escapesDrillDown(event: KeyEventLike | null | undefined, root?: DrillRootLike | null): boolean {
  if (event?.key !== "Escape") return false;
  const target = event.target as { closest?: (selector: string) => unknown } | null | undefined;
  if (target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable]"))
    return false;
  const doc = root?.document || (typeof document !== "undefined" ? document : null);
  if (
    doc &&
    typeof doc.querySelector === "function" &&
    doc.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]')
  )
    return false;
  return true;
}
// #endregion FUNC_escapesDrillDown

/** The part of an outline row the boundary rule reads. */
interface BoundaryRow {
  kind: string;
  order?: number;
}

/** One built-in row from the mirror: rendered grey and read-only. */
interface BuiltinOutlineRow {
  kind: "builtin";
  key: string;
  name: string;
  order?: number;
}

/** One of the profile's own refs. */
export interface OursOutlineRow {
  kind: "ours";
  key: string;
  ref: SectionRef;
  section: RowEntry;
  order?: number;
  seq: number;
}

/** A ref that names no registered section. */
interface BrokenOutlineRow {
  kind: "broken";
  key: string;
  ref: SectionRef;
  order?: number;
  seq: number;
}

/** One rendered outline row: a built-in, one of our refs, or a broken ref. */
export type OutlineRow = BuiltinOutlineRow | OursOutlineRow | BrokenOutlineRow;

/** A row lookup the guard accepts: a Map (any realm) or a plain record. */
type SectionsLookup = Map<string, RowEntry> | Record<string, RowEntry> | null | undefined;

interface MapLike<T> {
  get(key: string): T | undefined;
  has(key: string): boolean;
}

/** Duck-typed Map detection: `instanceof Map` is false across a vm realm. */
function isMapLike<T>(value: unknown): value is MapLike<T> {
  const candidate = value as MapLike<T> | null | undefined;
  return !!candidate && typeof candidate.get === "function" && typeof candidate.has === "function";
}

// #region FUNC_insertionOrders
/**
 * @purpose Orders for the drag-and-drop insertion gaps: entry i is the gap
 *   before `rows[i]`, the last entry the gap after the final row.
 * @invariants Integers only, never a midpoint. Dropping below a built-in
 *   yields its order + 1 so the host rule cannot hoist the row above it.
 */
export function insertionOrders(rows: ReadonlyArray<BoundaryRow> | null | undefined): number[] {
  const orderOf = (row: BoundaryRow | undefined) =>
    row && row.kind !== "broken" && typeof row.order === "number" ? row.order : null;
  const list = rows ?? [];
  const orders: number[] = [];
  for (const row of list) {
    const order = orderOf(row);
    if (order !== null) orders.push(order);
  }
  const out: number[] = [];
  for (let i = 0; i <= list.length; i++) {
    let above: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      above = orderOf(list[j]);
      if (above !== null) break;
    }
    let below: number | null = null;
    for (let j = i; j < list.length; j++) {
      below = orderOf(list[j]);
      if (below !== null) break;
    }
    out[i] =
      orders.length === 0
        ? 100
        : above === null
          ? orders[0] - 1
          : below === null
            ? orders[orders.length - 1] + 1
            : above + 1;
  }
  return out;
}
// #endregion FUNC_insertionOrders

// #region FUNC_canSaveSection
/** @purpose Autosave gate: only a confirmed row with a non-empty title may be written. */
export function canSaveSection(title: unknown, confirmed: unknown): boolean {
  return confirmed === true && String(title ?? "").trim() !== "";
}
// #endregion FUNC_canSaveSection

// #region FUNC_sourceKindOf
/**
 * @purpose Which `source` badge to render: only `bundle` and `unknown` are
 *   worth showing; `user` rows are the calm default and get no badge.
 */
export function sourceKindOf(source: unknown): "bundle" | "unknown" | null {
  if (source === "bundle") return "bundle";
  if (source === "unknown") return "unknown";
  return null;
}
// #endregion FUNC_sourceKindOf

// #region FUNC_usedInProfileName
/**
 * @purpose Resolve a used-in profile reference to its human title, falling
 *   back to the raw id when the profile is missing from /state.
 */
export function usedInProfileName(state: StateDocument | null | undefined, profileId: string): string {
  const profile = (state?.profiles ?? []).find((p) => idOf(p) === profileId);
  return profile?.title || profileId;
}
// #endregion FUNC_usedInProfileName

// #region FUNC_countLabel
/**
 * @purpose Render a count with the noun form the number demands: the Slavic
 *   rule (one for 1/21/31…, few for 2–4/22–24…, many otherwise). English
 *   carries one value for `few` and `many`, Chinese the same value in all
 *   three, so one rule serves every dictionary.
 */
export function countLabel(n: number, t: Translate, base: "sections" | "broken"): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  const form =
    mod10 === 1 && mod100 !== 11
      ? `${base}One`
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? `${base}Few`
        : `${base}Many`;
  return `${n} ${t(form)}`;
}
// #endregion FUNC_countLabel

// #region FUNC_scopeKeyOf
/** @purpose Locale key for a section-ref scope value (single mapping shared
 *   by the scope menu and the used-in line, so none render the raw enum). */
export function scopeKeyOf(scope: string | null | undefined): "scopeMainOnly" | "scopeSubagentsOnly" | "scopeInherit" {
  return scope === "main-only" ? "scopeMainOnly" : scope === "subagents-only" ? "scopeSubagentsOnly" : "scopeInherit";
}
// #endregion FUNC_scopeKeyOf

// #region FUNC_renameNotice
/** @purpose Post-rename notice listing profiles still pointing at the old id, if any. */
export function renameNotice(
  result: { affectedProfiles?: ReadonlyArray<{ profileId?: string; title?: string }> } | null | undefined,
  t: Translate,
): string | null {
  const affected = Array.isArray(result?.affectedProfiles) ? result.affectedProfiles : [];
  if (affected.length === 0) return null;
  const names = affected.map((p) => p?.title || p?.profileId).filter(Boolean);
  const list = names.length ? names.join(", ") : String(affected.length);
  return `${t("renameAffected")} ${list}`;
}
// #endregion FUNC_renameNotice

// #region FUNC_outlineRows
/**
 * @purpose Merge a profile's refs with the built-in mirror into an ordered
 *   outline. Orders are the persisted ones; equal-to-built-in is normal.
 */
export function outlineRows(
  profile: { sections?: ReadonlyArray<SectionRef> } | null | undefined,
  sectionsById: SectionsLookup,
  builtinOrders: Record<string, number> | null | undefined,
): OutlineRow[] {
  const builtins = builtinOrders ?? {};
  const mapLike = isMapLike<RowEntry>(sectionsById);
  const byId: MapLike<RowEntry> = mapLike ? sectionsById : new Map(Object.entries(sectionsById ?? {}));
  const rows: OutlineRow[] = [];
  for (const [name, order] of Object.entries(builtins)) {
    rows.push({ kind: "builtin", name, order, key: `builtin:${name}` });
  }
  for (const [seq, rawRef] of (profile?.sections ?? []).entries()) {
    if (!rawRef) continue;
    const ref = { ...rawRef, id: dedupeRowPrefix(rawRef.id) };
    const section = byId.get(ref.id);
    if (!section) {
      rows.push({ kind: "broken", ref, order: ref.order, seq, key: `broken:${seq}:${ref.id}` });
      continue;
    }
    rows.push({ kind: "ours", ref, section, order: ref.order, seq, key: `ours:${seq}:${ref.id}` });
  }
  // Deterministic and TRANSITIVE: order, then OUR sections before built-ins
  // at an equal order (the host assembler's own insertion rule — the UI must
  // show the sequence that actually reaches the prompt), then the ref's
  // position in the profile, then the id.
  rows.sort((a, b) => {
    // Broken refs take no part in the composition order — keep them after
    // the resolvable rows (they are actionable only via Remove).
    if (a.kind === "broken" || b.kind === "broken") {
      if (a.kind === "broken" && b.kind === "broken") return a.seq - b.seq;
      return a.kind === "broken" ? 1 : -1;
    }
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    if (a.kind !== b.kind) return a.kind === "builtin" ? 1 : -1;
    if (a.kind === "builtin" && b.kind === "builtin") return a.name.localeCompare(b.name);
    if (a.kind === "ours" && b.kind === "ours") {
      if (a.seq !== b.seq) return a.seq - b.seq;
      return a.ref.id.localeCompare(b.ref.id);
    }
    return 0;
  });
  return rows;
}
// #endregion FUNC_outlineRows

// #region FUNC_filterSections
/** @purpose Case-insensitive search over section title and id. */
export function filterSections(sections: ReadonlyArray<RowEntry>, query: unknown): RowEntry[] {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q) return sections.slice();
  return sections.filter(
    (s) =>
      String(s.title ?? "")
        .toLowerCase()
        .includes(q) ||
      String(idOf(s) ?? "")
        .toLowerCase()
        .includes(q),
  );
}
// #endregion FUNC_filterSections

/** A collapsed run of built-in entries. */
interface BuiltinsPreviewPlanItem {
  kind: "builtins";
  names: string[];
}

/** One of our sections, in final order. */
interface OursPreviewPlanItem {
  kind: "ours";
  id?: string;
  title?: string;
  order?: number;
  text?: string;
}

/** One render-plan entry: a collapsed run of built-ins or one of our sections. */
type PreviewPlanItem = BuiltinsPreviewPlanItem | OursPreviewPlanItem;

export interface PreviewPlan {
  plan: PreviewPlanItem[];
  skipped: Array<{ id?: string; title: string; reason: string }>;
  variables: Record<string, string | null> | null;
}
// #region FUNC_previewPlan
/**
 * @purpose Map the host preview response into a render plan: consecutive
 *   built-in entries collapse into one placeholder group, ours sections
 *   keep order/title/text, skipped sections carry their reason.
 */
export function previewPlan(response: PreviewResponse | null | undefined): PreviewPlan {
  const r = response ?? {};
  const items = Array.isArray(r.sections) ? r.sections : [];
  const plan: PreviewPlanItem[] = [];
  let builtins: string[] = [];
  const flush = () => {
    if (builtins.length) {
      plan.push({ kind: "builtins", names: builtins });
      builtins = [];
    }
  };
  for (const item of items) {
    const isBuiltin = item && (item.builtin === true || item.kind === "builtin" || item.ours === false);
    if (isBuiltin) builtins.push(item.title ?? item.name ?? item.id ?? "?");
    else {
      flush();
      plan.push({
        kind: "ours",
        id: item?.id,
        title: item?.title ?? item?.id ?? "?",
        order: item?.order,
        text: item?.text ?? item?.body ?? "",
      });
    }
  }
  flush();
  const skipped = (Array.isArray(r.skipped) ? r.skipped : []).map((s) => ({
    id: s?.id,
    title: s?.title ?? s?.id ?? "?",
    reason: s?.reason ?? "",
  }));
  // `variables` is the host's own report of what it substituted (cwd from the
  // host process, model unknown/null) — carried through so the pane can be
  // honest about it instead of presenting the preview as the exact prompt.
  return { plan, skipped, variables: r.variables ?? null };
}
// #endregion FUNC_previewPlan

// #region FUNC_previewVariableNames
/** @purpose The `{{name}}` variables a piece of text references (unique, ordered). */
function previewVariableNames(text: unknown): string[] {
  const names: string[] = [];
  for (const match of String(text ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}
// #endregion FUNC_previewVariableNames

// #region FUNC_previewVariableNotice
/**
 * @purpose Names that make a preview item illustrative rather than exact:
 *   sessionless assembly means a used value cannot be proven exact.
 */
export function previewVariableNotice(
  text: unknown,
  body: unknown,
  variables?: Record<string, string | null> | null,
  sessionValues?: Record<string, string> | null,
): string[] | null {
  const used = [...new Set([...previewVariableNames(body), ...previewVariableNames(text)])];
  if (used.length === 0) return null;
  const flagged = used.filter((name) => {
    const preview = variables ? variables[name] : undefined;
    if (preview === null || preview === undefined) return true; // unknown host-side
    const real = sessionValues ? sessionValues[name] : undefined;
    return real === undefined || real !== preview; // cannot prove a match
  });
  return flagged.length ? flagged : null;
}
// #endregion FUNC_previewVariableNotice

// The chip re-reads /state on this signal, debounced, so a burst of edits
// cannot cause a request storm.
const profileStateListeners = new Set<(seq: number) => void>();
let profileStateSeq = 0;
/** How long a burst of mutations is coalesced before the chip re-reads /state. */
export const PROFILES_REFRESH_DEBOUNCE_MS = 150;

// #region FUNC_notifyProfilesChanged
/** @purpose Fire the profiles-changed signal after a successful mutation. */
export function notifyProfilesChanged(): void {
  profileStateSeq += 1;
  // One failing listener must not starve the others.
  for (const listener of [...profileStateListeners]) {
    try {
      listener(profileStateSeq);
    } catch (_) {
      /* isolated */
    }
  }
}
// #endregion FUNC_notifyProfilesChanged

// #region FUNC_subscribeProfilesChanged
/** @purpose Subscribe to the profiles-changed signal; returns the unsubscribe. */
export function subscribeProfilesChanged(listener: (seq: number) => void): () => void {
  profileStateListeners.add(listener);
  return () => {
    profileStateListeners.delete(listener);
  };
}
// #endregion FUNC_subscribeProfilesChanged

// #region FUNC_errText
/** @purpose Duck-typed error message (cross-realm-safe, unlike instanceof). */
export function errText(err: unknown): string {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" ? message : "";
}
// #endregion FUNC_errText

// The reasons the host can attach to a skipped preview reference, as the
// dictionary names them. A reason this build does not know (newer host) falls
// back to the raw text rather than rendering an empty line.
const SKIP_REASON_KEYS: Record<string, string> = {
  "section-not-found": "skipSectionNotFound",
  "section-disabled": "skipSectionDisabled",
  "empty-body": "skipEmptyBody",
  "main-only-in-subagent": "skipMainOnlyInSubagent",
  "subagents-only-outside-subagent": "skipSubagentsOnlyOutsideSubagent",
  "unknown-scope": "skipUnknownScope",
  "malformed-variable-reference": "skipMalformedVariableReference",
};

// #region FUNC_skipReasonText
/**
 * @purpose Localize one skipped-reference reason: the id through the
 *   dictionary, its value appended when the host sent one.
 */
export function skipReasonText(reason: unknown, detail: unknown, t: Translate): string {
  const id = String(reason ?? "");
  const key = SKIP_REASON_KEYS[id];
  if (!key) return id;
  const text = t(key);
  const value = detail === undefined || detail === null ? "" : String(detail);
  return value === "" ? text : `${text} (${value})`;
}
// #endregion FUNC_skipReasonText

export const helpers = {
  insertionOrders,
  outlineRows,
  filterSections,
  previewPlan,
  idOf,
  refIdOf,
  dedupeRowPrefix,
  normalizeSections,
  addSectionsToRefs,
  canSaveSection,
  sourceKindOf,
  usedInProfileName,
  renameNotice,
  scopeKeyOf,
  profileLabel,
  escapesDrillDown,
  previewVariableNotice,
  notifyProfilesChanged,
  subscribeProfilesChanged,
};
