/** #region moduleContract
 * @modulecontract
 * @purpose The client half of the promptProfiles Remote surface: the mirrored
 *   contribution plus the typed endpoint facade the UI consumes.
 * @invariants
 *  - Descriptors are shape-identical to the host's; every call passes an object.
 *  - `{ ok: true, value }` resolves to `value`; `{ ok: false, error }`
 *    rejects with the envelope's message and code.
 *  - The envelope carries no status, so conflicts classify from message text.
 * #endregion moduleContract */
import type { CreateResponse, PreviewResponse, RenameResponse, SectionRef, StateDocument } from "./model.ts";
/** One RemoteResult envelope as the gateway delivers it. */
export interface RemoteEnvelope {
    ok?: boolean;
    value?: unknown;
    error?: {
        code?: string;
        message?: string;
    } | null;
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
declare const clientContribution: {
    package: string;
    descriptors: Record<string, unknown>[];
};
/**
 * The Error a `{ ok: false, error }` envelope becomes: the envelope's message
 * (what errText/notify render) plus its `code`, so callers can discriminate
 * without string matching on anything but the documented conflict messages.
 */
declare class RemoteCallError extends Error {
    readonly code: string | undefined;
    constructor(code: string | undefined, message: string | undefined);
}
/**
 * @purpose Unwrap one RemoteResult envelope: `{ ok: true, value }` resolves
 *   to `value`, `{ ok: false, error }` rejects with RemoteCallError — the
 *   failure path every existing UI handler (notify, inline error, runSave)
 *   already consumes via err.message.
 */
declare function unwrapRemoteResult<T>(envelope: RemoteEnvelope | null | undefined): Promise<T>;
/**
 * @purpose One typed call helper per method: calls the injected namespace
 *   service and unwraps the envelope. The argument is ALWAYS an object
 *   (`undefined` fails the wire contract with `missing "input"`).
 */
declare function remoteCall<T>(scope: RemoteScope, method: string, args: object): Promise<T>;
/**
 * @purpose Conflict classifier shared by runSave's re-apply flow: true for a
 *   stale-revision message, so the conflict behaviour (reload, re-apply once,
 *   conflictError notice on the second failure) is preserved.
 */
declare function isRemoteConflict(err: unknown): boolean;
/** @purpose Adapt the injected namespace while preserving endpoint wire shapes. */
declare const makeRemoteApi: (scope: RemoteScope) => RemoteApi;
export { clientContribution, isRemoteConflict, makeRemoteApi, RemoteCallError, remoteCall, unwrapRemoteResult };
