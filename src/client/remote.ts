// @ts-nocheck
// TODO(phase 1): remove after typing
/** #region moduleContract
 * @modulecontract
 * @purpose The CLIENT half of the promptProfiles Remote surface: the mirrored
 *   contribution (`{ package, descriptors }` — the exact same shape the host
 *   registers, built from the ONE shared method table) plus small typed call
 *   helpers that call `scope.remote.promptProfiles.<method>({...})`, always
 *   pass an object, and unwrap the RemoteResult envelope into the error path
 *   the UI already handles.
 * @scope
 *  - clientContribution, remoteCall (per-method helper factory), the
 *    isRemoteConflict classifier, and makeRemoteApi (the endpoint facade the
 *    UI consumes, same method names as the fetch facade).
 *  - NOT: the mount lifecycle (src/client/index.ts owns the Cordis effect),
 *    the fetch fallback (src/client/index.ts, temporary until phase 2c), and
 *    anything host-side.
 * @invariants
 *  - The descriptors are byte-identical in shape to the host's (same method
 *    set, same strict zod codecs, same typeSymbols) — only the reported
 *    sourceLocation file differs.
 *  - Every call passes an object argument (never `undefined` — the wire
 *    contract rejects a missing `input`).
 *  - `{ ok: true, value }` resolves to `value`; `{ ok: false, error }`
 *    rejects with an Error carrying the envelope's message and code, so the
 *    existing errText/notify/inline-error paths keep working unchanged.
 *  - Conflict detection stays behaviour-compatible: the fetch path answered
 *    status 409, the Remote envelope carries no HTTP status, so the two
 *    known stale-revision messages are classified from the message text.
 * @dependencies
 *  - USES API: ctx.remote.$mount (mount, owner: src/client/index.ts),
 *    ctx.inject(['remote.promptProfiles'], scope => ...) — the namespace
 *    service is NOT reachable bare; zod 4 (bundled, via the shared contract).
 * @rationale
 *  - Q: Why classify conflicts by message text instead of a status field?
 *    A: The gateway serializes a thrown host ApiError as
 *    `{ code: 'gateway/internal', message }` — the 409 status does not cross
 *    the envelope. Until the host can throw a code-carrying RemoteError
 *    (deferred refactor), the two deterministic conflict messages are the
 *    only honest signal available, and runSave keeps err.status === 409 for
 *    the fetch path.
 * @keywords remote, client, contribution, $mount, inject, envelope, unwrap,
 *   RemoteResult, facade, phase 2b
 * #endregion moduleContract */

const {
  TYPERT_PACKAGE, REMOTE_NAMESPACE, buildRemoteDescriptors,
} = require("../shared/remote-contract.ts");

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
  constructor(code, message) {
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
 * @param {{ok: boolean, value?: any, error?: {code?: string, message?: string}}} envelope
 * @returns {Promise<any>} the unwrapped business value.
 */
async function unwrapRemoteResult(envelope) {
  if (envelope && envelope.ok) return envelope.value;
  const error = envelope?.error;
  throw new RemoteCallError(error?.code, error?.message);
}
// #endregion FUNC_unwrapRemoteResult

// #region FUNC_remoteCall
/**
 * @purpose One typed call helper per method: `remoteCall(scope, method, args)`
 *   calls `scope.remote.promptProfiles.<method>(args ?? {})` through the
 *   injected namespace service and unwraps the envelope. The argument is
 *   ALWAYS an object (`undefined` fails the wire contract with
 *   `missing "input"`).
 * @param {object} scope - the ctx.inject(['remote.promptProfiles']) scope.
 * @param {string} method - Remote method name (from the shared table).
 * @param {object} args - the strict-schema input object.
 * @returns {Promise<any>} the unwrapped result.
 */
async function remoteCall(scope, method, args) {
  const envelope = await scope.remote[REMOTE_NAMESPACE][method](args ?? {});
  return unwrapRemoteResult(envelope);
}
// #endregion FUNC_remoteCall

// #region CONST_conflictPattern
/**
 * The stale-revision failures the host reports as ApiError 409 over HTTP; the
 * Remote envelope carries no status, so the deterministic messages are the
 * conflict signal (see @rationale in the module contract).
 */
const REMOTE_CONFLICT_PATTERN = /configuration changed since read|configuration kept changing/;
// #endregion CONST_conflictPattern

// #region FUNC_isRemoteConflict
/**
 * @purpose Conflict classifier shared by runSave's 409 re-apply flow: true
 *   for the fetch path's `err.status === 409` and for the Remote path's
 *   stale-revision message, so the conflict behaviour (reload, re-apply
 *   once, conflictError notice on the second failure) is preserved.
 */
function isRemoteConflict(err) {
  return err?.status === 409 || REMOTE_CONFLICT_PATTERN.test(String(err?.message ?? ""));
}
// #endregion FUNC_isRemoteConflict

// #region FUNC_makeRemoteApi
/**
 * @purpose The endpoint facade over the Remote namespace — the SAME method
 *   names and payload semantics as the fetch facade (makeApi): WRITES send
 *   the unqualified `patchId` in the `rowId` field, updates carry WHOLE
 *   objects in `value`, `setDefault("")` means none, `last(choice)` keys the
 *   choice by exactly one of workspaceId/cwd. Results come from the envelope
 *   unwrap; failures throw (message preserved).
 * @param {object} scope - the ctx.inject(['remote.promptProfiles']) scope.
 * @returns {object} the api facade consumed by the chip, settings page and
 *   the create/mutation flows.
 */
const makeRemoteApi = (scope) => {
  const call = (method, args) => remoteCall(scope, method, args);
  return {
    loadState: () => call("state", {}),
    preview: (profileId) => call("preview", { profileId }),
    sectionCreate: (value) => call("sectionCreate", value ?? {}),
    sectionUpdate: (patchId, value) => call("sectionUpdate", { rowId: patchId, value }),
    sectionDelete: (patchId) => call("sectionDelete", { rowId: patchId }),
    sectionRename: (patchId, id) => call("sectionRename", { rowId: patchId, id }),
    profileCreate: (value) => call("profileCreate", value ?? {}),
    profileUpdate: (patchId, value) => call("profileUpdate", { rowId: patchId, value }),
    profileDelete: (patchId) => call("profileDelete", { rowId: patchId }),
    setDefault: (value) => call("defaultSet", { profileId: value }),
    last: (choice) => call("last", {
      workspaceId: choice?.workspaceId,
      cwd: choice?.cwd,
      profileId: choice?.profileId ?? "",
    }),
  };
};
// #endregion FUNC_makeRemoteApi

export {
  clientContribution,
  RemoteCallError,
  unwrapRemoteResult,
  remoteCall,
  isRemoteConflict,
  makeRemoteApi,
};
