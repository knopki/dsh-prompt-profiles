/**
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the shared operations as a hand-written Typert Remote service
 *   on namespace `promptProfiles`, per the recipe the 2a spike PROVED on live
 *   rc.2: no generator, no decorators — one hand-written invocation descriptor
 *   per method with real zod strict codecs, registered through
 *   `ctx.typert.register` inside a Cordis effect, and a service carrying the
 *   3-field `typertRemote` identity the gateway requires.
 * @scope
 *  - The HOST half: the run adapters, the `PromptProfilesRemote` service
 *    (delegation to the shared operations), and `registerRemote`.
 *  - NOT: the method table and descriptor shape (src/shared/remote-contract.ts,
 *    which the client mounts too), the operations (host/application/), or the
 *    client-side contribution (src/client/remote.ts).
 * @invariants
 *  - Every input crosses a STRICT zod codec (`z.strictObject`): missing
 *    required fields, extra fields and wrong types are rejected BEFORE the
 *    operation runs, so a malformed call can never touch the patch file.
 *  - Every result is plain JSON (recursive guard: no class instances, no
 *    functions, no cycles, no non-finite numbers) AND validated against its
 *    strict result schema; a violation is a thrown InternalError — the call
 *    surfaces as a Remote failure, never a silent success.
 *  - Business failures are the SAME DomainError objects the operations throw;
 *    the gateway wraps them as Remote failures with the message preserved.
 *  - `undefined`-returning operations (`last`, `defaultSet`) answer `{ok:true}`.
 *  - The contribution registers ONLY while the plugin fiber lives.
 * @dependencies
 *  - USES API: @deepseek-ai/dsh-typert-protocol (TypertRemoteService), zod 4
 *    (strict codecs), ctx.typert.register, ctx.get(name) REFLECT reads for the
 *    optional services, host/application.
 * @rationale
 *  - Q: Why a SECOND service (`promptProfilesRemote`) instead of binding the
 *    registry service itself?
 *    A: The gateway requires the binding's `serviceKey` to equal
 *    `descriptor.service` and Cordis service keys are unique per tree; the
 *    `promptProfiles` key is already taken by the registry service. A
 *    dedicated delegating service keeps the registry untouched.
 * @keywords typert, remote, descriptors, strict codecs, zod, typertRemote
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE } from "../../shared/remote-contract.ts";
import type { LogPort, WarnFn } from "../application/ports.ts";
import { type RegistryService } from "../infra/index.ts";
export { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE };
/** What `registerRemote` and the delegating service need from the plugin. */
export interface RemoteOptions {
    service: RegistryService;
    /** Cordis REFLECT reader for the optional driven services. */
    getService?(name: string): unknown;
    warn?: WarnFn;
    log?: LogPort;
}
/**
 * The host descriptors, built from the ONE shared method table
 * (src/shared/remote-contract.ts — the client half mounts the same shape).
 *
 * @purpose Give `ctx.typert.register` a contribution the strict gateway
 *   accepts without any generator pipeline, keeping the plugin independently
 *   installable.
 */
export declare function remoteInvocations(): Array<Record<string, unknown>>;
/**
 * The delegating Typert Remote service (Cordis key `promptProfilesRemote`,
 * wire namespace `promptProfiles`). Extends `TypertRemoteService` so its
 * constructor installs the exact 3-field `typertRemote` binding the gateway's
 * `validateBinding` demands — identity metadata, not auth.
 */
export declare class PromptProfilesRemote extends TypertRemoteService {
    /**
     * One own-property dispatch closure per method-table entry; the gateway
     * resolves them through a context proxy receiver, so closures rather than
     * prototype methods keep proxied dispatch identical to a direct call.
     */
    [method: string]: unknown;
    constructor(ctx: Context, options: RemoteOptions);
}
/**
 * Mount the Remote half inside a Cordis effect: the delegating service fiber
 * plus the strict contribution on `ctx.typert.register`. Both die with the
 * calling fiber — the registry withdrawal is what the smoke test asserts.
 *
 * @purpose Give the plugin ONE call that registers the whole Remote surface
 *   when (and only while) the `typert` service exists, with loud lifecycle
 *   diagnostics.
 * @returns disposer withdrawing the contribution (the service fiber is a child
 *   of `ctx` and disposes with it).
 */
export declare function registerRemote(ctx: Context, options: RemoteOptions): () => void;
