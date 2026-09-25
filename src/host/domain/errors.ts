/**
 * #region moduleContract
 * @modulecontract
 * @purpose Carry a domain failure out of the operations with a machine
 *   discriminator (`code`) and a safe human message, so every surface renders
 *   and classifies failures from ONE vocabulary instead of leaking stacks.
 * @scope
 *  - The five failure kinds the operations can report, the error base class,
 *    and the message helper used wherever a thrown value must become text.
 *  - NOT: mapping of port-specific failures onto these kinds (the settings
 *    mapping lives with the operations that call the port).
 * @invariants
 *  - Every DomainError message is a non-empty string chosen by the thrower;
 *    nothing here echoes a stack or a raw thrown value.
 *  - `status` mirrors `code` numerically for callers and harnesses that
 *    classify by number; `code` is the domain discriminator.
 * @keywords domain errors, invalid input, not found, conflict, unavailable
 * #endregion moduleContract
 */

// #region CONST_codes
/** Why an operation refused: the domain discriminator every surface branches on. */
export type DomainErrorCode = "invalid" | "not-found" | "conflict" | "unavailable" | "internal";

/** Numeric mirror of each code, for callers that classify failures by number. */
export const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  invalid: 400,
  "not-found": 404,
  conflict: 409,
  unavailable: 503,
  internal: 500,
};
// #endregion CONST_codes

// #region CLASS_DomainError
/** The base of every failure the operations raise: a code plus a safe message. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = DOMAIN_ERROR_STATUS[code];
  }
}
// #endregion CLASS_DomainError

// #region CLASS_kinds
/** The payload, the addressed row or the request itself is malformed. */
export class InvalidInputError extends DomainError {
  constructor(message: string) {
    super("invalid", message);
    this.name = "InvalidInputError";
  }
}

/** The addressed row, profile or section is not registered. */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super("not-found", message);
    this.name = "NotFoundError";
  }
}

/** The expected configuration revision no longer matches the stored one. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super("conflict", message);
    this.name = "ConflictError";
  }
}

/** A service the operation requires is absent or unusable. */
export class UnavailableError extends DomainError {
  constructor(message: string) {
    super("unavailable", message);
    this.name = "UnavailableError";
  }
}

/** An invariant of the implementation was violated (a bug, not user input). */
export class InternalError extends DomainError {
  constructor(message: string) {
    super("internal", message);
    this.name = "InternalError";
  }
}
// #endregion CLASS_kinds

// #region FUNC_errorMessage
/**
 * @purpose Extract a NON-EMPTY human-readable message from any thrown value —
 *   Error (even with an empty `.message`), string, plain object, null — so
 *   every failure rendered to a user or a log carries readable text.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message !== "") return error.message;
    return error.name || "Error"; // e.g. `new Error("")` still names itself
  }
  if (typeof error === "string") return error === "" ? "unknown error" : error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message; // Error-like plain object
  }
  try {
    const text = String(error);
    if (text !== "") return text;
  } catch {
    // exotic toString: fall through
  }
  return "unknown error";
}
// #endregion FUNC_errorMessage
