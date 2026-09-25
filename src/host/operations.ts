// @ts-nocheck
// TODO(refactor B2): remove after typing, when this module moves to src/host/application/
/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the operation logic — validation, registry lookups, writer and
 *   settings mutations — so every surface built on this bundle executes ONE
 *   implementation and cannot drift apart.
 * @scope
 *  - The eleven operations (state, preview, section create/update/delete/
 *    rename, profile create/update/delete, default, last).
 *  - Writes to EXISTING rows replace the WHOLE volatile config via
 *    ctx.settings.replace(ns, value, revision); creation/removal/disable go
 *    through the writer; rename is the documented batch that touches the
 *    SECTION ONLY and returns `affectedProfiles` for the user to fix by hand.
 *  - NOT: pure rules. Ids, reference matching, ordering, skip reasons and the
 *    payload schemas live in src/host/domain/ and are only APPLIED here.
 * @invariants
 *  - Every payload is validated BEFORE any write happens: a violation throws
 *    InvalidInputError and leaves the patch file byte-identical.
 *  - A section body may be empty/whitespace (SPEC §7); state marks it
 *    `emits: false`.
 *  - FROZEN ID SCHEME: a created row's `config.id` IS its full row id
 *    (`prompt-<kind>-<token>`) and the returned `configId`; existing rows with
 *    old bare config ids are never rewritten.
 *  - `last` stores the choice under the SAME key the assembler reads
 *    (resolveWorkspaceKeys), so a chip choice always reaches the prompt;
 *    `profileId: ""` still means an explicit "none" and an unknown profile id
 *    is a NotFoundError.
 *  - EVERY mutating path runs inside the bundle's one in-process serializer
 *    (withWriteLock), preventing same-process lost updates.
 *  - Results are plain JSON-safe objects (no class instances, no functions):
 *    surfaces serialize them verbatim.
 * @dependencies USES API: ctx.settings.replace/mutate/describe,
 *   ctx.configEditor.documentPath/entries and ctx.promptProfiles views — all
 *   OPTIONAL, read lazily through the caller-provided getService reader.
 * @keywords operations, validation, CRUD, settings.replace, withWriteLock, ids
 * #endregion moduleContract
 */

import { parse } from "yaml";
import {
  ConflictError,
  configIds,
  defaultPayload,
  errorMessage,
  findRow,
  InternalError,
  InvalidInputError,
  idPrefix,
  interpolationSkipReason,
  lastPayload,
  NotFoundError,
  newRowId,
  normalizeExplicitRowId,
  PERSONA_PLUGIN_NAME,
  PROFILE_PLUGIN_NAME,
  parsePayload,
  planInsertion,
  profileCreatePayload,
  profileDeletePayload,
  profileUpdatePayload,
  refNamesRow,
  resolveSectionRefId,
  rowAliases,
  SECTION_PLUGIN_NAME,
  sectionCreatePayload,
  sectionDeletePayload,
  sectionRefTargets,
  sectionRenamePayload,
  sectionSkipReason,
  sectionUpdatePayload,
  sortByOrder,
  takenIds as takenRowIds,
  toPatchId,
  UnavailableError,
} from "./domain/index.ts";
import { resolveWorkspaceKeys } from "./resolve.ts";
import {
  disableRow,
  insertRow,
  listRowIds,
  provenance,
  readPatchRows,
  removeRow,
  renameSectionRow,
  withWriteLock,
} from "./writer.ts";

/** The create-token source the tests drive to force id collisions. */
export { tokenSource } from "./domain/ids.ts";

// #region CONST_yamlDialect
/** `!!js` customTag shared with the loader dialect (SPEC §3). */
const yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
// #endregion CONST_yamlDialect

// #region FUNC_titleOrDefault
/** Title with a DEFAULT allowed (frozen contract): missing or blank uses the fallback. */
function titleOrDefault(value, fallback) {
  return value === undefined || value.trim() === "" ? fallback : value;
}
// #endregion FUNC_titleOrDefault

// #region FUNC_explicitRowId
/**
 * Normalize an EXPLICIT create/rename id to the full `prompt-<kind>-<token>`
 * form, or null when the payload named no id (the server mints one). A
 * malformed id is rejected here, before anything is written.
 */
function explicitRowId(label, kind, value) {
  if (value === undefined) return null;
  const full = normalizeExplicitRowId(kind, value);
  if (full === null) {
    const prefix = idPrefix(kind);
    throw new InvalidInputError(
      `${label}: field "id" must be a bare token, ${prefix}<token>, or include:${prefix}<token>`,
    );
  }
  return full;
}
// #endregion FUNC_explicitRowId

// #region FUNC_sectionRefs
/**
 * Resolve every `sections[].id` to the id that must be STORED in the profile —
 * the registered config.id (see resolveSectionRefId). A typo or a foreign id
 * is rejected on CREATE and UPDATE alike.
 */
function sectionRefs(label, refs, deps) {
  const targets = deps.sectionTargets ?? new Map();
  return refs.map((ref, index) => {
    const id = resolveSectionRefId(ref.id, { targets, pending: deps.pendingSectionIds });
    if (id === null) {
      throw new InvalidInputError(`${label}: sections[${index}].id "${ref.id}" is not a registered section`);
    }
    return { id, order: ref.order, ...(ref.scope != null ? { scope: ref.scope } : {}) };
  });
}
// #endregion FUNC_sectionRefs

// #region FUNC_validate
/**
 * @purpose Reject malformed payloads before anything is written. Every branch
 *   parses the SHARED business schema (src/host/domain/validation.ts, so the
 *   wire codecs and these rules cannot drift) and then applies the cross-field
 *   rules that need registry state — reference targets and pending ids.
 *   Updates carry a WHOLE object `value`; there are no path ops.
 */
function validate(kind, body, deps = {}) {
  switch (kind) {
    case "section/create": {
      // Empty/whitespace body is allowed (SPEC §7): the section simply does not
      // emit. An explicit id is accepted and stored in the FULL prefixed form.
      const payload = parsePayload(sectionCreatePayload, body, kind);
      return {
        id: explicitRowId(kind, "section", payload.id),
        title: titleOrDefault(payload.title, "Section"),
        body: payload.body ?? "",
      };
    }
    case "profile/create": {
      const payload = parsePayload(profileCreatePayload, body, kind);
      return {
        id: explicitRowId(kind, "profile", payload.id),
        title: titleOrDefault(payload.title, "Profile"),
        sections: payload.sections === undefined ? [] : sectionRefs(kind, payload.sections, deps),
      };
    }
    case "section/update": {
      const payload = parsePayload(sectionUpdatePayload, body, kind);
      return {
        rowId: payload.rowId,
        value: { title: payload.value.title, body: payload.value.body },
        revision: payload.revision,
      };
    }
    case "profile/update": {
      const payload = parsePayload(profileUpdatePayload, body, kind);
      return {
        rowId: payload.rowId,
        value: {
          title: payload.value.title,
          sections: payload.value.sections === undefined ? [] : sectionRefs(kind, payload.value.sections, deps),
        },
        revision: payload.revision,
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
      // revision is used for the orphan-reference cleanup settings write.
      return parsePayload(profileDeletePayload, body, kind);
    case "default": {
      // Only a profile-id string, '' (none), or null (clear) — a missing field
      // is rejected, never silently coerced.
      const payload = parsePayload(defaultPayload, body, kind);
      return { default: payload.default ?? "" };
    }
    case "last": {
      // Contract with the client chip: {workspaceId?, cwd?, profileId}, at
      // least one workspace key present. `cwd` is the fallback key so a blank
      // session with no workspace id yet still reaches the prompt (the
      // assembler falls back to cwd too).
      const payload = parsePayload(lastPayload, body, kind);
      return {
        workspaceId: payload.workspaceId ?? "",
        cwd: payload.cwd ?? "",
        profileId: payload.profileId,
        revision: payload.revision,
      };
    }
    default:
      throw new InternalError(`validate: unknown kind ${kind}`);
  }
}
// #endregion FUNC_validate

// #region FUNC_modeViews
/** Defensive traversal cap; a parsed YAML document is acyclic. */
const MAX_PRESET_DEPTH = 32;
/**
 * Depth-first search for a `@deepseek-ai/dsh-persona` row carrying
 * `config.complete === true`, at ANY depth — through arrays, objects and the
 * `config` ARRAYS of `cordis:group` rows. The preset document shape varies:
 * the raw `presets/*.patch.yml` nests the persona row under
 * `insert[].config.plugins[]`, while `agentPresets.readDocument` may dump the
 * plugin LIST at the top level. One recursive search covers both; no preset
 * name is hardcoded.
 */
function hasCompletePersona(node, depth = 0) {
  if (depth > MAX_PRESET_DEPTH) return false;
  if (Array.isArray(node)) return node.some((child) => hasCompletePersona(child, depth + 1));
  if (node === null || typeof node !== "object") return false;
  if (node.name === PERSONA_PLUGIN_NAME && node.config?.complete === true) return true;
  return Object.values(node).some((child) => hasCompletePersona(child, depth + 1));
}

/**
 * @purpose Build `modes: [{id, title, complete}]` for the editor's
 *   complete-mode warning (SPEC §2 decision 21): for each agent preset, read
 *   its declared composition and mark `complete: true` when any plugin row
 *   named `@deepseek-ai/dsh-persona` carries `config.complete === true`
 *   ANYWHERE in the parsed document (recursive, see hasCompletePersona). The
 *   roster alone carries no config, so readDocument + parse is the only
 *   detection method.
 * @returns {Promise<Array<{ id: string, title: string, complete: boolean }>>}
 *   `[]` when the service is absent or listing fails (degrade, SPEC §7).
 */
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
      // `yamlParseOptions` carries the `!!js` custom tag: preset files use
      // `disabled: !!js process.platform === 'win32'`, which must NOT abort the
      // parse. A genuinely unparseable document warns below and stays false.
      const entries = parse(document.content ?? "", yamlParseOptions);
      complete = hasCompletePersona(entries);
    } catch (error) {
      warn?.("prompt-profiles: preset document unreadable; complete stays false", {
        preset: preset.id,
        error: error?.message ?? String(error),
      });
    }
    modes.push({ id: preset.id, title: preset.name ?? preset.id, complete });
  }
  return modes;
}
// #endregion FUNC_modeViews

// #region FUNC_stateResponse
/**
 * @purpose Assemble the state document (SPEC §5.5): profiles, sections with
 *   source, usedIn, an `emits` flag, and BOTH identifiers on every row —
 *   `rowId` (fully qualified loader entry id, display/debug) and `patchId`
 *   (unqualified patch row id used for writes).
 */
async function stateResponse(deps) {
  const { service, warn, patchIdOf } = deps;
  // PER-OPERATION DEGRADATION: reading state must work without the optional
  // settings/agentPresets services; revision is null when unreadable.
  const settings = deps.getService?.("settings") ?? deps.settings;
  const revision = settings?.describe?.().find((descriptor) => descriptor.ns === "prompt-profiles")?.revision ?? null;
  return {
    profiles: service.profiles().map((profile) => ({ ...profile, patchId: patchIdOf(profile.rowId) })),
    sections: service.sections().map((section) => ({
      ...section,
      patchId: patchIdOf(section.rowId),
      usedIn: service.usedIn(section.id),
      emits: typeof section.body === "string" && section.body.trim() !== "",
    })),
    builtinOrders: service.builtinOrders(),
    modes: await modeViews(deps.getService?.("agentPresets") ?? deps.agentPresets, warn),
    default: service.config.default.get(),
    lastByWorkspace: service.config.lastByWorkspace.get(),
    revision,
  };
}
// #endregion FUNC_stateResponse

// #region FUNC_previewResponse
/**
 * Build the preview document for `preview({profileId, cwd?})`: an
 * @purpose Build the preview document for `preview({profileId, cwd?})`: an
 *   ILLUSTRATIVE preview, not the runtime text. Built-in sections appear as
 *   `{kind:"builtin", name, order}` placeholders interleaved with our sections
 *   in final order; selection reuses `sectionSkipReason` (the same predicate
 *   `buildSnapshot` applies for the main agent) and the merge reuses
 *   `planInsertion`, BUT interpolation is lenient: `{{cwd}}` is filled with
 *   the session cwd when the input supplies one (otherwise `process.cwd()`),
 *   every other variable stays literal, and unknown or malformed references
 *   are NOT rejected. Real values are substituted when the session starts, so
 *   the response reports exactly which variables were used and what (if
 *   anything) was substituted — `null` means unknown — for the client to flag
 *   as illustrative. The sealed snapshot remains the ONLY runtime truth.
 * @returns {{ profileId: string, title: string, sections: Array<object>,
 *   skipped: Array<{ id: string, reason: string }>,
 *   variables: Record<string, string|null> }}
 */
function previewResponse(deps, profileId, { cwd } = {}) {
  const { service } = deps;
  const profile = findRow(service.profiles(), profileId);
  if (!profile) throw new NotFoundError(`profile "${profileId}" is not registered`);
  const sectionsById = new Map(service.sections().map((row) => [row.id, row]));
  const builtinOrdersByName = service.builtinOrdersByName?.() ?? {};
  const sessionCwd = typeof cwd === "string" && cwd !== "" ? cwd : process.cwd();
  // Variables actually referenced by the rendered text, with the value the
  // preview substituted (null = unknown host-side / substituted at session start).
  const usedVariables = new Set();
  const interpolate = (text) =>
    String(text).replace(/\{\{([^{}]*)\}\}/g, (match, name) => {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) return match; // malformed: left literal
      usedVariables.add(name);
      return name === "cwd" ? sessionCwd : match; // only cwd is known host-side
    });
  // Profile order = insertion order (stable on equal orders), the same sort
  // planInsertion performs.
  const planned = sortByOrder(profile.sections);
  const ours = [];
  const skipped = [];
  for (const ref of planned) {
    const section = sectionsById.get(ref.id);
    // Runtime selection rule (main agent): inherit + main-only emit,
    // subagents-only is skipped with a reason.
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
      emits: true,
    });
  }
  // Built-in placeholders in ENGINE order (order, then name) — the order the
  // assembled array already has before our sections are spliced in.
  const builtins = Object.entries(builtinOrdersByName)
    .map(([name, order]) => ({ kind: "builtin", name, title: name, order }))
    .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // Splice our sections with the SAME base-index plan the assembler uses
  // (descending, so earlier indices stay valid and equal indices keep the
  // profile order). `ours` is already in planInsertion's sort order, so
  // plan[i] corresponds to ours[i].
  const plan = planInsertion({
    snapshot: { sections: ours.map((row) => ({ id: row.id, order: row.order, text: row.text })) },
    assemblySections: builtins.map((row) => ({ name: row.name })),
    builtinOrdersByName,
  });
  const merged = builtins.slice();
  for (let i = plan.length - 1; i >= 0; i--) merged.splice(plan[i].index, 0, ours[i]);
  const variables = Object.fromEntries(
    [...usedVariables].sort().map((name) => [name, name === "cwd" ? sessionCwd : null]),
  );
  return { profileId, title: profile.title, sections: merged, skipped, variables };
}
// #endregion FUNC_previewResponse

/**
 * @purpose Map the writer's duplicate guard («already exists» from insertRow /
 *   renameSectionRow) to a clean 400, so a duplicate id never surfaces as a
 *   500 in sectionCreate, profileCreate or sectionRename.
 */
function mapDuplicate(error) {
  if (/already exists/.test(error?.message ?? "")) throw new InvalidInputError(error.message);
  throw error;
}

// #region FUNC_deleteRow
/**
 * @purpose Implement delete for both kinds: user-owned rows are physically
 *   removed, bundle-provided rows get a bare `{id, name, disabled: true}`
 *   override (SPEC §2 #17); provenance comes from the writer, not from
 *   configuration() which cannot prove layer ownership. `patchId` must
 *   already be NORMALIZED (the patch file addresses unqualified row ids).
 */
async function deleteRow(deps, patchId, name) {
  const configEditor = deps.getService?.("configEditor") ?? deps.configEditor;
  if (!configEditor) throw new UnavailableError("profile storage service is unavailable");
  const patchPath = configEditor.documentPath;
  const ownership = provenance({ patchPath, rowId: patchId });
  if (ownership.source === "user") {
    const removed = await removeRow({ patchPath, rowId: patchId });
    if (!removed) throw new NotFoundError(`row "${patchId}" not found in the profile patch`);
    return { disabled: false };
  }
  await disableRow({ patchPath, rowId: patchId, name });
  return { disabled: true };
}
// #endregion FUNC_deleteRow

// #region FUNC_renameSection
/**
 * @purpose Execute the rename batch (SPEC §2 #16) as ONE writer commit: guard
 *   the new full row id, then insert the new row and remove or disable the old
 *   one — a single read-modify-write held inside one exclusivity gate. The
 *   incoming rowId may be qualified or not; every file address below uses the
 *   NORMALIZED patch row id. The new id arrives already normalized to the FULL
 *   `prompt-section-<token>` form, so it is BOTH the new row id and the new
 *   `config.id`.
 *
 * PROFILES ARE NEVER TOUCHED (frozen decision): a profile that came from a
 * bundle cannot have its refs rewritten anyway and the action is rare, so
 * rename reports `affectedProfiles` — every registered profile still naming
 * the OLD id — and the user fixes those references by hand.
 */
async function renameSection(deps, { rowId: received, id: newId }) {
  const { service, resolve } = deps;
  const configEditor = deps.getService?.("configEditor") ?? deps.configEditor;
  if (!configEditor) throw new UnavailableError("profile storage service is unavailable");
  const { row: section, patchId } = resolve("section", received);
  const oldRowId = patchId;
  // Every id that names THIS section, used for the no-op check AND for the
  // affectedProfiles report.
  const aliases = rowAliases(section);
  const affectedProfiles = service
    .profiles()
    .filter((profile) => profile.sections.some((ref) => refNamesRow(ref.id, aliases)))
    .map((profile) => ({ profileId: profile.id, title: profile.title }));
  // The normalized new id already naming THIS row means nothing would change;
  // it is reported as a collision (400) rather than a silent no-op, so a
  // repeated rename into the same id fails cleanly.
  if (refNamesRow(newId, aliases)) throw new InvalidInputError(`section id "${newId}" is already taken`);
  // Uniqueness on FULL id strings: the new id must not duplicate another
  // registered section's config.id or row id. A duplicate row id already in
  // the patch surfaces from the writer's duplicate guard inside the batch
  // below (mapped to a clean 400 with the rollback already applied).
  const clash = service
    .sections()
    .some(
      (row) =>
        row.rowId !== section.rowId && (row.id === newId || row.rowId === newId || toPatchId(row.rowId) === newId),
    );
  if (clash) throw new InvalidInputError(`section id "${newId}" is already taken`);
  const patchPath = configEditor.documentPath;
  // Only a row THIS patch inserted may be physically removed; a bare override
  // or a lower-layer row we can only override is disabled instead. `.inserted`
  // (not `.source === 'bundle'`) keeps this correct now that an absent row
  // reports 'unknown' rather than 'bundle'.
  const bundleOwned = !provenance({ patchPath, rowId: oldRowId }).inserted;
  try {
    await renameSectionRow({
      patchPath,
      row: { id: newId, name: SECTION_PLUGIN_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId,
      oldName: SECTION_PLUGIN_NAME,
      bundleOwned,
    });
  } catch (error) {
    // A row id already present in the patch (but not registered) surfaces
    // from the writer's duplicate guard mid-batch; the rollback already
    // restored the file — report it as a clean 400.
    mapDuplicate(error);
  }
  return { rowId: newId, patchId: newId, id: newId, affectedProfiles };
}
// #endregion FUNC_renameSection

// #region FUNC_createOperations
/**
 * @purpose Build the operation set (SPEC §5.5 + preview) once per surface.
 *   Each operation validates, performs at most one logical write path, and
 *   returns a plain JSON result; `undefined` means "nothing to report" and the
 *   surface renders its own acknowledgement for it.
 * @param {object} deps - { service, getService?, settings?, configEditor?,
 *   workspaceRegistry?, agentPresets?, warn?, log? }. Optional services are
 *   read per call through `getService`, so a late-appearing service is picked
 *   up and a missing one degrades per operation instead of blocking the mount.
 * @returns {{ ops: Record<string, (input: object) => any> }}
 */
export function createOperations(deps) {
  const { service } = deps;
  const SECTION_PREFIX = "prompt-section-";
  /** Lazy per-call service resolution through the caller's REFLECT reader. */
  const svc = (name) => {
    try {
      return deps.getService?.(name) ?? deps[name];
    } catch {
      return deps[name];
    }
  };
  const settingsStore = () => svc("settings");
  const editorStore = () => svc("configEditor");
  /** Mutations that store volatile config require settings. */
  const requireSettings = () => {
    const store = settingsStore();
    if (!store) throw new UnavailableError("profile storage service is unavailable");
    return store;
  };
  /** Row mutations additionally need the profile patch (configEditor). */
  const requireStorage = () => {
    const store = settingsStore();
    const editor = editorStore();
    if (!store || !editor) throw new UnavailableError("profile storage service is unavailable");
    return { settings: store, configEditor: editor };
  };
  const patchPath = () => editorStore()?.documentPath;

  /** Registered sections' id targets — see domain/refs.ts sectionRefTargets. */
  const sectionTargets = () => sectionRefTargets(service.sections());

  /**
   * Section row ids already written to the profile patch but not yet
   * registered (HMR lag). H5: a pending id counts ONLY when the row really is
   * one of OUR sections — plugin `name` matches, `config` is present, and the
   * row is not disabled. A bare override, a foreign plugin row, a disabled row
   * or a row without `config` is NOT a valid reference target, so a typo that
   * collides with such an id is still a 400. Read-only snapshot; an unreadable
   * patch degrades to registered-only.
   */
  const pendingSectionIds = () => {
    try {
      const path = patchPath();
      if (path === undefined) return new Set();
      return new Set(
        readPatchRows({ patchPath: path })
          .filter(
            (row) =>
              typeof row.id === "string" &&
              row.id.startsWith(SECTION_PREFIX) &&
              row.name === SECTION_PLUGIN_NAME &&
              row.hasConfig &&
              !row.disabled,
          )
          .map((row) => row.id),
      );
    } catch {
      return new Set();
    }
  };

  /**
   * B2: can this profile still be chosen, per the AUTHORITATIVE patch rather
   * than the HMR-lagged registry? A row for the profile's rowId that is present
   * but foreign/disabled, or a source-"user" row that has VANISHED from the
   * patch, means the deletion already committed. A row absent from this patch
   * but registered from an inherited/bundle layer stays valid (it legitimately
   * lives outside this file). An unreadable patch falls back to the registry.
   */
  const profileSelectable = (profileId) => {
    const entry = service.profiles().find((row) => row.id === profileId);
    if (!entry) return false;
    let rows = [];
    try {
      const path = patchPath();
      if (path === undefined) return true; // no patch view: trust the registry
      rows = readPatchRows({ patchPath: path });
    } catch {
      return true; // the registry already said yes and we cannot prove absence
    }
    const row = rows.find((candidate) => candidate.id === entry.rowId || candidate.configId === profileId);
    if (row) return row.name === PROFILE_PLUGIN_NAME && !row.disabled;
    return entry.source !== "user"; // absent: only a removed user row is definitively gone
  };

  /**
   * Registered config ids of `kind` (domain/ids.ts configIds). A NEW id must
   * never duplicate one of these; duplicate row ids already present in the
   * patch are caught by the writer's own duplicate guard on the FULL row id
   * (an id matching only a bundle row's id is an override, by design).
   */
  const registeredConfigIds = (kind) => configIds(kind === "section" ? service.sections() : service.profiles());

  /**
   * The canonical patch row id for a registry rowId. PREFERRED: the true id
   * from `configEditor.entries()` (matched in EITHER form, since the fiber
   * entry id and the entry list may use different qualification), returned
   * normalized. DOCUMENTED FALLBACK: `toPatchId` — strip the leading
   * `<parent>:` prefix chain and keep the last segment.
   */
  const patchIdOf = (rowIdValue) => {
    try {
      const entry = (editorStore()?.entries?.() ?? []).find((candidate) => {
        const id = candidate?.options?.id;
        return typeof id === "string" && (id === rowIdValue || toPatchId(id) === toPatchId(rowIdValue));
      });
      if (entry) return toPatchId(entry.options.id);
    } catch {
      // entries() unavailable or threw: fall through to the string fallback.
    }
    return toPatchId(rowIdValue);
  };
  deps.patchIdOf = patchIdOf;

  /**
   * Resolve a row received in ANY of the accepted forms (qualified loader
   * entry rowId, unqualified patch row id, or the row's own config.id —
   * old-scheme rows keep bare config ids) via the one shared findRow matcher,
   * then derive the normalized patchId used for every settings/writer address.
   */
  const resolveRow = (kind, received) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    const row = findRow(rows, received);
    if (!row) throw new NotFoundError(`${kind} row "${received}" is not registered`);
    return { row, patchId: patchIdOf(row.rowId) };
  };
  deps.resolve = resolveRow;

  /**
   * @purpose Replace settings writes wrapped in the bundle's shared write
   *   serializer, so operation updates never interleave with writer mutations
   *   in this process. Updates replace ONLY the volatile fields — `id` belongs
   *   to the inherited insert layer, and dsh-settings `replace(ns, section)`
   *   rejects every key that is not marked volatile in the row Config.
   *   Known settings-layer failures map to clean statuses with their real
   *   message (never a bare 500).
   */
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
      await withWriteLock(() =>
        method === "replace"
          ? store.replace(ns, value, typeof revision === "number" ? revision : undefined)
          : store.mutate(ns, value, typeof revision === "number" ? revision : undefined),
      );
    } catch (error) {
      mapSettingsError(error, revision);
    }
  };

  // #region FUNC_mutateWithRetry
  /** Bounded attempts before a /last or cleanup gives up. */
  const MAX_MUTATE_ATTEMPTS = 5;
  /** The current `prompt-profiles` settings revision (undefined when unknown). */
  const currentRevision = () => {
    try {
      return settingsStore()
        ?.describe?.()
        .find((entry) => entry.ns === "prompt-profiles")?.revision;
    } catch {
      return undefined;
    }
  };
  /**
   * @purpose Atomic read-modify-write of the `prompt-profiles` config, correct
   *   WITH or WITHOUT a settings revision:
   *  - `buildOps` runs inside the bundle write lock and emits PER-KEY ops
   *    (`set`/`unset` on `lastByWorkspace.<key>`, or `default`), which
   *    `settings.mutate` applies to the value it reads at write time. A
   *    whole-dict write is never sent, so a concurrent writer's keys cannot be
   *    clobbered by a stale read.
   *  - When a revision IS available it is also passed as `expectedRevision`;
   *    SETTINGS_CONFLICT re-reads and retries, and the cap yields a clean 409 —
   *    never a silent unchecked write.
   * Never nests the non-reentrant lock: `withWriteLock` is taken ONCE around
   * the whole attempt loop and `settings.mutate` is called directly.
   * @param {() => Array<{op: string, path: string[], value?: unknown}>} buildOps
   *   receives `{ revisionAvailable }`; ops that are safe only under CAS must
   *   consult it.
   * @returns {Promise<boolean>} whether anything was written.
   */
  const mutateWithRetry = async (buildOps, { clientRevision } = {}) =>
    withWriteLock(async () => {
      for (let attempt = 1; ; attempt += 1) {
        const expected = currentRevision();
        if (
          attempt === 1 &&
          typeof clientRevision === "number" &&
          typeof expected === "number" &&
          clientRevision !== expected
        ) {
          throw new ConflictError(`configuration changed since read (expected revision ${clientRevision})`);
        }
        const ops = buildOps({ revisionAvailable: typeof expected === "number" }); // read + decide INSIDE the lock
        if (ops.length === 0) return false;
        try {
          await settingsStore().mutate("prompt-profiles", ops, typeof expected === "number" ? expected : undefined);
          return true;
        } catch (error) {
          if (error?.code !== "SETTINGS_CONFLICT") mapSettingsError(error, expected);
          if (attempt >= MAX_MUTATE_ATTEMPTS) {
            throw new ConflictError(`configuration kept changing; gave up after ${MAX_MUTATE_ATTEMPTS} attempts`);
          }
          // conflict: re-read the config/revision and retry
        }
      }
    });
  // #endregion FUNC_mutateWithRetry

  // #region FUNC_clearProfileReferences
  /**
   * @purpose Best-effort orphan cleanup after a profile row was deleted:
   *   remove the profile's id from `lastByWorkspace` (per-key `unset` ops) and
   *   reset `default` to "" when it named it. Per-key ops plus the write lock
   *   keep a concurrent /last from losing its choice; a failure here is not
   *   fatal, because the resolver resets a dangling profile id anyway.
   * @returns {Promise<boolean>} whether references were cleared.
   */
  const clearProfileReferences = async (profile) => {
    const aliases = rowAliases(profile);
    return mutateWithRetry(() => {
      const ops = [];
      for (const [key, value] of Object.entries(service.config.lastByWorkspace.get() ?? {})) {
        if (aliases.has(value)) ops.push({ op: "unset", path: ["lastByWorkspace", key] });
      }
      if (aliases.has(service.config.default.get())) ops.push({ op: "set", path: ["default"], value: "" });
      return ops;
    });
  };
  // #endregion FUNC_clearProfileReferences

  // #region FUNC_staleWorkspaceKeys
  /**
   * Dead `lastByWorkspace` KEYS to unset on the next /last write:
   *  - values that match no registered profile (except "" = explicit none);
   *  - keys shaped like a workspace UUID the registry does not know.
   * cwd-shaped keys are ALWAYS kept — they may belong to a session whose
   * workspace is not registered yet. Without a workspaceRegistry no UUID can
   * be proven stale, so such keys are kept. Only the listed keys are touched
   * (per-key `unset`), never the whole dictionary.
   */
  const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const staleWorkspaceKeys = (value) => {
    const profileIds = new Set(service.profiles().map((row) => row.id));
    const registry = svc("workspaceRegistry");
    const stale = [];
    for (const [key, entry] of Object.entries(value ?? {})) {
      if (entry !== "" && !profileIds.has(entry)) {
        stale.push(key);
        continue;
      } // dangling profile choice
      if (WORKSPACE_ID.test(key) && typeof registry?.get === "function") {
        let known = true;
        try {
          known = Boolean(registry.get(key));
        } catch {
          known = true; // unreadable registry: do not drop a possibly-live key
        }
        if (!known) stale.push(key); // stale workspace id
      }
    }
    return stale;
  };
  // #endregion FUNC_staleWorkspaceKeys

  /**
   * Every id a NEW row of `kind` must not reuse: the registered rows' ids plus
   * every id already present in the patch file (domain/ids.ts takenIds).
   */
  const idsInUse = (kind) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    let fromPatch = [];
    try {
      const path = patchPath();
      if (path !== undefined) fromPatch = [...listRowIds({ patchPath: path })];
    } catch {
      // patch unreadable: insertRow's own duplicate guard still protects us
    }
    return takenRowIds(rows, fromPatch);
  };

  // #region OPS_definitions
  /**
   * THE operation set. Keys are the operation names every surface publishes
   * as its method names. `defaultSet` takes the `{default: id|""|null,
   * revision?}` shape; a surface whose input names the field `profileId` maps
   * onto it, so the behaviour lives in ONE place.
   */
  const ops = {
    /** Read the full editor state (degrades per optional service). */
    state: () => stateResponse(deps),

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
      // An explicit id may never duplicate a registered section's config.id;
      // patch row-id duplicates fall to the writer's own duplicate guard.
      if (payload.id !== null && registeredConfigIds("section").has(payload.id)) {
        throw new InvalidInputError(`section id "${payload.id}" already exists`);
      }
      const id = payload.id ?? newRowId("section", idsInUse("section"));
      // FROZEN ID SCHEME: the row id and the stored config.id are the SAME
      // full `prompt-section-<token>` string, so a profile ref (which is a
      // config.id) addresses the row exactly.
      const row = { id, name: SECTION_PLUGIN_NAME, config: { id, title: payload.title, body: payload.body } };
      return insertRow({ patchPath: requireStorage().configEditor.documentPath, row })
        .catch(mapDuplicate)
        .then(() => ({
          rowId: row.id,
          patchId: row.id,
          configId: row.id,
          title: payload.title,
          body: payload.body,
          emits: payload.body.trim() !== "",
        }));
    },

    /** Whole-object update of a section's volatile fields. */
    sectionUpdate: async (body) => {
      requireStorage();
      const payload = validate("section/update", body);
      const { row, patchId } = resolveRow("section", payload.rowId);
      // VOLATILE-ONLY whole-object write: `id` stays in the inherited insert
      // layer (settings would reject it — see settingsWrite docblock).
      await settingsWrite(
        "replace",
        patchId,
        { title: payload.value.title, body: payload.value.body },
        payload.revision,
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
        pendingSectionIds: pendingSectionIds(),
      });
      // An explicit id may never duplicate a registered profile's config.id;
      // patch row-id duplicates fall to the writer's own duplicate guard.
      if (payload.id !== null && registeredConfigIds("profile").has(payload.id)) {
        throw new InvalidInputError(`profile id "${payload.id}" already exists`);
      }
      const id = payload.id ?? newRowId("profile", idsInUse("profile"));
      // FROZEN ID SCHEME: row id === stored config.id (full form).
      const row = { id, name: PROFILE_PLUGIN_NAME, config: { id, title: payload.title, sections: payload.sections } };
      return insertRow({ patchPath: requireStorage().configEditor.documentPath, row })
        .catch(mapDuplicate)
        .then(() => ({
          rowId: row.id,
          patchId: row.id,
          configId: row.id,
          title: payload.title,
          sections: payload.sections,
        }));
    },

    /** Whole-object update of a profile's volatile fields. */
    profileUpdate: async (body) => {
      requireStorage();
      const payload = validate("profile/update", body, {
        sectionTargets: sectionTargets(),
        pendingSectionIds: pendingSectionIds(),
      });
      const { row, patchId } = resolveRow("profile", payload.rowId);
      // VOLATILE-ONLY whole-object write (see settingsWrite docblock): the
      // `sections` array replaces wholesale, `id` is inherited.
      await settingsWrite(
        "replace",
        patchId,
        { title: payload.value.title, sections: payload.value.sections },
        payload.revision,
      );
      return { rowId: row.rowId, patchId };
    },

    /** Delete a profile row and best-effort-clear its default/last references. */
    profileDelete: async (body) => {
      requireStorage();
      const payload = validate("profile/delete", body);
      const { row, patchId } = resolveRow("profile", payload.rowId);
      // ORDER MATTERS: delete the ROW first — its writer rollback is the
      // authoritative operation. Reference cleanup then runs best-effort; if
      // it fails, dangling ids remain, which the resolver resets silently
      // (safe degradation). Clearing first could irreversibly lose the
      // user's choice when the deletion itself failed.
      const result = await deleteRow(deps, patchId, PROFILE_PLUGIN_NAME);
      try {
        await clearProfileReferences(row);
      } catch (error) {
        try {
          deps.log?.warn?.(
            "prompt-profiles: profile deleted but its default/lastByWorkspace references were not cleared",
            {
              profileId: row.id,
              error: errorMessage(error),
            },
          );
        } catch {
          // logging must never turn a successful delete into a failure
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
      // Validate against the authoritative patch INSIDE the lock, so a profile
      // whose row is already gone cannot become the default while HMR still
      // exposes it.
      await mutateWithRetry(
        () => {
          if (payload.default !== "" && !profileSelectable(payload.default)) {
            throw new NotFoundError(`profile "${payload.default}" is not registered`);
          }
          return [{ op: "set", path: ["default"], value: payload.default }];
        },
        { clientRevision: body.revision },
      );
    },

    /** Record the workspace's last chosen profile (SPEC §2 #11). */
    last: async (body) => {
      requireSettings();
      const payload = validate("last", body);
      // New choices go under the FIRST candidate the assembler resolves
      // (the workspace UUID when known, else the cwd) so we stop creating
      // new path keys; reading still walks ALL candidates, so legacy
      // path-keyed choices keep working (no migration, no cleanup).
      const workspaceKeys = await resolveWorkspaceKeys({
        workspaceRegistry: svc("workspaceRegistry"),
        workspaceId: payload.workspaceId,
        cwd: payload.cwd,
      });
      const workspaceKey = workspaceKeys[0] ?? "";
      // Per-key ops applied by settings.mutate against the value it reads at
      // write time: a parallel /last can never lose another workspace's
      // choice, and the (non-reentrant) write lock is taken once around the
      // whole attempt loop.
      await mutateWithRetry(
        ({ revisionAvailable }) => {
          // Validity is decided INSIDE the locked mutation, after the awaited
          // key resolution, against the AUTHORITATIVE patch (not the HMR-lagged
          // registry): a profile deleted while we were resolving — or already
          // gone from the file but still listed — must yield 404, never a
          // resurrected dangling choice.
          if (payload.profileId !== "" && !profileSelectable(payload.profileId)) {
            throw new NotFoundError(`profile "${payload.profileId}" is not registered`);
          }
          // Housekeeping unset is computed from the live config inside the
          // lock. It is applied ONLY when a settings revision is available:
          // without CAS a concurrent out-of-lock writer could make a scanned
          // key valid between this scan and settings.mutate, and the unset
          // would delete that choice. No revision → skip pruning (safe), the
          // caller's own key is still set (per-key ops are race-free).
          const ops = revisionAvailable
            ? staleWorkspaceKeys(service.config.lastByWorkspace.get()).map((key) => ({
                op: "unset",
                path: ["lastByWorkspace", key],
              }))
            : [];
          // Explicit "none" is STORED as an own-property empty string: the
          // resolver treats it as a decision that beats the default; deleting
          // the key would silently fall back to `default`.
          ops.push({ op: "set", path: ["lastByWorkspace", workspaceKey], value: payload.profileId });
          return ops;
        },
        { clientRevision: payload.revision },
      );
    },
  };
  // #endregion OPS_definitions

  return { ops };
}
// #endregion FUNC_createOperations
