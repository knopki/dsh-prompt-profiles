import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  ApiError,
  createOperations,
  errorText
} from "./chunk-7MITQ3EU.js";
import {
  toPatchId
} from "./chunk-P2AH5IU6.js";

// src/host/api.ts
var MAX_BODY_BYTES = 1 << 20;
var AUTH_REQUIRED_MESSAGE = "web authentication required; reopen the URL printed by dsh web";
var ORIGIN_UNTRUSTED_MESSAGE = "request origin is not trusted";
function sameOriginHost(origin, host) {
  if (typeof host !== "string" || host === "") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function createRoutes(deps) {
  const { routes } = createOperations(deps);
  const log = deps.log ?? {};
  const JSON_HEADERS = { "content-type": "application/json" };
  const encode = (status, payload, extraHeaders) => new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...extraHeaders ?? {} } });
  return routes.map(({ path, method, run }) => ({
    path,
    method,
    fetch: async (request) => {
      let receivedRowId = null;
      try {
        if (request.method !== method) {
          return encode(405, { error: { message: `${method} ${path}: method not allowed` } }, { allow: method });
        }
        const connection = deps.getService?.("connection") ?? deps.connection;
        if (typeof connection?.admit === "function") {
          let decision;
          try {
            decision = await connection.admit(request);
          } catch (error) {
            deps.warn?.("prompt-profiles api: connection.admit threw; refusing the request", {
              route: `${method} ${path}`,
              error: errorText(error)
            });
            return encode(401, { error: { message: AUTH_REQUIRED_MESSAGE } });
          }
          if (decision?.rejection) {
            const rejection = decision.rejection === 403 ? 403 : 401;
            return encode(rejection, {
              error: { message: rejection === 403 ? ORIGIN_UNTRUSTED_MESSAGE : AUTH_REQUIRED_MESSAGE }
            });
          }
        }
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
        return encode(200, result === void 0 ? { ok: true } : { ok: true, ...result });
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 500;
        const message = errorText(error);
        const details = {
          route: `${request.method} ${path}`,
          rowId: receivedRowId,
          patchId: receivedRowId == null ? null : toPatchId(receivedRowId),
          error: message
        };
        try {
          const sink = status >= 500 ? log.error ?? log.warn ?? deps.warn : log.warn ?? deps.warn;
          sink?.("prompt-profiles api: request failed", details);
        } catch {
        }
        return encode(status, { error: { message: status === 500 ? `internal error: ${message}` : message } });
      }
    }
  }));
}
var API_ROUTE_BASE = "/api/__dsh-prompt-profiles";
var ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
function registerApi(ctx, { service, warn, log }) {
  const getService = (name) => {
    try {
      return ctx.get?.(name) ?? void 0;
    } catch {
      return void 0;
    }
  };
  let logger;
  try {
    logger = ctx.logger;
  } catch {
    logger = void 0;
  }
  const sinks = log ?? {
    warn: (message, details) => (logger?.warn ?? console.warn)(message, details ?? ""),
    error: (message, details) => (logger?.error ?? logger?.warn ?? console.error)(message, details ?? "")
  };
  const info = (message, details) => {
    try {
      if (typeof log?.info === "function") log.info(message, details ?? "");
      else if (typeof logger?.info === "function") logger.info(message, details ?? "");
    } catch {
    }
  };
  const OPTIONAL_SERVICES = ["settings", "configEditor", "agentPresets", "workspaceRegistry"];
  const missingServices = () => OPTIONAL_SERVICES.filter((name) => !getService(name));
  const connection = ctx.connection ?? getService("connection");
  if (typeof connection?.admit !== "function") {
    sinks.warn("prompt-profiles api: connection.admit unavailable; routes run WITHOUT platform authentication (CSRF checks only)", {});
  }
  const routes = createRoutes({
    service,
    getService,
    warn: warn ?? ((message, details) => sinks.warn(message, details)),
    log: sinks
  });
  const disposers = [];
  for (const route of routes) {
    const path = `${API_ROUTE_BASE}${route.path}`;
    try {
      const dispose = connection.fetch.register({
        path,
        methods: [...ROUTE_METHODS],
        requestBody: "buffered",
        fetch: route.fetch
      });
      disposers.push(typeof dispose === "function" ? dispose : () => {
      });
    } catch (error) {
      sinks.error("prompt-profiles api: route registration failed", { path, error: errorText(error) });
    }
  }
  const failed = routes.length - disposers.length;
  const missing = missingServices();
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

export {
  API_ROUTE_BASE,
  registerApi
};
//# sourceMappingURL=chunk-O2ATJHFT.js.map
