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
} from "./chunk-YSHAZUQR.js";
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
  PERSONA_PLUGIN_NAME,
  PROFILE_PLUGIN_NAME,
  SECTION_ID_PREFIX,
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
  ConflictError,
  InvalidInputError,
  NotFoundError,
  SKIP_REASONS,
  UnavailableError,
  errorMessage,
  interpolationSkipReason,
  planInsertion,
  sectionSkipReason,
  sortByOrder
} from "./chunk-M5XL7FMX.js";
import {
  __toESM
} from "./chunk-EU2VRU6C.js";

// src/host/application/env.ts
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
function createUseCaseEnv(ports) {
  const { registry } = ports;
  const patchPath = () => ports.patch()?.path();
  const patchIdOf = (rowId) => ports.patch()?.patchIdOf(rowId) ?? toPatchId(rowId);
  const sectionTargets = () => sectionRefTargets(registry.sections());
  const pendingSectionIds = () => {
    try {
      if (patchPath() === void 0) return /* @__PURE__ */ new Set();
      return new Set(
        (ports.patch()?.rows() ?? []).filter(
          (row) => typeof row.id === "string" && row.id.startsWith(SECTION_ID_PREFIX) && row.name === SECTION_PLUGIN_NAME && row.hasConfig && !row.disabled
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
      const patch = ports.patch();
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
  const resolveSection = (received) => {
    const row = findRow(registry.sections(), received);
    if (!row) throw new NotFoundError(`section row "${received}" is not registered`);
    return { row, patchId: patchIdOf(row.rowId) };
  };
  const resolveProfile = (received) => {
    const row = findRow(registry.profiles(), received);
    if (!row) throw new NotFoundError(`profile row "${received}" is not registered`);
    return { row, patchId: patchIdOf(row.rowId) };
  };
  const requireSettings = () => {
    const store = ports.settings();
    if (!store) throw new UnavailableError("profile storage service is unavailable");
    return store;
  };
  const requireStorage = () => {
    const store = ports.settings();
    const patch = ports.patch();
    if (!store || !patch) throw new UnavailableError("profile storage service is unavailable");
    return { settings: store, patch };
  };
  const mapSettingsError = (error, revision) => {
    if (error?.code === "SETTINGS_CONFLICT") {
      throw new ConflictError(`configuration changed since read (expected revision ${revision})`);
    }
    const message = errorMessage(error);
    if (/is not volatile/.test(message)) throw new InvalidInputError(message);
    if (/No configurable plugin entry/.test(message)) throw new NotFoundError(message);
    throw error;
  };
  const settingsWrite = async (namespace, value, revision) => {
    try {
      const store = requireSettings();
      await ports.lock.run(() => store.replace(namespace, value, typeof revision === "number" ? revision : void 0));
    } catch (error) {
      mapSettingsError(error, revision);
    }
  };
  const MAX_MUTATE_ATTEMPTS = 5;
  const currentRevision = () => {
    try {
      return ports.settings()?.revision();
    } catch {
      return void 0;
    }
  };
  const mutateWithRetry = async (buildOps, { clientRevision } = {}) => ports.lock.run(async () => {
    for (let attempt = 1; ; attempt += 1) {
      const expected = currentRevision();
      if (attempt === 1 && typeof clientRevision === "number" && typeof expected === "number" && clientRevision !== expected) {
        throw new ConflictError(`configuration changed since read (expected revision ${clientRevision})`);
      }
      const ops = buildOps({ revisionAvailable: typeof expected === "number" });
      if (ops.length === 0) return false;
      try {
        await requireSettings().mutate("prompt-profiles", ops, typeof expected === "number" ? expected : void 0);
        return true;
      } catch (error) {
        if (error?.code !== "SETTINGS_CONFLICT") mapSettingsError(error, expected);
        if (attempt >= MAX_MUTATE_ATTEMPTS) {
          throw new ConflictError(`configuration kept changing; gave up after ${MAX_MUTATE_ATTEMPTS} attempts`);
        }
      }
    }
  });
  const idsInUse = (kind) => {
    const rows = kind === "section" ? registry.sections() : registry.profiles();
    let fromPatch = [];
    try {
      const patch = ports.patch();
      if (patch && patch.path() !== void 0) fromPatch = [...patch.rowIds()];
    } catch {
    }
    return takenIds(rows, fromPatch);
  };
  const deleteRow = async (patchId, name) => {
    const patch = ports.patch();
    if (!patch) throw new UnavailableError("profile storage service is unavailable");
    const ownership = patch.ownership(patchId);
    if (ownership.source === "user") {
      const removed = await patch.remove(patchId);
      if (!removed) throw new NotFoundError(`row "${patchId}" not found in the profile patch`);
      return { disabled: false };
    }
    await patch.disable(patchId, name);
    return { disabled: true };
  };
  const mapDuplicate = (error) => {
    const message = error?.message;
    if (/already exists/.test(message ?? "")) throw new InvalidInputError(message ?? "");
    throw error;
  };
  return {
    ports,
    registry,
    patchIdOf,
    sectionTargets,
    pendingSectionIds,
    idsInUse,
    registeredConfigIds,
    resolveSection,
    resolveProfile,
    profileSelectable,
    requireSettings,
    requireStorage,
    settingsWrite,
    mutateWithRetry,
    deleteRow,
    mapDuplicate
  };
}

// src/host/application/preview.ts
function previewResponse(env, profileId, { cwd } = {}) {
  const { registry, orders } = env.ports;
  const profile = findRow(registry.profiles(), profileId);
  if (!profile) throw new NotFoundError(`profile "${profileId}" is not registered`);
  const sectionsById = new Map(registry.sections().map((row) => [row.id, row]));
  const builtinOrdersByName = orders.ordersByName();
  const sessionCwd = typeof cwd === "string" && cwd !== "" ? cwd : process.cwd();
  const usedVariables = /* @__PURE__ */ new Set();
  const interpolate = (text) => text.replace(/\{\{([^{}]*)\}\}/g, (match, name) => {
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
    if (reason !== null || section === void 0) {
      skipped.push({ id: ref.id, title: section?.title ?? ref.id, reason: reason ?? SKIP_REASONS.sectionNotFound });
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
    snapshot: { sections: ours.map((row) => ({ id: row.id, title: row.title, order: row.order, text: row.text })) },
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
function createPreviewCases(env) {
  return {
    /** Illustrative preview of `profileId`, optionally against a session cwd. */
    preview: (input) => {
      const profileId = input?.profileId;
      if (typeof profileId !== "string" || profileId === "") {
        throw new InvalidInputError('preview: query parameter "profileId" is required');
      }
      return previewResponse(env, profileId, { cwd: input?.cwd });
    }
  };
}

// src/host/application/profiles.ts
function sectionRefs(env, label, refs) {
  const targets = env.sectionTargets();
  const pending = env.pendingSectionIds();
  return refs.map((ref, index) => {
    const id = resolveSectionRefId(ref.id, { targets, pending });
    if (id === null) {
      throw new InvalidInputError(`${label}: sections[${index}].id "${ref.id}" is not a registered section`);
    }
    return { id, order: ref.order, ...ref.scope != null ? { scope: ref.scope } : {} };
  });
}
var WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function staleWorkspaceKeys(env, value) {
  const profileIds = new Set(env.registry.profiles().map((row) => row.id));
  const workspaces = env.ports.workspaces();
  const stale = [];
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (entry !== "" && !profileIds.has(entry)) {
      stale.push(key);
      continue;
    }
    if (WORKSPACE_ID.test(key) && workspaces.knows(key) === false) stale.push(key);
  }
  return stale;
}
function createProfileCases(env) {
  const clearProfileReferences = async (profile) => {
    const aliases = rowAliases(profile);
    return env.mutateWithRetry(() => {
      const ops = [];
      for (const [key, value] of Object.entries(env.registry.lastByWorkspace() ?? {})) {
        if (aliases.has(value)) ops.push({ op: "unset", path: ["lastByWorkspace", key] });
      }
      if (aliases.has(env.registry.defaultId())) ops.push({ op: "set", path: ["default"], value: "" });
      return ops;
    });
  };
  return {
    /** Create a profile row. */
    profileCreate: async (body) => {
      const { patch } = env.requireStorage();
      const payload = parsePayload(profileCreatePayload, body, "profile/create");
      const id = explicitRowId("profile/create", "profile", payload.id);
      const title = titleOrDefault(payload.title, "Profile");
      const sections = payload.sections === void 0 ? [] : sectionRefs(env, "profile/create", payload.sections);
      if (id !== null && env.registeredConfigIds("profile").has(id)) {
        throw new InvalidInputError(`profile id "${id}" already exists`);
      }
      const rowId = id ?? newRowId("profile", env.idsInUse("profile"));
      const row = { id: rowId, name: PROFILE_PLUGIN_NAME, config: { id: rowId, title, sections } };
      try {
        await patch.insert(row);
      } catch (error) {
        env.mapDuplicate(error);
      }
      return { rowId: row.id, patchId: row.id, configId: row.id, title, sections };
    },
    /** Whole-object update of a profile's volatile fields. */
    profileUpdate: async (body) => {
      env.requireStorage();
      const payload = parsePayload(profileUpdatePayload, body, "profile/update");
      const value = {
        title: payload.value.title,
        sections: payload.value.sections === void 0 ? [] : sectionRefs(env, "profile/update", payload.value.sections)
      };
      const { row, patchId } = env.resolveProfile(payload.rowId);
      await env.settingsWrite(patchId, value, payload.revision);
      return { rowId: row.rowId, patchId };
    },
    /** Delete a profile row and best-effort-clear its default/last references. */
    profileDelete: async (body) => {
      env.requireStorage();
      const payload = parsePayload(profileDeletePayload, body, "profile/delete");
      const { row, patchId } = env.resolveProfile(payload.rowId);
      const result = await env.deleteRow(patchId, PROFILE_PLUGIN_NAME);
      try {
        await clearProfileReferences(row);
      } catch (error) {
        try {
          env.ports.log?.warn?.(
            "prompt-profiles: profile deleted but its default/lastByWorkspace references were not cleared",
            { profileId: row.id, error: errorMessage(error) }
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
      env.requireSettings();
      const payload = parsePayload(defaultPayload, body, "default");
      const defaultId = payload.default ?? "";
      await env.mutateWithRetry(
        () => {
          if (defaultId !== "" && !env.profileSelectable(defaultId)) {
            throw new NotFoundError(`profile "${defaultId}" is not registered`);
          }
          return [{ op: "set", path: ["default"], value: defaultId }];
        },
        { clientRevision: body?.revision }
      );
    },
    /** Record the workspace's last chosen profile (SPEC §2 #11). */
    last: async (body) => {
      env.requireSettings();
      const payload = parsePayload(lastPayload, body, "last");
      const workspaceKeys = await env.ports.workspaces().keys({
        workspaceId: payload.workspaceId,
        cwd: payload.cwd
      });
      const workspaceKey = workspaceKeys[0] ?? "";
      await env.mutateWithRetry(
        ({ revisionAvailable }) => {
          if (payload.profileId !== "" && !env.profileSelectable(payload.profileId)) {
            throw new NotFoundError(`profile "${payload.profileId}" is not registered`);
          }
          const ops = revisionAvailable ? staleWorkspaceKeys(env, env.registry.lastByWorkspace()).map((key) => ({
            op: "unset",
            path: ["lastByWorkspace", key]
          })) : [];
          ops.push({ op: "set", path: ["lastByWorkspace", workspaceKey], value: payload.profileId });
          return ops;
        },
        { clientRevision: payload.revision }
      );
    }
  };
}

// src/host/application/sections.ts
async function renameSection(env, { rowId: received, id: newId }) {
  const patch = env.ports.patch();
  if (!patch) throw new UnavailableError("profile storage service is unavailable");
  const { row: section, patchId } = env.resolveSection(received);
  const oldRowId = patchId;
  const aliases = rowAliases(section);
  const affectedProfiles = env.registry.profiles().filter((profile) => profile.sections.some((ref) => refNamesRow(ref.id, aliases))).map((profile) => ({ profileId: profile.id, title: profile.title }));
  if (refNamesRow(newId, aliases)) throw new InvalidInputError(`section id "${newId}" is already taken`);
  const clash = env.registry.sections().some(
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
    env.mapDuplicate(error);
  }
  return { rowId: newId, patchId: newId, id: newId, affectedProfiles };
}
function createSectionCases(env) {
  return {
    /** Create a section row (SPEC §7: empty body allowed). */
    sectionCreate: async (body) => {
      const { patch } = env.requireStorage();
      const payload = parsePayload(sectionCreatePayload, body, "section/create");
      const id = explicitRowId("section/create", "section", payload.id);
      if (id !== null && env.registeredConfigIds("section").has(id)) {
        throw new InvalidInputError(`section id "${id}" already exists`);
      }
      const title = titleOrDefault(payload.title, "Section");
      const sectionBody = payload.body ?? "";
      const rowId = id ?? newRowId("section", env.idsInUse("section"));
      const row = { id: rowId, name: SECTION_PLUGIN_NAME, config: { id: rowId, title, body: sectionBody } };
      try {
        await patch.insert(row);
      } catch (error) {
        env.mapDuplicate(error);
      }
      return {
        rowId: row.id,
        patchId: row.id,
        configId: row.id,
        title,
        body: sectionBody,
        emits: sectionBody.trim() !== ""
      };
    },
    /** Whole-object update of a section's volatile fields. */
    sectionUpdate: async (body) => {
      env.requireStorage();
      const payload = parsePayload(sectionUpdatePayload, body, "section/update");
      const { row, patchId } = env.resolveSection(payload.rowId);
      await env.settingsWrite(patchId, { title: payload.value.title, body: payload.value.body }, payload.revision);
      return { rowId: row.rowId, patchId, emits: payload.value.body.trim() !== "" };
    },
    /** Delete (or disable) a section row. */
    sectionDelete: async (body) => {
      env.requireStorage();
      const payload = parsePayload(sectionDeletePayload, body, "section/delete");
      const { patchId } = env.resolveSection(payload.rowId);
      return env.deleteRow(patchId, SECTION_PLUGIN_NAME);
    },
    /** Rename a section row; profiles are never rewritten. */
    sectionRename: (body) => {
      env.requireStorage();
      const payload = parsePayload(sectionRenamePayload, body, "section/rename");
      const id = explicitRowId("section/rename", "section", payload.id);
      if (id === null) throw new InvalidInputError('section/rename: field "id" is required');
      return renameSection(env, { rowId: payload.rowId, id });
    }
  };
}

// src/host/application/state.ts
var import_yaml = __toESM(require_dist(), 1);
var yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
var MAX_PRESET_DEPTH = 32;
function hasCompletePersona(node, depth = 0) {
  if (depth > MAX_PRESET_DEPTH) return false;
  if (Array.isArray(node)) return node.some((child) => hasCompletePersona(child, depth + 1));
  if (node === null || typeof node !== "object") return false;
  const row = node;
  if (row.name === PERSONA_PLUGIN_NAME && row.config?.complete === true) return true;
  return Object.values(node).some((child) => hasCompletePersona(child, depth + 1));
}
async function modeViews(agentPresets, warn) {
  if (agentPresets == null) return [];
  let presets = [];
  try {
    presets = await agentPresets.list();
  } catch (error) {
    warn?.("prompt-profiles: agentPresets.list failed; modes empty", { error: errorMessageOf(error) });
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
        error: errorMessageOf(error)
      });
    }
    modes.push({ id: preset.id, title: preset.name ?? preset.id, complete });
  }
  return modes;
}
function errorMessageOf(error) {
  return error?.message ?? String(error);
}
function createStateCases(env) {
  return {
    /** Read the full editor state (degrades per optional service). */
    state: async (_input) => {
      const { registry, orders } = env.ports;
      const revision = env.ports.settings()?.revision() ?? null;
      return {
        profiles: registry.profiles().map((profile) => ({ ...profile, patchId: env.patchIdOf(profile.rowId) })),
        sections: registry.sections().map((section) => ({
          ...section,
          patchId: env.patchIdOf(section.rowId),
          usedIn: registry.usedIn(section.id),
          emits: typeof section.body === "string" && section.body.trim() !== ""
        })),
        builtinOrders: orders.orders(),
        modes: await modeViews(env.ports.presets(), env.ports.warn),
        default: registry.defaultId(),
        lastByWorkspace: registry.lastByWorkspace(),
        revision
      };
    }
  };
}

// src/host/application/index.ts
function createOperations(ports) {
  const env = createUseCaseEnv(ports);
  const ops = {
    ...createStateCases(env),
    ...createPreviewCases(env),
    ...createSectionCases(env),
    ...createProfileCases(env)
  };
  return { ops };
}

export {
  createOperations
};
//# sourceMappingURL=chunk-FT6YPXU6.js.map
