window.__ModuleLoader__.load({ id: "@knopki/dsh-prompt-profiles", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/client/chip.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var React2 = __toESM(require("react"), 1);

// src/client/helpers.ts
function idOf(entry) {
  return entry?.configId ?? entry?.patchId ?? entry?.rowId ?? entry?.id ?? null;
}
function refIdOf(entry) {
  return idOf(entry);
}
function dedupeRowPrefix(id) {
  return String(id ?? "").replace(/^(prompt-(?:section|profile)-)(?:prompt-(?:section|profile)-)+/, "$1");
}
function normalizeSections(refs) {
  return (refs ?? []).map((ref) => ref ? { ...ref, id: dedupeRowPrefix(ref.id) } : ref);
}
function addSectionsToRefs(refs, ids, step = 100) {
  const base = normalizeSections(refs);
  const maxOrder = base.reduce((max, ref) => Math.max(max, ref.order ?? 0), 0);
  return [
    ...base,
    ...(ids ?? []).map((id, i) => ({
      id: dedupeRowPrefix(id),
      order: maxOrder + step * (i + 1),
      scope: "inherit"
    }))
  ];
}
function profileLabel(profile, t) {
  if (!profile) return t("none");
  return profile.title || idOf(profile) || t("untitled");
}
function escapesDrillDown(event, root) {
  if (event?.key !== "Escape") return false;
  const target = event.target;
  if (target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable]"))
    return false;
  const doc = root?.document || (typeof document !== "undefined" ? document : null);
  if (doc && typeof doc.querySelector === "function" && doc.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]'))
    return false;
  return true;
}
function isMapLike(value) {
  const candidate = value;
  return !!candidate && typeof candidate.get === "function" && typeof candidate.has === "function";
}
function insertionOrders(rows) {
  const orderOf = (row) => row && row.kind !== "broken" && typeof row.order === "number" ? row.order : null;
  const list = rows ?? [];
  const orders = [];
  for (const row of list) {
    const order = orderOf(row);
    if (order !== null) orders.push(order);
  }
  const out = [];
  for (let i = 0; i <= list.length; i++) {
    let above = null;
    for (let j = i - 1; j >= 0; j--) {
      above = orderOf(list[j]);
      if (above !== null) break;
    }
    let below = null;
    for (let j = i; j < list.length; j++) {
      below = orderOf(list[j]);
      if (below !== null) break;
    }
    out[i] = orders.length === 0 ? 100 : above === null ? orders[0] - 1 : below === null ? orders[orders.length - 1] + 1 : above + 1;
  }
  return out;
}
function canSaveSection(title, confirmed) {
  return confirmed === true && String(title ?? "").trim() !== "";
}
function sourceKindOf(source) {
  if (source === "bundle") return "bundle";
  if (source === "unknown") return "unknown";
  return null;
}
function usedInProfileName(state, profileId) {
  const profile = (state?.profiles ?? []).find((p) => idOf(p) === profileId);
  return profile?.title || profileId;
}
function scopeKeyOf(scope) {
  return scope === "main-only" ? "scopeMainOnly" : scope === "subagents-only" ? "scopeSubagentsOnly" : "scopeInherit";
}
function renameNotice(result, t) {
  const affected = Array.isArray(result?.affectedProfiles) ? result.affectedProfiles : [];
  if (affected.length === 0) return null;
  const names = affected.map((p) => p?.title || p?.profileId).filter(Boolean);
  const list = names.length ? names.join(", ") : String(affected.length);
  return `${t("renameAffected")} ${list}`;
}
function outlineRows(profile, sectionsById, builtinOrders) {
  const builtins = builtinOrders ?? {};
  const mapLike = isMapLike(sectionsById);
  const byId = mapLike ? sectionsById : new Map(Object.entries(sectionsById ?? {}));
  const rows = [];
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
  rows.sort((a, b) => {
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
function filterSections(sections, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return sections.slice();
  return sections.filter(
    (s) => String(s.title ?? "").toLowerCase().includes(q) || String(idOf(s) ?? "").toLowerCase().includes(q)
  );
}
function previewPlan(response) {
  const r = response ?? {};
  const items = Array.isArray(r.sections) ? r.sections : [];
  const plan = [];
  let builtins = [];
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
        text: item?.text ?? item?.body ?? ""
      });
    }
  }
  flush();
  const skipped = (Array.isArray(r.skipped) ? r.skipped : []).map((s) => ({
    id: s?.id,
    title: s?.title ?? s?.id ?? "?",
    reason: s?.reason ?? ""
  }));
  return { plan, skipped, variables: r.variables ?? null };
}
function previewVariableNames(text) {
  const names = [];
  for (const match of String(text ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}
function previewVariableNotice(text, body, variables, sessionValues) {
  const used = [.../* @__PURE__ */ new Set([...previewVariableNames(body), ...previewVariableNames(text)])];
  if (used.length === 0) return null;
  const flagged = used.filter((name) => {
    const preview = variables ? variables[name] : void 0;
    if (preview === null || preview === void 0) return true;
    const real = sessionValues ? sessionValues[name] : void 0;
    return real === void 0 || real !== preview;
  });
  return flagged.length ? flagged : null;
}
var profileStateListeners = /* @__PURE__ */ new Set();
var profileStateSeq = 0;
var PROFILES_REFRESH_DEBOUNCE_MS = 150;
function notifyProfilesChanged() {
  profileStateSeq += 1;
  for (const listener of [...profileStateListeners]) {
    try {
      listener(profileStateSeq);
    } catch (_) {
    }
  }
}
function subscribeProfilesChanged(listener) {
  profileStateListeners.add(listener);
  return () => {
    profileStateListeners.delete(listener);
  };
}
function errText(err) {
  const message = err?.message;
  return typeof message === "string" ? message : "";
}
var helpers = {
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
  subscribeProfilesChanged
};

// src/client/i18n.ts
var NS = "promptProfiles";
var en = {
  // chip
  none: "None",
  untitled: "(no title)",
  loadError: "Could not load prompt profiles.",
  saveError: "Could not save prompt profile.",
  remoteUnavailable: "Prompt profiles are unavailable: the Remote connection is not mounted. Reload the page.",
  menuLabel: "Choose a prompt profile",
  chooseNeedsWorkspace: "Choose a workspace first \u2014 the profile choice is remembered per workspace.",
  // settings page
  nav: "Prompt profiles",
  tabProfiles: "Profiles",
  tabSections: "Sections",
  tabPreview: "Preview",
  profileWord: "Profile",
  back: "Back",
  searchPlaceholder: "Search\u2026",
  newProfile: "+ New profile",
  newSection: "+ New section",
  addSection: "Add section",
  creating: "creating\u2026",
  defaultSectionTitle: "New section",
  defaultProfileTitle: "New profile",
  createError: "Could not create:",
  createTimeout: "the new item did not appear in time \u2014 retry or reload the page.",
  defaultForNewSessions: "Default for new sessions",
  previewProfile: "Preview",
  editProfile: "Edit",
  builtIn: "built-in",
  builtInNote: "Some built-in sections may be absent in a given mode.",
  scopeLabel: "Scope",
  scopeInherit: "inherit",
  scopeMainOnly: "main-only",
  scopeSubagentsOnly: "subagents-only",
  sourceLabel: "source",
  sourceBundle: "bundle",
  sourceUnknown: "unknown",
  usedIn: "Used in",
  notUsed: "not used",
  openInSectionTab: "Open in Sections",
  remove: "Remove from profile",
  duplicate: "Duplicate",
  deleteLabel: "Delete",
  renameId: "Change id",
  copySuffix: "(copy)",
  renameIdLocked: "Bundle-owned section \u2014 its id cannot be changed, only disabled.",
  titleLabel: "Title",
  bodyLabel: "Body",
  orderLabel: "Order",
  cancel: "Cancel",
  confirm: "Confirm",
  confirmDeleteProfile: "Delete this profile?",
  confirmDeleteSection: "Delete this section?",
  confirmRemoveRef: "Remove this section from the profile?",
  confirmRename: "Change section id?",
  // The host no longer rewrites profile references on rename.
  renameNote: "Change the id? References in profiles are NOT updated \u2014 fix them manually.",
  renameAffected: "These profiles still reference the old id \u2014 fix them manually:",
  renameEmpty: "Enter a new id \u2014 it cannot be empty.",
  titleRequired: "Enter a name \u2014 a section needs a non-empty title before it can be saved.",
  dragHandle: "Drag to reorder",
  missingSection: "section not found",
  emptyBody: "empty body \u2014 not emitted",
  completeModeWarning: "Profile sections are discarded in complete modes:",
  conflictError: "Concurrent edit \u2014 state reloaded.",
  pickerTitle: "Add sections",
  pickerAdd: "Add",
  pickerEmpty: "No sections to add",
  builtinMarker: "\u27E8built-in\u27E9",
  skippedMarker: "\u27E8skipped\u27E9",
  brokenWord: "broken",
  noProfiles: "No profiles yet.",
  noSections: "No sections yet.",
  previewEmpty: "This profile emits no sections.",
  previewVariables: "Substituted at session start \u2014 may differ from this preview:",
  sectionsWord: "sections"
};
var ru = {
  // chip
  none: "\u041D\u0435\u0442",
  untitled: "(\u0431\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F)",
  loadError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u0438 \u043F\u0440\u043E\u043C\u043F\u0442\u0430.",
  saveError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u0440\u043E\u043C\u043F\u0442\u0430.",
  remoteUnavailable: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438 \u043F\u0440\u043E\u043C\u043F\u0442\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B: Remote-\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E, \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.",
  menuLabel: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u0440\u043E\u043C\u043F\u0442\u0430",
  chooseNeedsWorkspace: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u043E\u0440\u043A\u0441\u043F\u0435\u0439\u0441 \u2014 \u0432\u044B\u0431\u043E\u0440 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u0437\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u0432\u043E\u0440\u043A\u0441\u043F\u0435\u0439\u0441\u0430.",
  // settings page
  nav: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438 \u043F\u0440\u043E\u043C\u043F\u0442\u0430",
  tabProfiles: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438",
  tabSections: "\u0421\u0435\u043A\u0446\u0438\u0438",
  tabPreview: "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440",
  profileWord: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C",
  back: "\u041D\u0430\u0437\u0430\u0434",
  searchPlaceholder: "\u041F\u043E\u0438\u0441\u043A\u2026",
  newProfile: "+ \u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
  newSection: "+ \u041D\u043E\u0432\u0430\u044F \u0441\u0435\u043A\u0446\u0438\u044F",
  addSection: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0435\u043A\u0446\u0438\u044E",
  creating: "\u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435\u2026",
  defaultSectionTitle: "\u041D\u043E\u0432\u0430\u044F \u0441\u0435\u043A\u0446\u0438\u044F",
  defaultProfileTitle: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
  createError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C:",
  createTimeout: "\u043D\u043E\u0432\u044B\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u043D\u0435 \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F \u0432\u043E\u0432\u0440\u0435\u043C\u044F \u2014 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.",
  defaultForNewSessions: "\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0434\u043B\u044F \u043D\u043E\u0432\u044B\u0445 \u0441\u0435\u0441\u0441\u0438\u0439",
  previewProfile: "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440",
  editProfile: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C",
  builtIn: "\u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u0430\u044F",
  builtInNote: "\u0427\u0430\u0441\u0442\u044C \u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u044B\u0445 \u0441\u0435\u043A\u0446\u0438\u0439 \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u0432 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435.",
  scopeLabel: "\u041E\u0431\u043B\u0430\u0441\u0442\u044C",
  scopeInherit: "\u043D\u0430\u0441\u043B\u0435\u0434\u0443\u0435\u0442\u0441\u044F",
  scopeMainOnly: "\u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0430\u0433\u0435\u043D\u0442",
  scopeSubagentsOnly: "\u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u044B",
  sourceLabel: "\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A",
  sourceBundle: "\u0438\u0437 \u0431\u0430\u043D\u0434\u043B\u0430",
  sourceUnknown: "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E",
  usedIn: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0432",
  notUsed: "\u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F",
  openInSectionTab: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 \xAB\u0421\u0435\u043A\u0446\u0438\u044F\u0445\xBB",
  remove: "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044F",
  duplicate: "\u0414\u0443\u0431\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  deleteLabel: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
  renameId: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C id",
  copySuffix: "(\u043A\u043E\u043F\u0438\u044F)",
  renameIdLocked: "\u0421\u0435\u043A\u0446\u0438\u044F \u0438\u0437 \u0431\u0430\u043D\u0434\u043B\u0430 \u2014 id \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F, \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C.",
  titleLabel: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
  bodyLabel: "\u0422\u0435\u043A\u0441\u0442",
  orderLabel: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A",
  cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
  confirm: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C",
  confirmDeleteProfile: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u043E\u0442 \u043F\u0440\u043E\u0444\u0438\u043B\u044C?",
  confirmDeleteSection: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0443 \u0441\u0435\u043A\u0446\u0438\u044E?",
  confirmRemoveRef: "\u0423\u0431\u0440\u0430\u0442\u044C \u044D\u0442\u0443 \u0441\u0435\u043A\u0446\u0438\u044E \u0438\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044F?",
  confirmRename: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C id \u0441\u0435\u043A\u0446\u0438\u0438?",
  renameNote: "\u0421\u0441\u044B\u043B\u043A\u0438 \u0432 \u043F\u0440\u043E\u0444\u0438\u043B\u044F\u0445 \u043F\u0440\u0438 \u044D\u0442\u043E\u043C \u041D\u0415 \u043E\u0431\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u2014 \u0438\u0445 \u043F\u0440\u0438\u0434\u0451\u0442\u0441\u044F \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
  renameAffected: "\u0412 \u044D\u0442\u0438\u0445 \u043F\u0440\u043E\u0444\u0438\u043B\u044F\u0445 \u043E\u0441\u0442\u0430\u043B\u0430\u0441\u044C \u0441\u0442\u0430\u0440\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430 \u2014 \u043F\u043E\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0432\u0440\u0443\u0447\u043D\u0443\u044E:",
  renameEmpty: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 id \u2014 \u043F\u0443\u0441\u0442\u044B\u043C \u043E\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u043E\u0436\u0435\u0442.",
  titleRequired: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u2014 \u0441\u0435\u043A\u0446\u0438\u044E \u043D\u0435\u043B\u044C\u0437\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441 \u043F\u0443\u0441\u0442\u044B\u043C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C.",
  dragHandle: "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E\u0440\u044F\u0434\u043E\u043A",
  missingSection: "\u0441\u0435\u043A\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430",
  emptyBody: "\u043F\u0443\u0441\u0442\u043E\u0439 \u0442\u0435\u043A\u0441\u0442 \u2014 \u043D\u0435 \u0432\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F",
  completeModeWarning: "\u0412 \u0440\u0435\u0436\u0438\u043C\u0430\u0445 \u0441 \u043F\u043E\u043B\u043D\u043E\u0439 \u0437\u0430\u043C\u0435\u043D\u043E\u0439 \u043F\u0440\u043E\u043C\u043F\u0442\u0430 \u0441\u0435\u043A\u0446\u0438\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u043E\u0442\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F:",
  conflictError: "\u041F\u0430\u0440\u0430\u043B\u043B\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u2014 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E.",
  pickerTitle: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0435\u043A\u0446\u0438\u0438",
  pickerAdd: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C",
  pickerEmpty: "\u041D\u0435\u0442 \u0441\u0435\u043A\u0446\u0438\u0439 \u0434\u043B\u044F \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u044F",
  builtinMarker: "\u27E8\u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u0430\u044F\u27E9",
  skippedMarker: "\u27E8\u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E\u27E9",
  brokenWord: "\u0431\u0438\u0442\u044B\u0445",
  noProfiles: "\u041F\u0440\u043E\u0444\u0438\u043B\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
  noSections: "\u0421\u0435\u043A\u0446\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
  previewEmpty: "\u042D\u0442\u043E\u0442 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435 \u0432\u044B\u0434\u0430\u0451\u0442 \u043D\u0438 \u043E\u0434\u043D\u043E\u0439 \u0441\u0435\u043A\u0446\u0438\u0438.",
  previewVariables: "\u041F\u043E\u0434\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u043F\u0440\u043E\u0438\u0437\u043E\u0439\u0434\u0451\u0442 \u043F\u0440\u0438 \u0441\u0442\u0430\u0440\u0442\u0435 \u0441\u0435\u0441\u0441\u0438\u0438 \u2014 \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F \u043E\u0442 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430:",
  sectionsWord: "\u0441\u0435\u043A\u0446\u0438\u0439"
};
var zh = {
  // chip
  none: "\u65E0",
  untitled: "\uFF08\u65E0\u6807\u9898\uFF09",
  loadError: "\u65E0\u6CD5\u52A0\u8F7D\u63D0\u793A\u914D\u7F6E\u3002",
  saveError: "\u65E0\u6CD5\u4FDD\u5B58\u63D0\u793A\u914D\u7F6E\u3002",
  remoteUnavailable: "\u63D0\u793A\u914D\u7F6E\u4E0D\u53EF\u7528\uFF1ARemote \u8FDE\u63A5\u672A\u5EFA\u7ACB\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u9875\u9762\u3002",
  menuLabel: "\u9009\u62E9\u63D0\u793A\u914D\u7F6E",
  chooseNeedsWorkspace: "\u8BF7\u5148\u9009\u62E9\u5DE5\u4F5C\u533A\u2014\u2014\u63D0\u793A\u914D\u7F6E\u7684\u9009\u62E9\u6309\u5DE5\u4F5C\u533A\u4FDD\u5B58\u3002",
  // settings page
  nav: "\u63D0\u793A\u914D\u7F6E",
  tabProfiles: "\u914D\u7F6E",
  tabSections: "\u7247\u6BB5",
  tabPreview: "\u9884\u89C8",
  profileWord: "\u914D\u7F6E",
  back: "\u8FD4\u56DE",
  searchPlaceholder: "\u641C\u7D22\u2026",
  newProfile: "+ \u65B0\u5EFA\u914D\u7F6E",
  newSection: "+ \u65B0\u5EFA\u7247\u6BB5",
  addSection: "\u6DFB\u52A0\u7247\u6BB5",
  creating: "\u521B\u5EFA\u4E2D\u2026",
  defaultSectionTitle: "\u65B0\u7247\u6BB5",
  defaultProfileTitle: "\u65B0\u914D\u7F6E",
  createError: "\u521B\u5EFA\u5931\u8D25\uFF1A",
  createTimeout: "\u65B0\u6761\u76EE\u672A\u80FD\u53CA\u65F6\u51FA\u73B0\u2014\u2014\u8BF7\u91CD\u8BD5\u6216\u5237\u65B0\u9875\u9762\u3002",
  defaultForNewSessions: "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4",
  previewProfile: "\u9884\u89C8",
  editProfile: "\u7F16\u8F91",
  builtIn: "\u5185\u7F6E",
  builtInNote: "\u90E8\u5206\u5185\u7F6E\u7247\u6BB5\u5728\u7279\u5B9A\u6A21\u5F0F\u4E0B\u53EF\u80FD\u4E0D\u5B58\u5728\u3002",
  scopeLabel: "\u4F5C\u7528\u8303\u56F4",
  scopeInherit: "\u7EE7\u627F",
  scopeMainOnly: "\u4EC5\u4E3B\u4EE3\u7406",
  scopeSubagentsOnly: "\u4EC5\u5B50\u4EE3\u7406",
  sourceLabel: "\u6765\u6E90",
  sourceBundle: "\u6765\u81EA\u63D2\u4EF6\u5305",
  sourceUnknown: "\u672A\u77E5",
  usedIn: "\u7528\u4E8E",
  notUsed: "\u672A\u4F7F\u7528",
  openInSectionTab: "\u5728\u300C\u7247\u6BB5\u300D\u4E2D\u6253\u5F00",
  remove: "\u4ECE\u914D\u7F6E\u4E2D\u79FB\u9664",
  duplicate: "\u590D\u5236",
  deleteLabel: "\u5220\u9664",
  renameId: "\u4FEE\u6539 id",
  copySuffix: "\uFF08\u526F\u672C\uFF09",
  renameIdLocked: "\u63D2\u4EF6\u5305\u63D0\u4F9B\u7684\u7247\u6BB5\u2014\u2014\u65E0\u6CD5\u4FEE\u6539\u5176 id\uFF0C\u53EA\u80FD\u505C\u7528\u3002",
  titleLabel: "\u6807\u9898",
  bodyLabel: "\u5185\u5BB9",
  orderLabel: "\u987A\u5E8F",
  cancel: "\u53D6\u6D88",
  confirm: "\u786E\u8BA4",
  confirmDeleteProfile: "\u5220\u9664\u6B64\u914D\u7F6E\uFF1F",
  confirmDeleteSection: "\u5220\u9664\u6B64\u7247\u6BB5\uFF1F",
  confirmRemoveRef: "\u4ECE\u914D\u7F6E\u4E2D\u79FB\u9664\u6B64\u7247\u6BB5\uFF1F",
  confirmRename: "\u4FEE\u6539\u7247\u6BB5 id\uFF1F",
  renameNote: "\u914D\u7F6E\u4E2D\u7684\u5F15\u7528\u4E0D\u4F1A\u968F\u4E4B\u66F4\u65B0\u2014\u2014\u8BF7\u624B\u52A8\u4FEE\u6539\u3002",
  renameAffected: "\u4EE5\u4E0B\u914D\u7F6E\u4ECD\u5F15\u7528\u65E7 id\u2014\u2014\u8BF7\u624B\u52A8\u4FEE\u6539\uFF1A",
  renameEmpty: "\u8BF7\u8F93\u5165\u65B0\u7684 id\u2014\u2014\u4E0D\u80FD\u4E3A\u7A7A\u3002",
  titleRequired: "\u8BF7\u8F93\u5165\u540D\u79F0\u2014\u2014\u7247\u6BB5\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A\u624D\u80FD\u4FDD\u5B58\u3002",
  dragHandle: "\u62D6\u52A8\u4EE5\u8C03\u6574\u987A\u5E8F",
  missingSection: "\u672A\u627E\u5230\u7247\u6BB5",
  emptyBody: "\u5185\u5BB9\u4E3A\u7A7A\u2014\u2014\u4E0D\u4F1A\u6CE8\u5165",
  completeModeWarning: "\u5728\u5B8C\u5168\u66FF\u6362\u63D0\u793A\u8BCD\u7684\u6A21\u5F0F\u4E0B\uFF0C\u914D\u7F6E\u7247\u6BB5\u4F1A\u88AB\u4E22\u5F03\uFF1A",
  conflictError: "\u5E76\u53D1\u7F16\u8F91\u2014\u2014\u72B6\u6001\u5DF2\u91CD\u65B0\u52A0\u8F7D\u3002",
  pickerTitle: "\u6DFB\u52A0\u7247\u6BB5",
  pickerAdd: "\u6DFB\u52A0",
  pickerEmpty: "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u7247\u6BB5",
  builtinMarker: "\u27E8\u5185\u7F6E\u27E9",
  skippedMarker: "\u27E8\u5DF2\u8DF3\u8FC7\u27E9",
  brokenWord: "\u635F\u574F",
  noProfiles: "\u8FD8\u6CA1\u6709\u914D\u7F6E\u3002",
  noSections: "\u8FD8\u6CA1\u6709\u7247\u6BB5\u3002",
  previewEmpty: "\u6B64\u914D\u7F6E\u4E0D\u4F1A\u6CE8\u5165\u4EFB\u4F55\u7247\u6BB5\u3002",
  previewVariables: "\u5C06\u5728\u4F1A\u8BDD\u542F\u52A8\u65F6\u66FF\u6362\u2014\u2014\u53EF\u80FD\u4E0E\u9884\u89C8\u4E0D\u540C\uFF1A",
  sectionsWord: "\u4E2A\u7247\u6BB5"
};
var messages = { en, ru, zh };
var bound = (key) => en[key] ?? key;
function boundT(key) {
  return bound(key);
}
function bindT(translate) {
  bound = translate;
}

// src/client/remote.ts
var remote_exports = {};
__export(remote_exports, {
  RemoteCallError: () => RemoteCallError,
  clientContribution: () => clientContribution,
  isRemoteConflict: () => isRemoteConflict,
  makeRemoteApi: () => makeRemoteApi,
  remoteCall: () => remoteCall,
  unwrapRemoteResult: () => unwrapRemoteResult
});

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
var Cached = class {
  constructor(getter) {
    this._getter = getter;
    this._value = void 0;
  }
  get value() {
    const getter = this._getter;
    if (getter !== void 0) {
      this._value = getter();
      this._getter = void 0;
    }
    return this._value;
  }
};
function cached(getter) {
  return new Cached(getter);
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
  });
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a2;
    (_a2 = iss).path ?? (_a2.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function attachSchema(issues, start, inst) {
  var _a2;
  for (let i = start; i < issues.length; i++) {
    (_a2 = issues[i]).schema ?? (_a2.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config2) {
  var _a2;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a2 = iss).schema ?? (_a2.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return void 0;
  }
};
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = void 0;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key, make, enumerable) {
  const proto = claim(inst, key);
  if (!proto)
    return;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: void 0 };
      Object.defineProperty(this, key, desc);
      desc.value = make(this);
      Object.defineProperty(this, key, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
    }
  });
}

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: void 0, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition();
      }
      try {
        return new Definition();
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition();
}
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer2, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = /* @__PURE__ */ new Set();
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = void 0;
      }
    } else if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer2(inst, def);
    if (initialized) {
      const own2 = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own2;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own2;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto2 = _.prototype;
    for (const k in proto2) {
      if (!Object.prototype.hasOwnProperty.call(proto2, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto2[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = void 0;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _issuesDesc = { value: void 0, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = void 0;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, void 0, {
  Parent: Error
});

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/parse.js
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
function failure(Err, issues, ctx) {
  let error;
  return {
    success: false,
    get error() {
      if (!error) {
        error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = void 0;
        ctx = void 0;
      }
      return error;
    },
    set error(e) {
      error = e;
      issues = void 0;
      ctx = void 0;
    }
  };
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js
var anyString = /^[\s\S]{0,}$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 6,
  patch: 5
};

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
}, {
  // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {
      }
      return validateAsync(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = def.pattern ?? anyString;
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
    const proms = [];
    const abortEarly = ctx?.abortEarly;
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
        if (abortEarly && result.issues.length !== 0 && aborted(result))
          break;
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, optin, optout) {
  const isPresent = key in input;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result.issues.length) {
    if (optin !== void 0 && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && optin === void 0) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent || optin === "defaulted" && !isOptionalOut) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result.value;
  }
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  let seen = 0;
  for (const key in input) {
    if (abortEarly && payload.issues.length !== seen) {
      if (aborted(payload, seen))
        break;
      seen = payload.issues.length;
    }
    if (keySet.has(key))
      continue;
    if (key === "__proto__") {
      if (t === "never")
        unrecognized.push(key);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key, input, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
      // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  const sh = desc?.get ? desc.get.raw : def.shape ?? {};
  if (sh) {
    const get = () => {
      const newSh = { ...sh };
      Object.defineProperty(def, "shape", { value: newSh });
      get.raw = newSh;
      return newSh;
    };
    get.raw = sh;
    Object.defineProperty(def, "shape", { get });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazyInternal(inst, "propValues", (zod) => {
    const shape = zod.def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
          assignProp(propValues, key, /* @__PURE__ */ new Set());
        }
        for (const v of field.values)
          propValues[key].add(v);
        if (field.optin !== void 0)
          propValues[key].add(void 0);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
    const proms = [];
    const shape = value.shape;
    const abortEarly = ctx?.abortEarly;
    let seen = payload.issues.length;
    for (const key of value.allKeys) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (key === "__proto__")
        continue;
      const el = shape[key];
      const optin = el._zod.optin;
      const optout = el._zod.optout;
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key, input, optin, optout);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
  };
});
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values && !def.partial) {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      const recordKeys = /* @__PURE__ */ new Set();
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          if (key === "__proto__")
            continue;
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          if (outKey === "__proto__")
            continue;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          if (def.mode === "loose") {
            if (key === "__proto__")
              continue;
            payload.value[key] = input[key];
          } else {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          }
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    } else {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      let unrecognized;
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else if (values) {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const outKey = keyResult.value;
        if (outKey === "__proto__")
          continue;
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[outKey] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[outKey] = result.value;
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  defineLazyInternal(inst, "pattern", (zod) => {
    const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
    return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const values = new Set(def.values);
  inst._zod.values = values;
  defineLazyInternal(inst, "pattern", (zod) => {
    const vals = zod.def.values;
    return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
function handleOptionalResult(payload, result) {
  payload.value = result.issues.length ? void 0 : result.value;
  return payload;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  inst._zod.optout = "optional";
  defineLazyInternal(inst, "values", (zod) => {
    const values = zod.def.innerType._zod.values;
    return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      if (def.innerType._zod.optin !== "defaulted")
        return payload;
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise)
        return result.then((result2) => handleOptionalResult(payload, result2));
      return handleOptionalResult(payload, result);
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazyInternal(inst, "values", (zod) => {
    return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
  return new Class(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
  return new Class(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
  return new Class({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}

// node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/mini/schemas.js
var ZodMiniType = /* @__PURE__ */ $constructor("ZodMiniType", (inst, def) => {
  if (!inst._zod)
    throw new Error("Uninitialized schema in ZodMiniType.");
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
}, {
  // `with` is an alias for `check`: the same function object, not a wrapper.
  get with() {
    return this.check;
  },
  set with(value) {
    own(this, "with", value);
  },
  parse(data, params) {
    return parse(this, data, params, { callee: this.parse });
  },
  parseAsync(data, params) {
    return parseAsync(this, data, params, { callee: this.parseAsync });
  },
  safeParse(data, params) {
    return safeParse(this, data, params);
  },
  safeParseAsync(data, params) {
    return safeParseAsync(this, data, params);
  },
  check(...checks) {
    const def = this.def;
    return this.clone({
      ...def,
      checks: [
        ...def.checks ?? [],
        ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }, { parent: true });
  },
  clone(_def, params) {
    return clone(this, _def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta2) {
    reg.add(this, meta2);
    return this;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  }
});
var ZodMiniString = /* @__PURE__ */ $constructor("ZodMiniString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function string2(params) {
  return _string(ZodMiniString, params);
}
var ZodMiniNumber = /* @__PURE__ */ $constructor("ZodMiniNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function number2(params) {
  return _number(ZodMiniNumber, params);
}
var ZodMiniBoolean = /* @__PURE__ */ $constructor("ZodMiniBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function boolean2(params) {
  return _boolean(ZodMiniBoolean, params);
}
var ZodMiniUnknown = /* @__PURE__ */ $constructor("ZodMiniUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function unknown() {
  return _unknown(ZodMiniUnknown);
}
var ZodMiniNever = /* @__PURE__ */ $constructor("ZodMiniNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function never(params) {
  return _never(ZodMiniNever, params);
}
var ZodMiniArray = /* @__PURE__ */ $constructor("ZodMiniArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function array(element, params) {
  return new ZodMiniArray({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
var ZodMiniObject = /* @__PURE__ */ $constructor("ZodMiniObject", (inst, def) => {
  $ZodObject.init(inst, def);
  ZodMiniType.init(inst, def);
  installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
});
// @__NO_SIDE_EFFECTS__
function strictObject(shape, params) {
  return new ZodMiniObject({
    type: "object",
    shape,
    catchall: /* @__PURE__ */ never(),
    ...normalizeParams(params)
  });
}
var ZodMiniRecord = /* @__PURE__ */ $constructor("ZodMiniRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodMiniRecord({
      type: "record",
      keyType: /* @__PURE__ */ string2(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodMiniRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
var ZodMiniEnum = /* @__PURE__ */ $constructor("ZodMiniEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodMiniType.init(inst, def);
  inst.options = [...inst._zod.values];
});
// @__NO_SIDE_EFFECTS__
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodMiniEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodMiniLiteral = /* @__PURE__ */ $constructor("ZodMiniLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function literal(value, params) {
  return new ZodMiniLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
var ZodMiniOptional = /* @__PURE__ */ $constructor("ZodMiniOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function optional(innerType) {
  return new ZodMiniOptional({
    type: "optional",
    innerType
  });
}
var ZodMiniNullable = /* @__PURE__ */ $constructor("ZodMiniNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function nullable(innerType) {
  return new ZodMiniNullable({
    type: "nullable",
    innerType
  });
}

// src/host/domain/model.ts
var SCOPES = ["inherit", "main-only", "subagents-only"];

// src/shared/wire-schemas.ts
var revision = optional(number2());
var sectionRefFields = { id: string2(), order: number2(), scope: optional(_enum(SCOPES)) };
var jsonRow = () => record(string2(), unknown());
var jsonRows = () => array(jsonRow());
var stateFields = {
  sessionId: optional(string2()),
  cwd: optional(string2()),
  workspaceId: optional(string2())
};
var previewFields = { profileId: string2(), cwd: optional(string2()) };
var sectionCreateFields = { id: optional(string2()), title: optional(string2()), body: optional(string2()) };
var sectionValueFields = { title: string2(), body: string2() };
var sectionUpdateFields = { rowId: string2(), value: strictObject(sectionValueFields), revision };
var sectionDeleteFields = { rowId: string2() };
var sectionRenameFields = { rowId: string2(), id: string2() };
var profileCreateFields = {
  id: optional(string2()),
  title: optional(string2()),
  sections: optional(array(strictObject(sectionRefFields)))
};
var profileValueFields = { title: string2(), sections: optional(array(strictObject(sectionRefFields))) };
var profileUpdateFields = { rowId: string2(), value: strictObject(profileValueFields), revision };
var profileDeleteFields = { rowId: string2(), revision };
var lastFields = {
  workspaceId: optional(string2()),
  cwd: optional(string2()),
  profileId: string2(),
  revision
};
var defaultSetFields = { profileId: string2(), revision };
var stateInput = strictObject(stateFields);
var previewInput = strictObject(previewFields);
var sectionCreateInput = strictObject(sectionCreateFields);
var sectionUpdateInput = strictObject(sectionUpdateFields);
var sectionDeleteInput = strictObject(sectionDeleteFields);
var sectionRenameInput = strictObject(sectionRenameFields);
var profileCreateInput = strictObject(profileCreateFields);
var profileUpdateInput = strictObject(profileUpdateFields);
var profileDeleteInput = strictObject(profileDeleteFields);
var lastInput = strictObject(lastFields);
var defaultSetInput = strictObject(defaultSetFields);
var stateResult = strictObject({
  profiles: jsonRows(),
  sections: jsonRows(),
  builtinOrders: record(string2(), number2()),
  modes: array(strictObject({ id: string2(), title: string2(), complete: boolean2() })),
  default: string2(),
  lastByWorkspace: record(string2(), string2()),
  revision: nullable(number2())
});
var previewResult = strictObject({
  profileId: string2(),
  title: string2(),
  sections: jsonRows(),
  skipped: array(strictObject({ id: string2(), title: string2(), reason: string2() })),
  variables: record(string2(), nullable(string2()))
});
var sectionCreateResult = strictObject({
  rowId: string2(),
  patchId: string2(),
  configId: string2(),
  title: string2(),
  body: string2(),
  emits: boolean2()
});
var sectionUpdateResult = strictObject({ rowId: string2(), patchId: string2(), emits: boolean2() });
var sectionDeleteResult = strictObject({ disabled: boolean2() });
var sectionRenameResult = strictObject({
  rowId: string2(),
  patchId: string2(),
  id: string2(),
  affectedProfiles: array(strictObject({ profileId: string2(), title: string2() }))
});
var profileCreateResult = strictObject({
  rowId: string2(),
  patchId: string2(),
  configId: string2(),
  title: string2(),
  sections: array(strictObject(sectionRefFields))
});
var profileUpdateResult = strictObject({ rowId: string2(), patchId: string2() });
var profileDeleteResult = strictObject({ disabled: boolean2() });
var okResult = strictObject({ ok: literal(true) });

// src/shared/remote-contract.ts
var TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
var REMOTE_NAMESPACE = "promptProfiles";
var REMOTE_SERVICE_KEY = "promptProfilesRemote";
function memoCreate(build) {
  let cached2;
  return () => cached2 ??= build();
}
var METHOD_SPECS = [
  { method: "state", line: 115, input: () => stateInput, result: () => stateResult },
  { method: "preview", line: 134, input: () => previewInput, result: () => previewResult },
  { method: "sectionCreate", line: 147, input: () => sectionCreateInput, result: () => sectionCreateResult },
  { method: "sectionUpdate", line: 165, input: () => sectionUpdateInput, result: () => sectionUpdateResult },
  { method: "sectionDelete", line: 176, input: () => sectionDeleteInput, result: () => sectionDeleteResult },
  { method: "sectionRename", line: 183, input: () => sectionRenameInput, result: () => sectionRenameResult },
  { method: "profileCreate", line: 195, input: () => profileCreateInput, result: () => profileCreateResult },
  { method: "profileUpdate", line: 212, input: () => profileUpdateInput, result: () => profileUpdateResult },
  { method: "profileDelete", line: 223, input: () => profileDeleteInput, result: () => profileDeleteResult },
  { method: "last", line: 230, input: () => lastInput, result: () => okResult },
  { method: "defaultSet", line: 242, input: () => defaultSetInput, result: () => okResult }
];
var FACE_FILES = {
  host: "src/host/remote.ts",
  client: "src/client/remote.ts"
};
function buildRemoteDescriptors(face) {
  const file = FACE_FILES[face] ?? FACE_FILES.host;
  return METHOD_SPECS.map((spec) => ({
    id: `${TYPERT_PACKAGE}#${REMOTE_NAMESPACE}/${spec.method}`,
    service: REMOTE_SERVICE_KEY,
    namespace: REMOTE_NAMESPACE,
    method: spec.method,
    invocation: { kind: "direct" },
    parameters: [
      {
        name: "input",
        wire: "input",
        source: "json",
        codec: {
          mode: "strict",
          typeSymbol: `${TYPERT_PACKAGE}#${cap(spec.method)}Input`,
          create: memoCreate(spec.input)
        }
      }
    ],
    result: {
      mode: "strict",
      typeSymbol: `${TYPERT_PACKAGE}#${cap(spec.method)}Result`,
      create: memoCreate(spec.result)
    },
    sourceLocation: { file, line: spec.line, column: 1 }
  }));
}
function cap(name) {
  return name[0].toUpperCase() + name.slice(1);
}

// src/client/remote.ts
var clientContribution = {
  package: TYPERT_PACKAGE,
  descriptors: buildRemoteDescriptors("client")
};
var RemoteCallError = class extends Error {
  code;
  constructor(code, message) {
    super(message || "prompt profiles remote call failed");
    this.name = "RemoteCallError";
    this.code = code;
  }
};
async function unwrapRemoteResult(envelope) {
  if (envelope?.ok) return envelope.value;
  const error = envelope?.error;
  throw new RemoteCallError(error?.code, error?.message);
}
async function remoteCall(scope, method, args) {
  const envelope = await scope.remote[REMOTE_NAMESPACE][method](args ?? {});
  return unwrapRemoteResult(envelope);
}
var REMOTE_CONFLICT_PATTERN = /configuration changed since read|configuration kept changing/;
function isRemoteConflict(err) {
  const candidate = err;
  return candidate?.status === 409 || REMOTE_CONFLICT_PATTERN.test(String(candidate?.message ?? ""));
}
var makeRemoteApi = (scope) => {
  const call = (method, args) => remoteCall(scope, method, args);
  return {
    loadState: () => call("state", {}),
    preview: (profileId) => call("preview", { profileId }),
    sectionCreate: (value) => call("sectionCreate", value ?? {}),
    sectionUpdate: (patchId, value) => call("sectionUpdate", { rowId: patchId, value }),
    sectionDelete: (patchId) => call("sectionDelete", { rowId: patchId }),
    sectionRename: (patchId, id) => call("sectionRename", { rowId: patchId, id }),
    profileCreate: (value) => call("profileCreate", value ?? {}),
    profileUpdate: (patchId, value) => call("profileUpdate", { rowId: patchId, value }),
    profileDelete: (patchId) => call("profileDelete", { rowId: patchId }),
    setDefault: (value) => call("defaultSet", { profileId: value }),
    last: (choice) => call("last", {
      workspaceId: choice?.workspaceId,
      cwd: choice?.cwd,
      profileId: choice?.profileId ?? ""
    })
  };
};

// src/client/transport.ts
var raiseRemoteUnavailable = () => Promise.reject(new Error(boundT("remoteUnavailable")));
var UNAVAILABLE_METHODS = [
  "loadState",
  "preview",
  "sectionCreate",
  "sectionUpdate",
  "sectionDelete",
  "sectionRename",
  "profileCreate",
  "profileUpdate",
  "profileDelete",
  "setDefault",
  "last"
];
var unavailableApi = Object.fromEntries(
  UNAVAILABLE_METHODS.map((method) => [method, raiseRemoteUnavailable])
);
var activeApi = unavailableApi;
var remoteSettled = Promise.resolve(false);
var readyApi = async () => {
  await remoteSettled;
  return activeApi;
};
var getActiveApi = () => activeApi;
function mountRemote(ctx) {
  let settle;
  remoteSettled = new Promise((resolve) => {
    settle = resolve;
  });
  const loud = (stage, error) => {
    const message = error?.message ?? String(error);
    const details = { stage, error: message };
    try {
      (ctx.logger?.error ?? console.error)(
        "prompt-profiles client: Remote mount failed; the UI now reports it",
        details
      );
    } catch (_) {
    }
    settle(false);
  };
  ctx.effect(() => {
    let disposeMount = () => {
    };
    let disposeInject = () => {
    };
    void (async () => {
      try {
        const mounted = await ctx.remote.$mount(clientContribution);
        disposeMount = typeof mounted === "function" ? mounted : () => {
        };
        disposeInject = ctx.inject(["remote", "remote.promptProfiles"], (scope) => {
          activeApi = makeRemoteApi(scope);
          settle(true);
          return () => {
          };
        }) ?? (() => {
        });
      } catch (error) {
        loud("$mount", error);
      }
    })();
    return async () => {
      try {
        disposeInject();
      } catch (_) {
      }
      try {
        await disposeMount();
      } catch (_) {
      }
    };
  });
}

// src/client/ui.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var React = __toESM(require("react"), 1);
var import_jsx_runtime = require("react/jsx-runtime");
var errorStyle = {
  color: "var(--dsh-alias-state-error-primary, red)",
  margin: "8px 0"
};
var mutedStyle = { color: "var(--dsw-alias-label-secondary)" };
var rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 4px",
  borderBottom: "1px solid var(--dsw-alias-border-l2)"
};
var fieldStyle = {
  color: "var(--dsw-alias-label-primary)",
  background: "var(--dsw-alias-bg-l2)",
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: "8px",
  padding: "6px 8px",
  fontFamily: "inherit",
  fontSize: "inherit"
};
var triggerLabelStyle = {
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  overflow: "hidden",
  minWidth: 0,
  color: "var(--dsw-alias-label-secondary)"
};
var triggerChevronStyle = {
  color: "var(--dsw-alias-label-caption)",
  flex: "none",
  display: "inline-flex"
};
var chipMaxWidth = { maxWidth: "220px" };
var inlineError = (text) => text ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "alert", style: errorStyle, children: text }) : null;
function iconControl(label, Icon, onClick, extra = {}) {
  const button = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.Button,
    {
      variant: extra.variant ?? "ghost",
      size: "sm",
      icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { size: 14 }),
      "aria-label": label,
      title: extra.title ?? label,
      disabled: extra.disabled === true,
      onClick: onClick ?? void 0,
      ...extra.props
    }
  );
  return extra.tooltip === false ? button : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label, children: button }, extra.key ?? label);
}
function useNotifier() {
  const [notice, setNotice] = React.useState(null);
  const seq = React.useRef(0);
  const notify = React.useCallback((text) => {
    seq.current += 1;
    setNotice({ seq: seq.current, text: String(text ?? "") });
  }, []);
  const dismiss = React.useCallback(() => setNotice(null), []);
  const banner = notice ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Toast, { text: notice.text, icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconWarningOutlineRegular, {}), onDone: dismiss }, `notice-${notice.seq}`) : null;
  return { notify, dismiss, banner };
}
function ConfirmDialog({
  open,
  title,
  body,
  actionLabel,
  extraChildren,
  onCancel,
  onConfirm,
  t
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    import_dsh_client_ui_primitives.Modal,
    {
      open,
      onClose: onCancel,
      title,
      closeLabel: t("cancel"),
      footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", onClick: onCancel, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", onClick: onConfirm, children: actionLabel || t("confirm") })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: mutedStyle, children: body }),
        extraChildren
      ]
    }
  );
}
function DefaultMenu({ state, t, onPick, labelKey }) {
  const [open, setOpen] = React.useState(false);
  const profiles = [...state.profiles ?? []].sort((a, b) => a.title.localeCompare(b.title));
  const selected = profiles.find((p) => idOf(p) === state.default);
  const label = t(labelKey ?? "defaultForNewSessions");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.Menu,
    {
      open,
      onClose: () => setOpen(false),
      anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        import_dsh_client_ui_primitives.Button,
        {
          variant: "ghost",
          size: "sm",
          "aria-label": label,
          title: label,
          onClick: () => setOpen(!open),
          style: chipMaxWidth,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: triggerLabelStyle, children: profileLabel(selected, t) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": true, style: triggerChevronStyle, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 14 }) })
          ]
        }
      ),
      items: [{ id: "none", label: t("none") }, ...profiles.map((p) => ({ id: idOf(p), label: p.title }))],
      selectedId: selected ? idOf(selected) : state.default || "none",
      onSelect: (id) => {
        setOpen(false);
        onPick(id === "none" ? "" : id);
      }
    }
  );
}

// src/client/chip.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function PromptProfileChip(props) {
  const { sessionId, useSession, useWorkspaces, useSessions = () => void 0, t, pick: pick2 } = props;
  const session = useSession((s) => s);
  const workspace = useWorkspaces((s) => s.items.find((w) => w.sessionIds.includes(sessionId)));
  const workspaceId = workspace?.workspaceId;
  const cwd = useSessions((s) => s?.byId?.[sessionId]?.cwd) ?? workspace?.path;
  const activeModeId = useSessions((s) => {
    const value = s?.byId?.[sessionId]?.projectionValues?.agentPreset;
    return typeof value === "string" ? value : void 0;
  });
  const [state, setState] = React2.useState(null);
  const [open, setOpen] = React2.useState(false);
  const { notify, banner } = useNotifier();
  React2.useEffect(() => {
    let live = true;
    const load = () => readyApi().then((api) => api.loadState()).then((value) => {
      if (live) setState(value);
    }).catch((err) => {
      if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"));
    });
    load();
    let timer = null;
    const unsubscribe = subscribeProfilesChanged(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        load();
      }, PROFILES_REFRESH_DEBOUNCE_MS);
    });
    return () => {
      live = false;
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [t, notify]);
  if (session?.blank !== true || !state || !state.profiles?.length) return null;
  const lastKey = workspaceId ?? cwd;
  const lastChoice = state.lastByWorkspace ?? {};
  const hasChoice = lastKey !== void 0 && lastKey !== "" && Object.hasOwn(lastChoice, lastKey);
  const chosen = hasChoice ? lastChoice[lastKey] : void 0;
  const chosenProfile = chosen ? state.profiles.find((p) => idOf(p) === chosen) : void 0;
  const selected = hasChoice && chosen === "" ? void 0 : chosenProfile || state.profiles.find((p) => idOf(p) === state.default);
  const activeMode = activeModeId ? (state.modes ?? []).find((m) => m.id === activeModeId) : void 0;
  const completeMode = activeMode && activeMode.complete === true ? activeMode : void 0;
  const modeWarning = completeMode ? `${t("completeModeWarning")} ${completeMode.title ?? completeMode.id}` : null;
  const profiles = [...state.profiles].sort((a, b) => a.title.localeCompare(b.title));
  const choose = async (profileId) => {
    if (!lastKey) {
      setOpen(false);
      notify(t("chooseNeedsWorkspace"));
      return;
    }
    const previous = state;
    setState({ ...state, lastByWorkspace: { ...state.lastByWorkspace, [lastKey]: profileId || "" } });
    setOpen(false);
    const choice = { profileId };
    if (workspaceId) choice.workspaceId = workspaceId;
    else if (cwd) choice.cwd = cwd;
    try {
      await pick2(choice);
      const api = await readyApi();
      const refreshed = await api.loadState();
      setState(refreshed);
    } catch (err) {
      setState(previous);
      notify(errText(err) ? `${t("saveError")} ${errText(err)}`.trim() : t("saveError"));
    }
  };
  const items = [
    { id: "none", label: t("none") },
    ...profiles.map((profile) => ({ id: idOf(profile), label: profile.title }))
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Menu,
      {
        open,
        onClose: () => setOpen(false),
        side: "top",
        portal: true,
        anchor: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "ghost",
            size: "sm",
            "aria-label": t("menuLabel"),
            title: modeWarning ?? (lastKey ? t("menuLabel") : t("chooseNeedsWorkspace")),
            onClick: () => setOpen(!open),
            style: completeMode ? { ...chipMaxWidth, opacity: 0.6 } : chipMaxWidth,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: triggerLabelStyle, children: profileLabel(selected, t) }),
              completeMode && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "span",
                {
                  "data-complete-warning": completeMode.id,
                  "aria-hidden": true,
                  style: {
                    color: "var(--dsw-alias-state-warning-primary, orange)",
                    flex: "none",
                    display: "inline-flex"
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconWarningOutlineRegular, { size: 14 })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": true, style: triggerChevronStyle, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronDownOutlineRegular, { size: 14 }) })
            ]
          }
        ),
        items,
        selectedId: selected ? idOf(selected) : "none",
        onSelect: (id) => choose(id === "none" ? "" : id)
      }
    ),
    banner
  ] });
}

// src/client/flows.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var PollTimeoutError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PollTimeoutError";
  }
};
function findEntry(state, patchId) {
  for (const key of ["sections", "profiles"]) {
    const hit = (state?.[key] ?? []).find(
      (entry) => Boolean(entry) && (entry.patchId === patchId || entry.configId === patchId || entry.rowId === patchId)
    );
    if (hit) return hit;
  }
  return null;
}
function optimisticEntry(kind, created) {
  const id = created?.configId ?? created?.patchId ?? created?.rowId;
  if (kind === "section") {
    return {
      rowId: created?.rowId ?? id,
      patchId: created?.patchId ?? id ?? "",
      configId: id,
      title: created?.title ?? "",
      body: created?.body ?? "",
      usedIn: [],
      source: "user",
      emits: typeof created?.body === "string" && created.body.trim() !== ""
    };
  }
  return {
    rowId: created?.rowId ?? id,
    patchId: created?.patchId ?? id ?? "",
    configId: id,
    title: created?.title ?? "",
    sections: created?.sections ?? [],
    usedIn: [],
    source: "user"
  };
}
function makeCreateFlow({
  api,
  t,
  notify,
  reload,
  getState,
  onState,
  onDrill,
  onPending,
  pollInterval = 500,
  pollDeadline = 1e4
}) {
  let busy = false;
  const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
  async function pollFor(patchId) {
    for (let attempt = 1; ; attempt++) {
      const state = await api.loadState();
      const found = findEntry(state, patchId);
      if (found) return { state, found };
      if (attempt >= maxTries) {
        throw new PollTimeoutError(t("createTimeout"));
      }
      await sleep(pollInterval);
    }
  }
  async function create(kind, value) {
    if (busy) return { ok: false, busy: true };
    busy = true;
    if (onPending) onPending(true);
    try {
      const created = kind === "section" ? await api.sectionCreate(value) : await api.profileCreate(value);
      const prior = getState ? getState() : null;
      const listKey = kind === "section" ? "sections" : "profiles";
      if (onState && prior) {
        const list = [...prior[listKey] ?? [], optimisticEntry(kind, created)];
        onState(listKey === "sections" ? { ...prior, sections: list } : { ...prior, profiles: list });
      }
      const { state, found } = await pollFor(created.patchId ?? created.rowId);
      if (onState) onState(state);
      if (onDrill) onDrill(idOf(found));
      notifyProfilesChanged();
      return { ok: true, item: found, created };
    } catch (err) {
      notify(`${t("createError")} ${errText(err)}`.trim());
      if (reload) {
        try {
          await reload();
        } catch (_) {
        }
      }
      return { ok: false, error: err };
    } finally {
      busy = false;
      if (onPending) onPending(false);
    }
  }
  return { create, isBusy: () => busy };
}
function makeMutationFlow({
  api,
  t,
  notify,
  reload,
  getState,
  onState,
  onPending,
  pollInterval = 500,
  pollDeadline = 1e4
}) {
  let busy = false;
  const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
  async function run({ mutate, optimistic, agree, onDone }) {
    if (busy) return { ok: false, busy: true };
    busy = true;
    if (onPending) onPending(true);
    const prior = getState ? getState() : null;
    try {
      const result = await mutate();
      if (onState && prior && optimistic) onState(optimistic(prior, result));
      let state = prior;
      for (let attempt = 1; ; attempt++) {
        state = await api.loadState();
        if (!agree || agree(state, result)) break;
        if (attempt >= maxTries) throw new PollTimeoutError(t("createTimeout"));
        await sleep(pollInterval);
      }
      if (onState && state) onState(state);
      if (onDone && state) onDone(state, result);
      notifyProfilesChanged();
      return { ok: true, result };
    } catch (err) {
      if (onState && prior) onState(prior);
      notify(`${t("createError")} ${errText(err)}`.trim());
      if (reload) {
        try {
          await reload();
        } catch (_) {
        }
      }
      return { ok: false, error: err };
    } finally {
      busy = false;
      if (onPending) onPending(false);
    }
  }
  return { run, isBusy: () => busy };
}

// src/client/settings-page.tsx
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");
var React7 = __toESM(require("react"), 1);

// src/client/settings-preview.tsx
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
var React3 = __toESM(require("react"), 1);
var import_jsx_runtime3 = require("react/jsx-runtime");
function PreviewTab({ state, api, t, notify }) {
  const [profileId, setProfileId] = React3.useState(state.default || (idOf((state.profiles ?? [])[0]) ?? ""));
  const [data, setData] = React3.useState(null);
  React3.useEffect(() => {
    let live = true;
    setData(null);
    if (!profileId) return void 0;
    api.preview(profileId).then((value) => {
      if (live) setData(previewPlan(value));
    }).catch((err) => {
      if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"));
    });
    return () => {
      live = false;
    };
  }, [profileId, api, t, notify]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: mutedStyle, children: t("profileWord") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DefaultMenu, { state: { ...state, default: profileId }, t, onPick: setProfileId, labelKey: "previewProfile" })
    ] }),
    !profileId && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: mutedStyle, children: t("noProfiles") }),
    profileId && !data && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: mutedStyle, children: "\u2026" }),
    (data?.plan ?? []).map((entry, i) => {
      if (entry.kind === "builtins") {
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "div",
          {
            style: {
              ...mutedStyle,
              padding: "8px",
              margin: "8px 0",
              borderRadius: "8px",
              background: "var(--dsw-alias-bg-l2)"
            },
            children: `${t("builtinMarker")}  ${entry.names.join(", ")}`
          },
          `b${i}`
        );
      }
      const body = (state.sections ?? []).find((s) => refIdOf(s) === entry.id)?.body;
      const flagged = previewVariableNotice(entry.text, body, data?.variables ?? null, null);
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { padding: "8px 0", borderTop: "1px solid var(--dsw-alias-border-l2)" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "span",
            {
              style: { ...mutedStyle, width: "72px", display: "inline-block", fontVariantNumeric: "tabular-nums" },
              children: entry.order !== void 0 ? String(entry.order) : ""
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: ` ${entry.title}` }),
          flagged && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { ...mutedStyle, marginLeft: "8px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tag, { children: `\u26A0 ${t("previewVariables")}` }),
            ` ${flagged.map((name) => `{{${name}}}`).join(", ")}`
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: { margin: "4px 0 0 72px", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px" }, children: entry.text })
      ] }, `${i}:${entry.id}`);
    }),
    data && data.skipped.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { marginTop: "12px" }, children: data.skipped.map((s) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...mutedStyle, fontStyle: "italic" }, children: `${t("skippedMarker")} ${s.title} \u2014 ${s.reason}` }, s.id ?? s.title)) }),
    data && data.plan.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: mutedStyle, children: t("previewEmpty") })
  ] });
}

// src/client/settings-profiles.tsx
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var React5 = __toESM(require("react"), 1);

// src/client/settings-shared.ts
var React4 = __toESM(require("react"), 1);
function useProfilesState(api, t, notify) {
  const [state, setState] = React4.useState(null);
  const reload = React4.useCallback(
    () => api.loadState().then(setState).catch((err) => notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"))),
    [api, t, notify]
  );
  React4.useEffect(() => {
    reload();
  }, [reload]);
  return { state, setState, reload };
}
function useAutosave(value, save, delay = 1200) {
  const latest = React4.useRef(save);
  latest.current = save;
  const skipFirst = React4.useRef(true);
  const timer = React4.useRef(null);
  const dirty = React4.useRef(false);
  const flush = React4.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (dirty.current) {
      dirty.current = false;
      latest.current();
    }
  }, []);
  React4.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return void 0;
    }
    dirty.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      dirty.current = false;
      latest.current();
    }, delay);
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [value, delay]);
  React4.useEffect(() => () => flush(), [flush]);
  return flush;
}
async function runSave(fn, reload, t, notify, onError) {
  const fail = (prefix, err) => {
    const text = `${prefix} ${errText(err)}`.trim();
    notify(text);
    if (onError) onError(text);
  };
  try {
    await fn();
    await reload();
    if (onError) onError("");
    notifyProfilesChanged();
    return true;
  } catch (err) {
    if (isRemoteConflict(err)) {
      try {
        await reload();
        await fn();
        await reload();
        if (onError) onError("");
        notifyProfilesChanged();
        return true;
      } catch (retryErr) {
        fail(t("conflictError"), retryErr);
        return false;
      }
    }
    fail(t("saveError"), err);
    return false;
  }
}
function useFocusSelect(ref, active) {
  React4.useEffect(() => {
    if (active && ref.current && typeof ref.current.focus === "function") {
      ref.current.focus();
      if (typeof ref.current.select === "function") ref.current.select();
    }
  }, [active, ref]);
}

// src/client/settings-profiles.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function AddSectionPicker({
  sections,
  alreadyIn,
  onAdd,
  onClose,
  t
}) {
  const [query, setQuery] = React5.useState("");
  const [selected, setSelected] = React5.useState(() => /* @__PURE__ */ new Set());
  const candidates = filterSections(
    sections.filter((s) => !alreadyIn.has(refIdOf(s) ?? "")),
    query
  );
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_dsh_client_ui_primitives4.Modal, { open: true, onClose, title: t("pickerTitle"), closeLabel: t("cancel"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives4.Input,
      {
        icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSearchOutlineRegular, { size: 14 }),
        placeholder: t("searchPlaceholder"),
        value: query,
        onChange: (e) => setQuery(e.target.value),
        style: { width: "100%", boxSizing: "border-box" }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { maxHeight: "320px", overflowY: "auto", marginTop: "8px" }, children: [
      candidates.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: mutedStyle, children: t("pickerEmpty") }),
      candidates.map((s) => {
        const id = refIdOf(s) ?? "";
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { ...rowStyle, cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Checkbox, { checked: selected.has(id), onChange: () => toggle(id), label: s.title }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: s.title }),
          !String(s.body ?? "").trim() && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tag, { children: t("emptyBody") })
        ] }, id);
      })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { textAlign: "right", marginTop: "8px" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives4.Button,
      {
        variant: "primary",
        disabled: selected.size === 0,
        onClick: () => {
          onAdd([...selected]);
          onClose();
        },
        children: `${t("pickerAdd")} (${selected.size})`
      }
    ) })
  ] });
}
function ProfileOutline({
  profile,
  state,
  api,
  reload,
  t,
  notify,
  onBack,
  onOpenSection,
  autoFocusTitle
}) {
  const [title, setTitle] = React5.useState(profile.title ?? "");
  const [refs, setRefs] = React5.useState(normalizeSections(profile.sections));
  const [pickerOpen, setPickerOpen] = React5.useState(false);
  const [scopeOpen, setScopeOpen] = React5.useState(null);
  const [error, setError] = React5.useState("");
  const titleRef = React5.useRef(null);
  useFocusSelect(titleRef, autoFocusTitle);
  const sectionsById = new Map((state.sections ?? []).map((s) => [refIdOf(s) ?? "", s]));
  const builtinOrders = state.builtinOrders ?? {};
  const ours = refs.filter((ref) => sectionsById.has(ref.id));
  const saveProfile = () => runSave(
    () => api.profileUpdate(profile.patchId, { title, sections: normalizeSections(refs) }),
    reload,
    t,
    notify,
    setError
  );
  const flushTitle = useAutosave(title, () => {
    if (title !== (profile.title ?? "")) saveProfile();
  });
  const flushRefs = useAutosave(refs, () => {
    if (JSON.stringify(refs) !== JSON.stringify(profile.sections ?? [])) saveProfile();
  });
  const leave = () => {
    flushTitle();
    flushRefs();
    onBack();
  };
  const writeRefs = (next) => setRefs(next);
  const [dragId, setDragId] = React5.useState(null);
  const [dragOverIndex, setDragOverIndex] = React5.useState(null);
  const [confirmRemove, setConfirmRemove] = React5.useState(null);
  const dragStart = (refSeq) => (event) => {
    setDragId(refSeq);
    if (event?.dataTransfer) {
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData?.("text/plain", String(refSeq));
      } catch (_) {
      }
    }
  };
  const dragEnd = () => {
    setDragId(null);
    setDragOverIndex(null);
  };
  const droppedSeq = (event) => {
    let from = dragId;
    if (from === null || from === void 0 || from === "") {
      if (typeof event?.dataTransfer?.getData === "function") {
        try {
          from = event.dataTransfer.getData("text/plain");
        } catch (_) {
          from = null;
        }
      }
    }
    if (from === null || from === void 0 || from === "") return null;
    const seq = Number(from);
    return Number.isInteger(seq) && seq >= 0 ? seq : null;
  };
  const patchRef = (refSeq, patch) => writeRefs(refs.map((ref, index) => index === refSeq ? { ...ref, ...patch } : ref));
  const changeScope = (refSeq, scope) => patchRef(refSeq, { scope });
  const changeOrder = (refSeq, order) => {
    if (!Number.isFinite(order)) return;
    patchRef(refSeq, { order });
  };
  const removeRef = (refSeq) => writeRefs(refs.filter((_, index) => index !== refSeq));
  const addSections = (ids) => writeRefs(addSectionsToRefs(refs, ids));
  const completeModes = (state.modes ?? []).filter((m) => m.complete === true);
  const rows = outlineRows({ ...profile, sections: refs }, sectionsById, builtinOrders);
  const brokenRows = rows.filter((row) => row.kind === "broken");
  const scopeMenu = (row) => {
    const { ref, seq } = row;
    const scopeLabel = `${t("scopeLabel")}: ${t(scopeKeyOf(ref.scope))}`;
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives4.Menu,
      {
        open: scopeOpen === seq,
        onClose: () => setScopeOpen(null),
        anchor: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          import_dsh_client_ui_primitives4.Button,
          {
            variant: "ghost",
            size: "sm",
            "aria-label": scopeLabel,
            onClick: () => setScopeOpen((openSeq) => openSeq === seq ? null : seq),
            children: scopeLabel
          }
        ),
        items: ["inherit", "main-only", "subagents-only"].map((scope) => ({
          id: scope,
          label: t(scopeKeyOf(scope))
        })),
        selectedId: ref.scope ?? "inherit",
        onSelect: (scope) => {
          changeScope(seq, scope);
          setScopeOpen(null);
        }
      }
    );
  };
  const boundaryOrders = insertionOrders(rows);
  const dropAt = (index, fromSeq) => {
    const order = boundaryOrders[index];
    if (fromSeq === null || typeof order !== "number") return;
    const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === fromSeq);
    if (ownIndex < 0 || ownIndex === index || ownIndex === index - 1) return;
    const withOrder = refs.map((ref, i) => i === fromSeq ? { ...ref, order } : ref);
    const moved = withOrder[fromSeq];
    const remaining = withOrder.filter((_, i) => i !== fromSeq);
    let insertAt = remaining.length;
    for (let r = index; r < rows.length; r++) {
      const row = rows[r];
      if ((row.kind === "ours" || row.kind === "broken") && row.seq !== fromSeq) {
        const pos = remaining.indexOf(withOrder[row.seq]);
        if (pos >= 0) {
          insertAt = pos;
          break;
        }
      }
    }
    remaining.splice(insertAt, 0, moved);
    writeRefs(remaining);
  };
  const moveRefBy = (refSeq, direction) => {
    const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === refSeq);
    if (ownIndex < 0) return;
    const boundary = direction === "up" ? ownIndex - 1 : ownIndex + 2;
    if (boundary < 0 || boundary > rows.length) return;
    dropAt(boundary, refSeq);
  };
  const dropZone = (index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "div",
    {
      "data-drop-index": index,
      style: {
        height: dragOverIndex === index ? "18px" : "6px",
        margin: "2px 0",
        borderRadius: "4px",
        background: dragOverIndex === index ? "var(--dsw-alias-interactive-bg-hover)" : "transparent"
      },
      onDragOver: (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (dragId !== null && dragOverIndex !== index) setDragOverIndex(index);
      },
      onDrop: (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        const from = droppedSeq(event);
        dragEnd();
        dropAt(index, from);
      }
    },
    `drop-${index}`
  );
  const renderRow = (row) => {
    if (row.kind === "builtin") {
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...rowStyle, opacity: 0.55 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { width: "64px", fontVariantNumeric: "tabular-nums" }, children: String(row.order) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: row.name }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tag, { children: t("builtIn") })
      ] }, row.key);
    }
    if (row.kind === "broken") {
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...rowStyle, color: "var(--dsw-alias-state-warning-primary, orange)" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { width: "64px", fontVariantNumeric: "tabular-nums" }, children: String(row.ref.order) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
          row.ref.id,
          " \u2014 ",
          t("missingSection")
        ] }),
        iconControl(t("remove"), import_dsh_client_ui_primitives4.IconTrashOutlineRegular, () => setConfirmRemove(row.seq))
      ] }, row.key);
    }
    const { ref, section, seq } = row;
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...rowStyle, opacity: dragId === seq ? 0.5 : 1 }, children: [
      iconControl(t("dragHandle"), import_dsh_client_ui_primitives4.IconChevronsUpDownOutlineRegular, null, {
        props: {
          draggable: true,
          onDragStart: dragStart(seq),
          onDragEnd: dragEnd,
          onKeyDown: (event) => {
            if (event?.key === "ArrowUp") {
              event.preventDefault?.();
              moveRefBy(seq, "up");
            } else if (event?.key === "ArrowDown") {
              event.preventDefault?.();
              moveRefBy(seq, "down");
            }
          },
          "data-drag-handle": seq
        }
      }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "input",
        {
          type: "number",
          value: ref.order,
          "aria-label": t("orderLabel"),
          onChange: (e) => changeOrder(seq, Number(e.target.value)),
          style: { ...fieldStyle, width: "76px" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { flex: 1, minWidth: 0 }, children: [
        section.title,
        !String(section.body ?? "").trim() && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tag, { children: t("emptyBody") })
      ] }),
      scopeMenu(row),
      iconControl(t("openInSectionTab"), import_dsh_client_ui_primitives4.IconEditOutlineRegular, () => onOpenSection(ref.id)),
      iconControl(t("remove"), import_dsh_client_ui_primitives4.IconTrashOutlineRegular, () => setConfirmRemove(seq))
    ] }, row.key);
  };
  const outlineRowsEls = [];
  rows.forEach((row, index) => {
    outlineRowsEls.push(dropZone(index));
    outlineRowsEls.push(renderRow(row));
  });
  outlineRowsEls.push(dropZone(rows.length));
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...rowStyle, borderBottom: "none" }, children: [
      iconControl(t("back"), import_dsh_client_ui_primitives4.IconChevronLeftOutlineMedium, leave, {
        variant: "outline",
        tooltip: false,
        key: "back"
      }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { style: { flex: 1 }, children: title || idOf(profile) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tag, { children: brokenRows.length ? `${ours.length} ${t("sectionsWord")} \xB7 ${brokenRows.length} ${t("brokenWord")}` : `${ours.length} ${t("sectionsWord")}` })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
    inlineError(error),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { display: "block", marginBottom: "8px" }, children: [
      t("titleLabel"),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "input",
        {
          ref: titleRef,
          value: title,
          onChange: (e) => setTitle(e.target.value),
          onBlur: flushTitle,
          style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...mutedStyle, fontSize: "12px" }, children: t("builtInNote") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: outlineRowsEls }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { marginTop: "8px" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "outline", icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconPlusOutlineRegular, { size: 14 }), onClick: () => setPickerOpen(true), children: t("addSection") }) }),
    completeModes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { marginTop: "12px", color: "var(--dsw-alias-state-warning-primary, orange)" }, children: `\u26A0 ${t("completeModeWarning")} ${completeModes.map((m) => m.title ?? m.id).join(", ")}` }),
    confirmRemove !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      ConfirmDialog,
      {
        open: true,
        title: t("confirmRemoveRef"),
        actionLabel: t("remove"),
        body: sectionsById.get(refs[confirmRemove]?.id ?? "")?.title || refs[confirmRemove]?.id || "",
        t,
        onCancel: () => setConfirmRemove(null),
        onConfirm: () => {
          const seq = confirmRemove;
          setConfirmRemove(null);
          removeRef(seq);
        }
      }
    ),
    pickerOpen && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      AddSectionPicker,
      {
        sections: state.sections ?? [],
        alreadyIn: new Set(refs.map((ref) => ref.id)),
        onAdd: addSections,
        onClose: () => setPickerOpen(false),
        t
      }
    )
  ] });
}
function ProfilesTab({
  state,
  api,
  reload,
  t,
  notify,
  drill,
  setDrill,
  onOpenSection,
  setState,
  createFlow
}) {
  const [creating, setCreating] = React5.useState(false);
  const [confirming, setConfirming] = React5.useState(null);
  const [justCreated, setJustCreated] = React5.useState(null);
  const [mutating, setMutating] = React5.useState(false);
  const profiles = [...state.profiles ?? []].sort((a, b) => a.title.localeCompare(b.title));
  const flow = React5.useMemo(
    () => createFlow ?? makeCreateFlow({
      api,
      t,
      notify,
      reload,
      getState: () => state,
      onState: setState,
      onPending: setCreating,
      onDrill: (id) => {
        setJustCreated(id);
        setDrill(id);
      }
    }),
    [createFlow, api, t, notify, reload, state, setState, setDrill]
  );
  const mutation = React5.useMemo(
    () => makeMutationFlow({
      api,
      t,
      notify,
      reload,
      getState: () => state,
      onState: setState,
      onPending: setMutating
    }),
    [api, t, notify, reload, state, setState]
  );
  const drilledProfile = drill ? profiles.find((p) => idOf(p) === drill) ?? null : null;
  React5.useEffect(() => {
    if (drill && !drilledProfile) setDrill(null);
  }, [drill, drilledProfile, setDrill]);
  if (drilledProfile) {
    const profile = drilledProfile;
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      ProfileOutline,
      {
        profile,
        state,
        api,
        reload,
        t,
        notify,
        autoFocusTitle: justCreated === drill,
        onBack: () => {
          setJustCreated(null);
          setDrill(null);
        },
        onOpenSection
      }
    );
  }
  const duplicateProfile = (profile) => mutation.run({
    mutate: () => api.profileCreate({
      title: `${profile.title} ${t("copySuffix")}`,
      sections: normalizeSections(profile.sections)
    }),
    optimistic: (prior, created) => ({
      ...prior,
      profiles: [...prior?.profiles ?? [], optimisticEntry("profile", created)]
    }),
    agree: (polled, created) => Boolean(findEntry(polled, created?.patchId ?? created?.rowId ?? created?.configId))
  });
  const deleteProfile = (profile) => mutation.run({
    mutate: () => api.profileDelete(profile.patchId),
    optimistic: (prior) => ({
      ...prior,
      profiles: (prior?.profiles ?? []).filter((p) => p.patchId !== profile.patchId)
    }),
    agree: (polled) => !findEntry(polled, profile.patchId)
  });
  const setDefault = (value) => runSave(() => api.setDefault(value), reload, t, notify);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
    profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: mutedStyle, children: t("noProfiles") }),
    profiles.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...rowStyle, cursor: "pointer" }, onClick: () => setDrill(idOf(profile)), children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: profile.title }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: mutedStyle, children: `${(profile.sections ?? []).length} ${t("sectionsWord")}` }),
      iconControl(t("editProfile"), import_dsh_client_ui_primitives4.IconEditOutlineRegular, () => setDrill(idOf(profile))),
      iconControl(
        t("duplicate"),
        import_dsh_client_ui_primitives4.IconCopyOutlineRegular,
        (e) => {
          e.stopPropagation();
          duplicateProfile(profile);
        },
        { disabled: mutating }
      ),
      iconControl(
        t("deleteLabel"),
        import_dsh_client_ui_primitives4.IconTrashOutlineRegular,
        (e) => {
          e.stopPropagation();
          setConfirming(profile);
        },
        { disabled: mutating }
      )
    ] }, idOf(profile))),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { marginTop: "8px" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives4.Button,
      {
        variant: "outline",
        disabled: creating || mutating,
        onClick: () => flow.create("profile", { title: t("defaultProfileTitle"), sections: [] }),
        children: creating ? t("creating") : t("newProfile")
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: mutedStyle, children: t("defaultForNewSessions") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DefaultMenu, { state, t, onPick: setDefault })
    ] }),
    confirming && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      ConfirmDialog,
      {
        open: true,
        title: t("confirmDeleteProfile"),
        actionLabel: t("deleteLabel"),
        body: confirming.title,
        t,
        onCancel: () => setConfirming(null),
        onConfirm: () => {
          const profile = confirming;
          setConfirming(null);
          deleteProfile(profile);
        }
      }
    )
  ] });
}

// src/client/settings-sections.tsx
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var React6 = __toESM(require("react"), 1);
var import_jsx_runtime5 = require("react/jsx-runtime");
function SectionForm({
  section,
  state,
  api,
  reload,
  t,
  notify,
  onBack,
  onRenamed,
  onDrill,
  setState,
  autoFocusTitle
}) {
  const [title, setTitle] = React6.useState(section.title);
  const [body, setBody] = React6.useState(section.body ?? "");
  const [confirmDelete, setConfirmDelete] = React6.useState(false);
  const [renameValue, setRenameValue] = React6.useState(refIdOf(section));
  const [confirmRename, setConfirmRename] = React6.useState(false);
  const [error, setError] = React6.useState("");
  const [mutating, setMutating] = React6.useState(false);
  const [renameHint, setRenameHint] = React6.useState("");
  const titleRef = React6.useRef(null);
  useFocusSelect(titleRef, autoFocusTitle);
  const mutation = React6.useMemo(
    () => makeMutationFlow({
      api,
      t,
      notify,
      reload,
      getState: () => state,
      onState: setState,
      onPending: setMutating
    }),
    [api, t, notify, reload, state, setState]
  );
  const confirmed = Boolean(section?.patchId) && (state?.sections ?? []).some((s) => s.patchId === section.patchId || idOf(s) === idOf(section));
  const titleOk = String(title ?? "").trim() !== "";
  const saveSection = () => {
    if (!canSaveSection(title, confirmed)) return Promise.resolve(false);
    return runSave(() => api.sectionUpdate(section.patchId, { title, body }), reload, t, notify, setError);
  };
  const flushTitle = useAutosave(title, () => {
    if (title !== section.title) saveSection();
  });
  const flushBody = useAutosave(body, () => {
    if (body !== (section.body ?? "")) saveSection();
  });
  const leave = () => {
    flushTitle();
    flushBody();
    onBack();
  };
  const duplicate = () => mutation.run({
    mutate: () => api.sectionCreate({
      title: `${section.title} ${t("copySuffix")}`,
      body: section.body ?? ""
    }),
    optimistic: (prior, created) => ({
      ...prior,
      sections: [...prior?.sections ?? [], optimisticEntry("section", created)]
    }),
    agree: (polled, created) => Boolean(findEntry(polled, created?.configId ?? created?.patchId ?? created?.rowId)),
    // Creation-style navigation: open the COPY, not the row it came from.
    onDone: (polled, created) => {
      const copy = findEntry(polled, created?.configId ?? created?.patchId ?? created?.rowId);
      if (copy && onDrill) onDrill(idOf(copy));
    }
  });
  const remove = () => mutation.run({
    mutate: () => api.sectionDelete(section.patchId),
    optimistic: (prior) => ({
      ...prior,
      sections: (prior?.sections ?? []).filter((s) => s.patchId !== section.patchId)
    }),
    agree: (polled) => !findEntry(polled, section.patchId),
    onDone: () => onBack()
  });
  const rename = () => {
    const typed = dedupeRowPrefix(String(renameValue ?? "").trim());
    const oldId = refIdOf(section) ?? "";
    if (!typed) {
      setRenameHint(t("renameEmpty"));
      return;
    }
    setRenameHint("");
    setConfirmRename(false);
    if (typed === oldId) return;
    const prefix = /^prompt-(?:section|profile)-/.exec(oldId)?.[0] ?? "";
    const newId = prefix && !typed.startsWith(prefix) ? `${prefix}${typed}` : typed;
    return mutation.run({
      mutate: () => api.sectionRename(section.patchId, typed),
      // The host canonicalizes the id and leaves profile references alone:
      // the polled row carries the new id, and the response lists any profile
      // still pointing at the old one — only a full /state reload reconciles
      // the outlines.
      agree: (polled) => (polled?.sections ?? []).some((s) => refIdOf(s) === newId),
      onDone: (polled, result) => {
        const notice = renameNotice(result, t);
        if (notice && notify) notify(notice);
        const live = (polled?.sections ?? []).find((s) => refIdOf(s) === newId);
        if (onRenamed) onRenamed(live ? refIdOf(live) ?? newId : newId);
      }
    });
  };
  const usedIn = section.usedIn ?? [];
  const sourceKind = sourceKindOf(section.source);
  const bundleOwned = section.source === "bundle";
  const emptyBody = !String(body ?? "").trim();
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...rowStyle, borderBottom: "none" }, children: [
      iconControl(t("back"), import_dsh_client_ui_primitives5.IconChevronLeftOutlineMedium, leave, {
        variant: "outline",
        tooltip: false,
        key: "back"
      }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { style: { flex: 1 }, children: idOf(section) }),
      iconControl(t("duplicate"), import_dsh_client_ui_primitives5.IconCopyOutlineRegular, duplicate, { disabled: mutating }),
      iconControl(t("deleteLabel"), import_dsh_client_ui_primitives5.IconTrashOutlineRegular, () => setConfirmDelete(true), { disabled: mutating })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
    inlineError(error),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: { display: "block", marginBottom: "8px" }, children: [
      t("titleLabel"),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          ref: titleRef,
          value: title,
          onChange: (e) => setTitle(e.target.value),
          onBlur: flushTitle,
          style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" }
        }
      ),
      !titleOk && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { ...mutedStyle, fontSize: "12px" }, children: t("titleRequired") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: { display: "block", marginBottom: "8px" }, children: [
      t("bodyLabel"),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "textarea",
        {
          value: body,
          rows: 8,
          onChange: (e) => setBody(e.target.value),
          onBlur: flushBody,
          style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px", resize: "vertical" }
        }
      ),
      emptyBody && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { ...mutedStyle, fontSize: "12px" }, children: t("emptyBody") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...mutedStyle, marginBottom: "4px" }, children: [
      `${t("usedIn")}: `,
      usedIn.length === 0 ? t("notUsed") : usedIn.map((u, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "span",
        {
          style: { marginRight: "8px" },
          children: `${usedInProfileName(state, u.profileId)} \u2014 ${t("scopeLabel")}: ${t(scopeKeyOf(u.scope))}`
        },
        `${u.profileId}:${u.scope}:${index}`
      ))
    ] }),
    sourceKind && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...mutedStyle, marginBottom: "8px" }, children: `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}` }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives5.Button,
        {
          variant: "outline",
          disabled: mutating || bundleOwned,
          title: bundleOwned ? t("renameIdLocked") : t("renameNote"),
          onClick: () => {
            setRenameValue(refIdOf(section));
            setRenameHint("");
            setConfirmRename(true);
          },
          children: t("renameId")
        }
      ),
      bundleOwned && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { ...mutedStyle, fontSize: "12px" }, children: t("renameIdLocked") })
    ] }),
    confirmDelete && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      ConfirmDialog,
      {
        open: true,
        title: t("confirmDeleteSection"),
        actionLabel: t("deleteLabel"),
        body: section.title,
        t,
        onCancel: () => setConfirmDelete(false),
        onConfirm: () => {
          setConfirmDelete(false);
          remove();
        }
      }
    ),
    confirmRename && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      ConfirmDialog,
      {
        open: true,
        title: t("confirmRename"),
        actionLabel: t("confirm"),
        body: t("renameNote"),
        t,
        onCancel: () => {
          setConfirmRename(false);
          setRenameHint("");
        },
        onConfirm: rename,
        extraChildren: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              value: renameValue,
              autoFocus: true,
              onChange: (e) => setRenameValue(e.target.value),
              style: { ...fieldStyle, width: "100%", boxSizing: "border-box" }
            }
          ),
          renameHint && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { ...mutedStyle, marginTop: "8px", marginBottom: 0 }, children: renameHint })
        ] })
      }
    )
  ] });
}
function SectionsTab({
  state,
  api,
  reload,
  t,
  notify,
  drill,
  setDrill,
  setState,
  createFlow
}) {
  const [query, setQuery] = React6.useState("");
  const [creating, setCreating] = React6.useState(false);
  const [justCreated, setJustCreated] = React6.useState(null);
  const sections = filterSections(state.sections ?? [], query);
  const flow = React6.useMemo(
    () => createFlow ?? makeCreateFlow({
      api,
      t,
      notify,
      reload,
      getState: () => state,
      onState: setState,
      onPending: setCreating,
      onDrill: (id) => {
        setJustCreated(id);
        setDrill(id);
      }
    }),
    [createFlow, api, t, notify, reload, state, setState, setDrill]
  );
  const drilledSection = drill ? (state.sections ?? []).find((s) => idOf(s) === drill) ?? null : null;
  React6.useEffect(() => {
    if (drill && !drilledSection) setDrill(null);
  }, [drill, drilledSection, setDrill]);
  if (drilledSection) {
    const live = drilledSection;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      SectionForm,
      {
        section: live,
        state,
        api,
        reload,
        t,
        notify,
        autoFocusTitle: justCreated === drill,
        onBack: () => {
          setJustCreated(null);
          setDrill(null);
        },
        onRenamed: (id) => {
          setJustCreated(null);
          setDrill(id);
        },
        onDrill: (id) => {
          setJustCreated(null);
          setDrill(id);
        },
        setState
      },
      idOf(live)
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: "8px", marginBottom: "8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives5.Input,
        {
          icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconSearchOutlineRegular, { size: 14 }),
          placeholder: t("searchPlaceholder"),
          value: query,
          onChange: (e) => setQuery(e.target.value),
          style: { flex: 1 }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives5.Button,
        {
          variant: "outline",
          disabled: creating,
          onClick: () => flow.create("section", { title: t("defaultSectionTitle"), body: "" }),
          children: creating ? t("creating") : t("newSection")
        }
      )
    ] }),
    sections.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: mutedStyle, children: t("noSections") }),
    sections.map((section) => {
      const sourceKind = sourceKindOf(section.source);
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...rowStyle, cursor: "pointer" }, onClick: () => setDrill(idOf(section)), children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          section.title,
          !String(section.body ?? "").trim() && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tag, { children: t("emptyBody") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: mutedStyle, children: [
          `${t("usedIn")}: `,
          (section.usedIn ?? []).length === 0 ? t("notUsed") : (section.usedIn ?? []).map((u) => usedInProfileName(state, u.profileId)).join(", ")
        ] }),
        sourceKind && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tag, { children: `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}` })
      ] }, idOf(section));
    })
  ] });
}

// src/client/settings-page.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var pageStyle = {
  height: "100%",
  minHeight: 0,
  boxSizing: "border-box",
  overflowY: "auto",
  scrollbarGutter: "stable"
};
function PromptProfilesSection(props) {
  const { t, api } = props;
  const { notify, banner } = useNotifier();
  const { state, setState, reload } = useProfilesState(api ?? unavailableApi, t, notify);
  const [tab, setTab] = React7.useState("profiles");
  const [drill, setDrillState] = React7.useState({ profiles: null, sections: null });
  const setDrill = (value) => setDrillState((prev) => ({ ...prev, [tab]: value }));
  React7.useEffect(() => {
    const onKey = (event) => {
      if (escapesDrillDown(event, typeof window !== "undefined" ? window : void 0)) {
        setDrillState((prev) => ({ ...prev, [tab]: null }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);
  const selectTab = (value) => {
    if (value === tab) setDrillState((prev) => ({ ...prev, [tab]: null }));
    else setTab(value);
  };
  const onOpenSection = (sectionId) => {
    setTab("sections");
    setDrillState((prev) => ({ ...prev, sections: sectionId }));
  };
  if (!state)
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: pageStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: mutedStyle, children: "\u2026" }),
      banner
    ] });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: pageStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      import_dsh_client_ui_primitives6.SegmentedTabs,
      {
        items: [
          { value: "profiles", label: t("tabProfiles"), id: "pp-tab-profiles", panelId: "pp-tab-profiles-panel" },
          { value: "sections", label: t("tabSections"), id: "pp-tab-sections", panelId: "pp-tab-sections-panel" },
          { value: "preview", label: t("tabPreview"), id: "pp-tab-preview", panelId: "pp-tab-preview-panel" }
        ],
        value: tab,
        onChange: selectTab,
        label: t("nav")
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { marginTop: "12px" }, children: [
      tab === "profiles" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        ProfilesTab,
        {
          state,
          api: api ?? unavailableApi,
          reload,
          t,
          notify,
          drill: drill.profiles ?? null,
          setDrill,
          onOpenSection,
          setState
        }
      ),
      tab === "sections" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        SectionsTab,
        {
          state,
          api: api ?? unavailableApi,
          reload,
          t,
          notify,
          drill: drill.sections ?? null,
          setDrill,
          setState
        }
      ),
      tab === "preview" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(PreviewTab, { state, api: api ?? unavailableApi, t, notify })
    ] }),
    banner
  ] });
}

// src/client/index.ts
module.exports = {
  // apply() touches exactly these services; undeclared services stay unreachable on ctx.
  inject: ["slots", "locale", "remote"],
  helpers,
  // Test seams (also reusable building blocks).
  makeCreateFlow,
  makeMutationFlow,
  runSave,
  findEntry,
  optimisticEntry,
  remote: remote_exports,
  getActiveApi,
  readyApi,
  components: { ProfilesTab, SectionsTab, SectionForm, ProfileOutline, PreviewTab },
  // #region FUNC_apply
  /** @purpose Register the plugin's locale entries, Remote mount and slot surfaces. */
  apply(ctx) {
    ctx.locale.register(NS, messages);
    if (typeof ctx.locale.bind === "function") bindT(ctx.locale.bind(NS));
    if (typeof ctx.effect === "function") mountRemote(ctx);
    ctx.slots.inject(
      "conversation.input.left",
      () => ctx.slots.register(
        {
          name: "conversation.input.left",
          id: "prompt-profile",
          order: 10,
          locale: NS,
          inject: (sessionId) => ({
            // `choice` is {profileId, workspaceId?, cwd?}: the host keys `last`
            // by workspace id when known, else by the Session cwd.
            pick: (choice) => readyApi().then((api) => api.last(choice)),
            sessionId
          })
        },
        PromptProfileChip
      )
    );
    ctx.slots.inject("settings.section", () => {
      const bound2 = typeof ctx.locale.bind === "function" ? ctx.locale.bind(NS) : null;
      return ctx.slots.register(
        {
          name: "settings.section",
          id: "prompt-profiles",
          order: 25,
          label: () => bound2 ? bound2("nav") : messages.en.nav,
          locale: NS,
          inject: () => ({ api: getActiveApi() })
        },
        PromptProfilesSection
      );
    });
  }
};
return module.exports; } });
//# sourceMappingURL=client.js.map
