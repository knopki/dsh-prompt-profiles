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
 *    rollback and touches the SECTION ONLY — it never rewrites profile
 *    references, returning `affectedProfiles` for the user to fix by hand.
 *    Every row-addressing route accepts EITHER the fully qualified
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
 *  - FROZEN ID SCHEME: on create and rename, `config.id` === the full row id
 *    (`prompt-<kind>-<token>`) === the response `configId`; callers may still
 *    send a bare token, the full form, or a qualified `include:` form.
 *    Existing rows with old bare config ids are never rewritten; every lookup
 *    keeps accepting both forms.
 *  - `/last` takes `{workspaceId?, cwd?, profileId}` and stores the choice
 *    under the SAME key the assembler reads (resolveWorkspaceKey: registry
 *    membership → async resolveByPath(cwd) id → raw cwd → workspaceId), so a
 *    chip choice always reaches the prompt; `profileId: ""` still means an
 *    explicit "none" and an unknown profile id is a 404.
 *  - Route handlers never let an exception escape to the socket: errors map
 *    to a JSON error response (400 validation/duplicate id/non-volatile
 *    write, 404 unknown row, 405 method, 409 revision conflict or unsafe
 *    rename, 413 too large, 500 unexpected) and EVERY failure is logged with
 *    the route, the rowId as received, the normalized patchId, and the
 *    underlying error message. The catch path itself is guarded: a broken
 *    logger or an already-dead socket can never turn a clean error envelope
 *    into the host dispatcher's empty 400.
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

import { randomUUID } from "node:crypto";
import { parse } from "yaml";
import { insertRow, removeRow, disableRow, provenance, withWriteLock, renameSectionRow, listRowIds, toPatchId } from "./writer.js";
import { resolveWorkspaceKey, sectionSkipReason, planInsertion } from "./resolve.js";

// #region CONST_identity
/** Plugin names of the row kinds this API manages (SPEC §3). */
const SECTION_NAME = "@knopki/dsh-prompt-profiles/section";
const PROFILE_NAME = "@knopki/dsh-prompt-profiles/profile";
/**
 * Id scheme: a created row's `config.id` IS its full row id
 * (`prompt-<kind>-<token>`, prefix included, built by normalizeNewRowId);
 * old rows keep their bare slug/token `config.id`s and are never migrated.
 * ID_PATTERN is the rule for the TOKEN part only.
 */
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

// #region FUNC_errorText
/**
 * Extract a NON-EMPTY human-readable message from any thrown value —
 * Error (even with an empty .message), string, plain object, null/undefined.
 *
 * @purpose Live bug: the empty-400 round showed failure diagnostics
 *   collapsing when a thrown value had no `.message`; every response body
 *   and every log line now carries a readable message by construction.
 * @param {unknown} error - whatever was thrown.
 * @returns {string} non-empty message.
 */
function errorText(error) {
  if (error instanceof Error) {
    if (typeof error.message === "string" && error.message !== "") return error.message;
    return error.name || "Error"; // e.g. `new Error("")` still names itself
  }
  if (typeof error === "string") return error === "" ? "unknown error" : error;
  if (typeof error === "object" && error !== null && typeof error.message === "string" && error.message !== "") {
    return error.message; // Error-like plain object
  }
  try {
    const text = String(error);
    if (text !== "") return text;
  } catch {
    // exotic toString: fall through
  }
  return "unknown error";
}
// #endregion FUNC_errorText

// #region FUNC_findRow
/**
 * Shared registry-row lookup for every route that addresses an existing row.
 *
 * @purpose ONE place implementing the id-matching rule, so rename, update,
 *   delete (and any future route) can never diverge — the live bug was
 *   exactly such a divergence: the registry stored the QUALIFIED loader
 *   entry rowId (`include:prompt-section-f01aa4a5`, from
 *   `ctx.fiber.entry.id` in lib/section.js) while a route looked the row up
 *   by the unqualified patch id and missed with «is not registered».
 *
 * MATCHING ORDER (first hit wins):
 *  1. exact match on the registry `rowId`;
 *  2. normalized match: `toPatchId(value)` against `rowId` (qualified value
 *     → unqualified row) or `toPatchId(rowId)` against `value` (unqualified
 *     value → qualified row) — the direction that actually occurs live;
 *  3. the row's CONFIG id (`candidate.id`), exact or `toPatchId`-normalized,
 *     so callers may address a row by its domain id as well.
 *
 * CANONICAL ID: this helper only FINDS the row. The patch row id used for
 * settings/writer addresses is derived separately by `patchIdOf`, which
 * prefers the canonical id from `configEditor.entries()` and only falls back
 * to `toPatchId` when entries are unavailable.
 *
 * @param {Array<{ id: string, rowId: string }>} registryView - rows from
 *   service.sections() / service.profiles().
 * @param {string} value - row identifier as received (any of the three
 *   forms above).
 * @returns {object | null} the matching registry row view, or null.
 */
export function findRow(registryView, value) {
  if (typeof value !== "string" || value === "") return null;
  const normalized = toPatchId(value);
  return (registryView ?? []).find((candidate) =>
    candidate.rowId === value
    || candidate.rowId === normalized
    || toPatchId(candidate.rowId) === normalized
    || candidate.id === value
    || candidate.id === normalized,
  ) ?? null;
}
// #endregion FUNC_findRow

// #region FUNC_normalizeNewRowId
/**
 * Normalize the NEW id of a create/rename payload to the two canonical
 * forms under the frozen decision «config.id === full row id»: the stored
 * config id is the FULL `prompt-<kind>-<token>` string.
 *
 * Accepted inputs (all equivalent):
 *  - bare token:            `123123`
 *  - full row id:           `prompt-section-123123`
 *  - qualified loader form: `include:prompt-section-123123` (any `:` chain)
 *
 * @param {"section"|"profile"} kind - supplies the `prompt-<kind>-` prefix.
 * @param {string} value - id as received.
 * @returns {string} the FULL `prompt-<kind>-<token>` form, or null when the
 *   input is not a string or reduces to the bare prefix (pattern checks stay
 *   with the caller, which reports a clear 400).
 */
export function normalizeNewRowId(kind, value) {
  if (typeof value !== "string") return null;
  const bare = toPatchId(value);
  if (bare === "") return null;
  const prefix = `prompt-${kind}-`;
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}
// #endregion FUNC_normalizeNewRowId

// #region CONST_tokenSource
/**
 * Injectable source of short random create tokens (8 lowercase hex chars).
 * @purpose Let tests force collisions deterministically (`tokenSource.next`)
 *   without monkey-patching crypto; production always uses a crypto UUID.
 */
export const tokenSource = { next: () => randomUUID().replace(/-/g, "").slice(0, 8) };
// #endregion CONST_tokenSource

// #region FUNC_generateTokenId
/**
 * Generate a unique short random id for create routes: 8 lowercase hex chars
 * from a crypto UUID, returned in the FULL `prompt-<kind>-<token>` form that
 * is BOTH the row id and `config.id` (frozen id scheme). The token is
 * regenerated on collision with any full id in `taken` — an existing row id
 * or an existing `config.id` (SPEC §3/§5.5).
 *
 * @purpose The create id no longer derives from the title: slug ids read as
 *   two different ids (`prompt-section-new-section` vs `config.id:
 *   new-section`) and could collide with rows another bundle ships. A random
 *   token removes both problems; existing rows keep their slug-based ids.
 * @param {"section"|"profile"} kind
 * @param {Set<string>} taken - every FULL id string (row-id AND config-id
 *   forms) that must not be reused (see takenIds in createRoutes).
 * @returns {string} the full `prompt-<kind>-<token>` id, unique against
 *   `taken`.
 */
function generateTokenId(kind, taken) {
  let id = normalizeNewRowId(kind, tokenSource.next());
  while (id === null || taken.has(id)) id = normalizeNewRowId(kind, tokenSource.next());
  return id;
}
// #endregion FUNC_generateTokenId

// #region FUNC_validate
/**
 * @purpose Reject malformed request payloads before anything is written
 *   (PLAN step 4: «попытка испортить входные данные — отказ без записи»).
 *   Updates carry a WHOLE object `value`; there are no path ops anymore.
 * @param {string} kind - expected payload kind, for error messages.
 * @param {object} body - parsed JSON body.
 * @param {object} deps - registry views for cross-field checks
 *   (`sectionTargets: Map<string, string>` mapping every id a profile ref may
 *   use for a section — config.id, full row id, qualified form, bare token —
 *   to the registered config.id that must be stored).
 * @returns {object} validated payload.
 */
function validate(kind, body, deps = {}) {
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
  /**
   * Normalize a create/rename `id` to the FULL `prompt-<kind>-<token>` form
   * (frozen id scheme: the stored `config.id` IS the row id). Accepts a bare
   * token, the full row-id form, or a qualified `include:...` chain; the
   * TOKEN after the prefix must match ID_PATTERN.
   */
  const newId = (name) => {
    if (body.id === undefined) return null;
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
  /**
   * Resolve one `sections[].id` to the id STORED in the profile. A registered
   * section is addressed by its config.id (verbatim — old rows keep bare slug
   * ids), its full/qualified row id, or the bare token of a full
   * `prompt-section-<token>` config id; the stored ref is ALWAYS the
   * registered config.id, so runtime lookups (which key on config.id) hit.
   * CREATE may reference a section HMR has not registered yet: there the full
   * normalized form is stored after a shape check.
   */
  const sectionRefId = (raw, requireRegistered) => {
    if (typeof raw !== "string" || raw === "") return null;
    const targets = deps.sectionTargets ?? new Map();
    const direct = targets.get(raw) ?? targets.get(toPatchId(raw));
    if (direct !== undefined) return direct;
    const full = normalizeNewRowId("section", raw);
    if (full === null) return null;
    const registered = targets.get(full);
    if (registered !== undefined) return registered;
    if (requireRegistered) return null;
    const token = full.slice("prompt-section-".length);
    return token !== "" && ID_PATTERN.test(token) ? full : null;
  };
  const sectionRefs = (value, { requireRegistered = true } = {}) => {
    if (!Array.isArray(value)) throw new ApiError(400, `${kind}: sections must be an array`);
    return value.map((ref, index) => {
      if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
        throw new ApiError(400, `${kind}: sections[${index}] must be an object`);
      }
      // CREATE may reference a section created moments ago that HMR has not
      // registered yet — only the token shape is checked there; UPDATE demands
      // a currently registered section.
      const id = sectionRefId(ref.id, requireRegistered);
      if (id === null) {
        throw new ApiError(400, `${kind}: sections[${index}].id "${ref.id}" is not a registered section`);
      }
      if (!Number.isFinite(ref.order)) throw new ApiError(400, `${kind}: sections[${index}].order must be a number`);
      if (ref.scope != null && !SCOPES.includes(ref.scope)) {
        throw new ApiError(400, `${kind}: sections[${index}].scope must be one of ${SCOPES.join(", ")}`);
      }
      return { id, order: ref.order, ...(ref.scope != null ? { scope: ref.scope } : {}) };
    });
  };
  switch (kind) {
    case "section/create": {
      // Frozen contract: {title, body}; the server generates a short random
      // token id (an explicit id — bare, full, or qualified — is still
      // accepted for back-compat and stored in the FULL prefixed form).
      // SPEC §7: empty/whitespace body is allowed — the section simply does
      // not emit.
      const id = newId("section");
      const title = titleWithDefault("Section");
      if (body.body !== undefined && typeof body.body !== "string") {
        throw new ApiError(400, `${kind}: field "body" must be a string`);
      }
      return { id, title, body: body.body ?? "" };
    }
    case "profile/create": {
      const id = newId("profile");
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
      return { rowId: str("rowId"), id: newId("section") };
    case "section/delete":
      return { rowId: str("rowId") };
    case "profile/delete":
      // revision is used for the orphan-reference cleanup settings write.
      return { rowId: str("rowId"), revision: revision() };
    case "default": {
      // Only a profile-id string, '' (none), or null (clear) — never a
      // silently coerced missing field (verify-step4-sol defect 3).
      if (!("default" in body) || (body.default !== null && typeof body.default !== "string")) {
        throw new ApiError(400, 'default: field "default" must be a profile id string, "" for none, or null');
      }
      return { default: body.default ?? "" };
    }
    case "last": {
      // Contract with the client chip: {workspaceId?, cwd?, profileId}.
      // `cwd` is the fallback key so a blank session with no workspace id yet
      // still reaches the prompt (the assembler falls back to cwd too).
      if (body.workspaceId !== undefined && typeof body.workspaceId !== "string") {
        throw new ApiError(400, 'last: "workspaceId" must be a string when present');
      }
      if (body.cwd !== undefined && typeof body.cwd !== "string") {
        throw new ApiError(400, 'last: "cwd" must be a string when present');
      }
      const workspaceId = body.workspaceId ?? "";
      const cwd = body.cwd ?? "";
      if (workspaceId === "" && cwd === "") {
        throw new ApiError(400, 'last: "workspaceId" or "cwd" is required');
      }
      if (typeof body.profileId !== "string") throw new ApiError(400, "last: profileId must be a string (empty = none)");
      return { workspaceId, cwd, profileId: body.profileId, revision: revision() };
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
 * Build GET /preview?profileId=… : the MAIN-AGENT assembly as the prompt would
 * receive it — built-in sections as `{kind:"builtin", name, order}`
 * placeholders interleaved with our sections in final order, host-side
 * interpolation ({{cwd}} from process.cwd(); {{model}} is unknown host-side and
 * stays literal, reported in `variables`), and every skipped reference with its
 * reason (SPEC §2 #25, §6.2, §7).
 *
 * FIDELITY (gap-audit A1+A2): selection reuses `sectionSkipReason` — the SAME
 * predicate `buildSnapshot` applies at runtime — for the main agent
 * (`inherit` and `main-only` emit; `subagents-only` is skipped with a reason),
 * and the merged order reuses `planInsertion` on the mirror's built-ins, so the
 * Preview tab cannot disagree with what actually reaches the prompt.
 *
 * @purpose Give the editor an accurate preview without a live session; the
 *   sealed snapshot remains the runtime truth. Each section reports the order
 *   EXACTLY as the profile stores it — equal orders (with a built-in or a peer)
 *   are legal and never shifted; our section with an order equal to a built-in
 *   stands BEFORE it, exactly as at assembly time.
 * @returns {{ profileId: string, title: string, sections: Array<object>,
 *   skipped: Array<{ id: string, reason: string }>, variables: object }}
 */
function previewResponse(deps, profileId) {
  const { service } = deps;
  const profile = findRow(service.profiles(), profileId);
  if (!profile) throw new ApiError(404, `profile "${profileId}" is not registered`);
  const sectionsById = new Map(service.sections().map((row) => [row.id, row]));
  const builtinOrdersByName = service.builtinOrdersByName?.() ?? {};
  const variables = { cwd: process.cwd(), model: null };
  const interpolate = (text) => String(text)
    .replace(/\{\{cwd\}\}/g, variables.cwd)
    .replace(/\{\{model\}\}/g, "{{model}}"); // unknown host-side: kept literal
  // Profile order = insertion order (stable on equal orders), the same sort
  // planInsertion performs.
  const planned = [...profile.sections].sort((a, b) => a.order - b.order);
  const ours = [];
  const skipped = [];
  for (const ref of planned) {
    const section = sectionsById.get(ref.id);
    // Runtime selection rule (main agent): inherit + main-only emit,
    // subagents-only is skipped with a reason.
    const reason = sectionSkipReason(ref, section, { subagent: false, fork: false });
    if (reason !== null) { skipped.push({ id: ref.id, title: section?.title ?? ref.id, reason }); continue; }
    let text;
    try {
      text = interpolate(section.body);
    } catch (error) {
      skipped.push({ id: ref.id, title: section.title, reason: `interpolation failed: ${error?.message ?? String(error)}` });
      continue;
    }
    ours.push({
      id: section.id, title: section.title, order: ref.order, scope: ref.scope ?? "inherit",
      text, emits: true,
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
  return { profileId, title: profile.title, sections: merged, skipped, variables };
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
 *   (astra finding C): guard the new full row id, then insert the new row and
 *   remove or disable the old one — a single read-modify-write held inside one
 *   exclusivity gate. The incoming rowId may be qualified or not; every file
 *   address below uses the NORMALIZED patch row id. The new id arrives already
 *   normalized to the FULL `prompt-section-<token>` form, so it is BOTH the
 *   new row id and the new `config.id`.
 *
 * PROFILES ARE NEVER TOUCHED (frozen decision): a profile that came from a
 * bundle cannot have its refs rewritten anyway and the action is rare, so
 * rename reports `affectedProfiles` — every registered profile still naming
 * the OLD id — and the user fixes those references by hand.
 */
async function renameSection(deps, { rowId: received, id: newId }) {
  const { service, configEditor, resolve } = deps;
  const { row: section, patchId } = resolve("section", received);
  const oldRowId = patchId;
  // Every id that names THIS section: its config.id (a new-scheme row's is
  // already the full id; old rows keep bare slugs), its patch row id, and the
  // bare token of a full config.id. Used for the no-op check AND for the
  // affectedProfiles report.
  const aliases = new Set([section.id, toPatchId(section.rowId)]);
  if (typeof section.id === "string" && section.id.startsWith("prompt-section-")) {
    aliases.add(section.id.slice("prompt-section-".length));
  }
  const namesSection = (value) => aliases.has(value) || aliases.has(toPatchId(value));
  const affectedProfiles = service.profiles()
    .filter((profile) => profile.sections.some((ref) => namesSection(ref.id)))
    .map((profile) => ({ profileId: profile.id, title: profile.title }));
  // The normalized new id already naming THIS row means nothing would change;
  // it is reported as a collision (400) rather than a silent no-op, so a
  // repeated rename into the same id fails cleanly.
  if (namesSection(newId)) throw new ApiError(400, `section id "${newId}" is already taken`);
  // Uniqueness on FULL id strings: the new id must not duplicate another
  // registered section's config.id or row id. A duplicate row id already in
  // the patch surfaces from the writer's duplicate guard inside the batch
  // below (mapped to a clean 400 with the rollback already applied).
  const clash = service.sections().some((row) => row.rowId !== section.rowId
    && (row.id === newId || row.rowId === newId || toPatchId(row.rowId) === newId));
  if (clash) throw new ApiError(400, `section id "${newId}" is already taken`);
  const patchPath = configEditor.documentPath;
  // Only a row THIS patch inserted may be physically removed; a bare override
  // or a lower-layer row we can only override is disabled instead. Using
  // `.inserted` (not `.source === 'bundle'`) keeps this correct now that an
  // absent row reports 'unknown' rather than 'bundle'.
  const bundleOwned = !provenance({ patchPath, rowId: oldRowId }).inserted;
  try {
    await renameSectionRow({
      patchPath,
      row: { id: newId, name: SECTION_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId, oldName: SECTION_NAME, bundleOwned,
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

// #region FUNC_createRoutes
/**
 * Build the route table (SPEC §5.5 + preview + frozen live-bugfix contract).
 * Each handler validates, performs at most one logical write path, and
 * answers `{ ok: true, ... }`.
 *
 * @purpose Keep route wiring declarative so registration and tests share one
 *   table.
 * @param {object} deps - { service, settings, configEditor, workspaceRegistry?,
 *   agentPresets?, warn?, log? }.
 * @returns {Array<{ path: string, method: string,
 *   run: (body: object, query: URLSearchParams) => any }>}
 */
function createRoutes(deps) {
  const { service, settings, configEditor } = deps;
  const SECTION_PREFIX = "prompt-section-";

  /**
   * Map every id a profile may use to name a registered section to the
   * config.id that must be STORED for the ref to resolve at runtime (lookups
   * key on config.id): the config.id itself (old rows keep bare slug ids),
   * its normalized and qualified row-id forms, and the bare token of a full
   * `prompt-section-<token>` config id — plus the reverse mapping so an old
   * bare config id stays addressable by its full row-id form. Exact config
   * ids always win over convenience aliases.
   */
  const sectionTargets = () => {
    const targets = new Map();
    const alias = (key, value) => {
      if (typeof key === "string" && key !== "" && !targets.has(key)) targets.set(key, value);
    };
    for (const row of service.sections()) {
      const id = row.id;
      if (typeof id !== "string" || id === "") continue;
      targets.set(id, id); // exact config.id wins over any earlier alias
      const patch = toPatchId(row.rowId);
      alias(patch, id);
      alias(`include:${patch}`, id);
      if (id.startsWith(SECTION_PREFIX)) alias(id.slice(SECTION_PREFIX.length), id);
      else alias(`${SECTION_PREFIX}${id}`, id);
    }
    return targets;
  };

  /**
   * Registered config ids of `kind`. A NEW id must never duplicate one of
   * these; duplicate row ids already present in the patch are caught by the
   * writer's own duplicate guard on the FULL row id (an id matching only a
   * bundle row's id is an override, which the loader supports by design).
   */
  const takenConfigIds = (kind) =>
    new Set((kind === "section" ? service.sections() : service.profiles()).map((row) => row.id));

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
   * Resolve a row received in ANY of the accepted forms (qualified loader
   * entry rowId, unqualified patch row id, or the row's own config.id —
   * old-scheme rows keep bare config ids) via the one shared findRow matcher,
   * then derive the normalized patchId used for every settings/writer address.
   */
  const resolveRow = (kind, received) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    const row = findRow(rows, received);
    if (!row) throw new ApiError(404, `${kind} row "${received}" is not registered`);
    return { row, patchId: patchIdOf(row.rowId) };
  };
  deps.resolve = resolveRow;

  /**
   * settings.replace / settings.mutate wrapped in the bundle's shared write
   * serializer so API updates never interleave with writer operations in this
   * process (verify-step4-sol defect 1). settings takes its own hmr/file
   * locks. Revision conflicts map to a clean 409.
   *
   * LIVE BUG (empty 400 on update): dsh-settings `replace(ns, section)`
   * validates EVERY key of `section` against the row Config's volatile
   * fields (`validatePaths` → `isVolatilePath`); the section/profile row
   * Configs mark only `title`/`body`/`sections` volatile, so passing `id`
   * threw `Config field "id" is not volatile`. Updates therefore replace
   * ONLY the volatile fields — the row's `id` belongs to the inherited
   * insert layer and is never reset. Known settings-layer failures are
   * mapped to clean statuses with their REAL message (never a bare 500).
   */
  const settingsWrite = async (method, ns, value, revision) => {
    try {
      await withWriteLock(() =>
        method === "replace"
          ? settings.replace(ns, value, typeof revision === "number" ? revision : undefined)
          : settings.mutate(ns, value, typeof revision === "number" ? revision : undefined));
    } catch (error) {
      if (error?.code === "SETTINGS_CONFLICT") throw new ApiError(409, `configuration changed since read (expected revision ${revision})`);
      const message = errorText(error);
      if (/is not volatile/.test(message)) throw new ApiError(400, message);
      if (/No configurable plugin entry/.test(message)) throw new ApiError(404, message);
      throw error;
    }
  };

  // #region FUNC_clearProfileReferences
  /**
   * Orphan cleanup on profile delete: drop the profile's id from every
   * `lastByWorkspace` value and reset `default` to "" when it named the
   * deleted profile. Runs BEFORE the row deletion (same write lock), so the UI
   * can never observe a stored choice whose profile is already gone.
   * @param {{ id: string, rowId: string }} profile - the row being deleted.
   * @param {number|undefined} revision - settings revision from the request.
   * @returns {Promise<boolean>} whether anything was written.
   */
  const clearProfileReferences = async (profile, revision) => {
    const aliases = new Set([profile.id, profile.rowId, toPatchId(profile.rowId)].filter((value) => typeof value === "string" && value !== ""));
    const lastByWorkspace = { ...service.config.lastByWorkspace.get() };
    let lastChanged = false;
    for (const [key, value] of Object.entries(lastByWorkspace)) {
      if (aliases.has(value)) { delete lastByWorkspace[key]; lastChanged = true; }
    }
    const clearDefault = aliases.has(service.config.default.get());
    if (!lastChanged && !clearDefault) return false;
    const ops = [];
    if (lastChanged) ops.push({ op: "set", path: ["lastByWorkspace"], value: lastByWorkspace });
    if (clearDefault) ops.push({ op: "set", path: ["default"], value: "" });
    await settingsWrite("mutate", "prompt-profiles", ops, revision);
    return true;
  };
  // #endregion FUNC_clearProfileReferences

  // #region FUNC_pruneLastByWorkspace
  /**
   * Drop dead entries from `lastByWorkspace` before writing /last:
   *  - values that match no registered profile (except "" = explicit none);
   *  - keys shaped like a workspace UUID that the registry does not know.
   * cwd-shaped keys are ALWAYS kept — they may belong to a session whose
   * workspace is not registered yet. Without a workspaceRegistry there is no
   * way to prove a UUID stale, so such keys are kept.
   */
  const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pruneLastByWorkspace = (value) => {
    const profileIds = new Set(service.profiles().map((row) => row.id));
    const registry = deps.workspaceRegistry;
    const pruned = {};
    for (const [key, entry] of Object.entries(value ?? {})) {
      if (entry !== "" && !profileIds.has(entry)) continue; // dangling profile choice
      if (WORKSPACE_ID.test(key) && typeof registry?.get === "function") {
        let known = true;
        try {
          known = Boolean(registry.get(key));
        } catch {
          known = true; // unreadable registry: do not drop a possibly-live key
        }
        if (!known) continue; // stale workspace id
      }
      pruned[key] = entry;
    }
    return pruned;
  };
  // #endregion FUNC_pruneLastByWorkspace

  /**
   * Every FULL id string a NEW row of `kind` must not reuse: the row ids and
   * config ids of the registered rows (raw and `toPatchId`-normalized, so
   * both the qualified `include:` form and the unqualified patch id are
   * covered) plus every id present in the patch file. Generated ids are
   * always `prompt-<kind>-<token>`, so string equality on the full form is
   * what keeps a fresh id from duplicating an existing row id OR an existing
   * config.id.
   */
  const takenIds = (kind) => {
    const rows = kind === "section" ? service.sections() : service.profiles();
    const taken = new Set();
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
      for (const id of listRowIds({ patchPath: configEditor.documentPath })) add(id);
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
        const payload = validate("section/create", body, { sectionTargets: sectionTargets() });
        // An explicit id may never duplicate a registered section's config.id;
        // patch row-id duplicates fall to the writer's own duplicate guard.
        if (payload.id !== null && takenConfigIds("section").has(payload.id)) {
          throw new ApiError(400, `section id "${payload.id}" already exists`);
        }
        const id = payload.id ?? generateTokenId("section", takenIds("section"));
        // FROZEN ID SCHEME: the row id and the stored config.id are the SAME
        // full `prompt-section-<token>` string, so a profile ref (which is a
        // config.id) addresses the row exactly.
        const row = { id, name: SECTION_NAME, config: { id, title: payload.title, body: payload.body } };
        return insertRow({ patchPath: configEditor.documentPath, row })
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
    },
    {
      path: "/section/update", method: "POST",
      run: async (body) => {
        const payload = validate("section/update", body);
        const { row, patchId } = resolveRow("section", payload.rowId);
        // VOLATILE-ONLY whole-object write: `id` stays in the inherited insert
        // layer (settings would reject it — see settingsWrite docblock).
        await settingsWrite("replace", patchId, { title: payload.value.title, body: payload.value.body }, payload.revision);
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
        const payload = validate("profile/create", body, { sectionTargets: sectionTargets() });
        // An explicit id may never duplicate a registered profile's config.id;
        // patch row-id duplicates fall to the writer's own duplicate guard.
        if (payload.id !== null && takenConfigIds("profile").has(payload.id)) {
          throw new ApiError(400, `profile id "${payload.id}" already exists`);
        }
        const id = payload.id ?? generateTokenId("profile", takenIds("profile"));
        // FROZEN ID SCHEME: row id === stored config.id (full form).
        const row = { id, name: PROFILE_NAME, config: { id, title: payload.title, sections: payload.sections } };
        return insertRow({ patchPath: configEditor.documentPath, row })
          .catch(mapDuplicate)
          .then(() => ({
            rowId: row.id,
            patchId: row.id,
            configId: row.id,
            title: payload.title,
            sections: payload.sections,
          }));
      },
    },
    {
      path: "/profile/update", method: "POST",
      run: async (body) => {
        const payload = validate("profile/update", body, { sectionTargets: sectionTargets() });
        const { row, patchId } = resolveRow("profile", payload.rowId);
        // VOLATILE-ONLY whole-object write (see settingsWrite docblock): the
        // `sections` array replaces wholesale, `id` is inherited.
        await settingsWrite("replace", patchId, { title: payload.value.title, sections: payload.value.sections }, payload.revision);
        return { rowId: row.rowId, patchId };
      },
    },
    {
      path: "/profile/delete", method: "POST",
      run: async (body) => {
        const payload = validate("profile/delete", body);
        const { row, patchId } = resolveRow("profile", payload.rowId);
        // Orphan cleanup BEFORE the row goes: clear lastByWorkspace values and
        // `default` when they pointed at this profile (same write lock).
        await clearProfileReferences(row, payload.revision);
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
        // Store under the SAME key the assembler will read: the workspace
        // registry's id for cwd when resolvable, else the raw cwd, else the
        // explicit workspace id (see resolveWorkspaceKey). The old code keyed
        // by the client's workspaceId only, so a cwd-keyed assembler never
        // found the choice.
        const workspaceKey = await resolveWorkspaceKey({
          workspaceRegistry: deps.workspaceRegistry,
          workspaceId: payload.workspaceId,
          cwd: payload.cwd,
        });
        const lastByWorkspace = pruneLastByWorkspace(service.config.lastByWorkspace.get());
        // Explicit "none" is STORED as an own-property empty string (astra
        // finding E): the resolver treats it as a decision that beats the
        // default; deleting the key would silently fall back to `default`.
        lastByWorkspace[workspaceKey] = payload.profileId;
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
        // BULLETPROOF failure path (live bug: updates failed with an EMPTY
        // 400 body and no visible log — the host webServer dispatcher answers
        // `res.writeHead(400); res.end()` whenever a route handler promise
        // REJECTS, so nothing may ever escape this catch). Logging and the
        // response are each independently guarded; the response ALWAYS ends
        // with `{ error: { message } }` and a non-empty message.
        const status = error instanceof ApiError ? error.status : 500;
        const message = errorText(error);
        // REAL host logging: every route failure is logged with the route,
        // the rowId as received, the normalized patchId, and the message —
        // wrapped so a broken sink can never break the response.
        const details = {
          route: `${request.method} ${path}`,
          rowId: receivedRowId,
          patchId: receivedRowId == null ? null : toPatchId(receivedRowId),
          error: message,
        };
        try {
          const sink = status >= 500
            ? (log.error ?? log.warn ?? deps.warn)
            : (log.warn ?? deps.warn);
          sink?.("prompt-profiles api: request failed", details);
        } catch {
          // logging must never take the response down with it
        }
        const payload = { error: { message: status === 500 ? `internal error: ${message}` : message } };
        try {
          answer(status, payload);
        } catch {
          try {
            response.statusCode = status;
            response.end(JSON.stringify(payload));
          } catch {
            // socket already gone: nothing left to do
          }
        }
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
  // Optional services read WITHOUT the inject requirement (cordis REFLECT):
  // workspaceRegistry lets /last derive the same workspace key the assembler
  // reads; absence only disables that resolution (cwd/workspaceId still work).
  let workspaceRegistry;
  try {
    workspaceRegistry = ctx.get?.("workspaceRegistry") ?? undefined;
  } catch {
    workspaceRegistry = undefined;
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
    workspaceRegistry,
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
