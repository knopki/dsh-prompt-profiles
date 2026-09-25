import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  planInsertion,
  resolveWorkspaceKeys,
  sectionSkipReason
} from "./chunk-GU6TSHY5.js";
import {
  disableRow,
  insertRow,
  listRowIds,
  provenance,
  readPatchRows,
  removeRow,
  renameSectionRow,
  require_dist,
  toPatchId,
  withWriteLock
} from "./chunk-P2AH5IU6.js";
import {
  __toESM
} from "./chunk-EU2VRU6C.js";

// src/host/operations.ts
var import_yaml = __toESM(require_dist(), 1);
import { randomUUID } from "node:crypto";
var SECTION_NAME = "@knopki/dsh-prompt-profiles/section";
var PROFILE_NAME = "@knopki/dsh-prompt-profiles/profile";
var ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
var SCOPES = ["inherit", "main-only", "subagents-only"];
var PERSONA_PLUGIN = "@deepseek-ai/dsh-persona";
var yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
var ApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
function errorText(error) {
  if (error instanceof Error) {
    if (typeof error.message === "string" && error.message !== "") return error.message;
    return error.name || "Error";
  }
  if (typeof error === "string") return error === "" ? "unknown error" : error;
  if (typeof error === "object" && error !== null && typeof error.message === "string" && error.message !== "") {
    return error.message;
  }
  try {
    const text = String(error);
    if (text !== "") return text;
  } catch {
  }
  return "unknown error";
}
function findRow(registryView, value) {
  if (typeof value !== "string" || value === "") return null;
  const normalized = toPatchId(value);
  return (registryView ?? []).find(
    (candidate) => candidate.rowId === value || candidate.rowId === normalized || toPatchId(candidate.rowId) === normalized || candidate.id === value || candidate.id === normalized
  ) ?? null;
}
function normalizeNewRowId(kind, value) {
  if (typeof value !== "string") return null;
  const bare = toPatchId(value);
  if (bare === "") return null;
  const prefix = `prompt-${kind}-`;
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}
var tokenSource = { next: () => randomUUID().replace(/-/g, "").slice(0, 8) };
function generateTokenId(kind, taken) {
  let id = normalizeNewRowId(kind, tokenSource.next());
  while (id === null || taken.has(id)) id = normalizeNewRowId(kind, tokenSource.next());
  return id;
}
function validate(kind, body, deps = {}) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, `${kind}: request body must be a JSON object`);
  }
  const str = (field, { allowEmpty = false } = {}) => {
    const value = body[field];
    if (typeof value !== "string" || !allowEmpty && value.trim() === "") {
      throw new ApiError(400, `${kind}: field "${field}" must be a ${allowEmpty ? "string" : "non-empty string"}`);
    }
    return value;
  };
  const newId = (name) => {
    if (body.id === void 0) return null;
    if (typeof body.id !== "string" || body.id.trim() === "") {
      throw new ApiError(400, `${kind}: field "id" must be a non-empty string`);
    }
    const full = normalizeNewRowId(name, body.id);
    const token = full === null ? "" : full.slice(`prompt-${name}-`.length);
    if (token === "" || !ID_PATTERN.test(token)) {
      throw new ApiError(400, `${kind}: field "id" must be a bare token, prompt-${name}-<token>, or include:prompt-${name}-<token> matching ${ID_PATTERN}`);
    }
    return full;
  };
  const revision = () => {
    if (body.revision !== void 0 && !Number.isFinite(body.revision)) {
      throw new ApiError(400, `${kind}: "revision" must be a number when present`);
    }
    return body.revision;
  };
  const titleWithDefault = (fallback) => {
    const value = body.title;
    if (value === void 0 || typeof value === "string" && value.trim() === "") return fallback;
    if (typeof value !== "string") throw new ApiError(400, `${kind}: field "title" must be a string`);
    return value;
  };
  const sectionRefId = (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    const targets = deps.sectionTargets ?? /* @__PURE__ */ new Map();
    const direct = targets.get(raw) ?? targets.get(toPatchId(raw));
    if (direct !== void 0) return direct;
    const full = normalizeNewRowId("section", raw);
    if (full === null) return null;
    const registered = targets.get(full);
    if (registered !== void 0) return registered;
    const token = full.slice("prompt-section-".length);
    if (token === "" || !ID_PATTERN.test(token)) return null;
    return deps.pendingSectionIds?.has(full) ? full : null;
  };
  const sectionRefs = (value) => {
    if (!Array.isArray(value)) throw new ApiError(400, `${kind}: sections must be an array`);
    return value.map((ref, index) => {
      if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
        throw new ApiError(400, `${kind}: sections[${index}] must be an object`);
      }
      const id = sectionRefId(ref.id);
      if (id === null) {
        throw new ApiError(400, `${kind}: sections[${index}].id "${ref.id}" is not a registered section`);
      }
      if (!Number.isFinite(ref.order)) throw new ApiError(400, `${kind}: sections[${index}].order must be a number`);
      if (ref.scope != null && !SCOPES.includes(ref.scope)) {
        throw new ApiError(400, `${kind}: sections[${index}].scope must be one of ${SCOPES.join(", ")}`);
      }
      return { id, order: ref.order, ...ref.scope != null ? { scope: ref.scope } : {} };
    });
  };
  switch (kind) {
    case "section/create": {
      const id = newId("section");
      const title = titleWithDefault("Section");
      if (body.body !== void 0 && typeof body.body !== "string") {
        throw new ApiError(400, `${kind}: field "body" must be a string`);
      }
      return { id, title, body: body.body ?? "" };
    }
    case "profile/create": {
      const id = newId("profile");
      const title = titleWithDefault("Profile");
      const sections = body.sections === void 0 ? [] : sectionRefs(body.sections);
      return { id, title, sections };
    }
    case "section/update": {
      const rowIdValue = str("rowId");
      if (body.value === null || typeof body.value !== "object" || Array.isArray(body.value)) {
        throw new ApiError(400, `${kind}: field "value" must be an object {title, body}`);
      }
      if (typeof body.value.title !== "string" || body.value.title.trim() === "") {
        throw new ApiError(400, `${kind}: value.title must be a non-empty string`);
      }
      if (typeof body.value.body !== "string") {
        throw new ApiError(400, `${kind}: value.body must be a string (empty allowed)`);
      }
      return { rowId: rowIdValue, value: { title: body.value.title, body: body.value.body }, revision: revision() };
    }
    case "profile/update": {
      const rowIdValue = str("rowId");
      if (body.value === null || typeof body.value !== "object" || Array.isArray(body.value)) {
        throw new ApiError(400, `${kind}: field "value" must be an object {title, sections}`);
      }
      if (typeof body.value.title !== "string" || body.value.title.trim() === "") {
        throw new ApiError(400, `${kind}: value.title must be a non-empty string`);
      }
      const sections = body.value.sections === void 0 ? [] : sectionRefs(body.value.sections);
      return { rowId: rowIdValue, value: { title: body.value.title, sections }, revision: revision() };
    }
    case "section/rename":
      return { rowId: str("rowId"), id: newId("section") };
    case "section/delete":
      return { rowId: str("rowId") };
    case "profile/delete":
      return { rowId: str("rowId"), revision: revision() };
    case "default": {
      if (!("default" in body) || body.default !== null && typeof body.default !== "string") {
        throw new ApiError(400, 'default: field "default" must be a profile id string, "" for none, or null');
      }
      return { default: body.default ?? "" };
    }
    case "last": {
      if (body.workspaceId !== void 0 && typeof body.workspaceId !== "string") {
        throw new ApiError(400, 'last: "workspaceId" must be a string when present');
      }
      if (body.cwd !== void 0 && typeof body.cwd !== "string") {
        throw new ApiError(400, 'last: "cwd" must be a string when present');
      }
      const workspaceId = body.workspaceId ?? "";
      const cwd = body.cwd ?? "";
      if (workspaceId === "" && cwd === "") {
        throw new ApiError(400, "last: workspaceId or cwd is required");
      }
      if (typeof body.profileId !== "string") throw new ApiError(400, "last: profileId must be a string (empty = none)");
      return { workspaceId, cwd, profileId: body.profileId, revision: revision() };
    }
    default:
      throw new ApiError(500, `validate: unknown kind ${kind}`);
  }
}
var MAX_PRESET_DEPTH = 32;
function hasCompletePersona(node, depth = 0) {
  if (depth > MAX_PRESET_DEPTH) return false;
  if (Array.isArray(node)) return node.some((child) => hasCompletePersona(child, depth + 1));
  if (node === null || typeof node !== "object") return false;
  if (node.name === PERSONA_PLUGIN && node.config?.complete === true) return true;
  return Object.values(node).some((child) => hasCompletePersona(child, depth + 1));
}
async function modeViews(agentPresets, warn) {
  if (agentPresets == null) return [];
  let presets;
  try {
    presets = await agentPresets.list();
  } catch (error) {
    warn?.("prompt-profiles api: agentPresets.list failed; modes empty", { error: error?.message ?? String(error) });
    return [];
  }
  const modes = [];
  for (const preset of presets) {
    let complete = false;
    try {
      const document = await agentPresets.readDocument(preset.id);
      const entries = (0, import_yaml.parse)(document.content ?? "", yamlParseOptions);
      complete = hasCompletePersona(entries);
    } catch (error) {
      warn?.("prompt-profiles api: preset document unreadable; complete stays false", {
        preset: preset.id,
        error: error?.message ?? String(error)
      });
    }
    modes.push({ id: preset.id, title: preset.name ?? preset.id, complete });
  }
  return modes;
}
async function stateResponse(deps) {
  const { service, warn, patchIdOf } = deps;
  const settings = deps.getService?.("settings") ?? deps.settings;
  const revision = settings?.describe?.().find((descriptor) => descriptor.ns === "prompt-profiles")?.revision ?? null;
  return {
    profiles: service.profiles().map((profile) => ({ ...profile, patchId: patchIdOf(profile.rowId) })),
    sections: service.sections().map((section) => ({
      ...section,
      patchId: patchIdOf(section.rowId),
      usedIn: service.usedIn(section.id),
      emits: typeof section.body === "string" && section.body.trim() !== ""
    })),
    builtinOrders: service.builtinOrders(),
    modes: await modeViews(deps.getService?.("agentPresets") ?? deps.agentPresets, warn),
    default: service.config.default.get(),
    lastByWorkspace: service.config.lastByWorkspace.get(),
    revision
  };
}
function previewResponse(deps, profileId, { cwd } = {}) {
  const { service } = deps;
  const profile = findRow(service.profiles(), profileId);
  if (!profile) throw new ApiError(404, `profile "${profileId}" is not registered`);
  const sectionsById = new Map(service.sections().map((row) => [row.id, row]));
  const builtinOrdersByName = service.builtinOrdersByName?.() ?? {};
  const sessionCwd = typeof cwd === "string" && cwd !== "" ? cwd : process.cwd();
  const usedVariables = /* @__PURE__ */ new Set();
  const interpolate = (text) => String(text).replace(/\{\{([^{}]*)\}\}/g, (match, name) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) return match;
    usedVariables.add(name);
    return name === "cwd" ? sessionCwd : match;
  });
  const planned = [...profile.sections].sort((a, b) => a.order - b.order);
  const ours = [];
  const skipped = [];
  for (const ref of planned) {
    const section = sectionsById.get(ref.id);
    const reason = sectionSkipReason(ref, section, { subagent: false, fork: false });
    if (reason !== null) {
      skipped.push({ id: ref.id, title: section?.title ?? ref.id, reason });
      continue;
    }
    let text;
    try {
      text = interpolate(section.body);
    } catch (error) {
      skipped.push({ id: ref.id, title: section.title, reason: `interpolation failed: ${error?.message ?? String(error)}` });
      continue;
    }
    ours.push({
      id: section.id,
      title: section.title,
      order: ref.order,
      scope: ref.scope ?? "inherit",
      text,
      emits: true
    });
  }
  const builtins = Object.entries(builtinOrdersByName).map(([name, order]) => ({ kind: "builtin", name, title: name, order })).sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const plan = planInsertion({
    snapshot: { sections: ours.map((row) => ({ id: row.id, order: row.order, text: row.text })) },
    assemblySections: builtins.map((row) => ({ name: row.name })),
    builtinOrdersByName
  });
  const merged = builtins.slice();
  for (let i = plan.length - 1; i >= 0; i--) merged.splice(plan[i].index, 0, ours[i]);
  const variables = Object.fromEntries([...usedVariables].sort().map((name) => [name, name === "cwd" ? sessionCwd : null]));
  return { profileId, title: profile.title, sections: merged, skipped, variables };
}
function mapDuplicate(error) {
  if (/already exists/.test(error?.message ?? "")) throw new ApiError(400, error.message);
  throw error;
}
async function deleteRow(deps, patchId, name) {
  const configEditor = deps.getService?.("configEditor") ?? deps.configEditor;
  if (!configEditor) throw new ApiError(503, "profile storage service is unavailable");
  const patchPath = configEditor.documentPath;
  const ownership = provenance({ patchPath, rowId: patchId });
  if (ownership.source === "user") {
    const removed = await removeRow({ patchPath, rowId: patchId });
    if (!removed) throw new ApiError(404, `row "${patchId}" not found in the profile patch`);
    return { disabled: false };
  }
  await disableRow({ patchPath, rowId: patchId, name });
  return { disabled: true };
}
async function renameSection(deps, { rowId: received, id: newId }) {
  const { service, resolve } = deps;
  const configEditor = deps.getService?.("configEditor") ?? deps.configEditor;
  if (!configEditor) throw new ApiError(503, "profile storage service is unavailable");
  const { row: section, patchId } = resolve("section", received);
  const oldRowId = patchId;
  const aliases = /* @__PURE__ */ new Set([section.id, toPatchId(section.rowId)]);
  if (typeof section.id === "string" && section.id.startsWith("prompt-section-")) {
    aliases.add(section.id.slice("prompt-section-".length));
  }
  const namesSection = (value) => aliases.has(value) || aliases.has(toPatchId(value));
  const affectedProfiles = service.profiles().filter((profile) => profile.sections.some((ref) => namesSection(ref.id))).map((profile) => ({ profileId: profile.id, title: profile.title }));
  if (namesSection(newId)) throw new ApiError(400, `section id "${newId}" is already taken`);
  const clash = service.sections().some((row) => row.rowId !== section.rowId && (row.id === newId || row.rowId === newId || toPatchId(row.rowId) === newId));
  if (clash) throw new ApiError(400, `section id "${newId}" is already taken`);
  const patchPath = configEditor.documentPath;
  const bundleOwned = !provenance({ patchPath, rowId: oldRowId }).inserted;
  try {
    await renameSectionRow({
      patchPath,
      row: { id: newId, name: SECTION_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId,
      oldName: SECTION_NAME,
      bundleOwned
    });
  } catch (error) {
    mapDuplicate(error);
  }
  return { rowId: newId, patchId: newId, id: newId, affectedProfiles };
}
function createOperations(deps) {
  const { service } = deps;
  const SECTION_PREFIX = "prompt-section-";
  const svc = (name) => {
    try {
      return deps.getService?.(name) ?? deps[name];
    } catch {
      return deps[name];
    }
  };
  const settingsStore = () => svc("settings");
  const editorStore = () => svc("configEditor");
  const requireSettings = () => {
    const store = settingsStore();
    if (!store) throw new ApiError(503, "profile storage service is unavailable");
    return store;
  };
  const requireStorage = () => {
    const store = settingsStore();
    const editor = editorStore();
    if (!store || !editor) throw new ApiError(503, "profile storage service is unavailable");
    return { settings: store, configEditor: editor };
  };
  const patchPath = () => editorStore()?.documentPath;
  const sectionTargets = () => {
    const targets = /* @__PURE__ */ new Map();
    const alias = (key, value) => {
      if (typeof key === "string" && key !== "" && !targets.has(key)) targets.set(key, value);
    };
    for (const row of service.sections()) {
      const id = row.id;
      if (typeof id !== "string" || id === "") continue;
      targets.set(id, id);
      const patch = toPatchId(row.rowId);
      alias(patch, id);
      alias(`include:${patch}`, id);
      if (id.startsWith(SECTION_PREFIX)) alias(id.slice(SECTION_PREFIX.length), id);
      else alias(`${SECTION_PREFIX}${id}`, id);
    }
    return targets;
  };
  const pendingSectionIds = () => {
    try {
      const path = patchPath();
      if (path === void 0) return /* @__PURE__ */ new Set();
      return new Set(readPatchRows({ patchPath: path }).filter((row) => typeof row.id === "string" && row.id.startsWith(SECTION_PREFIX) && row.name === SECTION_NAME && row.hasConfig && !row.disabled).map((row) => row.id));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  };
  const profileSelectable = (profileId) => {
    const entry = service.profiles().find((row2) => row2.id === profileId);
    if (!entry) return false;
    let rows;
    try {
      const path = patchPath();
      if (path === void 0) return true;
      rows = readPatchRows({ patchPath: path });
    } catch {
      return true;
    }
    const row = rows.find((candidate) => candidate.id === entry.rowId || candidate.configId === profileId);
    if (row) return row.name === PROFILE_NAME && !row.disabled;
    return entry.source !== "user";
  };
  const takenConfigIds = (kind) => new Set((kind === "section" ? service.sections() : service.profiles()).map((row) => row.id));
  const patchIdOf = (rowIdValue) => {
    try {
      const entry = (editorStore()?.entries?.() ?? []).find((candidate) => {
        const id = candidate?.options?.id;
        return typeof id === "string" && (id === rowIdValue || toPatchId(id) === toPatchId(rowIdValue));
      });
      if (entry) return toPatchId(entry.options.id);
    } catch {
    }
    return toPatchId(rowIdValue);
  };
  deps.patchIdOf = patchIdOf;
  const resolveRow = (kind, received) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    const row = findRow(rows, received);
    if (!row) throw new ApiError(404, `${kind} row "${received}" is not registered`);
    return { row, patchId: patchIdOf(row.rowId) };
  };
  deps.resolve = resolveRow;
  const mapSettingsError = (error, revision) => {
    if (error?.code === "SETTINGS_CONFLICT") throw new ApiError(409, `configuration changed since read (expected revision ${revision})`);
    const message = errorText(error);
    if (/is not volatile/.test(message)) throw new ApiError(400, message);
    if (/No configurable plugin entry/.test(message)) throw new ApiError(404, message);
    throw error;
  };
  const settingsWrite = async (method, ns, value, revision) => {
    try {
      const store = requireSettings();
      await withWriteLock(() => method === "replace" ? store.replace(ns, value, typeof revision === "number" ? revision : void 0) : store.mutate(ns, value, typeof revision === "number" ? revision : void 0));
    } catch (error) {
      mapSettingsError(error, revision);
    }
  };
  const MAX_MUTATE_ATTEMPTS = 5;
  const currentRevision = () => {
    try {
      return settingsStore()?.describe?.().find((entry) => entry.ns === "prompt-profiles")?.revision;
    } catch {
      return void 0;
    }
  };
  const mutateWithRetry = async (buildOps, { clientRevision } = {}) => withWriteLock(async () => {
    for (let attempt = 1; ; attempt += 1) {
      const expected = currentRevision();
      if (attempt === 1 && typeof clientRevision === "number" && typeof expected === "number" && clientRevision !== expected) {
        throw new ApiError(409, `configuration changed since read (expected revision ${clientRevision})`);
      }
      const ops2 = buildOps({ revisionAvailable: typeof expected === "number" });
      if (ops2.length === 0) return false;
      try {
        await settingsStore().mutate("prompt-profiles", ops2, typeof expected === "number" ? expected : void 0);
        return true;
      } catch (error) {
        if (error?.code !== "SETTINGS_CONFLICT") mapSettingsError(error, expected);
        if (attempt >= MAX_MUTATE_ATTEMPTS) {
          throw new ApiError(409, `configuration kept changing; gave up after ${MAX_MUTATE_ATTEMPTS} attempts`);
        }
      }
    }
  });
  const clearProfileReferences = async (profile) => {
    const aliases = new Set([profile.id, profile.rowId, toPatchId(profile.rowId)].filter((value) => typeof value === "string" && value !== ""));
    return mutateWithRetry(() => {
      const ops2 = [];
      for (const [key, value] of Object.entries(service.config.lastByWorkspace.get() ?? {})) {
        if (aliases.has(value)) ops2.push({ op: "unset", path: ["lastByWorkspace", key] });
      }
      if (aliases.has(service.config.default.get())) ops2.push({ op: "set", path: ["default"], value: "" });
      return ops2;
    });
  };
  const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const staleWorkspaceKeys = (value) => {
    const profileIds = new Set(service.profiles().map((row) => row.id));
    const registry = svc("workspaceRegistry");
    const stale = [];
    for (const [key, entry] of Object.entries(value ?? {})) {
      if (entry !== "" && !profileIds.has(entry)) {
        stale.push(key);
        continue;
      }
      if (WORKSPACE_ID.test(key) && typeof registry?.get === "function") {
        let known = true;
        try {
          known = Boolean(registry.get(key));
        } catch {
          known = true;
        }
        if (!known) stale.push(key);
      }
    }
    return stale;
  };
  const takenIds = (kind) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    const taken = /* @__PURE__ */ new Set();
    const add = (value) => {
      if (typeof value !== "string" || value === "") return;
      taken.add(value);
      taken.add(toPatchId(value));
    };
    for (const row of rows) {
      add(row.rowId);
      add(row.id);
    }
    try {
      const path = patchPath();
      if (path !== void 0) for (const id of listRowIds({ patchPath: path })) add(id);
    } catch {
    }
    return taken;
  };
  const ops = {
    /** Read the full editor state (degrades per optional service). */
    state: () => stateResponse(deps),
    /**
     * Illustrative profile preview. `input.profileId` must be a non-empty
     * id (the HTTP layer reads it from its query parameter, hence the
     * historical message text).
     */
    preview: (input) => {
      const profileId = input?.profileId;
      if (typeof profileId !== "string" || profileId === "") {
        throw new ApiError(400, 'preview: query parameter "profileId" is required');
      }
      return previewResponse(deps, profileId, { cwd: input?.cwd });
    },
    /** Create a section row (SPEC §7: empty body allowed). */
    sectionCreate: (body) => {
      requireStorage();
      const payload = validate("section/create", body, { sectionTargets: sectionTargets() });
      if (payload.id !== null && takenConfigIds("section").has(payload.id)) {
        throw new ApiError(400, `section id "${payload.id}" already exists`);
      }
      const id = payload.id ?? generateTokenId("section", takenIds("section"));
      const row = { id, name: SECTION_NAME, config: { id, title: payload.title, body: payload.body } };
      return insertRow({ patchPath: requireStorage().configEditor.documentPath, row }).catch(mapDuplicate).then(() => ({
        rowId: row.id,
        patchId: row.id,
        configId: row.id,
        title: payload.title,
        body: payload.body,
        emits: payload.body.trim() !== ""
      }));
    },
    /** Whole-object update of a section's volatile fields. */
    sectionUpdate: async (body) => {
      requireStorage();
      const payload = validate("section/update", body);
      const { row, patchId } = resolveRow("section", payload.rowId);
      await settingsWrite("replace", patchId, { title: payload.value.title, body: payload.value.body }, payload.revision);
      return { rowId: row.rowId, patchId, emits: payload.value.body.trim() !== "" };
    },
    /** Delete (or disable) a section row. */
    sectionDelete: async (body) => {
      requireStorage();
      const payload = validate("section/delete", body);
      const { patchId } = resolveRow("section", payload.rowId);
      return deleteRow(deps, patchId, SECTION_NAME);
    },
    /** Rename a section row; profiles are never rewritten (see renameSection). */
    sectionRename: (body) => {
      requireStorage();
      const payload = validate("section/rename", body);
      return renameSection(deps, payload);
    },
    /** Create a profile row. */
    profileCreate: (body) => {
      requireStorage();
      const payload = validate("profile/create", body, { sectionTargets: sectionTargets(), pendingSectionIds: pendingSectionIds() });
      if (payload.id !== null && takenConfigIds("profile").has(payload.id)) {
        throw new ApiError(400, `profile id "${payload.id}" already exists`);
      }
      const id = payload.id ?? generateTokenId("profile", takenIds("profile"));
      const row = { id, name: PROFILE_NAME, config: { id, title: payload.title, sections: payload.sections } };
      return insertRow({ patchPath: requireStorage().configEditor.documentPath, row }).catch(mapDuplicate).then(() => ({
        rowId: row.id,
        patchId: row.id,
        configId: row.id,
        title: payload.title,
        sections: payload.sections
      }));
    },
    /** Whole-object update of a profile's volatile fields. */
    profileUpdate: async (body) => {
      requireStorage();
      const payload = validate("profile/update", body, { sectionTargets: sectionTargets(), pendingSectionIds: pendingSectionIds() });
      const { row, patchId } = resolveRow("profile", payload.rowId);
      await settingsWrite("replace", patchId, { title: payload.value.title, sections: payload.value.sections }, payload.revision);
      return { rowId: row.rowId, patchId };
    },
    /** Delete a profile row and best-effort-clear its default/last references. */
    profileDelete: async (body) => {
      requireStorage();
      const payload = validate("profile/delete", body);
      const { row, patchId } = resolveRow("profile", payload.rowId);
      const result = await deleteRow(deps, patchId, PROFILE_NAME);
      try {
        await clearProfileReferences(row);
      } catch (error) {
        try {
          deps.log?.warn?.("prompt-profiles: profile deleted but its default/lastByWorkspace references were not cleared", {
            profileId: row.id,
            error: errorText(error)
          });
        } catch {
        }
      }
      return result;
    },
    /**
     * Set (`""`/null = clear) the default profile. Body contract:
     * `{default: profileId | "" | null, revision?}` — the Remote adapter
     * renames `default` to `profileId` but shares this implementation.
     */
    defaultSet: async (body) => {
      requireSettings();
      const payload = validate("default", body);
      await mutateWithRetry(() => {
        if (payload.default !== "" && !profileSelectable(payload.default)) {
          throw new ApiError(404, `profile "${payload.default}" is not registered`);
        }
        return [{ op: "set", path: ["default"], value: payload.default }];
      }, { clientRevision: body.revision });
    },
    /** Record the workspace's last chosen profile (SPEC §2 #11). */
    last: async (body) => {
      requireSettings();
      const payload = validate("last", body);
      const workspaceKeys = await resolveWorkspaceKeys({
        workspaceRegistry: svc("workspaceRegistry"),
        workspaceId: payload.workspaceId,
        cwd: payload.cwd
      });
      const workspaceKey = workspaceKeys[0] ?? "";
      await mutateWithRetry(({ revisionAvailable }) => {
        if (payload.profileId !== "" && !profileSelectable(payload.profileId)) {
          throw new ApiError(404, `profile "${payload.profileId}" is not registered`);
        }
        const ops2 = revisionAvailable ? staleWorkspaceKeys(service.config.lastByWorkspace.get()).map((key) => ({ op: "unset", path: ["lastByWorkspace", key] })) : [];
        ops2.push({ op: "set", path: ["lastByWorkspace", workspaceKey], value: payload.profileId });
        return ops2;
      }, { clientRevision: payload.revision });
    }
  };
  const routes = [
    { path: "/state", method: "GET", op: "state", run: () => ops.state() },
    {
      path: "/preview",
      method: "GET",
      op: "preview",
      run: (body, query) => ops.preview({
        profileId: query.get("profileId") ?? void 0,
        cwd: query.get("cwd") ?? void 0
      })
    },
    { path: "/section/create", method: "POST", op: "sectionCreate", run: (body) => ops.sectionCreate(body) },
    { path: "/section/update", method: "POST", op: "sectionUpdate", run: (body) => ops.sectionUpdate(body) },
    { path: "/section/delete", method: "POST", op: "sectionDelete", run: (body) => ops.sectionDelete(body) },
    { path: "/section/rename", method: "POST", op: "sectionRename", run: (body) => ops.sectionRename(body) },
    { path: "/profile/create", method: "POST", op: "profileCreate", run: (body) => ops.profileCreate(body) },
    { path: "/profile/update", method: "POST", op: "profileUpdate", run: (body) => ops.profileUpdate(body) },
    { path: "/profile/delete", method: "POST", op: "profileDelete", run: (body) => ops.profileDelete(body) },
    { path: "/default", method: "POST", op: "defaultSet", run: (body) => ops.defaultSet(body) },
    { path: "/last", method: "POST", op: "last", run: (body) => ops.last(body) }
  ];
  return { ops, routes };
}

export {
  ApiError,
  errorText,
  findRow,
  normalizeNewRowId,
  tokenSource,
  createOperations
};
//# sourceMappingURL=chunk-7MITQ3EU.js.map
