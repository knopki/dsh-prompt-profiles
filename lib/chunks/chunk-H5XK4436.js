import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  defaultPayload,
  lastPayload,
  parsePayload,
  profileCreatePayload,
  profileDeletePayload,
  profileUpdatePayload,
  sectionCreatePayload,
  sectionDeletePayload,
  sectionRenamePayload,
  sectionUpdatePayload
} from "./chunk-FEAYNPVI.js";
import {
  require_dist
} from "./chunk-EU4N3AP7.js";
import {
  refNamesRow,
  resolveSectionRefId,
  rowAliases,
  sectionRefTargets
} from "./chunk-CTYVKZTO.js";
import {
  ConflictError,
  InternalError,
  InvalidInputError,
  NotFoundError,
  UnavailableError,
  errorMessage,
  interpolationSkipReason,
  planInsertion,
  sectionSkipReason,
  sortByOrder
} from "./chunk-M5XL7FMX.js";
import {
  PERSONA_PLUGIN_NAME,
  PROFILE_PLUGIN_NAME,
  SECTION_PLUGIN_NAME,
  configIds,
  findRow,
  idPrefix,
  newRowId,
  normalizeExplicitRowId,
  takenIds,
  toPatchId
} from "./chunk-PYSVU6K5.js";
import {
  __toESM
} from "./chunk-EU2VRU6C.js";

// src/host/operations.ts
var import_yaml = __toESM(require_dist(), 1);
var yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
function titleOrDefault(value, fallback) {
  return value === void 0 || value.trim() === "" ? fallback : value;
}
function explicitRowId(label, kind, value) {
  if (value === void 0) return null;
  const full = normalizeExplicitRowId(kind, value);
  if (full === null) {
    const prefix = idPrefix(kind);
    throw new InvalidInputError(
      `${label}: field "id" must be a bare token, ${prefix}<token>, or include:${prefix}<token>`
    );
  }
  return full;
}
function sectionRefs(label, refs, deps) {
  const targets = deps.sectionTargets ?? /* @__PURE__ */ new Map();
  return refs.map((ref, index) => {
    const id = resolveSectionRefId(ref.id, { targets, pending: deps.pendingSectionIds });
    if (id === null) {
      throw new InvalidInputError(`${label}: sections[${index}].id "${ref.id}" is not a registered section`);
    }
    return { id, order: ref.order, ...ref.scope != null ? { scope: ref.scope } : {} };
  });
}
function validate(kind, body, deps = {}) {
  switch (kind) {
    case "section/create": {
      const payload = parsePayload(sectionCreatePayload, body, kind);
      return {
        id: explicitRowId(kind, "section", payload.id),
        title: titleOrDefault(payload.title, "Section"),
        body: payload.body ?? ""
      };
    }
    case "profile/create": {
      const payload = parsePayload(profileCreatePayload, body, kind);
      return {
        id: explicitRowId(kind, "profile", payload.id),
        title: titleOrDefault(payload.title, "Profile"),
        sections: payload.sections === void 0 ? [] : sectionRefs(kind, payload.sections, deps)
      };
    }
    case "section/update": {
      const payload = parsePayload(sectionUpdatePayload, body, kind);
      return {
        rowId: payload.rowId,
        value: { title: payload.value.title, body: payload.value.body },
        revision: payload.revision
      };
    }
    case "profile/update": {
      const payload = parsePayload(profileUpdatePayload, body, kind);
      return {
        rowId: payload.rowId,
        value: {
          title: payload.value.title,
          sections: payload.value.sections === void 0 ? [] : sectionRefs(kind, payload.value.sections, deps)
        },
        revision: payload.revision
      };
    }
    case "section/rename": {
      const payload = parsePayload(sectionRenamePayload, body, kind);
      const id = explicitRowId(kind, "section", payload.id);
      if (id === null) throw new InvalidInputError(`${kind}: field "id" is required`);
      return { rowId: payload.rowId, id };
    }
    case "section/delete": {
      const payload = parsePayload(sectionDeletePayload, body, kind);
      return { rowId: payload.rowId };
    }
    case "profile/delete":
      return parsePayload(profileDeletePayload, body, kind);
    case "default": {
      const payload = parsePayload(defaultPayload, body, kind);
      return { default: payload.default ?? "" };
    }
    case "last": {
      const payload = parsePayload(lastPayload, body, kind);
      return {
        workspaceId: payload.workspaceId ?? "",
        cwd: payload.cwd ?? "",
        profileId: payload.profileId,
        revision: payload.revision
      };
    }
    default:
      throw new InternalError(`validate: unknown kind ${kind}`);
  }
}
var MAX_PRESET_DEPTH = 32;
function hasCompletePersona(node, depth = 0) {
  if (depth > MAX_PRESET_DEPTH) return false;
  if (Array.isArray(node)) return node.some((child) => hasCompletePersona(child, depth + 1));
  if (node === null || typeof node !== "object") return false;
  if (node.name === PERSONA_PLUGIN_NAME && node.config?.complete === true) return true;
  return Object.values(node).some((child) => hasCompletePersona(child, depth + 1));
}
async function modeViews(agentPresets, warn) {
  if (agentPresets == null) return [];
  let presets = [];
  try {
    presets = await agentPresets.list();
  } catch (error) {
    warn?.("prompt-profiles: agentPresets.list failed; modes empty", { error: error?.message ?? String(error) });
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
      warn?.("prompt-profiles: preset document unreadable; complete stays false", {
        preset: preset.id,
        error: error?.message ?? String(error)
      });
    }
    modes.push({ id: preset.id, title: preset.name ?? preset.id, complete });
  }
  return modes;
}
async function stateResponse(deps, patchIdOf) {
  const { registry, orders, warn } = deps;
  const revision = deps.settings()?.revision() ?? null;
  return {
    profiles: registry.profiles().map((profile) => ({ ...profile, patchId: patchIdOf(profile.rowId) })),
    sections: registry.sections().map((section) => ({
      ...section,
      patchId: patchIdOf(section.rowId),
      usedIn: registry.usedIn(section.id),
      emits: typeof section.body === "string" && section.body.trim() !== ""
    })),
    builtinOrders: orders.orders(),
    modes: await modeViews(deps.presets(), warn),
    default: registry.defaultId(),
    lastByWorkspace: registry.lastByWorkspace(),
    revision
  };
}
function previewResponse(deps, profileId, { cwd } = {}) {
  const { registry, orders } = deps;
  const profile = findRow(registry.profiles(), profileId);
  if (!profile) throw new NotFoundError(`profile "${profileId}" is not registered`);
  const sectionsById = new Map(registry.sections().map((row) => [row.id, row]));
  const builtinOrdersByName = orders.ordersByName();
  const sessionCwd = typeof cwd === "string" && cwd !== "" ? cwd : process.cwd();
  const usedVariables = /* @__PURE__ */ new Set();
  const interpolate = (text) => String(text).replace(/\{\{([^{}]*)\}\}/g, (match, name) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) return match;
    usedVariables.add(name);
    return name === "cwd" ? sessionCwd : match;
  });
  const planned = sortByOrder(profile.sections);
  const ours = [];
  const skipped = [];
  for (const ref of planned) {
    const section = sectionsById.get(ref.id);
    const reason = sectionSkipReason(ref, section, { subagent: false, fork: false });
    if (reason !== null) {
      skipped.push({ id: ref.id, title: section?.title ?? ref.id, reason });
      continue;
    }
    let text = "";
    try {
      text = interpolate(section.body);
    } catch (error) {
      skipped.push({ id: ref.id, title: section.title, reason: interpolationSkipReason(error) });
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
  const variables = Object.fromEntries(
    [...usedVariables].sort().map((name) => [name, name === "cwd" ? sessionCwd : null])
  );
  return { profileId, title: profile.title, sections: merged, skipped, variables };
}
function mapDuplicate(error) {
  if (/already exists/.test(error?.message ?? "")) throw new InvalidInputError(error.message);
  throw error;
}
async function deleteRow(deps, patchId, name) {
  const patch = deps.patch();
  if (!patch) throw new UnavailableError("profile storage service is unavailable");
  const ownership = patch.ownership(patchId);
  if (ownership.source === "user") {
    const removed = await patch.remove(patchId);
    if (!removed) throw new NotFoundError(`row "${patchId}" not found in the profile patch`);
    return { disabled: false };
  }
  await patch.disable(patchId, name);
  return { disabled: true };
}
async function renameSection(deps, { rowId: received, id: newId }) {
  const { registry, resolve } = deps;
  const patch = deps.patch();
  if (!patch) throw new UnavailableError("profile storage service is unavailable");
  const { row: section, patchId } = resolve("section", received);
  const oldRowId = patchId;
  const aliases = rowAliases(section);
  const affectedProfiles = registry.profiles().filter((profile) => profile.sections.some((ref) => refNamesRow(ref.id, aliases))).map((profile) => ({ profileId: profile.id, title: profile.title }));
  if (refNamesRow(newId, aliases)) throw new InvalidInputError(`section id "${newId}" is already taken`);
  const clash = registry.sections().some(
    (row) => row.rowId !== section.rowId && (row.id === newId || row.rowId === newId || toPatchId(row.rowId) === newId)
  );
  if (clash) throw new InvalidInputError(`section id "${newId}" is already taken`);
  const bundleOwned = !patch.ownership(oldRowId).inserted;
  try {
    await patch.renameSection({
      row: { id: newId, name: SECTION_PLUGIN_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId,
      oldName: SECTION_PLUGIN_NAME,
      bundleOwned
    });
  } catch (error) {
    mapDuplicate(error);
  }
  return { rowId: newId, patchId: newId, id: newId, affectedProfiles };
}
function createOperations(deps) {
  const { registry } = deps;
  const SECTION_PREFIX = "prompt-section-";
  const requireSettings = () => {
    const store = deps.settings();
    if (!store) throw new UnavailableError("profile storage service is unavailable");
    return store;
  };
  const requireStorage = () => {
    const store = deps.settings();
    const patch = deps.patch();
    if (!store || !patch) throw new UnavailableError("profile storage service is unavailable");
    return { settings: store, patch };
  };
  const patchPath = () => deps.patch()?.path();
  const sectionTargets = () => sectionRefTargets(registry.sections());
  const pendingSectionIds = () => {
    try {
      if (patchPath() === void 0) return /* @__PURE__ */ new Set();
      return new Set(
        (deps.patch()?.rows() ?? []).filter(
          (row) => typeof row.id === "string" && row.id.startsWith(SECTION_PREFIX) && row.name === SECTION_PLUGIN_NAME && row.hasConfig && !row.disabled
        ).map((row) => row.id)
      );
    } catch {
      return /* @__PURE__ */ new Set();
    }
  };
  const profileSelectable = (profileId) => {
    const entry = registry.profiles().find((row2) => row2.id === profileId);
    if (!entry) return false;
    let rows = [];
    try {
      const patch = deps.patch();
      if (!patch || patch.path() === void 0) return true;
      rows = patch.rows();
    } catch {
      return true;
    }
    const row = rows.find((candidate) => candidate.id === entry.rowId || candidate.configId === profileId);
    if (row) return row.name === PROFILE_PLUGIN_NAME && !row.disabled;
    return entry.source !== "user";
  };
  const registeredConfigIds = (kind) => configIds(kind === "section" ? registry.sections() : registry.profiles());
  const patchIdOf = (rowIdValue) => deps.patch()?.patchIdOf(rowIdValue) ?? toPatchId(rowIdValue);
  const resolveRow = (kind, received) => {
    const rows = kind === "section" ? registry.sections() : registry.profiles();
    const row = findRow(rows, received);
    if (!row) throw new NotFoundError(`${kind} row "${received}" is not registered`);
    return { row, patchId: patchIdOf(row.rowId) };
  };
  deps.resolve = resolveRow;
  const mapSettingsError = (error, revision) => {
    if (error?.code === "SETTINGS_CONFLICT")
      throw new ConflictError(`configuration changed since read (expected revision ${revision})`);
    const message = errorMessage(error);
    if (/is not volatile/.test(message)) throw new InvalidInputError(message);
    if (/No configurable plugin entry/.test(message)) throw new NotFoundError(message);
    throw error;
  };
  const settingsWrite = async (method, ns, value, revision) => {
    try {
      const store = requireSettings();
      await deps.lock.run(
        () => method === "replace" ? store.replace(ns, value, typeof revision === "number" ? revision : void 0) : store.mutate(ns, value, typeof revision === "number" ? revision : void 0)
      );
    } catch (error) {
      mapSettingsError(error, revision);
    }
  };
  const MAX_MUTATE_ATTEMPTS = 5;
  const currentRevision = () => {
    try {
      return deps.settings()?.revision();
    } catch {
      return void 0;
    }
  };
  const mutateWithRetry = async (buildOps, { clientRevision } = {}) => deps.lock.run(async () => {
    for (let attempt = 1; ; attempt += 1) {
      const expected = currentRevision();
      if (attempt === 1 && typeof clientRevision === "number" && typeof expected === "number" && clientRevision !== expected) {
        throw new ConflictError(`configuration changed since read (expected revision ${clientRevision})`);
      }
      const ops2 = buildOps({ revisionAvailable: typeof expected === "number" });
      if (ops2.length === 0) return false;
      try {
        await deps.settings().mutate("prompt-profiles", ops2, typeof expected === "number" ? expected : void 0);
        return true;
      } catch (error) {
        if (error?.code !== "SETTINGS_CONFLICT") mapSettingsError(error, expected);
        if (attempt >= MAX_MUTATE_ATTEMPTS) {
          throw new ConflictError(`configuration kept changing; gave up after ${MAX_MUTATE_ATTEMPTS} attempts`);
        }
      }
    }
  });
  const clearProfileReferences = async (profile) => {
    const aliases = rowAliases(profile);
    return mutateWithRetry(() => {
      const ops2 = [];
      for (const [key, value] of Object.entries(registry.lastByWorkspace() ?? {})) {
        if (aliases.has(value)) ops2.push({ op: "unset", path: ["lastByWorkspace", key] });
      }
      if (aliases.has(registry.defaultId())) ops2.push({ op: "set", path: ["default"], value: "" });
      return ops2;
    });
  };
  const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const staleWorkspaceKeys = (value) => {
    const profileIds = new Set(registry.profiles().map((row) => row.id));
    const workspaces = deps.workspaces();
    const stale = [];
    for (const [key, entry] of Object.entries(value ?? {})) {
      if (entry !== "" && !profileIds.has(entry)) {
        stale.push(key);
        continue;
      }
      if (WORKSPACE_ID.test(key) && workspaces.knows(key) === false) stale.push(key);
    }
    return stale;
  };
  const idsInUse = (kind) => {
    const rows = kind === "section" ? registry.sections() : registry.profiles();
    let fromPatch = [];
    try {
      const patch = deps.patch();
      if (patch && patch.path() !== void 0) fromPatch = [...patch.rowIds()];
    } catch {
    }
    return takenIds(rows, fromPatch);
  };
  const ops = {
    /** Read the full editor state (degrades per optional service). */
    state: () => stateResponse(deps, patchIdOf),
    /** Illustrative preview of `profileId`, optionally against a session cwd. */
    preview: (input) => {
      const profileId = input?.profileId;
      if (typeof profileId !== "string" || profileId === "") {
        throw new InvalidInputError('preview: query parameter "profileId" is required');
      }
      return previewResponse(deps, profileId, { cwd: input?.cwd });
    },
    /** Create a section row (SPEC §7: empty body allowed). */
    sectionCreate: (body) => {
      requireStorage();
      const payload = validate("section/create", body, { sectionTargets: sectionTargets() });
      if (payload.id !== null && registeredConfigIds("section").has(payload.id)) {
        throw new InvalidInputError(`section id "${payload.id}" already exists`);
      }
      const id = payload.id ?? newRowId("section", idsInUse("section"));
      const row = { id, name: SECTION_PLUGIN_NAME, config: { id, title: payload.title, body: payload.body } };
      return requireStorage().patch.insert(row).catch(mapDuplicate).then(() => ({
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
      await settingsWrite(
        "replace",
        patchId,
        { title: payload.value.title, body: payload.value.body },
        payload.revision
      );
      return { rowId: row.rowId, patchId, emits: payload.value.body.trim() !== "" };
    },
    /** Delete (or disable) a section row. */
    sectionDelete: async (body) => {
      requireStorage();
      const payload = validate("section/delete", body);
      const { patchId } = resolveRow("section", payload.rowId);
      return deleteRow(deps, patchId, SECTION_PLUGIN_NAME);
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
      const payload = validate("profile/create", body, {
        sectionTargets: sectionTargets(),
        pendingSectionIds: pendingSectionIds()
      });
      if (payload.id !== null && registeredConfigIds("profile").has(payload.id)) {
        throw new InvalidInputError(`profile id "${payload.id}" already exists`);
      }
      const id = payload.id ?? newRowId("profile", idsInUse("profile"));
      const row = { id, name: PROFILE_PLUGIN_NAME, config: { id, title: payload.title, sections: payload.sections } };
      return requireStorage().patch.insert(row).catch(mapDuplicate).then(() => ({
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
      const payload = validate("profile/update", body, {
        sectionTargets: sectionTargets(),
        pendingSectionIds: pendingSectionIds()
      });
      const { row, patchId } = resolveRow("profile", payload.rowId);
      await settingsWrite(
        "replace",
        patchId,
        { title: payload.value.title, sections: payload.value.sections },
        payload.revision
      );
      return { rowId: row.rowId, patchId };
    },
    /** Delete a profile row and best-effort-clear its default/last references. */
    profileDelete: async (body) => {
      requireStorage();
      const payload = validate("profile/delete", body);
      const { row, patchId } = resolveRow("profile", payload.rowId);
      const result = await deleteRow(deps, patchId, PROFILE_PLUGIN_NAME);
      try {
        await clearProfileReferences(row);
      } catch (error) {
        try {
          deps.log?.warn?.(
            "prompt-profiles: profile deleted but its default/lastByWorkspace references were not cleared",
            {
              profileId: row.id,
              error: errorMessage(error)
            }
          );
        } catch {
        }
      }
      return result;
    },
    /**
     * Set (`""`/null = clear) the default profile. Input contract:
     * `{default: profileId | "" | null, revision?}`.
     */
    defaultSet: async (body) => {
      requireSettings();
      const payload = validate("default", body);
      await mutateWithRetry(
        () => {
          if (payload.default !== "" && !profileSelectable(payload.default)) {
            throw new NotFoundError(`profile "${payload.default}" is not registered`);
          }
          return [{ op: "set", path: ["default"], value: payload.default }];
        },
        { clientRevision: body.revision }
      );
    },
    /** Record the workspace's last chosen profile (SPEC §2 #11). */
    last: async (body) => {
      requireSettings();
      const payload = validate("last", body);
      const workspaceKeys = await deps.workspaces().keys({
        workspaceId: payload.workspaceId,
        cwd: payload.cwd
      });
      const workspaceKey = workspaceKeys[0] ?? "";
      await mutateWithRetry(
        ({ revisionAvailable }) => {
          if (payload.profileId !== "" && !profileSelectable(payload.profileId)) {
            throw new NotFoundError(`profile "${payload.profileId}" is not registered`);
          }
          const ops2 = revisionAvailable ? staleWorkspaceKeys(registry.lastByWorkspace()).map((key) => ({
            op: "unset",
            path: ["lastByWorkspace", key]
          })) : [];
          ops2.push({ op: "set", path: ["lastByWorkspace", workspaceKey], value: payload.profileId });
          return ops2;
        },
        { clientRevision: payload.revision }
      );
    }
  };
  return { ops };
}

export {
  createOperations
};
//# sourceMappingURL=chunk-H5XK4436.js.map
