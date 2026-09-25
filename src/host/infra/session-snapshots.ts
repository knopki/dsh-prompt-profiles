/**
 * #region moduleContract
 * @modulecontract
 * @purpose Persist each session's sealed prompt-profile decision durably,
 *   exactly once per process, behind the `SessionSnapshotsPort` the assembler
 *   consumes.
 * @scope
 *  - The retrying storage open, the decide-once/persist-durable-first sealing
 *    policy, and the in-memory pin that survives a storage outage.
 *  - NOT: what a snapshot contains (domain + host/resolve.ts) or the record
 *    schema (host/index.ts owns the prompt_profiles domain definition).
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
import type { Snapshot } from "../domain/model.ts";

// #region TYPE_storage
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
// #endregion TYPE_storage

// #region TYPE_retryingCache
/** A cached async getter that also exposes the pending promise without starting one. */
export type RetryingCache<T> = (() => Promise<T>) & { cached: () => Promise<T> | null };

/**
 * @purpose Cache a pending asynchronous open (storage domain) but DROP the
 *   cache on rejection, so a transient failure disables nothing permanently —
 *   the next call starts a fresh attempt.
 * @invariants A fulfilled promise stays cached forever; a rejected one is
 *   removed synchronously before the rejection propagates.
 */
export function retryingCache<T>(create: () => Promise<T>): RetryingCache<T> {
  let cached: Promise<T> | null = null;
  const get = () => {
    cached ??= Promise.resolve()
      .then(create)
      .then(
        (value) => value,
        (error) => {
          cached = null;
          throw error;
        },
      );
    return cached;
  };
  return Object.assign(get, { cached: () => cached });
}
// #endregion TYPE_retryingCache

// #region FUNC_sealSnapshot
/**
 * @purpose Decide a session's snapshot EXACTLY ONCE and keep it stable: an
 *   already-persisted record — EMPTY INCLUDED — is the session's final
 *   decision, so a session that started without a profile never receives one
 *   mid-session. A fresh decision is memoized and written durable-first (an
 *   explicit empty record for "no profile"); storage failures degrade to the
 *   in-memory decision and are retried on the next assembly.
 */
export async function sealSnapshot<T>({
  sessionId,
  createSnapshot,
  memo,
  openTable,
  warn = () => {},
}: {
  sessionId: string;
  createSnapshot: () => T;
  memo: Map<string, { snapshot: T; persisted: boolean }>;
  openTable: () => Promise<{ get(key: string): T | undefined; put(key: string, value: T): unknown }>;
  warn?: (message: string, details?: unknown) => void;
}): Promise<T> {
  let entry = memo.get(sessionId);
  if (entry === undefined) {
    let snapshot: T;
    let persisted = false;
    try {
      const table = await openTable();
      const saved = table.get(sessionId);
      if (saved !== undefined) {
        // Any persisted record — empty included — is the final decision.
        snapshot = saved;
        persisted = true;
      } else {
        snapshot = createSnapshot();
      }
    } catch (error) {
      warn("prompt-profiles storage unavailable; snapshot decision pinned in memory", { sessionId, error });
      snapshot = createSnapshot();
    }
    entry = { snapshot, persisted };
    memo.set(sessionId, entry);
  }
  if (!entry.persisted) {
    try {
      const table = await openTable();
      // Never clobber a record that landed concurrently.
      if (table.get(sessionId) === undefined) await table.put(sessionId, entry.snapshot);
      entry.persisted = true;
    } catch {
      // Still down: the in-memory decision stays authoritative, retried on the
      // next assembly.
    }
  }
  return entry.snapshot;
}
// #endregion FUNC_sealSnapshot

// #region FUNC_createSessionSnapshots
/**
 * @purpose Bind the sealing policy to one storage scope: one cached open per
 *   owner, one in-flight seal per session, and one memo of decided snapshots,
 *   all released together by `close()`.
 */
export function createSessionSnapshots({ openDomain, warn }: SessionSnapshotsOptions): SessionSnapshotsPort {
  const open = retryingCache(openDomain);
  const pending = new Map<string, Promise<Snapshot>>();
  const decided = new Map<string, { snapshot: Snapshot; persisted: boolean }>();
  return {
    seal(sessionId, createSnapshot) {
      let sealed = pending.get(sessionId);
      if (sealed === undefined) {
        sealed = sealSnapshot<Snapshot>({
          sessionId,
          createSnapshot,
          memo: decided,
          openTable: async () => (await open()).table("sessions"),
          warn,
        });
        pending.set(sessionId, sealed);
        void sealed.finally(() => pending.delete(sessionId)).catch(() => {});
      }
      return sealed;
    },
    async close() {
      pending.clear();
      const cached = open.cached();
      if (cached)
        await cached.then(
          (domain) => domain.close(),
          () => {},
        );
    },
  };
}
// #endregion FUNC_createSessionSnapshots
