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
export type DomainErrorReason = "section-id-taken" | "profile-id-exists" | "profile-not-registered" | "section-not-registered" | "row-not-found" | "storage-unavailable" | "conflict";
/** What a reason needs to say which value failed. */
export interface DomainErrorExtra {
    reason?: DomainErrorReason;
    params?: {
        id?: string;
        expected?: number;
    };
}
/**
 * @purpose Carry a coded failure with a safe message so surfaces classify without leaking stacks.
 */
export declare class DomainError extends Error {
    readonly code: DomainErrorCode;
    readonly status: number;
    readonly reason: DomainErrorReason | undefined;
    readonly params: DomainErrorExtra["params"];
    constructor(code: DomainErrorCode, message: string, extra?: DomainErrorExtra);
}
/**
 * @purpose Signal malformed payloads, addresses, or requests.
 */
export declare class InvalidInputError extends DomainError {
    constructor(message: string, extra?: DomainErrorExtra);
}
/**
 * @purpose Signal an addressed row, profile, or section that is not registered.
 */
export declare class NotFoundError extends DomainError {
    constructor(message: string, extra?: DomainErrorExtra);
}
/**
 * @purpose Signal a stale expected revision that no longer matches storage.
 */
export declare class ConflictError extends DomainError {
    constructor(message: string, extra?: DomainErrorExtra);
}
/**
 * @purpose Signal a required service that is absent or unusable.
 */
export declare class UnavailableError extends DomainError {
    constructor(message: string, extra?: DomainErrorExtra);
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
