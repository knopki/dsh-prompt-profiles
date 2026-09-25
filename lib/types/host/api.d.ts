/**
 * Same-origin HTTP API for the prompt-profiles editor and picker (SPEC §5.5).
 * #region moduleContract
 * @modulecontract
 * @purpose Carry the shared prompt-profile operations (lib/operations.ts) over
 *   exact Fetch routes on the platform Connection service
 *   (`connection.fetch.register`, the same /api carrier as the DSH API
 *   gateway) so the web client can manage rows without a typed remote. The
 *   operation LOGIC lives in lib/operations.ts and is shared verbatim with
 *   the Typert Remote surface (lib/remote.ts); this module owns only the
 *   HTTP transport: auth, CSRF, body parsing, statuses and the
 *   `{error:{message}}` envelope.
 * @scope
 *  - Route registration (state, preview, section create/update/delete/rename,
 *    profile create/update/delete, default, last) over ONE operation set.
 *  - NOT: validation or mutation semantics (lib/operations.ts), Typert
 *    descriptors (lib/remote.ts), the sealing core — the plugin works on
 *    non-web surfaces without these routes (no Connection -> zero routes,
 *    logged at error level).
 * @invariants
 *  - Route handlers never let an exception escape to the socket: errors map
 *    to a JSON error response (400 validation/duplicate id/non-volatile
 *    write, 404 unknown row, 405 method, 409 revision conflict or unsafe
 *    rename, 413 too large, 415 content type, 500 unexpected) and EVERY
 *    failure is logged with the route, the rowId as received, the normalized
 *    patchId, and the underlying error message. The catch path itself is
 *    guarded: a broken logger or an already-dead socket can never turn a
 *    clean error envelope into the host dispatcher's empty 400.
 *  - The request body is read ONLY after the auth/CSRF checks; nothing from
 *    it is ever echoed into the error/log path; our own byte limit
 *    (MAX_BODY_BYTES) sits on top of the carrier's buffered body.
 * @dependencies
 *  - USES API: ctx.connection.fetch.register (exact Fetch routes),
 *    ctx.get(name) REFLECT reads for the optional services handed to the
 *    operations, lib/operations.ts.
 * @rationale
 *  - Q: Why Fetch handlers on the Connection carrier instead of raw
 *    webServer routes?
 *    A: The platform owns the /api carrier (fence + signed cookie + body
 *    modes + auto-disposal); registering there is how the shipped plugins
 *    expose HTTP and it removes our own low-level route management.
 *  - Q: Why does this file no longer contain the operations?
 *    A: Phase 2b added the Typert Remote surface as a second transport.
 *    One implementation (lib/operations.ts) behind two thin adapters is the
 *    only way to guarantee both transports keep identical behaviour — the
 *    historical findRow divergence bug is what duplicated logic cost us.
 * @keywords api, routes, connection.fetch.register, toPatchId, rowId, patchId,
 *   modes, complete, preview, envelope, CSRF
 * #endregion moduleContract
 */
import { tokenSource } from "./operations.ts";
export { tokenSource };
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
