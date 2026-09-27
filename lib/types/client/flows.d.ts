/** #region moduleContract
 * @modulecontract
 * @purpose The two write flows: modal-free create and optimistic
 *   update-and-poll mutation, with the polling helpers they share.
 * @invariants
 *  - Rows appear only after the host mounts them, so every flow polls /state.
 *  - One flow instance runs one mutation at a time; a failure restores prior state.
 * #endregion moduleContract */
import type { Translate } from "./i18n.ts";
import type { CreateResponse, RowEntry, SectionRef, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
/** What one flow run reports back to its owner. */
interface FlowOutcome {
    ok: boolean;
    busy?: boolean;
    error?: unknown;
    item?: RowEntry | null;
    created?: CreateResponse;
    result?: unknown;
}
type CreateKind = "section" | "profile";
/** The union of what a create sends: a section body or a profile's refs. */
interface CreateRequest {
    id?: string;
    title?: string;
    body?: string;
    sections?: SectionRef[];
}
interface CreateFlowOptions {
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
interface MutationRunArgs<T> {
    mutate: () => Promise<T>;
    optimistic?: (prior: StateDocument, result: T) => StateDocument;
    agree?: (state: StateDocument, result: T) => boolean;
    onDone?: (state: StateDocument, result: T) => void;
}
interface MutationFlowOptions {
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
interface MutationFlow {
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
/** @purpose Serialize create operations until the host-mounted row is visible. */
export declare function makeCreateFlow({ api, t, notify, reload, getState, onState, onDrill, onPending, pollInterval, pollDeadline, }: CreateFlowOptions): CreateFlow;
/** @purpose Serialize mutations and reconcile optimistic state with the host. */
export declare function makeMutationFlow({ api, t, notify, reload, getState, onState, onPending, pollInterval, pollDeadline, }: MutationFlowOptions): MutationFlow;
export {};
