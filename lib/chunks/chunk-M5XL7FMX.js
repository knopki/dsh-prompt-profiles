import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/domain/errors.ts
var DOMAIN_ERROR_STATUS = {
  invalid: 400,
  "not-found": 404,
  conflict: 409,
  unavailable: 503,
  internal: 500
};
var DomainError = class extends Error {
  code;
  status;
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = DOMAIN_ERROR_STATUS[code];
  }
};
var InvalidInputError = class extends DomainError {
  constructor(message) {
    super("invalid", message);
    this.name = "InvalidInputError";
  }
};
var NotFoundError = class extends DomainError {
  constructor(message) {
    super("not-found", message);
    this.name = "NotFoundError";
  }
};
var ConflictError = class extends DomainError {
  constructor(message) {
    super("conflict", message);
    this.name = "ConflictError";
  }
};
var UnavailableError = class extends DomainError {
  constructor(message) {
    super("unavailable", message);
    this.name = "UnavailableError";
  }
};
var InternalError = class extends DomainError {
  constructor(message) {
    super("internal", message);
    this.name = "InternalError";
  }
};
function errorMessage(error) {
  if (error instanceof Error) {
    if (error.message !== "") return error.message;
    return error.name || "Error";
  }
  if (typeof error === "string") return error === "" ? "unknown error" : error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message !== "") return message;
  }
  try {
    const text = String(error);
    if (text !== "") return text;
  } catch {
  }
  return "unknown error";
}

// src/host/domain/ordering.ts
var SKIP_REASONS = {
  mainOnlyInSubagent: "scope main-only in a subagent",
  subagentsOnlyOutsidePlainSubagent: "scope subagents-only outside a plain subagent",
  sectionNotFound: "section not found",
  sectionDisabled: "section disabled",
  emptyBody: "empty body",
  emptyAfterInterpolation: "empty after interpolation"
};
function unknownScopeReason(scope) {
  return `unknown scope "${scope}"`;
}
function interpolationSkipReason(error) {
  return `interpolation failed: ${errorMessage(error)}`;
}
function sectionSkipReason(ref, section, { subagent = false, fork = false } = {}) {
  const scope = ref?.scope ?? "inherit";
  if (scope === "main-only" && subagent) return SKIP_REASONS.mainOnlyInSubagent;
  if (scope === "subagents-only" && (!subagent || fork)) return SKIP_REASONS.subagentsOnlyOutsidePlainSubagent;
  if (scope !== "inherit" && scope !== "main-only" && scope !== "subagents-only") return unknownScopeReason(scope);
  if (!section) return SKIP_REASONS.sectionNotFound;
  if (section.disabled) return SKIP_REASONS.sectionDisabled;
  if (typeof section.body !== "string" || !section.body.trim()) return SKIP_REASONS.emptyBody;
  return null;
}
function sortByOrder(rows) {
  return [...rows].sort((a, b) => a.order - b.order);
}
function insertionIndex(sectionOrders, presentBuiltinNames, builtinOrders) {
  const knownOrders = [];
  for (const name of presentBuiltinNames ?? []) {
    const order = builtinOrders?.[name];
    knownOrders.push(typeof order === "number" && Number.isFinite(order) ? order : null);
  }
  return [...sectionOrders ?? []].map((order) => {
    if (!Number.isFinite(order)) throw new TypeError(`insertionIndex: non-finite order ${order}`);
    let index = 0;
    for (let i = 0; i < knownOrders.length; i++) {
      const known = knownOrders[i];
      if (known !== null && known < order) index = i + 1;
    }
    return { order, index };
  });
}
function planInsertion({
  snapshot,
  assemblySections,
  builtinOrdersByName
}) {
  if (!snapshot?.sections?.length) return [];
  const names = assemblySections.map((section) => section.name);
  const sorted = snapshot.sections.map((section, position) => ({ section, position })).sort((a, b) => a.section.order - b.section.order || a.position - b.position);
  const orders = sorted.map(({ section }) => section.order);
  const anchors = insertionIndex(orders, names, builtinOrdersByName);
  return sorted.map(({ section }, position) => ({
    name: `prompt-profile:${section.id}`,
    text: section.text,
    // Sealed text is final: the engine must not interpolate it again, so a
    // literal `{{` in the body can never break rendering.
    interpolate: false,
    index: anchors[position].index
  }));
}

export {
  DOMAIN_ERROR_STATUS,
  DomainError,
  InvalidInputError,
  NotFoundError,
  ConflictError,
  UnavailableError,
  InternalError,
  errorMessage,
  SKIP_REASONS,
  unknownScopeReason,
  interpolationSkipReason,
  sectionSkipReason,
  sortByOrder,
  insertionIndex,
  planInsertion
};
//# sourceMappingURL=chunk-M5XL7FMX.js.map
