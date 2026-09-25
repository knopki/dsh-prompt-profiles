/**
 * Same-origin HTTP API for the prompt-profiles editor and picker (SPEC §5.5).
 * #region moduleContract
 * @modulecontract
 * @purpose Expose prompt-profile CRUD (plus mode/complete warnings and a
 *   host-rendered preview for the editor) as exact Fetch routes on the
 *   platform Connection service (`connection.fetch.register`, the same /api
 *   carrier as the DSH API gateway) so the web client can manage rows without
 *   a typed remote.
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
 *    these routes (no Connection -> zero routes, logged at error level).
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
 *    under the SAME key the assembler reads (resolveWorkspaceKeys: registry
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
 *  - USES API: ctx.connection.fetch.register (exact Fetch routes), ctx.settings.replace /
 *    mutate / describe, ctx.configEditor.documentPath / entries (optional),
 *    ctx.agentPresets.list / readDocument (optional), ctx.promptProfiles
 *    views, lib/writer.js.
 * @rationale
 *  - Q: Why Fetch handlers on the Connection carrier instead of raw
 *    webServer routes?
 *    A: The platform owns the /api carrier (fence + signed cookie + body
 *    modes + auto-disposal); registering there is how the shipped plugins
 *    expose HTTP and it removes our own low-level route management.
 *  - Q: Why whole-object replace instead of per-field ops?
 *    A: The client holds the full editor form; forwarding path ops only
 *    widened the race surface between reads and writes. replace keeps the
 *    contract "validated object in, whole config out" and 400s cleanly.
 * @keywords api, routes, connection.fetch.register, settings.replace, toPatchId, rowId,
 *   patchId, validation, CRUD, modes, complete, preview
 * #endregion moduleContract
 */
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
export declare function findRow(registryView: any, value: any): any;
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
export declare function normalizeNewRowId(kind: any, value: any): any;
/**
 * Injectable source of short random create tokens (8 lowercase hex chars).
 * @purpose Let tests force collisions deterministically (`tokenSource.next`)
 *   without monkey-patching crypto; production always uses a crypto UUID.
 */
export declare const tokenSource: {
    next: () => string;
};
/** Shared `/api` channel base of every bundle route (the Connection carrier requires Fetch routes under `/api`). */
export declare const API_ROUTE_BASE = "/api/__dsh-prompt-profiles";
/**
 * Register the SPEC §5.5 routes (plus preview) as exact Fetch routes on the
 * platform Connection service — the same carrier the DSH API gateway uses.
 *
 * @purpose Give the web client its CRUD surface through the PLATFORM mechanism
 *   (`connection.fetch.register`, owner.effect-scoped auto-disposal) instead of
 *   raw `webServer` registration. Called from `ctx.inject(['connection'], …)`,
 *   so the plugin still mounts (headless, zero routes, reported) without a
 *   Connection. settings/configEditor/agentPresets/workspaceRegistry are read
 *   OPTIONALLY through `ctx.get` and degrade PER ROUTE: reads work without
 *   them, mutations answer 503.
 * @param {object} ctx - the `connection` inject child (ctx.connection + ctx.get).
 * @param {object} options
 * @param {object} options.service - the ctx.promptProfiles service instance.
 * @param {(message: string, details?: unknown) => void} [options.warn]
 *   warning sink for unexpected handler failures.
 * @param {{ warn?: Function, error?: Function, info?: Function }} [options.log]
 *   structured logger override (tests); defaults to ctx.logger → console.
 * @returns {() => void} disposer removing every route.
 */
export declare function registerApi(ctx: any, { service, warn, log }: {
    service: any;
    warn: any;
    log: any;
}): () => void;
