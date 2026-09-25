/**
 * #region moduleContract
 * @modulecontract
 * @purpose Persist each session's sealed prompt-profile decision durably,
 *   exactly once per process, behind the `SessionSnapshotsPort` the assembler
 *   consumes.
 * @scope
 *  - The retrying storage open, the decide-once/persist-durable-first sealing
 *    policy, and the in-memory pin that survives a storage outage.
 *  - NOT: what a snapshot contains (domain + host/application/assembler.ts) or
 *    the record schema (host/entrypoints/plugin.ts owns the prompt_profiles
 *    domain definition).
 * @invariants
 *  - A persisted record is NEVER rebuilt from live configuration — an EMPTY
 *    one included, so a session that started without a profile stays
 *    unprofiled (SPEC §2 decision 9).
 *  - A rejected open is not cached: the next call starts a fresh attempt.
 *  - Storage failures degrade to the in-memory decision, retried on the next
 *    assembly.
 * @keywords session snapshot, sealing, storage domain, retry, durable
 * #endregion moduleContract
 */
import type { SessionSnapshotsPort, SnapshotTable } from "../application/ports.ts";
/** The open storage-domain handle as sealing uses it. */
export interface StorageDomainHandle {
    table(name: string): SnapshotTable;
    close(): Promise<unknown> | unknown;
}
export interface SessionSnapshotsOptions {
    /** Open the `prompt_profiles` domain; failures must reject, not throw synchronously. */
    openDomain(): Promise<StorageDomainHandle>;
    warn?(message: string, details?: unknown): void;
}
/** A cached async getter that also exposes the pending promise without starting one. */
export type RetryingCache<T> = (() => Promise<T>) & {
    cached: () => Promise<T> | null;
};
/**
 * @purpose Cache a pending asynchronous open (storage domain) but DROP the
 *   cache on rejection, so a transient failure disables nothing permanently —
 *   the next call starts a fresh attempt.
 * @invariants A fulfilled promise stays cached forever; a rejected one is
 *   removed synchronously before the rejection propagates.
 */
export declare function retryingCache<T>(create: () => Promise<T>): RetryingCache<T>;
/**
 * @purpose Decide a session's snapshot EXACTLY ONCE and keep it stable: an
 *   already-persisted record — EMPTY INCLUDED — is the session's final
 *   decision, so a session that started without a profile never receives one
 *   mid-session. A fresh decision is memoized and written durable-first (an
 *   explicit empty record for "no profile"); storage failures degrade to the
 *   in-memory decision and are retried on the next assembly.
 */
export declare function sealSnapshot<T>({ sessionId, createSnapshot, memo, openTable, warn, }: {
    sessionId: string;
    createSnapshot: () => T;
    memo: Map<string, {
        snapshot: T;
        persisted: boolean;
    }>;
    openTable: () => Promise<{
        get(key: string): T | undefined;
        put(key: string, value: T): unknown;
    }>;
    warn?: (message: string, details?: unknown) => void;
}): Promise<T>;
/**
 * @purpose Bind the sealing policy to one storage scope: one cached open per
 *   owner, one in-flight seal per session, and one memo of decided snapshots,
 *   all released together by `close()`.
 */
export declare function createSessionSnapshots({ openDomain, warn }: SessionSnapshotsOptions): SessionSnapshotsPort;
