/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give operations stable error codes and safe messages for host surfaces.
 * @scope Domain errors and thrown-value message normalization.
 * @invariants
 *  - `status` mirrors `code` numerically; messages are chosen by throwers.
 * #endregion moduleContract
 */

type DomainErrorCode = "invalid" | "not-found" | "conflict" | "unavailable" | "internal";

const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  invalid: 400,
  "not-found": 404,
  conflict: 409,
  unavailable: 503,
  internal: 500,
};

// #region CLASS_DomainError
/**
 * @purpose Carry a coded failure with a safe message so surfaces classify without leaking stacks.
 */
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

// #region CLASS_InvalidInputError
/**
 * @purpose Signal malformed payloads, addresses, or requests.
 */
export class InvalidInputError extends DomainError {
  constructor(message: string) {
    super("invalid", message);
    this.name = "InvalidInputError";
  }
}
// #endregion CLASS_InvalidInputError

// #region CLASS_NotFoundError
/**
 * @purpose Signal an addressed row, profile, or section that is not registered.
 */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super("not-found", message);
    this.name = "NotFoundError";
  }
}
// #endregion CLASS_NotFoundError

// #region CLASS_ConflictError
/**
 * @purpose Signal a stale expected revision that no longer matches storage.
 */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super("conflict", message);
    this.name = "ConflictError";
  }
}
// #endregion CLASS_ConflictError

// #region CLASS_UnavailableError
/**
 * @purpose Signal a required service that is absent or unusable.
 */
export class UnavailableError extends DomainError {
  constructor(message: string) {
    super("unavailable", message);
    this.name = "UnavailableError";
  }
}
// #endregion CLASS_UnavailableError

// #region CLASS_InternalError
/**
 * @purpose Signal a violated implementation invariant (a bug, not user input).
 */
export class InternalError extends DomainError {
  constructor(message: string) {
    super("internal", message);
    this.name = "InternalError";
  }
}
// #endregion CLASS_InternalError

// #region FUNC_errorMessage
/**
 * @purpose Convert thrown values to non-empty text for user-facing errors and logs.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message !== "") return error.message;
    return error.name || "Error"; // e.g. `new Error("")` still names itself
  }
  if (typeof error === "string") return error === "" ? "unknown error" : error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  try {
    const text = String(error);
    if (text !== "") return text;
  } catch {
    // exotic toString throws: fall through to the default below
  }
  return "unknown error";
}
// #endregion FUNC_errorMessage
