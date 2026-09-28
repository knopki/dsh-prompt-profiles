/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give operations stable error codes and safe messages for host surfaces.
 * @scope Domain errors and thrown-value message normalization.
 * @invariants
 *  - `status` mirrors `code` numerically; messages are chosen by throwers.
 *  - `reason` is wire vocabulary the client localizes; a failure a user cannot
 *    act on (a malformed call, a violated invariant) carries none.
 * #endregion moduleContract
 */

type DomainErrorCode = "invalid" | "not-found" | "conflict" | "unavailable" | "internal";

/** The failures a user can act on, addressed by id or revision. */
export type DomainErrorReason =
  | "section-id-taken"
  | "profile-id-exists"
  | "profile-not-registered"
  | "section-not-registered"
  | "row-not-found"
  | "storage-unavailable"
  | "conflict";

/** What a reason needs to say which value failed. */
export interface DomainErrorExtra {
  reason?: DomainErrorReason;
  params?: { id?: string; expected?: number };
}

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
  readonly reason: DomainErrorReason | undefined;
  readonly params: DomainErrorExtra["params"];

  constructor(code: DomainErrorCode, message: string, extra: DomainErrorExtra = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = DOMAIN_ERROR_STATUS[code];
    this.reason = extra.reason;
    this.params = extra.params;
  }
}
// #endregion CLASS_DomainError

// #region CLASS_InvalidInputError
/**
 * @purpose Signal malformed payloads, addresses, or requests.
 */
export class InvalidInputError extends DomainError {
  constructor(message: string, extra: DomainErrorExtra = {}) {
    super("invalid", message, extra);
    this.name = "InvalidInputError";
  }
}
// #endregion CLASS_InvalidInputError

// #region CLASS_NotFoundError
/**
 * @purpose Signal an addressed row, profile, or section that is not registered.
 */
export class NotFoundError extends DomainError {
  constructor(message: string, extra: DomainErrorExtra = {}) {
    super("not-found", message, extra);
    this.name = "NotFoundError";
  }
}
// #endregion CLASS_NotFoundError

// #region CLASS_ConflictError
/**
 * @purpose Signal a stale expected revision that no longer matches storage.
 */
export class ConflictError extends DomainError {
  constructor(message: string, extra: DomainErrorExtra = {}) {
    super("conflict", message, extra);
    this.name = "ConflictError";
  }
}
// #endregion CLASS_ConflictError

// #region CLASS_UnavailableError
/**
 * @purpose Signal a required service that is absent or unusable.
 */
export class UnavailableError extends DomainError {
  constructor(message: string, extra: DomainErrorExtra = {}) {
    super("unavailable", message, extra);
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
