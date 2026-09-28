/** #region moduleContract
 * @modulecontract
 * @purpose The client half of the promptProfiles Remote surface: the mirrored
 *   contribution plus the typed endpoint facade the UI consumes.
 * @invariants
 *  - Descriptors are shape-identical to the host's; every call passes an object.
 *  - `{ ok: true, value }` resolves to `value`; `{ ok: false, error }`
 *    rejects with the envelope's code, details and message.
 *  - A failure is classified by its code; the message is diagnostic prose the
 *    host happens to carry and is never matched against.
 * #endregion moduleContract */

import { buildRemoteDescriptors, REMOTE_NAMESPACE, TYPERT_PACKAGE } from "../shared/remote-contract.ts";
import type { CreateResponse, PreviewResponse, RenameResponse, SectionRef, StateDocument } from "./model.ts";

/** The detail fields the published failure codes carry, as the client reads them. */
export interface RemoteErrorDetails {
  id?: string;
  expected?: number;
}

/** One RemoteResult envelope as the gateway delivers it. */
export interface RemoteEnvelope {
  ok?: boolean;
  value?: unknown;
  error?: { code?: string; message?: string; details?: RemoteErrorDetails } | null;
}

/**
 * The namespace service `ctx.inject(['remote.promptProfiles'])` exposes: one
 * callable per method, always taking an object.
 */
interface RemoteNamespace {
  [method: string]: (args: object) => Promise<RemoteEnvelope>;
}

/** The injected scope: only the dotted namespace key is reachable, never `ctx.remote` bare. */
export interface RemoteScope {
  remote: Record<string, RemoteNamespace>;
}

/** What a section create/duplicate sends. */
interface SectionCreateRequest {
  id?: string;
  title?: string;
  body?: string;
}
/** What a whole-object section update sends as `value`. */
interface SectionUpdateValue {
  title: string;
  body: string;
}
/** What a profile create/duplicate sends. */
interface ProfileCreateRequest {
  id?: string;
  title?: string;
  sections?: SectionRef[];
}
/** What a whole-object profile update sends as `value`. */
interface ProfileUpdateValue {
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

/**
 * The client contribution mounted through `ctx.remote.$mount(...)`: our
 * package identity plus the descriptors built from the ONE shared method
 * table — the same namespace (`promptProfiles`) and methods the host serves.
 */
const clientContribution = {
  package: TYPERT_PACKAGE,
  descriptors: buildRemoteDescriptors("client"),
};

// #region CLASS_RemoteCallError
/**
 * The Error a `{ ok: false, error }` envelope becomes: the envelope's message,
 * its `code`, and the details the code types, so callers address a failure by
 * code and never by the prose the host happens to carry.
 */
class RemoteCallError extends Error {
  readonly code: string | undefined;
  readonly details: RemoteErrorDetails;

  constructor(code: string | undefined, message: string | undefined, details: RemoteErrorDetails = {}) {
    super(message || "prompt profiles remote call failed");
    this.name = "RemoteCallError";
    this.code = code;
    this.details = details;
  }
}
// #endregion CLASS_RemoteCallError

// #region FUNC_unwrapRemoteResult
/**
 * @purpose Unwrap one RemoteResult envelope: `{ ok: true, value }` resolves
 *   to `value`, `{ ok: false, error }` rejects with RemoteCallError — the
 *   failure path every existing UI handler (notify, inline error, runSave)
 *   already consumes.
 */
async function unwrapRemoteResult<T>(envelope: RemoteEnvelope | null | undefined): Promise<T> {
  if (envelope?.ok) return envelope.value as T;
  const error = envelope?.error;
  throw new RemoteCallError(error?.code, error?.message, error?.details);
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

/** The stale-revision failure the host reports as a coded conflict. */
const REMOTE_CONFLICT_CODE = "promptProfiles/conflict";
/** The conflict messages a host build predating the code still sends. */
const REMOTE_CONFLICT_PATTERN = /configuration changed since read|configuration kept changing/;

// #region FUNC_isRemoteConflict
/**
 * @purpose Conflict classifier shared by runSave's re-apply flow: true for a
 *   stale-revision failure, so the conflict behaviour (reload, re-apply once,
 *   conflictError notice on the second failure) is preserved. The code is the
 *   signal; the message pattern only covers a host bundle from before it.
 */
function isRemoteConflict(err: unknown): boolean {
  const candidate = err as { code?: unknown; status?: number; message?: unknown } | null | undefined;
  return (
    candidate?.status === 409 ||
    candidate?.code === REMOTE_CONFLICT_CODE ||
    REMOTE_CONFLICT_PATTERN.test(String(candidate?.message ?? ""))
  );
}
// #endregion FUNC_isRemoteConflict

// #region FUNC_makeRemoteApi
/** @purpose Adapt the injected namespace while preserving endpoint wire shapes. */
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
