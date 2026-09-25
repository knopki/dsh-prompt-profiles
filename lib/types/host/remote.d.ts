/**
 * Typert Remote surface for the prompt-profiles operations (MIGRATION Phase 2b).
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the shared operations (lib/operations.ts) as a hand-written
 *   Typert Remote service on namespace `promptProfiles`, per the recipe the
 *   2a spike PROVED on live rc.2: no generator, no decorators — one
 *   hand-written invocation descriptor per method with real zod strict
 *   codecs, registered through `ctx.typert.register` inside a Cordis effect,
 *   and a service carrying the 3-field `typertRemote` identity binding the
 *   gateway requires (`Service "…" has no visible typertRemote binding`
 *   without it).
 * @scope
 *  - Descriptor construction now lives in the ONE shared contract
 *    (src/shared/remote-contract.ts — the client mounts the same shape);
 *    this file owns the HOST half: the run adapters (HOST_RUNNERS),
 *    the `PromptProfilesRemote` service (delegation to the shared
 *    operations), and `registerRemote` (plugin fiber + typert contribution +
 *    loud lifecycle logs).
 *  - NOT: operation logic (lib/operations.ts), the client-side mirrored
 *    contribution (src/client/remote.ts).
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
 *  - `undefined`-returning operations (`last`, `defaultSet`) answer
 *    `{ ok: true }`.
 *  - The contribution registers ONLY while the plugin fiber lives: it is
 *    committed inside a Cordis effect and withdrawn with it (verified by the
 *    real-registry smoke test).
 * @dependencies
 *  - USES API: @deepseek-ai/dsh-typert-protocol (TypertRemoteService — the
 *    base class whose constructor binds `typertRemote` with this.name as the
 *    service key and our namespace), zod 4 (strict codecs), ctx.typert.
 *    register, ctx.get(name) REFLECT reads for the optional services,
 *    lib/operations.ts.
 * @rationale
 *  - Q: Why a SECOND service (`promptProfilesRemote`) instead of binding the
 *    registry service itself?
 *    A: The gateway requires the binding's `serviceKey` to equal
 *    `descriptor.service` and Cordis service keys are unique per tree; the
 *    `promptProfiles` key is already taken by the registry service. A
 *    dedicated delegating service keeps the registry untouched and lets the
 *    binding stay exactly the frozen 3-field shape `bindTypertRemote`
 *    returns (service, serviceKey, namespace).
 *  - Q: Why one `input` parameter per invocation (`{ name: 'input', wire:
 *    'input' }`)?
 *    A: The spike proved the wire contract end-to-end: calls become
 *    `POST /api/<namespace>/<method>` with `payload.args.input`, and the
 *    method receives the decoded object as its single argument.
 * @keywords typert, remote, descriptors, strict codecs, zod, typertRemote,
 *   bindTypertRemote, ctx.typert.register, namespace, phase 2b
 * #endregion moduleContract
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE } from "../shared/remote-contract.ts";
export { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE };
/**
 * The host descriptors, built from the ONE shared method table
 * (src/shared/remote-contract.ts — the client half mounts the same shape).
 * The builder reproduces the exact field shape the 2a spike proved against
 * the live rc.2 registry, including this file's historical sourceLocation
 * lines, so the committed host descriptors do not change in any field.
 *
 * @purpose Give `ctx.typert.register` a contribution the strict gateway
 *   accepts without any generator pipeline, keeping the plugin independently
 *   installable (MIGRATION "Out of scope").
 * @returns {Array<object>} fresh descriptor array (safe to register once).
 */
export declare function remoteInvocations(): Record<string, unknown>[];
/**
 * The delegating Typert Remote service (Cordis key `promptProfilesRemote`,
 * wire namespace `promptProfiles`). Extends `TypertRemoteService` so its
 * constructor installs the exact 3-field `typertRemote` binding
 * (`bindTypertRemote(this, this.name, { namespace })`) the gateway's
 * `validateBinding` demands — identity metadata, not auth.
 *
 * @purpose Host every Remote method on a Service the gateway can resolve by
 *   `descriptor.service`, with all behaviour delegated to the ONE shared
 *   operation set (no duplicated logic).
 */
export declare class PromptProfilesRemote extends TypertRemoteService {
    /**
     * Builds the shared operations and installs ONE own-property arrow method
     * per table entry. The methods are CONSTRUCTOR CLOSURES on purpose: the
     * gateway calls them through a context proxy receiver
     * (`receiverContext.extend({ invocation }).get(service)`), and class
     * private fields (`#`) or prototype methods relying on `this` brand checks
     * fail with «Receiver must be an instance of class». Arrow closures ignore
     * the receiver entirely, so proxied dispatch behaves exactly like a direct
     * call.
     * @param {object} options - { service, getService?, warn?, log? }; composed
     *   into the host ports passed to createOperations.
     */
    constructor(ctx: any, options?: {});
}
/**
 * Mount the Remote half inside a Cordis effect: the delegating service fiber
 * plus the strict contribution on `ctx.typert.register`. Both die with the
 * calling fiber — the registry withdrawal is what the smoke test asserts.
 *
 * @purpose Give the plugin ONE call that registers the whole Remote surface
 *   when (and only while) the `typert` service exists, with loud lifecycle
 *   diagnostics.
 * @param {object} ctx - the `typert` inject child (ctx.typert + ctx.get).
 * @param {object} options - { service, warn?, log? }.
 * @returns {() => void} disposer withdrawing the contribution (the service
 *   fiber is a child of `ctx` and disposes with it).
 */
export declare function registerRemote(ctx: any, options: any): () => void;
