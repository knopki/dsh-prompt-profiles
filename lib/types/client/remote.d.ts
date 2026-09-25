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
 *    UI consumes).
 *  - NOT: the mount lifecycle (src/client/index.ts owns the Cordis effect)
 *    and anything host-side.
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
 *  - USES API: ctx.remote.$mount (mount, owner: src/client/index.ts),
 *    ctx.inject(['remote.promptProfiles'], scope => ...) — the namespace
 *    service is NOT reachable bare; zod 4 (bundled, via the shared contract).
 * @rationale
 *  - Q: Why classify conflicts by message text instead of a status field?
 *    A: The gateway serializes a thrown host ApiError as
 *    `{ code: 'gateway/internal', message }` — the status does not cross the
 *    envelope. Until the host can throw a code-carrying RemoteError (deferred
 *    refactor), the two deterministic conflict messages are the only honest
 *    signal available.
 * @keywords remote, client, contribution, $mount, inject, envelope, unwrap,
 *   RemoteResult, facade, phase 2b
 * #endregion moduleContract */
/**
 * The client contribution mounted through `ctx.remote.$mount(...)`: our
 * package identity plus the descriptors built from the ONE shared method
 * table — the same namespace (`promptProfiles`) and methods the host serves.
 */
declare const clientContribution: {
    package: any;
    descriptors: any;
};
/**
 * The Error a `{ ok: false, error }` envelope becomes: the envelope's message
 * (what errText/notify render) plus its `code`, so callers can discriminate
 * without string matching on anything but the documented conflict messages.
 */
declare class RemoteCallError extends Error {
    constructor(code: any, message: any);
}
/**
 * @purpose Unwrap one RemoteResult envelope: `{ ok: true, value }` resolves
 *   to `value`, `{ ok: false, error }` rejects with RemoteCallError — the
 *   failure path every existing UI handler (notify, inline error, runSave)
 *   already consumes via err.message.
 * @param {{ok: boolean, value?: any, error?: {code?: string, message?: string}}} envelope
 * @returns {Promise<any>} the unwrapped business value.
 */
declare function unwrapRemoteResult(envelope: any): Promise<any>;
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
declare function remoteCall(scope: any, method: any, args: any): Promise<any>;
/**
 * @purpose Conflict classifier shared by runSave's re-apply flow: true for a
 *   stale-revision message, so the conflict behaviour (reload, re-apply once,
 *   conflictError notice on the second failure) is preserved.
 */
declare function isRemoteConflict(err: any): boolean;
/**
 * @purpose The endpoint facade over the Remote namespace: WRITES send the
 *   unqualified `patchId` in the `rowId` field, updates carry WHOLE objects in
 *   `value`, `setDefault("")` means none, `last(choice)` keys the choice by
 *   exactly one of workspaceId/cwd. Results come from the envelope unwrap;
 *   failures throw with the message preserved.
 * @param {object} scope - the ctx.inject(['remote.promptProfiles']) scope.
 * @returns {object} the api facade consumed by the chip, settings page and
 *   the create/mutation flows.
 */
declare const makeRemoteApi: (scope: any) => {
    loadState: () => Promise<any>;
    preview: (profileId: any) => Promise<any>;
    sectionCreate: (value: any) => Promise<any>;
    sectionUpdate: (patchId: any, value: any) => Promise<any>;
    sectionDelete: (patchId: any) => Promise<any>;
    sectionRename: (patchId: any, id: any) => Promise<any>;
    profileCreate: (value: any) => Promise<any>;
    profileUpdate: (patchId: any, value: any) => Promise<any>;
    profileDelete: (patchId: any) => Promise<any>;
    setDefault: (value: any) => Promise<any>;
    last: (choice: any) => Promise<any>;
};
export { clientContribution, isRemoteConflict, makeRemoteApi, RemoteCallError, remoteCall, unwrapRemoteResult };
