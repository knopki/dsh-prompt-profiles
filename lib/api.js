/**
 * Same-origin HTTP API for the prompt-profiles editor and picker (SPEC §5.5).
 * #region moduleContract
 * @modulecontract
 * @purpose Expose prompt-profile CRUD (plus mode/complete warnings and a
 *   host-rendered preview for the editor) over the host `webServer` service
 *   so the web client can manage rows without a typed remote — ordinary
 *   exact-path routes, like deepseek-web-import.
 * @scope
 *  - Route registration (state, preview, section create/update/delete/rename,
 *    profile create/update/delete, default, last) with whole-object
 *    validation.
 *  - Writes to EXISTING rows replace the WHOLE config via
 *    ctx.settings.replace(ns, value, revision); creation/removal/disable go
 *    through the writer (lib/writer.js); rename is the documented batch with
 *    rollback. Every row-addressing route accepts EITHER the fully qualified
 *    loader entry rowId (`include:prompt-section-1`) OR the unqualified
 *    patch row id (`prompt-section-1`) — toPatchId normalizes internally.
 *  - EVERY mutating path runs inside the bundle's one in-process serializer
 *    (`withWriteLock`), preventing same-process lost updates.
 *  - NOT: the sealing core — the plugin works on non-web surfaces without
 *    these routes (registration silently skipped when webServer is absent).
 * @invariants
 *  - Every request body is validated BEFORE any write happens: section value
 *    {title non-empty, body string}; profile value {title non-empty,
 *    sections array of {id ∈ registered sections, order finite, scope enum}};
 *    violations return a clean `{ error: { message } }` 400 and never touch
 *    the file (byte-identical).
 *  - A section body may be empty/whitespace (SPEC §7); responses mark it
 *    `emits: false`.
 *  - Route handlers never let an exception escape to the socket: errors map
 *    to a JSON error response (400 validation/duplicate id, 404 unknown
 *    row/profile, 405 method, 409 revision conflict or unsafe rename, 413
 *    too large, 500 unexpected) and EVERY failure is logged with the route,
 *    the rowId as received, the normalized patchId, and the underlying
 *    error message.
 *  - RESIDUAL CONCURRENCY WINDOW (documented, see writer.js): other plugins'
 *    direct configEditor writes when dsh-hmr is absent, and any second DSH
 *    process, are not serialized with these routes.
 * @dependencies
 *  - USES API: ctx.webServer.register (exact routes), ctx.settings.replace /
 *    mutate / describe, ctx.configEditor.documentPath / entries (optional),
 *    ctx.agentPresets.list / readDocument (optional), ctx.promptProfiles
 *    views, lib/writer.js.
 * @rationale
 *  - Q: Why raw node:http handlers instead of a router framework?
 *    A: The webServer service owns dispatch and registers plain
 *    (req, res) handlers; adding a framework would fight the host.
 *  - Q: Why whole-object replace instead of per-field ops?
 *    A: The client holds the full editor form; forwarding path ops only
 *    widened the race surface between reads and writes. replace keeps the
 *    contract "validated object in, whole config out" and 400s cleanly.
 * @keywords api, routes, webServer, settings.replace, toPatchId, rowId,
 *   patchId, validation, CRUD, modes, complete, preview
 * #endregion moduleContract
 */

import { parse } from "yaml";
import { insertRow, removeRow, disableRow, provenance, withWriteLock, renameSectionRow, listRowIds } from "./writer.js";

// #region CONST_identity
/** Plugin names of the row kinds this API manages (SPEC §3). */
const SECTION_NAME = "@knopki/dsh-prompt-profiles/section";
const PROFILE_NAME = "@knopki/dsh-prompt-profiles/profile";
/** Row id prefixes: the loader-row id domain is separate from config.id. */
const rowId = (kind, id) => `prompt-${kind}-${id}`;
/** id slug rule for user-visible section/profile ids. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SCOPES = ["inherit", "main-only", "subagents-only"];
/** Hard request-body ceiling (bodies are small JSON documents). */
const MAX_BODY_BYTES = 1 << 20;
/** The persona plugin whose `config.complete === true` collapses the prompt. */
const PERSONA_PLUGIN = "@deepseek-ai/dsh-persona";
/** `!!js` customTag shared with the loader dialect (SPEC §3). */
const yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
// #endregion CONST_identity

// #region CLASS_ApiError
/**
 * @purpose Carry an HTTP status plus a safe message out of handlers so the
 *   dispatcher can answer with a clean error object instead of a stack.
 */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
// #endregion CLASS_ApiError

// #region FUNC_toPatchId
/**
 * Normalize a row identifier to the unqualified PATCH row id used by
 * ctx.settings / configEditor: strip a leading `<parent>:` prefix CHAIN
 * (`include:group:prompt-section-1` → `prompt-section-1`) and keep the last
 * segment. An already-unqualified id passes through unchanged.
 *
 * @purpose Close the live bug where the client addressed rows by the fully
 *   qualified loader entry id while the settings service knows only the
 *   patch row id. FALLBACK ONLY: callers prefer the true patch id read from
 *   `configEditor.entries()` (see patchIdOf); this string split is used when
 *   entries are unavailable or do not know the row.
 * @param {string} value - rowId as received (either form).
 * @returns {string} the last `:`-separated segment.
 */
export function toPatchId(value) {
  if (typeof value !== "string" || value === "") return value;
  return value.slice(value.lastIndexOf(":") + 1);
}
// #endregion FUNC_toPatchId

// #region FUNC_slugify
/**
 * Best-effort ASCII slug from a title (lowercase, strip accents, non-alnum →
 * `-`). May return "" (e.g. pure-Cyrillic titles) — callers then fall back
 * to a numeric `<kind>-<n>` id.
 */
const slugify = (title) => String(title ?? "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
// #endregion FUNC_slugify

// #region FUNC_generateId
/**
 * Generate a unique config id for create routes (the server owns the slug).
 *
 * @purpose Never collide with a registered config id or any row id already
 *   present in the profile patch — the writer's duplicate guard would 400.
 * @param {"section"|"profile"} kind
 * @param {string} title - source of the slug stem.
 * @param {Set<string>} taken - every id that must not be reused.
 * @returns {string} slug id matching ID_PATTERN.
 */
function generateId(kind, title, taken) {
  const prefix = kind === "section" ? "section" : "profile";
  const stem = slugify(title);
  if (ID_PATTERN.test(stem)) {
    if (!taken.has(stem)) return stem;
    let n = 2;
    while (taken.has(`${stem}-${n}`)) n += 1;
    return `${stem}-${n}`;
  }
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}
// #endregion FUNC_generateId

// #region FUNC_validate
/**
 * @purpose Reject malformed request payloads before anything is written
 *   (PLAN step 4: «попытка испортить входные данные — отказ без записи»).
 *   Updates carry a WHOLE object `value`; there are no path ops anymore.
 * @param {string} kind - expected payload kind, for error messages.
 * @param {object} body - parsed JSON body.
 * @param {object} deps - registry views for cross-field checks
 *   (`sectionIds: Set<string>` of registered section config ids).
 * @returns {object} validated payload.
 */
function validate(kind, body, deps) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, `${kind}: request body must be a JSON object`);
  }
  const str = (field, { allowEmpty = false } = {}) => {
    const value = body[field];
    if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
      throw new ApiError(400, `${kind}: field "${field}" must be a ${allowEmpty ? "string" : "non-empty string"}`);
    }
    return value;
  };
  const slug = (field) => {
    const value = str(field);
    if (!ID_PATTERN.test(value)) {
      throw new ApiError(400, `${kind}: field "${field}" must match ${ID_PATTERN}`);
    }
    return value;
  };
  const revision = () => {
    if (body.revision !== undefined && !Number.isFinite(body.revision)) {
      throw new ApiError(400, `${kind}: "revision" must be a number when present`);
    }
    return body.revision;
  };
  /** Title with a DEFAULT allowed (frozen contract): missing/blank is fine. */
  const titleWithDefault = (fallback) => {
    const value = body.title;
    if (value === undefined || (typeof value === "string" && value.trim() === "")) return fallback;
    if (typeof value !== "string") throw new ApiError(400, `${kind}: field "title" must be a string`);
    return value;
  };
  const sectionRefs = (value, { requireRegistered = true } = {}) => {
    if (!Array.isArray(value)) throw new ApiError(400, `${kind}: sections must be an array`);
    return value.map((ref, index) => {
      if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
        throw new ApiError(400, `${kind}: sections[${index}] must be an object`);
      }
      // CREATE may reference a section created moments ago that HMR has not
      // registered yet — only the slug shape is checked there; UPDATE demands
      // a currently registered section.
      if (typeof ref.id !== "string" || (requireRegistered ? !deps.sectionIds.has(ref.id) : !ID_PATTERN.test(ref.id))) {
        throw new ApiError(400, `${kind}: sections[${index}].id "${ref.id}" is not a registered section`);
      }
      if (!Number.isFinite(ref.order)) throw new ApiError(400, `${kind}: sections[${index}].order must be a number`);
      if (ref.scope != null && !SCOPES.includes(ref.scope)) {
        throw new ApiError(400, `${kind}: sections[${index}].scope must be one of ${SCOPES.join(", ")}`);
      }
      return { id: ref.id, order: ref.order, ...(ref.scope != null ? { scope: ref.scope } : {}) };
    });
  };
  switch (kind) {
    case "section/create": {
      // Frozen contract: {title, body}; the server generates the slug id (an
      // explicit valid `id` is still accepted for back-compat). SPEC §7:
      // empty/whitespace body is allowed — the section simply does not emit.
      const id = body.id === undefined ? null : slug("id");
      const title = titleWithDefault("Section");
      if (body.body !== undefined && typeof body.body !== "string") {
        throw new ApiError(400, `${kind}: field "body" must be a string`);
      }
      return { id, title, body: body.body ?? "" };
    }
    case "profile/create": {
      const id = body.id === undefined ? null : slug("id");
      const title = titleWithDefault("Profile");
      const sections = body.sections === undefined ? [] : sectionRefs(body.sections, { requireRegistered: false });
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
      const sections = body.value.sections === undefined ? [] : sectionRefs(body.value.sections);
      return { rowId: rowIdValue, value: { title: body.value.title, sections }, revision: revision() };
    }
    case "section/rename":
      return { rowId: str("rowId"), id: slug("id") };
    case "section/delete":
    case "profile/delete":
      return { rowId: str("rowId") };
    case "default": {
      // Only a profile-id string, '' (none), or null (clear) — never a
      // silently coerced missing field (verify-step4-sol defect 3).
      if (!("default" in body) || (body.default !== null && typeof body.default !== "string")) {
        throw new ApiError(400, 'default: field "default" must be a profile id string, "" for none, or null');
      }
      return { default: body.default ?? "" };
    }
    case "last": {
      const workspaceId = str("workspaceId");
      if (typeof body.profileId !== "string") throw new ApiError(400, "last: profileId must be a string (empty = none)");
      return { workspaceId, profileId: body.profileId, revision: revision() };
    }
    default:
      throw new ApiError(500, `validate: unknown kind ${kind}`);
  }
}
// #endregion FUNC_validate

// #region FUNC_readJsonBody
/**
 * @purpose Decode one bounded JSON request body; violations become clean 400s
 *   before any handler logic runs.
 * @param {object} request - node:http IncomingMessage.
 * @returns {Promise<object>} parsed object.
 */
function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      reject(new ApiError(413, "request body is too large"));
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ApiError(413, "request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        resolve(parsed);
      } catch {
        reject(new ApiError(400, "request body is not valid JSON"));
      }
    });
    request.on("error", () => reject(new ApiError(400, "request body could not be read")));
  });
}
// #endregion FUNC_readJsonBody

// #region FUNC_modeViews
/**
 * Build `modes: [{id, title, complete}]` for the editor's complete-mode
 * warning (SPEC §2 decision 21): for each agent preset, read its declared
 * composition and mark `complete: true` when any plugin row named
 * `@deepseek-ai/dsh-persona` carries `config.complete === true`.
 *
 * @purpose Let the UI warn that a profile is discarded in complete modes,
 *   using the only detection method SPEC proved (readDocument + parse; the
 *   roster alone carries no config).
 * @param {object} [agentPresets] - ctx.agentPresets (optional service).
 * @param {(message: string, details?: unknown) => void} warn
 * @returns {Promise<Array<{ id: string, title: string, complete: boolean }>>}
 *   `[]` when the service is absent or listing fails (degrade, SPEC §7).
 */
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
      const entries = parse(document.content ?? "", yamlParseOptions);
      const rows = Array.isArray(entries) ? entries.flatMap((entry) => {
        if (entry == null || typeof entry !== "object") return [];
        const nested = Array.isArray(entry.insert) ? entry.insert.filter((row) => row && typeof row === "object") : [];
        return [entry, ...nested];
      }) : [];
      complete = rows.some((row) => row.name === PERSONA_PLUGIN && row.config?.complete === true);
    } catch (error) {
      warn?.("prompt-profiles api: preset document unreadable; complete stays false", {
        preset: preset.id, error: error?.message ?? String(error),
      });
    }
    modes.push({ id: preset.id, title: preset.name ?? preset.id, complete });
  }
  return modes;
}
// #endregion FUNC_modeViews

// #region FUNC_stateResponse
/**
 * @purpose Assemble the GET /state document (SPEC §5.5 + frozen live-bugfix
 *   contract): profiles, sections with source, usedIn, an `emits` flag, and
 *   BOTH identifiers on every row — `rowId` (fully qualified loader entry id,
 *   display/debug) and `patchId` (unqualified patch row id used for writes).
 */
async function stateResponse(deps) {
  const { service, settings, agentPresets, warn, patchIdOf } = deps;
  const revision = settings.describe().find((descriptor) => descriptor.ns === "prompt-profiles")?.revision ?? 0;
  return {
    profiles: service.profiles().map((profile) => ({ ...profile, patchId: patchIdOf(profile.rowId) })),
    sections: service.sections().map((section) => ({
      ...section,
      patchId: patchIdOf(section.rowId),
      usedIn: service.usedIn(section.id),
      emits: typeof section.body === "string" && section.body.trim() !== "",
    })),
    builtinOrders: service.builtinOrders(),
    modes: await modeViews(agentPresets, warn),
    default: service.config.default.get(),
    lastByWorkspace: service.config.lastByWorkspace.get(),
    revision,
  };
}
// #endregion FUNC_stateResponse

// #region FUNC_previewResponse
/**
 * Build GET /preview?profileId=… : our sections in final order with host-side
 * variable interpolation ({{cwd}} from process.cwd(); {{model}} is unknown
 * host-side and stays literal, reported in `variables`), plus every skipped
 * reference with its reason (SPEC §6.2 Preview tab, §7 degradation table).
 *
 * @purpose Give the editor an accurate, host-rendered preview without a live
 *   session; the sealed snapshot remains the runtime truth.
 * @returns {{ profileId: string, title: string, sections: Array<object>,
 *   skipped: Array<{ id: string, reason: string }>, variables: object }}
 */
function previewResponse(deps, profileId) {
  const { service } = deps;
  const profile = service.profiles().find((row) => row.id === profileId);
  if (!profile) throw new ApiError(404, `profile "${profileId}" is not registered`);
  const sectionsById = new Map(service.sections().map((row) => [row.id, row]));
  const ordersByName = service.builtinOrdersByName?.() ?? {};
  const builtinOrderValues = Object.values(ordersByName);
  const variables = { cwd: process.cwd(), model: null };
  const interpolate = (text) => String(text)
    .replace(/\{\{cwd\}\}/g, variables.cwd)
    .replace(/\{\{model\}\}/g, "{{model}}"); // unknown host-side: kept literal
  const planned = [...profile.sections].sort((a, b) => a.order - b.order);
  const sections = [];
  const skipped = [];
  for (const ref of planned) {
    const section = sectionsById.get(ref.id);
    if (!section) { skipped.push({ id: ref.id, reason: "section not found" }); continue; }
    if (section.disabled) { skipped.push({ id: ref.id, reason: "section disabled" }); continue; }
    if (typeof section.body !== "string" || section.body.trim() === "") {
      skipped.push({ id: ref.id, reason: "empty body" });
      continue;
    }
    const order = builtinOrderValues.includes(ref.order) ? ref.order + 0.5 : ref.order;
    sections.push({
      id: section.id, title: section.title, order, scope: ref.scope ?? "inherit",
      text: interpolate(section.body), emits: true,
    });
  }
  return { profileId, title: profile.title, sections, skipped, variables };
}
// #endregion FUNC_previewResponse

/**
 * Map the writer's duplicate guard («already exists» from insertRow /
 * renameSectionRow) to a clean 400 in every route that can hit it — create
 * routes included (verify-fixes-glm defect 1: bare rethrow answered 500).
 *
 * @purpose Give /section/create, /profile/create and /section/rename the same
 *   `{ error: { message } }` envelope as the rest of the API.
 */
function mapDuplicate(error) {
  if (/already exists/.test(error?.message ?? "")) throw new ApiError(400, error.message);
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
  const patchPath = deps.configEditor.documentPath;
  const ownership = provenance({ patchPath, rowId: patchId });
  if (ownership.source === "user") {
    const removed = await removeRow({ patchPath, rowId: patchId });
    if (!removed) throw new ApiError(404, `row "${patchId}" not found in the profile patch`);
    return { disabled: false };
  }
  await disableRow({ patchPath, rowId: patchId, name });
  return { disabled: true };
}
// #endregion FUNC_deleteRow

// #region FUNC_renameSection
/**
 * @purpose Execute the rename batch (SPEC §2 #16) as ONE writer commit
 *   (astra finding C): guard the new config.id, then insert the new row,
 *   rewrite the section references of every referencing profile, and remove
 *   or disable the old row — a single read-modify-write held inside one
 *   exclusivity gate. The incoming rowId may be qualified or not; every file
 *   address below uses the NORMALIZED patch row id.
 */
async function renameSection(deps, { rowId: received, id: newId }) {
  const { service, configEditor, resolve, patchIdOf } = deps;
  const { row: section, patchId } = resolve("section", received);
  const oldRowId = patchId;
  if (newId === section.id) return { rowId: section.rowId, patchId, id: newId }; // no-op rename
  if (service.sections().some((row) => row.id === newId && row.rowId !== section.rowId)) {
    throw new ApiError(400, `section id "${newId}" is already taken`);
  }
  const patchPath = configEditor.documentPath;
  const bundleOwned = provenance({ patchPath, rowId: oldRowId }).source === "bundle";
  // Profile rows may come from foreign bundles: a bare override written with
  // the wrong plugin name is silently skipped by the loader. Prefer each
  // row's real name from configEditor entries; when a name cannot be
  // determined, fall back to our own PROFILE_NAME ONLY for rows that live in
  // this patch as inserts (the writer updates their config in place, so the
  // name is never matched). Any other unnameable profile ⇒ explicit refusal
  // (409) instead of writing an override the loader would skip
  // (verify-fixes-glm defect 5; documented in SPEC §7).
  let entries = null;
  try {
    entries = configEditor.entries?.() ?? null;
  } catch {
    entries = null;
  }
  const nameOf = (rowIdValue) =>
    entries?.find((entry) => [rowIdValue, toPatchId(rowIdValue)].includes(entry?.options?.id))?.options?.name ?? null;
  const rewrite = (profile) =>
    profile.sections.map((ref) => (ref.id === section.id ? { ...ref, id: newId } : ref));
  const referencing = service.profiles()
    .filter((profile) => profile.sections.some((ref) => ref.id === section.id));
  let profileUpdates;
  try {
    profileUpdates = referencing.map((profile) => {
      const name = nameOf(profile.rowId);
      const profilePatchId = patchIdOf(profile.rowId);
      if (name != null) return { rowId: profilePatchId, name, sections: rewrite(profile) };
      if (provenance({ patchPath, rowId: profilePatchId }).inserted) {
        // insert row in this patch: config is updated in place, name unused
        return { rowId: profilePatchId, name: PROFILE_NAME, sections: rewrite(profile) };
      }
      return null; // would become a bare override the loader skips
    });
  } catch (error) {
    throw new ApiError(409, `section rename aborted: the profile patch could not be read to prove profile ownership (${error?.message ?? String(error)})`);
  }
  if (profileUpdates.includes(null)) {
    throw new ApiError(409, "section rename aborted: configEditor.entries() could not name every referencing profile; writing a bare override with a guessed plugin name would be skipped by the loader, so the rename was refused and the patch is untouched");
  }
  try {
    await renameSectionRow({
      patchPath,
      row: { id: rowId("section", newId), name: SECTION_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId, oldName: SECTION_NAME, bundleOwned, profileUpdates,
    });
  } catch (error) {
    // A row id already present in the patch (but not registered) surfaces
    // from the writer's duplicate guard mid-batch; the rollback already
    // restored the file — report it as a clean 400.
    mapDuplicate(error);
  }
  return { rowId: rowId("section", newId), patchId: rowId("section", newId), id: newId };
}
// #endregion FUNC_renameSection

// #region FUNC_createRoutes
/**
 * Build the route table (SPEC §5.5 + preview + frozen live-bugfix contract).
 * Each handler validates, performs at most one logical write path, and
 * answers `{ ok: true, ... }`.
 *
 * @purpose Keep route wiring declarative so registration and tests share one
 *   table.
 * @param {object} deps - { service, settings, configEditor, agentPresets?,
 *   warn?, log? }.
 * @returns {Array<{ path: string, method: string,
 *   run: (body: object, query: URLSearchParams) => any }>}
 */
function createRoutes(deps) {
  const { service, settings, configEditor } = deps;
  const sectionIds = () => new Set(service.sections().map((row) => row.id));

  /**
   * The canonical patch row id for a registry rowId. PREFERRED: the true id
   * from `configEditor.entries()` (matched in EITHER form, since the fiber
   * entry id and the entry list may use different qualification), returned
   * normalized. DOCUMENTED FALLBACK: `toPatchId` — strip the leading
   * `<parent>:` prefix chain and keep the last segment.
   */
  const patchIdOf = (rowIdValue) => {
    try {
      const entry = (configEditor.entries?.() ?? []).find((candidate) => {
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
   * Resolve a row received as EITHER the qualified loader entry rowId or the
   * unqualified patch row id (frozen contract; live bug A): match registry
   * rows on both forms, then derive the normalized patchId used for every
   * settings/writer address.
   */
  const resolveRow = (kind, received) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    const wanted = new Set([received, toPatchId(received)]);
    const row = rows.find((candidate) => wanted.has(candidate.rowId) || wanted.has(toPatchId(candidate.rowId)));
    if (!row) throw new ApiError(404, `${kind} row "${received}" is not registered`);
    return { row, patchId: patchIdOf(row.rowId) };
  };
  deps.resolve = resolveRow;

  /**
   * settings.replace / settings.mutate wrapped in the bundle's shared write
   * serializer so API updates never interleave with writer operations in this
   * process (verify-step4-sol defect 1). settings takes its own hmr/file
   * locks. Revision conflicts map to a clean 409.
   */
  const settingsWrite = async (method, ns, value, revision) => {
    try {
      await withWriteLock(() =>
        method === "replace"
          ? settings.replace(ns, value, typeof revision === "number" ? revision : undefined)
          : settings.mutate(ns, value, typeof revision === "number" ? revision : undefined));
    } catch (error) {
      if (error?.code === "SETTINGS_CONFLICT") throw new ApiError(409, `configuration changed since read (expected revision ${revision})`);
      throw error;
    }
  };

  /** Ids a NEW row of `kind` must not collide with (registry + patch file). */
  const takenIds = (kind) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    const taken = new Set(rows.map((row) => row.id));
    try {
      for (const id of listRowIds({ patchPath: configEditor.documentPath })) {
        taken.add(id);
        taken.add(toPatchId(id));
        // Also reserve the CONFIG id a patch row carries (its row-id prefix
        // stripped), so a fresh `tone` cannot shadow a patch row
        // `prompt-section-tone` whose config id is also `tone`.
        for (const prefix of ["prompt-section-", "prompt-profile-"]) {
          if (id.startsWith(prefix)) taken.add(id.slice(prefix.length));
        }
      }
    } catch {
      // patch unreadable: insertRow's own duplicate guard still protects us
    }
    return taken;
  };

  const table = [
    {
      path: "/state", method: "GET",
      run: () => stateResponse(deps),
    },
    {
      path: "/preview", method: "GET",
      run: (body, query) => {
        const profileId = query.get("profileId");
        if (typeof profileId !== "string" || profileId === "") {
          throw new ApiError(400, 'preview: query parameter "profileId" is required');
        }
        return previewResponse(deps, profileId);
      },
    },
    {
      path: "/section/create", method: "POST",
      run: (body) => {
        const payload = validate("section/create", body, { sectionIds: sectionIds() });
        const id = payload.id ?? generateId("section", payload.title, takenIds("section"));
        const row = { id: rowId("section", id), name: SECTION_NAME, config: { id, title: payload.title, body: payload.body } };
        return insertRow({ patchPath: configEditor.documentPath, row })
          .catch(mapDuplicate)
          .then(() => ({
            rowId: row.id,
            patchId: row.id,
            configId: id,
            title: payload.title,
            body: payload.body,
            emits: payload.body.trim() !== "",
          }));
      },
    },
    {
      path: "/section/update", method: "POST",
      run: async (body) => {
        const payload = validate("section/update", body, { sectionIds: sectionIds() });
        const { row, patchId } = resolveRow("section", payload.rowId);
        await settingsWrite("replace", patchId, { id: row.id, title: payload.value.title, body: payload.value.body }, payload.revision);
        return { rowId: row.rowId, patchId, emits: payload.value.body.trim() !== "" };
      },
    },
    {
      path: "/section/delete", method: "POST",
      run: async (body) => {
        const payload = validate("section/delete", body);
        const { patchId } = resolveRow("section", payload.rowId);
        return deleteRow(deps, patchId, SECTION_NAME);
      },
    },
    {
      path: "/section/rename", method: "POST",
      run: (body) => {
        const payload = validate("section/rename", body);
        return renameSection(deps, payload);
      },
    },
    {
      path: "/profile/create", method: "POST",
      run: (body) => {
        const payload = validate("profile/create", body, { sectionIds: sectionIds() });
        const id = payload.id ?? generateId("profile", payload.title, takenIds("profile"));
        const row = { id: rowId("profile", id), name: PROFILE_NAME, config: { id, title: payload.title, sections: payload.sections } };
        return insertRow({ patchPath: configEditor.documentPath, row })
          .catch(mapDuplicate)
          .then(() => ({
            rowId: row.id,
            patchId: row.id,
            configId: id,
            title: payload.title,
            sections: payload.sections,
          }));
      },
    },
    {
      path: "/profile/update", method: "POST",
      run: async (body) => {
        const payload = validate("profile/update", body, { sectionIds: sectionIds() });
        const { row, patchId } = resolveRow("profile", payload.rowId);
        await settingsWrite("replace", patchId, { id: row.id, title: payload.value.title, sections: payload.value.sections }, payload.revision);
        return { rowId: row.rowId, patchId };
      },
    },
    {
      path: "/profile/delete", method: "POST",
      run: async (body) => {
        const payload = validate("profile/delete", body);
        const { patchId } = resolveRow("profile", payload.rowId);
        return deleteRow(deps, patchId, PROFILE_NAME);
      },
    },
    {
      path: "/default", method: "POST",
      run: async (body) => {
        const payload = validate("default", body);
        if (payload.default !== "" && !service.profiles().some((row) => row.id === payload.default)) {
          throw new ApiError(404, `profile "${payload.default}" is not registered`);
        }
        await settingsWrite("mutate", "prompt-profiles", [{ op: "set", path: ["default"], value: payload.default }], body.revision);
      },
    },
    {
      path: "/last", method: "POST",
      run: async (body) => {
        const payload = validate("last", body);
        if (payload.profileId !== "" && !service.profiles().some((row) => row.id === payload.profileId)) {
          throw new ApiError(404, `profile "${payload.profileId}" is not registered`);
        }
        const lastByWorkspace = { ...service.config.lastByWorkspace.get() };
        // Explicit "none" is STORED as an own-property empty string (astra
        // finding E): the resolver treats it as a decision that beats the
        // default; deleting the key would silently fall back to `default`.
        lastByWorkspace[payload.workspaceId] = payload.profileId;
        await settingsWrite("mutate", "prompt-profiles", [{ op: "set", path: ["lastByWorkspace"], value: lastByWorkspace }], payload.revision);
      },
    },
  ];
  const log = deps.log ?? {};
  return table.map(({ path, method, run }) => ({
    path,
    method,
    handler: async (request, response) => {
      const answer = (status, payload) => {
        response.statusCode = status;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(payload));
      };
      // Live bug A diagnostics: capture the row id AS RECEIVED so the catch
      // block can log it next to its normalized form.
      let receivedRowId = null;
      try {
        if (request.method !== method) {
          response.setHeader("allow", method);
          throw new ApiError(405, `${method} ${path}: method not allowed`);
        }
        const query = new URL(request.url ?? "/", "http://prompt-profiles.local").searchParams;
        const body = method === "GET" ? {} : await readJsonBody(request);
        if (typeof body?.rowId === "string") receivedRowId = body.rowId;
        const result = await run(body, query);
        answer(200, result === undefined ? { ok: true } : { ok: true, ...result });
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 500;
        // REAL host logging (live bug: 500s were silent): every route
        // failure is logged with the route, the rowId as received, the
        // normalized patchId, and the underlying error message.
        const details = {
          route: `${request.method} ${path}`,
          rowId: receivedRowId,
          patchId: receivedRowId == null ? null : toPatchId(receivedRowId),
          error: error?.message ?? String(error),
        };
        const sink = status >= 500
          ? (log.error ?? log.warn ?? deps.warn)
          : (log.warn ?? deps.warn);
        sink?.("prompt-profiles api: request failed", details);
        if (error instanceof ApiError) {
          answer(status, { error: { message: error.message } });
          return;
        }
        answer(500, { error: { message: "internal error" } });
      }
    },
  }));
}
// #endregion FUNC_createRoutes

// #region FUNC_registerApi
/**
 * Register the SPEC §5.5 routes (plus preview) on the host webServer.
 *
 * @purpose Give the web client its CRUD surface; called from
 *   `ctx.inject(['webServer', 'settings', 'configEditor'], …)` so on surfaces
 *   without a webServer the callback never fires and the bundle (whose
 *   sealing core does not depend on the API) keeps working silently.
 *   `agentPresets` is read opportunistically (guarded property access), so
 *   its absence only empties `modes`.
 * @param {object} ctx - context carrying webServer/settings/configEditor
 *   (and, when present, ctx.logger — the host logger used for route
 *   failures; console is the last-resort sink so a failure is NEVER silent).
 * @param {object} options
 * @param {object} options.service - the ctx.promptProfiles service instance.
 * @param {(message: string, details?: unknown) => void} [options.warn]
 *   warning sink for unexpected handler failures.
 * @param {{ warn?: Function, error?: Function }} [options.log]
 *   structured logger override (tests); defaults to ctx.logger → console.
 * @returns {() => void} disposer removing every route.
 */
export function registerApi(ctx, { service, warn, log }) {
  let agentPresets;
  try {
    agentPresets = ctx.agentPresets;
  } catch {
    agentPresets = undefined; // service absent: modes degrade to []
  }
  let logger;
  try {
    logger = ctx.logger;
  } catch {
    logger = undefined;
  }
  const sinks = log ?? {
    warn: (message, details) => (logger?.warn ?? console.warn)(message, details ?? ""),
    error: (message, details) => (logger?.error ?? logger?.warn ?? console.error)(message, details ?? ""),
  };
  const routes = createRoutes({
    service,
    settings: ctx.settings,
    configEditor: ctx.configEditor,
    agentPresets,
    warn: warn ?? ((message, details) => sinks.warn(message, details)),
    log: sinks,
  });
  const disposers = routes.map((route) =>
    ctx.webServer.register({ kind: "exact", path: `/__dsh-prompt-profiles${route.path}`, handler: route.handler }),
  );
  return () => disposers.forEach((dispose) => dispose());
}
// #endregion FUNC_registerApi
