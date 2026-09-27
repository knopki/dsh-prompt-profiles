/**
 * #region moduleContract
 * @modulecontract
 * @purpose Persist each session's sealed prompt-profile decision durably,
 *   exactly once per process, behind the `SessionSnapshotsPort`.
 * @scope
 *  - The retrying storage open, the decide-once/persist-durable-first sealing
 *    policy, and the in-memory pin surviving a storage outage.
 *  - NOT: snapshot contents or the record schema.
 * @invariants
 *  - A persisted record is never rebuilt from live configuration; a rejected
 *    open is not cached. Storage failures degrade to the in-memory decision.
 * #endregion moduleContract
 */
import type { SessionSnapshotsPort } from "../application/ports.ts";
import type { Snapshot } from "../domain/model.ts";
/** The `prompt_profiles.sessions` table as sealing uses it. */
interface SnapshotTable {
    get(key: string): Snapshot | undefined;
    put(key: string, value: Snapshot): unknown;
}
/**
 * The open storage-domain handle as sealing uses it.
 *
 * @purpose Open the snapshot table sealing reads and writes.
 */
export interface StorageDomainHandle {
    table(name: string): SnapshotTable;
    close(): Promise<unknown> | unknown;
}
/**
 * @purpose Options for binding the sealing policy to one storage scope.
 */
export interface SessionSnapshotsOptions {
    /** Open the `prompt_profiles` domain; failures must reject, not throw synchronously. */
    openDomain(): Promise<StorageDomainHandle>;
    warn?(message: string, details?: unknown): void;
}
/**
 * A cached async getter that also exposes the pending promise without starting one.
 *
 * @purpose Share one in-flight open while allowing a fresh attempt after failure.
 */
export type RetryingCache<T> = (() => Promise<T>) & {
    cached: () => Promise<T> | null;
};
/**
 * @purpose Cache a pending asynchronous open but drop the cache on rejection.
 */
export declare function retryingCache<T>(create: () => Promise<T>): RetryingCache<T>;
/**
 * @purpose Decide a session's snapshot exactly once and keep it stable: an
 *   already-persisted record, empty included, is final. Fresh decisions are
 *   memoized and written durable-first; storage failures degrade to memory.
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
/** @purpose Bind the sealing policy to one storage scope, all released by `close()`. */
export declare function createSessionSnapshots({ openDomain, warn }: SessionSnapshotsOptions): SessionSnapshotsPort;
export {};
