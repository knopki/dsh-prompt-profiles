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
 *    profile create/update/delete, default, last) with allowlist validation.
 *  - Writes to EXISTING rows go through ctx.settings.mutate with an optional
 *    expectedRevision; creation/removal/disable go through the writer
 *    (lib/writer.js); rename is the documented batch with rollback.
 *  - EVERY mutating path (writer ops and settings.mutate) runs inside the
 *    bundle's one in-process serializer (`withWriteLock`), preventing
 *    same-process lost updates between our own writes.
 *  - NOT: the sealing core — the plugin works on non-web surfaces without
 *    these routes (registration silently skipped when webServer is absent).
 * @invariants
 *  - Every request body is validated BEFORE any write happens, against an
 *    allowlist of paths and value types per row kind (section: title/body;
 *    profile: title/sections with existing section ids, numeric order, scope
 *    enum); violations return a clean `{ error: { message } }` object.
 *  - A section body may be empty/whitespace (SPEC §7: such a section is
 *    simply not emitted); responses mark it `emits: false`.
 *  - Route handlers never let an exception escape to the socket: errors map
 *    to a JSON error response (400 validation/duplicate id, 404 unknown
 *    row/profile, 405 method, 409 revision conflict or rename refused when a
 *    referencing profile cannot be named safely, 413 too large, 500
 *    unexpected).
 *  - RESIDUAL CONCURRENCY WINDOW (documented, see writer.js): other plugins'
 *    direct configEditor writes when dsh-hmr is absent, and any second DSH
 *    process, are not serialized with these routes.
 * @dependencies
 *  - USES API: ctx.webServer.register (exact routes), ctx.settings.mutate /
 *    describe, ctx.configEditor.documentPath, ctx.agentPresets.list /
 *    readDocument (optional, SPEC decision 21), ctx.promptProfiles views,
 *    lib/writer.js.
 * @rationale
 *  - Q: Why raw node:http handlers instead of a router framework?
 *    A: The webServer service owns dispatch and registers plain
 *    (req, res) handlers; adding a framework would fight the host.
 *  - Q: Why an allowlist for update ops instead of forwarding them?
 *    A: settings.mutate is schema-checked but answers schema failures with
 *    a 500-worthy throw; validating paths/types here keeps the contract
 *    "bad input ⇒ 400, file untouched" (verify-step4-sol).
 * @keywords api, routes, webServer, settings.mutate, validation, CRUD,
 *   modes, complete, preview
 * #endregion moduleContract
 */

import { parse } from "yaml";
import { insertRow, removeRow, disableRow, provenance, withWriteLock, renameSectionRow } from "./writer.js";

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

// #region FUNC_validateOpValue
/**
 * Allowlist one update op's path and value against the row kind's editable
 * surface (SPEC §4): section — title (non-empty) / body (any string, may be
 * empty per SPEC §7); profile — title (non-empty) / sections (array of
 * {id, order, scope} with ids that exist among registered sections).
 *
 * @purpose Keep `set ['id']`, non-numeric orders, and unknown fields from
 *   reaching settings as 500s or silent writes (verify-step4-sol defect 3).
 */
function validateOpValue(kind, op, deps) {
  const label = `${kind}: op ${op.op} [${op.path.join(".")}]`;
  const path = op.path.join(".");
  if (op.op === "unset") {
    throw new ApiError(400, `${label}: unset is not allowed (id is not volatile; empty body is legal)`);
  }
  if (kind === "section/update") {
    if (path === "title" || path === "body") {
      if (typeof op.value !== "string") throw new ApiError(400, `${label}: value must be a string`);
      if (path === "title" && op.value.trim() === "") throw new ApiError(400, `${label}: title must be non-empty`);
      return;
    }
    throw new ApiError(400, `${label}: sections only allow "title" and "body"`);
  }
  if (kind === "profile/update") {
    if (path === "title") {
      if (typeof op.value !== "string" || op.value.trim() === "") throw new ApiError(400, `${label}: title must be a non-empty string`);
      return;
    }
    if (path === "sections") {
      if (!Array.isArray(op.value)) throw new ApiError(400, `${label}: value must be an array`);
      op.value.forEach((ref, index) => {
        if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
          throw new ApiError(400, `${label}: sections[${index}] must be an object`);
        }
        if (typeof ref.id !== "string" || !deps.sectionIds.has(ref.id)) {
          throw new ApiError(400, `${label}: sections[${index}].id "${ref.id}" is not a registered section`);
        }
        if (!Number.isFinite(ref.order)) throw new ApiError(400, `${label}: sections[${index}].order must be a number`);
        if (ref.scope != null && !SCOPES.includes(ref.scope)) {
          throw new ApiError(400, `${label}: sections[${index}].scope must be one of ${SCOPES.join(", ")}`);
        }
      });
      return;
    }
    throw new ApiError(400, `${label}: profiles only allow "title" and "sections"`);
  }
}
// #endregion FUNC_validateOpValue

// #region FUNC_validate
/**
 * @purpose Reject malformed request payloads before anything is written
 *   (PLAN step 4: «попытка испортить входные данные — отказ без записи»),
 *   including an allowlist of update-op paths and value types per row kind
 *   (verify-step4-sol defect 3).
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
  const sectionRef = (ref, index) => {
    if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
      throw new ApiError(400, `${kind}: sections[${index}] must be an object`);
    }
    if (typeof ref.id !== "string" || !ID_PATTERN.test(ref.id)) {
      throw new ApiError(400, `${kind}: sections[${index}].id must match ${ID_PATTERN}`);
    }
    if (!Number.isFinite(ref.order)) throw new ApiError(400, `${kind}: sections[${index}].order must be a number`);
    if (ref.scope != null && !SCOPES.includes(ref.scope)) {
      throw new ApiError(400, `${kind}: sections[${index}].scope must be one of ${SCOPES.join(", ")}`);
    }
    return { id: ref.id, order: ref.order, ...(ref.scope != null ? { scope: ref.scope } : {}) };
  };
  const sectionsValue = (value, label = "sections") => {
    if (!Array.isArray(value)) throw new ApiError(400, `${kind}: ${label} must be an array`);
    return value.map(sectionRef);
  };
  switch (kind) {
    case "section/create":
      // SPEC §7: empty/whitespace body is allowed — the section simply does
      // not emit; the response carries `emits: false`.
      return { id: slug("id"), title: str("title"), body: str("body", { allowEmpty: true }) };
    case "section/update":
    case "profile/update": {
      const rowIdValue = str("rowId");
      const ops = body.ops;
      if (!Array.isArray(ops) || ops.length === 0) throw new ApiError(400, `${kind}: "ops" must be a non-empty array`);
      for (const op of ops) {
        if (op?.op !== "set" && op?.op !== "unset") throw new ApiError(400, `${kind}: op.op must be "set" or "unset"`);
        if (!Array.isArray(op.path) || op.path.some((part) => typeof part !== "string")) {
          throw new ApiError(400, `${kind}: op.path must be an array of strings`);
        }
        validateOpValue(kind, op, deps);
      }
      return { rowId: rowIdValue, ops, revision: revision() };
    }
    case "section/rename":
      return { rowId: str("rowId"), id: slug("id") };
    case "profile/create": {
      const sections = body.sections === undefined ? [] : body.sections;
      return { id: slug("id"), title: str("title"), sections: sectionsValue(sections) };
    }
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
 * @purpose Assemble the GET /state document (SPEC §5.5): profiles, sections
 *   with source, usedIn and an `emits` flag (SPEC §7 empty-body rule),
 *   builtinOrders, default, lastByWorkspace, the current settings revision,
 *   and `modes` with complete-mode warnings for the editor.
 */
async function stateResponse(deps) {
  const { service, settings, agentPresets, warn } = deps;
  const revision = settings.describe().find((descriptor) => descriptor.ns === "prompt-profiles")?.revision ?? 0;
  return {
    profiles: service.profiles(),
    sections: service.sections().map((section) => ({
      ...section,
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
 *   configuration() which cannot prove layer ownership.
 */
async function deleteRow(deps, rowIdValue, name) {
  const patchPath = deps.configEditor.documentPath;
  const ownership = provenance({ patchPath, rowId: rowIdValue });
  if (ownership.source === "user") {
    const removed = await removeRow({ patchPath, rowId: rowIdValue });
    if (!removed) throw new ApiError(404, `row "${rowIdValue}" not found in the profile patch`);
    return { disabled: false };
  }
  await disableRow({ patchPath, rowId: rowIdValue, name });
  return { disabled: true };
}
// #endregion FUNC_deleteRow

// #region FUNC_renameSection
/**
 * @purpose Execute the rename batch (SPEC §2 #16) as ONE writer commit
 *   (astra finding C): guard the new config.id, then insert the new row,
 *   rewrite the section references of every referencing profile, and remove
 *   or disable the old row — a single read-modify-write held inside one
 *   exclusivity gate. settings.mutate is deliberately NOT used inside the
 *   batch: hmr transactions cannot be nested and the shared write mutex is
 *   not reentrant, so profile references are upserted directly in the patch
 *   document with the same wholesale-array semantics.
 */
async function renameSection(deps, { rowId: oldRowId, id: newId }) {
  const { service, configEditor } = deps;
  const section = service.sections().find((row) => row.rowId === oldRowId);
  if (!section) throw new ApiError(404, `section row "${oldRowId}" is not registered`);
  if (newId === section.id) return { rowId: oldRowId, id: newId }; // no-op rename
  if (service.sections().some((row) => row.id === newId && row.rowId !== oldRowId)) {
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
    entries?.find((entry) => entry?.options?.id === rowIdValue)?.options?.name ?? null;
  const rewrite = (profile) =>
    profile.sections.map((ref) => (ref.id === section.id ? { ...ref, id: newId } : ref));
  const referencing = service.profiles()
    .filter((profile) => profile.sections.some((ref) => ref.id === section.id));
  let profileUpdates;
  try {
    profileUpdates = referencing.map((profile) => {
      const name = nameOf(profile.rowId);
      if (name != null) return { rowId: profile.rowId, name, sections: rewrite(profile) };
      if (provenance({ patchPath, rowId: profile.rowId }).inserted) {
        // insert row in this patch: config is updated in place, name unused
        return { rowId: profile.rowId, name: PROFILE_NAME, sections: rewrite(profile) };
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
  return { rowId: rowId("section", newId), id: newId };
}
// #endregion FUNC_renameSection

// #region FUNC_createRoutes
/**
 * Build the route table (SPEC §5.5 + preview). Each handler validates,
 * performs at most one logical write path, and answers `{ ok: true, ... }`.
 *
 * @purpose Keep route wiring declarative so registration and tests share one
 *   table.
 * @param {object} deps - { service, settings, configEditor, agentPresets?, warn? }.
 * @returns {Array<{ path: string, method: string,
 *   run: (body: object, query: URLSearchParams) => any }>}
 */
function createRoutes(deps) {
  const { service, settings, configEditor } = deps;
  const sectionIds = () => new Set(service.sections().map((row) => row.id));
  /**
   * settings.mutate wrapped in the bundle's shared write serializer so API
   * updates never interleave with writer operations in this process
   * (verify-step4-sol defect 1). settings takes its own hmr/file locks.
   */
  const mutateWithRevision = async (ns, ops, revision) => {
    try {
      await withWriteLock(() => settings.mutate(ns, ops, typeof revision === "number" ? revision : undefined));
    } catch (error) {
      if (error?.code === "SETTINGS_CONFLICT") throw new ApiError(409, `configuration changed since read (expected revision ${revision})`);
      throw error;
    }
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
        const payload = validate("section/create", body);
        return insertRow({ patchPath: configEditor.documentPath, row: {
          id: rowId("section", payload.id), name: SECTION_NAME,
          config: { id: payload.id, title: payload.title, body: payload.body },
        } }).catch(mapDuplicate).then(() => ({
          rowId: rowId("section", payload.id),
          emits: payload.body.trim() !== "",
        }));
      },
    },
    {
      path: "/section/update", method: "POST",
      run: async (body) => {
        const payload = validate("section/update", body, { sectionIds: sectionIds() });
        if (!service.sections().some((row) => row.rowId === payload.rowId)) {
          throw new ApiError(404, `section row "${payload.rowId}" is not registered`);
        }
        await mutateWithRevision(payload.rowId, payload.ops, payload.revision);
        const bodyOp = payload.ops.find((op) => op.op === "set" && op.path.join(".") === "body");
        return bodyOp === undefined ? {} : { emits: String(bodyOp.value).trim() !== "" };
      },
    },
    {
      path: "/section/delete", method: "POST",
      run: async (body) => {
        const payload = validate("section/delete", body);
        if (!service.sections().some((row) => row.rowId === payload.rowId)) {
          throw new ApiError(404, `section row "${payload.rowId}" is not registered`);
        }
        return deleteRow(deps, payload.rowId, SECTION_NAME);
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
        return insertRow({ patchPath: configEditor.documentPath, row: {
          id: rowId("profile", payload.id), name: PROFILE_NAME,
          config: { id: payload.id, title: payload.title, sections: payload.sections },
        } }).catch(mapDuplicate).then(() => ({ rowId: rowId("profile", payload.id) }));
      },
    },
    {
      path: "/profile/update", method: "POST",
      run: async (body) => {
        const payload = validate("profile/update", body, { sectionIds: sectionIds() });
        if (!service.profiles().some((row) => row.rowId === payload.rowId)) {
          throw new ApiError(404, `profile row "${payload.rowId}" is not registered`);
        }
        await mutateWithRevision(payload.rowId, payload.ops, payload.revision);
      },
    },
    {
      path: "/profile/delete", method: "POST",
      run: async (body) => {
        const payload = validate("profile/delete", body);
        if (!service.profiles().some((row) => row.rowId === payload.rowId)) {
          throw new ApiError(404, `profile row "${payload.rowId}" is not registered`);
        }
        return deleteRow(deps, payload.rowId, PROFILE_NAME);
      },
    },
    {
      path: "/default", method: "POST",
      run: async (body) => {
        const payload = validate("default", body);
        if (payload.default !== "" && !service.profiles().some((row) => row.id === payload.default)) {
          throw new ApiError(404, `profile "${payload.default}" is not registered`);
        }
        await mutateWithRevision("prompt-profiles", [{ op: "set", path: ["default"], value: payload.default }], body.revision);
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
        await mutateWithRevision("prompt-profiles", [{ op: "set", path: ["lastByWorkspace"], value: lastByWorkspace }], payload.revision);
      },
    },
  ];
  return table.map(({ path, method, run }) => ({
    path,
    method,
    handler: async (request, response) => {
      const answer = (status, payload) => {
        response.statusCode = status;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(payload));
      };
      try {
        if (request.method !== method) {
          response.setHeader("allow", method);
          throw new ApiError(405, `${method} ${path}: method not allowed`);
        }
        const query = new URL(request.url ?? "/", "http://prompt-profiles.local").searchParams;
        const body = method === "GET" ? {} : await readJsonBody(request);
        const result = await run(body, query);
        answer(200, result === undefined ? { ok: true } : { ok: true, ...result });
      } catch (error) {
        if (error instanceof ApiError) {
          answer(error.status, { error: { message: error.message } });
          return;
        }
        deps.warn?.("prompt-profiles api: request failed", { path, error: error?.message ?? String(error) });
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
 * @param {object} ctx - context carrying webServer/settings/configEditor.
 * @param {object} options
 * @param {object} options.service - the ctx.promptProfiles service instance.
 * @param {(message: string, details?: unknown) => void} [options.warn]
 *   warning sink for unexpected handler failures.
 * @returns {() => void} disposer removing every route.
 */
export function registerApi(ctx, { service, warn }) {
  let agentPresets;
  try {
    agentPresets = ctx.agentPresets;
  } catch {
    agentPresets = undefined; // service absent: modes degrade to []
  }
  const routes = createRoutes({
    service,
    settings: ctx.settings,
    configEditor: ctx.configEditor,
    agentPresets,
    warn: warn ?? ((message, details) => ctx.logger?.warn?.(message, details ?? "")),
  });
  const disposers = routes.map((route) =>
    ctx.webServer.register({ kind: "exact", path: `/__dsh-prompt-profiles${route.path}`, handler: route.handler }),
  );
  return () => disposers.forEach((dispose) => dispose());
}
// #endregion FUNC_registerApi
