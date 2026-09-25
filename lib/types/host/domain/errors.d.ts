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
/** Why an operation refused: the domain discriminator every surface branches on. */
export type DomainErrorCode = "invalid" | "not-found" | "conflict" | "unavailable" | "internal";
/** Numeric mirror of each code, for callers that classify failures by number. */
export declare const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number>;
/** The base of every failure the operations raise: a code plus a safe message. */
export declare class DomainError extends Error {
    readonly code: DomainErrorCode;
    readonly status: number;
    constructor(code: DomainErrorCode, message: string);
}
/** The payload, the addressed row or the request itself is malformed. */
export declare class InvalidInputError extends DomainError {
    constructor(message: string);
}
/** The addressed row, profile or section is not registered. */
export declare class NotFoundError extends DomainError {
    constructor(message: string);
}
/** The expected configuration revision no longer matches the stored one. */
export declare class ConflictError extends DomainError {
    constructor(message: string);
}
/** A service the operation requires is absent or unusable. */
export declare class UnavailableError extends DomainError {
    constructor(message: string);
}
/** An invariant of the implementation was violated (a bug, not user input). */
export declare class InternalError extends DomainError {
    constructor(message: string);
}
/**
 * @purpose Extract a NON-EMPTY human-readable message from any thrown value —
 *   Error (even with an empty `.message`), string, plain object, null — so
 *   every failure rendered to a user or a log carries readable text.
 */
export declare function errorMessage(error: unknown): string;
