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
/**
 * @purpose Carry a coded failure with a safe message so surfaces classify without leaking stacks.
 */
export declare class DomainError extends Error {
    readonly code: DomainErrorCode;
    readonly status: number;
    constructor(code: DomainErrorCode, message: string);
}
/**
 * @purpose Signal malformed payloads, addresses, or requests.
 */
export declare class InvalidInputError extends DomainError {
    constructor(message: string);
}
/**
 * @purpose Signal an addressed row, profile, or section that is not registered.
 */
export declare class NotFoundError extends DomainError {
    constructor(message: string);
}
/**
 * @purpose Signal a stale expected revision that no longer matches storage.
 */
export declare class ConflictError extends DomainError {
    constructor(message: string);
}
/**
 * @purpose Signal a required service that is absent or unusable.
 */
export declare class UnavailableError extends DomainError {
    constructor(message: string);
}
/**
 * @purpose Signal a violated implementation invariant (a bug, not user input).
 */
export declare class InternalError extends DomainError {
    constructor(message: string);
}
/**
 * @purpose Convert thrown values to non-empty text for user-facing errors and logs.
 */
export declare function errorMessage(error: unknown): string;
export {};
