// @ts-nocheck
// TODO(phase 1): remove after typing
/**
 * Prompt-profile use cases (SPEC §5.5), transport-neutral.
 * #region moduleContract
 * @modulecontract
 * @purpose Own the operation logic — validation, registry lookups, writer and
 *   settings mutations — so every surface built on this bundle executes ONE
 *   implementation and cannot drift apart.
 * @scope
 *  - The eleven operations (state, preview, section create/update/delete/
 *    rename, profile create/update/delete, default, last) with whole-object
 *    validation and the frozen id scheme.
 *  - Writes to EXISTING rows replace the WHOLE config via
 *    ctx.settings.replace(ns, value, revision); creation/removal/disable go
 *    through the writer; rename is the documented batch with rollback and
 *    touches the SECTION ONLY, returning `affectedProfiles` for the user to
 *    fix by hand.
 *  - Every row-addressing operation accepts EITHER the fully qualified loader
 *    entry rowId (`include:prompt-section-1`) OR the unqualified patch row id
 *    (`prompt-section-1`) — toPatchId normalizes internally.
 *  - EVERY mutating path runs inside the bundle's one in-process serializer
 *    (`withWriteLock`), preventing same-process lost updates.
 *  - NOT: transport concerns. Descriptors, codecs and wire envelopes live
 *    with the surface that owns them; this module only throws ApiError with
 *    the documented status semantics (400/404/409/503/500).
 * @invariants
 *  - Every payload is validated BEFORE any write happens: section value
 *    {title non-empty, body string}; profile value {title non-empty,
 *    sections array of {id ∈ registered sections, order finite, scope enum}};
 *    violations throw a clean ApiError 400 and never touch the file
 *    (byte-identical).
 *  - A section body may be empty/whitespace (SPEC §7); state marks it
 *    `emits: false`.
 *  - FROZEN ID SCHEME: on create and rename, `config.id` === the full row id
 *    (`prompt-<kind>-<token>`) === the returned `configId`; callers may still
 *    send a bare token, the full form, or a qualified `include:` form.
 *    Existing rows with old bare config ids are never rewritten.
 *  - `last` stores the choice under the SAME key the assembler reads
 *    (resolveWorkspaceKeys), so a chip choice always reaches the prompt;
 *    `profileId: ""` still means an explicit "none" and an unknown profile id
 *    is a 404.
 *  - Results are plain JSON-safe objects (no class instances, no functions):
 *    surfaces serialize them verbatim.
 *  - RESIDUAL CONCURRENCY WINDOW (documented, see writer.js): other plugins'
 *    direct configEditor writes when dsh-hmr is absent, and any second DSH
 *    process, are not serialized with these operations.
 * @dependencies
 *  - USES API: ctx.settings.replace / mutate / describe, ctx.configEditor.
 *    documentPath / entries (both OPTIONAL, resolved lazily through the
 *    caller-provided getService reader), ctx.promptProfiles views,
 *    lib/writer.js, lib/resolve.ts.
 * @keywords operations, validation, CRUD, settings.replace, withWriteLock,
 *   toPatchId, rowId, patchId, ApiError, transport-neutral
 * #endregion moduleContract
 */

import { randomUUID } from "node:crypto";
import { parse } from "yaml";
import { planInsertion, resolveWorkspaceKeys, sectionSkipReason } from "./resolve.ts";
import {
  disableRow,
  insertRow,
  listRowIds,
  provenance,
  readPatchRows,
  removeRow,
  renameSectionRow,
  toPatchId,
  withWriteLock,
} from "./writer.ts";

// #region CONST_identity
/** Plugin names of the row kinds these operations manage (SPEC §3). */
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
/** The persona plugin whose `config.complete === true` collapses the prompt. */
const PERSONA_PLUGIN = "@deepseek-ai/dsh-persona";
/** `!!js` customTag shared with the loader dialect (SPEC §3). */
const yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
// #endregion CONST_identity

// #region CLASS_ApiError
/**
 * @purpose Carry an operation status plus a safe message out of the shared
 *   operations, so each surface translates a failure into its own shape
 *   instead of leaking a stack.
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
// #endregion CLASS_ApiError

// #region FUNC_errorText
/**
 * @purpose Extract a NON-EMPTY human-readable message from any thrown value —
 *   Error (even with an empty `.message`), string, plain object, null.
 *   Every failure rendered to a user or a log carries a readable message by
 *   construction.
 * @returns {string} non-empty message.
 */
export function errorText(error) {
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
 * @purpose ONE place implementing the row id-matching rule, so every
 *   operation that addresses an existing row resolves it identically. The
 *   registry stores the QUALIFIED loader entry rowId
 *   (`include:prompt-section-f01aa4a5`, from `ctx.fiber.entry.id`), while
 *   callers may send the unqualified patch row id.
 *
 * MATCHING ORDER (first hit wins):
 *  1. exact match on the registry `rowId`;
 *  2. normalized match: `toPatchId(value)` against `rowId` (qualified value
 *     → unqualified row) or `toPatchId(rowId)` against `value` (unqualified
 *     value → qualified row);
 *  3. the row's CONFIG id (`candidate.id`), exact or `toPatchId`-normalized,
 *     so callers may address a row by its domain id as well.
 *
 * @param {Array<{ id: string, rowId: string }>} registryView - rows from
 *   service.sections() / service.profiles().
 * @returns {object | null} the matching registry row view, or null.
 */
export function findRow(registryView, value) {
  if (typeof value !== "string" || value === "") return null;
  const normalized = toPatchId(value);
  return (
    (registryView ?? []).find(
      (candidate) =>
        candidate.rowId === value ||
        candidate.rowId === normalized ||
        toPatchId(candidate.rowId) === normalized ||
        candidate.id === value ||
        candidate.id === normalized,
    ) ?? null
  );
}
// #endregion FUNC_findRow

// #region FUNC_normalizeNewRowId
/**
 * Normalize the NEW id of a create/rename payload to the canonical
 * `prompt-<kind>-<token>` form under the frozen decision «config.id === full
 * row id»: the stored config id IS that full string.
 *
 * Accepted inputs (all equivalent):
 *  - bare token:            `123123`
 *  - full row id:           `prompt-section-123123`
 *  - qualified loader form: `include:prompt-section-123123` (any `:` chain)
 *
 * @param {"section"|"profile"} kind - supplies the `prompt-<kind>-` prefix.
 * @returns {string} the FULL form, or null when the input is not a string or
 *   reduces to the bare prefix (pattern checks stay with the caller, which
 *   reports a clear 400).
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
 * @purpose Generate a create id as a short random token instead of a
 *   title-derived slug: two ids derived from one title read as different rows
 *   and can collide with rows another bundle ships. Regenerates on collision
 *   with any full id in `taken` (an existing row id or `config.id`).
 * @param {Set<string>} taken - every FULL id string that must not be reused
 *   (see takenIds in createOperations).
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
 * @purpose Reject malformed payloads before anything is written
 *   (PLAN step 4: «попытка испортить входные данные — отказ без записи»).
 *   Updates carry a WHOLE object `value`; there are no path ops.
 * @param {string} kind - expected payload kind, for error messages.
 * @param {object} body - decoded operation input.
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
      throw new ApiError(
        400,
        `${kind}: field "id" must be a bare token, prompt-${name}-<token>, or include:prompt-${name}-<token> matching ${ID_PATTERN}`,
      );
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
   * A section that HMR has not registered YET is accepted only when its row
   * is already present in the profile patch (`pendingSectionIds`) — the
   * create-then-add flow. A typo/foreign id is rejected on CREATE and UPDATE
   * alike (no asymmetric allowance).
   */
  const sectionRefId = (raw) => {
    if (typeof raw !== "string" || raw === "") return null;
    const targets = deps.sectionTargets ?? new Map();
    const direct = targets.get(raw) ?? targets.get(toPatchId(raw));
    if (direct !== undefined) return direct;
    const full = normalizeNewRowId("section", raw);
    if (full === null) return null;
    const registered = targets.get(full);
    if (registered !== undefined) return registered;
    const token = full.slice("prompt-section-".length);
    if (token === "" || !ID_PATTERN.test(token)) return null;
    // Pending HMR registration: this bundle already wrote the row to the
    // patch (the client creates the section first and only then references
    // it). The check is a snapshot read of the patch; it can only REJECT a
    // row that is absent, never accept a typo.
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
      const sections = body.sections === undefined ? [] : sectionRefs(body.sections);
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
      // Only a profile-id string, '' (none), or null (clear) — a missing
      // field is rejected, never silently coerced.
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
        throw new ApiError(400, "last: workspaceId or cwd is required");
      }
      if (typeof body.profileId !== "string")
        throw new ApiError(400, "last: profileId must be a string (empty = none)");
      return { workspaceId, cwd, profileId: body.profileId, revision: revision() };
    }
    default:
      throw new ApiError(500, `validate: unknown kind ${kind}`);
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
  if (node.name === PERSONA_PLUGIN && node.config?.complete === true) return true;
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
  // biome-ignore lint/suspicious/noImplicitAnyLet: assigned in the try below before use (@ts-nocheck module; annotated in MIGRATION step B).
  let presets;
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
  if (!profile) throw new ApiError(404, `profile "${profileId}" is not registered`);
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
  const planned = [...profile.sections].sort((a, b) => a.order - b.order);
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
    // biome-ignore lint/suspicious/noImplicitAnyLet: assigned in the try below before use (@ts-nocheck module; annotated in MIGRATION step B).
    let text;
    try {
      text = interpolate(section.body);
    } catch (error) {
      skipped.push({
        id: ref.id,
        title: section.title,
        reason: `interpolation failed: ${error?.message ?? String(error)}`,
      });
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
  if (!configEditor) throw new ApiError(503, "profile storage service is unavailable");
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
  const affectedProfiles = service
    .profiles()
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
  const clash = service
    .sections()
    .some(
      (row) =>
        row.rowId !== section.rowId && (row.id === newId || row.rowId === newId || toPatchId(row.rowId) === newId),
    );
  if (clash) throw new ApiError(400, `section id "${newId}" is already taken`);
  const patchPath = configEditor.documentPath;
  // Only a row THIS patch inserted may be physically removed; a bare override
  // or a lower-layer row we can only override is disabled instead. `.inserted`
  // (not `.source === 'bundle'`) keeps this correct now that an absent row
  // reports 'unknown' rather than 'bundle'.
  const bundleOwned = !provenance({ patchPath, rowId: oldRowId }).inserted;
  try {
    await renameSectionRow({
      patchPath,
      row: { id: newId, name: SECTION_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId,
      oldName: SECTION_NAME,
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
    if (!store) throw new ApiError(503, "profile storage service is unavailable");
    return store;
  };
  /** Row mutations additionally need the profile patch (configEditor). */
  const requireStorage = () => {
    const store = settingsStore();
    const editor = editorStore();
    if (!store || !editor) throw new ApiError(503, "profile storage service is unavailable");
    return { settings: store, configEditor: editor };
  };
  const patchPath = () => editorStore()?.documentPath;

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
              row.name === SECTION_NAME &&
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
    // biome-ignore lint/suspicious/noImplicitAnyLet: assigned in the try below before use (@ts-nocheck module; annotated in MIGRATION step B).
    let rows;
    try {
      const path = patchPath();
      if (path === undefined) return true; // no patch view: trust the registry
      rows = readPatchRows({ patchPath: path });
    } catch {
      return true; // the registry already said yes and we cannot prove absence
    }
    const row = rows.find((candidate) => candidate.id === entry.rowId || candidate.configId === profileId);
    if (row) return row.name === PROFILE_NAME && !row.disabled;
    return entry.source !== "user"; // absent: only a removed user row is definitively gone
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
    if (!row) throw new ApiError(404, `${kind} row "${received}" is not registered`);
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
      throw new ApiError(409, `configuration changed since read (expected revision ${revision})`);
    const message = errorText(error);
    if (/is not volatile/.test(message)) throw new ApiError(400, message);
    if (/No configurable plugin entry/.test(message)) throw new ApiError(404, message);
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
          throw new ApiError(409, `configuration changed since read (expected revision ${clientRevision})`);
        }
        const ops = buildOps({ revisionAvailable: typeof expected === "number" }); // read + decide INSIDE the lock
        if (ops.length === 0) return false;
        try {
          await settingsStore().mutate("prompt-profiles", ops, typeof expected === "number" ? expected : undefined);
          return true;
        } catch (error) {
          if (error?.code !== "SETTINGS_CONFLICT") mapSettingsError(error, expected);
          if (attempt >= MAX_MUTATE_ATTEMPTS) {
            throw new ApiError(409, `configuration kept changing; gave up after ${MAX_MUTATE_ATTEMPTS} attempts`);
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
    const aliases = new Set(
      [profile.id, profile.rowId, toPatchId(profile.rowId)].filter(
        (value) => typeof value === "string" && value !== "",
      ),
    );
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
   * Every FULL id string a NEW row of `kind` must not reuse: the row ids and
   * config ids of the registered rows (raw and `toPatchId`-normalized, so both
   * the qualified `include:` form and the unqualified patch id are covered)
   * plus every id present in the patch file.
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
      const path = patchPath();
      if (path !== undefined) for (const id of listRowIds({ patchPath: path })) add(id);
    } catch {
      // patch unreadable: insertRow's own duplicate guard still protects us
    }
    return taken;
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
        throw new ApiError(400, 'preview: query parameter "profileId" is required');
      }
      return previewResponse(deps, profileId, { cwd: input?.cwd });
    },

    /** Create a section row (SPEC §7: empty body allowed). */
    sectionCreate: (body) => {
      requireStorage();
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
      const payload = validate("profile/create", body, {
        sectionTargets: sectionTargets(),
        pendingSectionIds: pendingSectionIds(),
      });
      // An explicit id may never duplicate a registered profile's config.id;
      // patch row-id duplicates fall to the writer's own duplicate guard.
      if (payload.id !== null && takenConfigIds("profile").has(payload.id)) {
        throw new ApiError(400, `profile id "${payload.id}" already exists`);
      }
      const id = payload.id ?? generateTokenId("profile", takenIds("profile"));
      // FROZEN ID SCHEME: row id === stored config.id (full form).
      const row = { id, name: PROFILE_NAME, config: { id, title: payload.title, sections: payload.sections } };
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
      const result = await deleteRow(deps, patchId, PROFILE_NAME);
      try {
        await clearProfileReferences(row);
      } catch (error) {
        try {
          deps.log?.warn?.(
            "prompt-profiles: profile deleted but its default/lastByWorkspace references were not cleared",
            {
              profileId: row.id,
              error: errorText(error),
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
            throw new ApiError(404, `profile "${payload.default}" is not registered`);
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
            throw new ApiError(404, `profile "${payload.profileId}" is not registered`);
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
