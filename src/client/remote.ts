/** #region moduleContract
 * @modulecontract
 * @purpose The CLIENT half of the promptProfiles Remote surface: the mirrored
 *   contribution (`{ package, descriptors }` — the exact same shape the host
 *   registers, built from the ONE shared method table) plus the typed endpoint
 *   facade the UI consumes, which unwraps the RemoteResult envelope into the
 *   error path the UI already handles.
 * @scope
 *  - clientContribution, remoteCall, the isRemoteConflict classifier, the
 *    request/response view types and makeRemoteApi.
 *  - NOT: the mount lifecycle (src/client/transport.ts owns the Cordis
 *    effect) and anything host-side.
 * @invariants
 *  - The descriptors are byte-identical in shape to the host's (same method
 *    set, same strict zod codecs, same typeSymbols) — only the reported
 *    sourceLocation file differs.
 *  - Every call passes an object argument (never `undefined` — the wire
 *    contract rejects a missing `input`).
 *  - `{ ok: true, value }` resolves to `value`; `{ ok: false, error }`
 *    rejects with an Error carrying the envelope's message and code, so the
 *    existing errText/notify/inline-error paths keep working unchanged.
 *  - Conflict detection stays behaviour-compatible: the envelope carries no
 *    status, so the two known stale-revision messages are classified from the
 *    message text.
 * @dependencies
 *  - USES API: ctx.remote.$mount (mount, owner: src/client/transport.ts),
 *    ctx.inject(['remote.promptProfiles'], scope => ...) — the namespace
 *    service is NOT reachable bare; zod 4 (bundled, via the shared contract).
 * @rationale
 *  - Q: Why classify conflicts by message text instead of a status field?
 *    A: The gateway serializes a thrown host DomainError as
 *    `{ code: 'gateway/internal', message }` — the status does not cross the
 *    envelope. Until the host can throw a code-carrying RemoteError (deferred
 *    refactor), the two deterministic conflict messages are the only honest
 *    signal available.
 * @keywords remote, client, contribution, $mount, inject, envelope, unwrap,
 *   RemoteResult, facade, phase 2b
 * #endregion moduleContract */

import { buildRemoteDescriptors, REMOTE_NAMESPACE, TYPERT_PACKAGE } from "../shared/remote-contract.ts";
import type { CreateResponse, PreviewResponse, RenameResponse, SectionRef, StateDocument } from "./model.ts";

// #region TYPE_remoteTransport
/** One RemoteResult envelope as the gateway delivers it. */
export interface RemoteEnvelope {
  ok?: boolean;
  value?: unknown;
  error?: { code?: string; message?: string } | null;
}

/**
 * The namespace service `ctx.inject(['remote.promptProfiles'])` exposes: one
 * callable per method, always taking an object.
 */
export interface RemoteNamespace {
  [method: string]: (args: object) => Promise<RemoteEnvelope>;
}

/** The injected scope: only the dotted namespace key is reachable, never `ctx.remote` bare. */
export interface RemoteScope {
  remote: Record<string, RemoteNamespace>;
}
// #endregion TYPE_remoteTransport

// #region TYPE_requests
/** What a section create/duplicate sends. */
export interface SectionCreateRequest {
  id?: string;
  title?: string;
  body?: string;
}
/** What a whole-object section update sends as `value`. */
export interface SectionUpdateValue {
  title: string;
  body: string;
}
/** What a profile create/duplicate sends. */
export interface ProfileCreateRequest {
  id?: string;
  title?: string;
  sections?: SectionRef[];
}
/** What a whole-object profile update sends as `value`. */
export interface ProfileUpdateValue {
  title: string;
  sections?: SectionRef[];
}
/** The `last` choice: keyed by exactly one of workspaceId/cwd. */
export interface LastChoice {
  profileId: string;
  workspaceId?: string;
  cwd?: string;
}

/** The endpoint facade the chip, the settings page and the flows consume. */
export interface RemoteApi {
  loadState(): Promise<StateDocument>;
  preview(profileId: string): Promise<PreviewResponse>;
  sectionCreate(value: SectionCreateRequest): Promise<CreateResponse>;
  sectionUpdate(patchId: string, value: SectionUpdateValue): Promise<unknown>;
  sectionDelete(patchId: string): Promise<unknown>;
  sectionRename(patchId: string, id: string): Promise<RenameResponse>;
  profileCreate(value: ProfileCreateRequest): Promise<CreateResponse>;
  profileUpdate(patchId: string, value: ProfileUpdateValue): Promise<unknown>;
  profileDelete(patchId: string): Promise<unknown>;
  setDefault(value: string): Promise<unknown>;
  last(choice: LastChoice): Promise<unknown>;
}
// #endregion TYPE_requests

// #region CONST_clientContribution
/**
 * The client contribution mounted through `ctx.remote.$mount(...)`: our
 * package identity plus the descriptors built from the ONE shared method
 * table — the same namespace (`promptProfiles`) and methods the host serves.
 */
const clientContribution = {
  package: TYPERT_PACKAGE,
  descriptors: buildRemoteDescriptors("client"),
};
// #endregion CONST_clientContribution

// #region CLASS_RemoteCallError
/**
 * The Error a `{ ok: false, error }` envelope becomes: the envelope's message
 * (what errText/notify render) plus its `code`, so callers can discriminate
 * without string matching on anything but the documented conflict messages.
 */
class RemoteCallError extends Error {
  readonly code: string | undefined;

  constructor(code: string | undefined, message: string | undefined) {
    super(message || "prompt profiles remote call failed");
    this.name = "RemoteCallError";
    this.code = code;
  }
}
// #endregion CLASS_RemoteCallError

// #region FUNC_unwrapRemoteResult
/**
 * @purpose Unwrap one RemoteResult envelope: `{ ok: true, value }` resolves
 *   to `value`, `{ ok: false, error }` rejects with RemoteCallError — the
 *   failure path every existing UI handler (notify, inline error, runSave)
 *   already consumes via err.message.
 */
async function unwrapRemoteResult<T>(envelope: RemoteEnvelope | null | undefined): Promise<T> {
  if (envelope?.ok) return envelope.value as T;
  const error = envelope?.error;
  throw new RemoteCallError(error?.code, error?.message);
}
// #endregion FUNC_unwrapRemoteResult

// #region FUNC_remoteCall
/**
 * @purpose One typed call helper per method: calls the injected namespace
 *   service and unwraps the envelope. The argument is ALWAYS an object
 *   (`undefined` fails the wire contract with `missing "input"`).
 */
async function remoteCall<T>(scope: RemoteScope, method: string, args: object): Promise<T> {
  const envelope = await scope.remote[REMOTE_NAMESPACE][method](args ?? {});
  return unwrapRemoteResult<T>(envelope);
}
// #endregion FUNC_remoteCall

// #region CONST_conflictPattern
/**
 * The stale-revision failures the host reports as ConflictError; the Remote
 * envelope carries no status, so the deterministic messages are the conflict
 * signal (see @rationale in the module contract).
 */
const REMOTE_CONFLICT_PATTERN = /configuration changed since read|configuration kept changing/;
// #endregion CONST_conflictPattern

// #region FUNC_isRemoteConflict
/**
 * @purpose Conflict classifier shared by runSave's re-apply flow: true for a
 *   stale-revision message, so the conflict behaviour (reload, re-apply once,
 *   conflictError notice on the second failure) is preserved.
 */
function isRemoteConflict(err: unknown): boolean {
  const candidate = err as { status?: number; message?: unknown } | null | undefined;
  return candidate?.status === 409 || REMOTE_CONFLICT_PATTERN.test(String(candidate?.message ?? ""));
}
// #endregion FUNC_isRemoteConflict

// #region FUNC_makeRemoteApi
/**
 * @purpose The endpoint facade over the Remote namespace: WRITES send the
 *   unqualified `patchId` in the `rowId` field, updates carry WHOLE objects in
 *   `value`, `setDefault("")` means none, `last(choice)` keys the choice by
 *   exactly one of workspaceId/cwd. Results come from the envelope unwrap;
 *   failures throw with the message preserved.
 */
const makeRemoteApi = (scope: RemoteScope): RemoteApi => {
  const call = <T>(method: string, args: object) => remoteCall<T>(scope, method, args);
  return {
    loadState: () => call<StateDocument>("state", {}),
    preview: (profileId) => call<PreviewResponse>("preview", { profileId }),
    sectionCreate: (value) => call<CreateResponse>("sectionCreate", value ?? {}),
    sectionUpdate: (patchId, value) => call<unknown>("sectionUpdate", { rowId: patchId, value }),
    sectionDelete: (patchId) => call<unknown>("sectionDelete", { rowId: patchId }),
    sectionRename: (patchId, id) => call<RenameResponse>("sectionRename", { rowId: patchId, id }),
    profileCreate: (value) => call<CreateResponse>("profileCreate", value ?? {}),
    profileUpdate: (patchId, value) => call<unknown>("profileUpdate", { rowId: patchId, value }),
    profileDelete: (patchId) => call<unknown>("profileDelete", { rowId: patchId }),
    setDefault: (value) => call<unknown>("defaultSet", { profileId: value }),
    last: (choice) =>
      call<unknown>("last", {
        workspaceId: choice?.workspaceId,
        cwd: choice?.cwd,
        profileId: choice?.profileId ?? "",
      }),
  };
};

// #endregion FUNC_makeRemoteApi

export { clientContribution, isRemoteConflict, makeRemoteApi, RemoteCallError, remoteCall, unwrapRemoteResult };
