/** #region moduleContract
 * @modulecontract
 * @purpose The two write flows every create/delete/rename path goes through:
 *   a modal-free create (write, insert optimistically, poll /state until the
 *   row mounts, then drill into it) and an optimistic-update-and-poll
 *   mutation (duplicate, delete, rename id).
 * @scope
 *  - `makeCreateFlow`, `makeMutationFlow` and the polling helpers they share
 *    (`findEntry`, `optimisticEntry`, `PollTimeoutError`).
 *  - NOT: the api facade (src/client/remote.ts), rendering, or the settings
 *    components that call these factories.
 * @invariants
 *  - Rows in this bundle become visible only after the host recomposes and
 *    mounts them, so every flow POLLS until /state agrees before handing back
 *    a document — a plain reload right after a write would race the mount.
 *  - One flow instance runs ONE mutation at a time: a second call while busy
 *    resolves `{ ok: false, busy: true }` without touching the server.
 *  - A failed mutation restores the PRIOR local state and notifies the SERVER
 *    message.
 * @keywords create flow, mutation flow, optimistic, poll, drill
 * #endregion moduleContract */
import type { Translate } from "./i18n.ts";
import type { CreateResponse, RowEntry, SectionRef, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
/** What one flow run reports back to its owner. */
export interface FlowOutcome {
    ok: boolean;
    busy?: boolean;
    error?: unknown;
    item?: RowEntry | null;
    created?: CreateResponse;
    result?: unknown;
}
export type CreateKind = "section" | "profile";
/** The union of what a create sends: a section body or a profile's refs. */
export interface CreateRequest {
    id?: string;
    title?: string;
    body?: string;
    sections?: SectionRef[];
}
export interface CreateFlowOptions {
    api: Pick<RemoteApi, "loadState" | "sectionCreate" | "profileCreate">;
    t: Translate;
    notify: (text: string) => void;
    reload?: () => Promise<unknown>;
    getState?: () => StateDocument | null;
    onState?: (state: StateDocument) => void;
    onDrill?: (id: string | null) => void;
    onPending?: (pending: boolean) => void;
    pollInterval?: number;
    pollDeadline?: number;
}
export interface CreateFlow {
    create(kind: CreateKind, value: CreateRequest): Promise<FlowOutcome>;
    isBusy(): boolean;
}
export interface MutationRunArgs<T> {
    mutate: () => Promise<T>;
    optimistic?: (prior: StateDocument, result: T) => StateDocument;
    agree?: (state: StateDocument, result: T) => boolean;
    onDone?: (state: StateDocument, result: T) => void;
}
export interface MutationFlowOptions {
    api: Pick<RemoteApi, "loadState">;
    t: Translate;
    notify: (text: string) => void;
    reload?: () => Promise<unknown>;
    getState?: () => StateDocument | null;
    onState?: (state: StateDocument) => void;
    onPending?: (pending: boolean) => void;
    pollInterval?: number;
    pollDeadline?: number;
}
export interface MutationFlow {
    run<T>(args: MutationRunArgs<T>): Promise<FlowOutcome>;
    isBusy(): boolean;
}
/** @purpose Mark a poll that outlived its deadline (create/mutation flows). */
export declare class PollTimeoutError extends Error {
    constructor(message: string);
}
/** @purpose The /state row a patchId names: unqualified patchId, configId or rowId. */
export declare function findEntry(state: StateDocument | null | undefined, patchId: string | null | undefined): RowEntry | null;
/** @purpose Shape a create response like a /state entry (optimistic render). */
export declare function optimisticEntry(kind: CreateKind, created: CreateResponse | null | undefined): RowEntry;
/**
 * @purpose Modal-free creation flow: create with a default title, insert the
 *   response into the local state OPTIMISTICALLY (the host returns the
 *   unqualified id in BOTH rowId and patchId — the include: prefix only
 *   appears after HMR recomposition), then poll the state until the new
 *   patchId appears so the mounted row (source, usedIn, emits) replaces the
 *   optimistic one, then hand the fresh state + drill target back to the
 *   owner. Any failure becomes a notify carrying the server message.
 */
export declare function makeCreateFlow({ api, t, notify, reload, getState, onState, onDrill, onPending, pollInterval, pollDeadline, }: CreateFlowOptions): CreateFlow;
/**
 * @purpose Optimistic-update-and-poll flow for any mutation that creates
 *   or removes a row (duplicate, delete, rename id): apply the change to the
 *   local state immediately (optimistic(prior, result)), write (mutate),
 *   then poll the state until the server document agrees (agree(state,
 *   result)), then hand the polled document back (onState). On failure the
 *   PRIOR state is restored and the SERVER error text is notified.
 */
export declare function makeMutationFlow({ api, t, notify, reload, getState, onState, onPending, pollInterval, pollDeadline, }: MutationFlowOptions): MutationFlow;
