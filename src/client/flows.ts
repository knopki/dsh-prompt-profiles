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

import { errText, idOf, notifyProfilesChanged } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { CreateResponse, RowEntry, SectionRef, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";

// #region TYPE_flows
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
// #endregion TYPE_flows

// #region FUNC_sleep
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
// #endregion FUNC_sleep

// #region CLASS_PollTimeoutError
/** @purpose Mark a poll that outlived its deadline (create/mutation flows). */
export class PollTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollTimeoutError";
  }
}
// #endregion CLASS_PollTimeoutError

// #region FUNC_findEntry
/** @purpose The /state row a patchId names: unqualified patchId, configId or rowId. */
export function findEntry(
  state: StateDocument | null | undefined,
  patchId: string | null | undefined,
): RowEntry | null {
  for (const key of ["sections", "profiles"] as const) {
    const hit = (state?.[key] ?? []).find(
      (entry) => Boolean(entry) && (entry.patchId === patchId || entry.configId === patchId || entry.rowId === patchId),
    );
    if (hit) return hit;
  }
  return null;
}
// #endregion FUNC_findEntry

// #region FUNC_optimisticEntry
/** @purpose Shape a create response like a /state entry (optimistic render). */
export function optimisticEntry(kind: CreateKind, created: CreateResponse | null | undefined): RowEntry {
  const id = created?.configId ?? created?.patchId ?? created?.rowId;
  if (kind === "section") {
    return {
      rowId: created?.rowId ?? id,
      patchId: created?.patchId ?? id ?? "",
      configId: id,
      title: created?.title ?? "",
      body: created?.body ?? "",
      usedIn: [],
      source: "user",
      emits: typeof created?.body === "string" && created.body.trim() !== "",
    };
  }
  return {
    rowId: created?.rowId ?? id,
    patchId: created?.patchId ?? id ?? "",
    configId: id,
    title: created?.title ?? "",
    sections: created?.sections ?? [],
    usedIn: [],
    source: "user",
  };
}
// #endregion FUNC_optimisticEntry

// #region FUNC_makeCreateFlow
/**
 * @purpose Modal-free creation flow: create with a default title, insert the
 *   response into the local state OPTIMISTICALLY (the host returns the
 *   unqualified id in BOTH rowId and patchId — the include: prefix only
 *   appears after HMR recomposition), then poll the state until the new
 *   patchId appears so the mounted row (source, usedIn, emits) replaces the
 *   optimistic one, then hand the fresh state + drill target back to the
 *   owner. Any failure becomes a notify carrying the server message.
 */
export function makeCreateFlow({
  api,
  t,
  notify,
  reload,
  getState,
  onState,
  onDrill,
  onPending,
  pollInterval = 500,
  pollDeadline = 10000,
}: CreateFlowOptions): CreateFlow {
  let busy = false;
  const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
  async function pollFor(patchId: string | undefined): Promise<{ state: StateDocument; found: RowEntry }> {
    for (let attempt = 1; ; attempt++) {
      const state = await api.loadState();
      const found = findEntry(state, patchId);
      if (found) return { state, found };
      if (attempt >= maxTries) {
        throw new PollTimeoutError(t("createTimeout"));
      }
      await sleep(pollInterval);
    }
  }
  async function create(kind: CreateKind, value: CreateRequest): Promise<FlowOutcome> {
    if (busy) return { ok: false, busy: true };
    busy = true;
    if (onPending) onPending(true);
    try {
      const created = kind === "section" ? await api.sectionCreate(value) : await api.profileCreate(value);
      // Optimistic insert: render the new row immediately from the create
      // response (host returns the unqualified id; source/usedIn unknown
      // until the row mounts).
      const prior = getState ? getState() : null;
      const listKey = kind === "section" ? ("sections" as const) : ("profiles" as const);
      if (onState && prior) {
        const list = [...(prior[listKey] ?? []), optimisticEntry(kind, created)];
        onState(listKey === "sections" ? { ...prior, sections: list } : { ...prior, profiles: list });
      }
      const { state, found } = await pollFor(created.patchId ?? created.rowId);
      if (onState) onState(state);
      if (onDrill) onDrill(idOf(found));
      // A created row changes the roster every surface renders.
      notifyProfilesChanged();
      return { ok: true, item: found, created };
    } catch (err) {
      notify(`${t("createError")} ${errText(err)}`.trim());
      if (reload) {
        try {
          await reload();
        } catch (_) {
          /* keep the notify */
        }
      }
      return { ok: false, error: err };
    } finally {
      busy = false;
      if (onPending) onPending(false);
    }
  }
  return { create, isBusy: () => busy };
}
// #endregion FUNC_makeCreateFlow

// #region FUNC_makeMutationFlow
/**
 * @purpose Optimistic-update-and-poll flow for any mutation that creates
 *   or removes a row (duplicate, delete, rename id): apply the change to the
 *   local state immediately (optimistic(prior, result)), write (mutate),
 *   then poll the state until the server document agrees (agree(state,
 *   result)), then hand the polled document back (onState). On failure the
 *   PRIOR state is restored and the SERVER error text is notified.
 */
export function makeMutationFlow({
  api,
  t,
  notify,
  reload,
  getState,
  onState,
  onPending,
  pollInterval = 500,
  pollDeadline = 10000,
}: MutationFlowOptions): MutationFlow {
  let busy = false;
  const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
  async function run<T>({ mutate, optimistic, agree, onDone }: MutationRunArgs<T>): Promise<FlowOutcome> {
    if (busy) return { ok: false, busy: true };
    busy = true;
    if (onPending) onPending(true);
    const prior = getState ? getState() : null;
    try {
      const result = await mutate();
      if (onState && prior && optimistic) onState(optimistic(prior, result));
      let state: StateDocument | null = prior;
      for (let attempt = 1; ; attempt++) {
        state = await api.loadState();
        if (!agree || agree(state, result)) break;
        if (attempt >= maxTries) throw new PollTimeoutError(t("createTimeout"));
        await sleep(pollInterval);
      }
      if (onState && state) onState(state);
      if (onDone && state) onDone(state, result);
      // Every other surface (the composer chip) re-reads /state from here.
      notifyProfilesChanged();
      return { ok: true, result };
    } catch (err) {
      if (onState && prior) onState(prior); // restore the pre-click local state
      notify(`${t("createError")} ${errText(err)}`.trim());
      if (reload) {
        try {
          await reload();
        } catch (_) {
          /* keep the notify */
        }
      }
      return { ok: false, error: err };
    } finally {
      busy = false;
      if (onPending) onPending(false);
    }
  }
  return { run, isBusy: () => busy };
}
// #endregion FUNC_makeMutationFlow
