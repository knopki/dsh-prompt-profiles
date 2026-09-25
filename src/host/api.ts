// @ts-nocheck
// TODO(phase 1): remove after typing
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

import { toPatchId } from "./writer.ts";
import { createOperations, ApiError, errorText, tokenSource } from "./operations.ts";

export { tokenSource };

// #region CONST_http
/** Hard request-body ceiling (bodies are small JSON documents). */
const MAX_BODY_BYTES = 1 << 20;
/** Platform-auth refusal texts (same fence/cookie as the DSH API gateway). */
const AUTH_REQUIRED_MESSAGE = "web authentication required; reopen the URL printed by dsh web";
const ORIGIN_UNTRUSTED_MESSAGE = "request origin is not trusted";
// #endregion CONST_http

// #region FUNC_sameOriginHost
/**
 * CSRF helper: does an `Origin` header name the same host:port as `Host`?
 * A malformed or opaque Origin (`"null"` from a sandboxed/file context)
 * returns false. The caller only invokes this when Origin is PRESENT, so
 * curl/tests/non-browser clients without the header are unaffected.
 */
function sameOriginHost(origin, host) {
  if (typeof host !== "string" || host === "") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
// #endregion FUNC_sameOriginHost

// #region FUNC_createRoutes
/**
 * Wrap the shared operation route table (lib/operations.ts) into Fetch-route
 * handlers: method guard, platform auth (second layer), CSRF, buffered body
 * parsing with our byte ceiling, and the `{ ok: true, ... }` /
 * `{ error: { message } }` envelopes.
 *
 * @purpose Keep the HTTP transport shell in ONE place so every operation it
 *   delegates to answers with identical envelopes and statuses.
 * @param {object} deps - { service, settings?, configEditor?, warn?, log?,
 *   getService? } (forwarded to createOperations).
 * @returns {Array<{ path: string, method: string, fetch: (request: Request) => Promise<Response> }>}
 */
function createRoutes(deps) {
  const { routes } = createOperations(deps);
  const log = deps.log ?? {};
  const JSON_HEADERS = { "content-type": "application/json" };
  const encode = (status, payload, extraHeaders) =>
    new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...(extraHeaders ?? {}) } });
  // PLATFORM ROUTES: every route becomes one exact Fetch route on the
  // Connection service (owner.effect-scoped, so disposal is automatic) and is
  // reached through the shared `/api` channel — the same carrier as the DSH
  // API gateway, which applies the trusted Host/Origin fence + signed browser
  // cookie BEFORE dispatching (see the report's trust-check section). Our own
  // admit call below stays as a second, redundant layer.
  return routes.map(({ path, method, run }) => ({
    path,
    method,
    fetch: async (request) => {
      // Live bug A diagnostics: capture the row id AS RECEIVED so the catch
      // block can log it next to its normalized form.
      let receivedRowId = null;
      try {
        // 0. Method guard: the route declares a broad method list so a
        //    mismatched method still answers 405 + Allow (the platform answers
        //    404 only for methods we did not declare at all).
        if (request.method !== method) {
          return encode(405, { error: { message: `${method} ${path}: method not allowed` } }, { allow: method });
        }
        // 1. PLATFORM AUTHENTICATION (second layer): `connection.admit` is the
        //    same fence + cookie the /api carrier already applied. FAIL CLOSED:
        //    an admit that throws refuses the request.
        const connection = deps.getService?.("connection") ?? deps.connection;
        if (typeof connection?.admit === "function") {
          let decision;
          try {
            decision = await connection.admit(request);
          } catch (error) {
            deps.warn?.("prompt-profiles api: connection.admit threw; refusing the request", {
              route: `${method} ${path}`, error: errorText(error),
            });
            return encode(401, { error: { message: AUTH_REQUIRED_MESSAGE } });
          }
          if (decision?.rejection) {
            const rejection = decision.rejection === 403 ? 403 : 401;
            return encode(rejection, {
              error: { message: rejection === 403 ? ORIGIN_UNTRUSTED_MESSAGE : AUTH_REQUIRED_MESSAGE },
            });
          }
        }
        // 2. CSRF hardening for OUR routes (second layer): a non-GET request
        //    must declare a JSON body (an HTML form cannot), and a PRESENT
        //    Origin must match the request Host. Absent Origin (curl/tests) is
        //    allowed.
        if (method !== "GET") {
          const contentType = String(request.headers.get("content-type") ?? "").trim();
          if (!/^application\/json\s*(;|$)/i.test(contentType)) {
            return encode(415, { error: { message: `${method} ${path}: content-type must be application/json` } });
          }
          const origin = request.headers.get("origin");
          if (typeof origin === "string" && origin !== "" && !sameOriginHost(origin, request.headers.get("host"))) {
            return encode(403, { error: { message: `${method} ${path}: cross-origin request refused` } });
          }
        }
        const query = new URL(request.url).searchParams;
        // The body is read ONLY after the checks above; nothing from it is ever
        // echoed into the error/log path. Our own byte limit is preserved on
        // top of the carrier's buffered body.
        let body = {};
        if (method !== "GET") {
          let text = "";
          try {
            text = await request.text();
          } catch {
            return encode(400, { error: { message: "request body could not be read" } });
          }
          if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
            return encode(413, { error: { message: "request body is too large" } });
          }
          try {
            body = text === "" ? {} : JSON.parse(text);
          } catch {
            return encode(400, { error: { message: "request body is not valid JSON" } });
          }
          if (body === null || typeof body !== "object" || Array.isArray(body)) {
            return encode(400, { error: { message: "request body must be a JSON object" } });
          }
        }
        if (typeof body.rowId === "string") receivedRowId = body.rowId;
        const result = await run(body, query);
        return encode(200, result === undefined ? { ok: true } : { ok: true, ...result });
      } catch (error) {
        // Bulletproof failure path: nothing may escape as a rejected promise
        // (the carrier would answer a bare 500). Logging and the response are
        // each independently guarded; every failure carries
        // `{error:{message}}` with a non-empty message.
        const status = error instanceof ApiError ? error.status : 500;
        const message = errorText(error);
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
        return encode(status, { error: { message: status === 500 ? `internal error: ${message}` : message } });
      }
    },
  }));
}
// #endregion FUNC_createRoutes

// #region FUNC_registerApi
/** Shared `/api` channel base of every bundle route (the Connection carrier requires Fetch routes under `/api`). */
export const API_ROUTE_BASE = "/api/__dsh-prompt-profiles";
/** Methods declared on every Fetch route so a mismatch reaches our 405 + Allow handler. */
const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

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
export function registerApi(ctx, { service, warn, log }) {
  // OPTIONAL services are read through cordis REFLECT (`ctx.get`) — the routes
  // only INJECT connection. The reader is handed to the operations so the
  // values are resolved lazily (a service that appears later is picked up).
  const getService = (name) => {
    try {
      return ctx.get?.(name) ?? undefined;
    } catch {
      return undefined; // absent/throwing service: degrade, never block the mount
    }
  };
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
  // Lifecycle diagnostics at info: the user greps `prompt-profiles` after a
  // reload to see whether routes mounted/unmounted (the live silent-404 bug).
  const info = (message, details) => {
    try {
      if (typeof log?.info === "function") log.info(message, details ?? "");
      else if (typeof logger?.info === "function") logger.info(message, details ?? "");
    } catch {
      // diagnostics only
    }
  };
  // Services the routes would LIKE to have; a missing one degrades per route
  // and is reported in the lifecycle log (never silently).
  const OPTIONAL_SERVICES = ["settings", "configEditor", "agentPresets", "workspaceRegistry"];
  const missingServices = () => OPTIONAL_SERVICES.filter((name) => !getService(name));
  const connection = ctx.connection ?? getService("connection");
  // Platform authentication is applied by the Connection carrier around the
  // WHOLE /api channel; the explicit admit inside the handler is a second
  // layer. Warn when it is not there at all.
  if (typeof connection?.admit !== "function") {
    sinks.warn("prompt-profiles api: connection.admit unavailable; routes run WITHOUT platform authentication (CSRF checks only)", {});
  }
  const routes = createRoutes({
    service,
    getService,
    warn: warn ?? ((message, details) => sinks.warn(message, details)),
    log: sinks,
  });
  // Registration hardening: ONE failed route must not abort the whole mount.
  // `connection.fetch.register` is owner.effect-scoped, so its disposer (and
  // our effect wrapper) removes the route with our fiber.
  const disposers = [];
  for (const route of routes) {
    const path = `${API_ROUTE_BASE}${route.path}`;
    try {
      const dispose = connection.fetch.register({
        path,
        methods: [...ROUTE_METHODS],
        requestBody: "buffered",
        fetch: route.fetch,
      });
      disposers.push(typeof dispose === "function" ? dispose : () => {});
    } catch (error) {
      sinks.error("prompt-profiles api: route registration failed", { path, error: errorText(error) });
    }
  }
  const failed = routes.length - disposers.length;
  const missing = missingServices();
  // LOUD lifecycle: a web profile that ends up with ZERO routes must never be
  // silent again (that is exactly how the live 404 stayed unexplained).
  if (disposers.length === 0) {
    sinks.error("prompt-profiles api: mounted ZERO routes", { missing, failed });
  } else if (failed > 0 || missing.length > 0) {
    sinks.warn("prompt-profiles api: mounted with missing services", { routes: disposers.length, failed, missing });
  }
  info("prompt-profiles api: mounted", { routes: disposers.length, failed, missing });
  return () => {
    let removed = 0;
    for (const dispose of disposers) {
      try {
        dispose();
        removed += 1;
      } catch (error) {
        sinks.warn("prompt-profiles api: route removal failed", { error: errorText(error) });
      }
    }
    info("prompt-profiles api: unmounted", { routes: removed });
  };
}
// #endregion FUNC_registerApi
