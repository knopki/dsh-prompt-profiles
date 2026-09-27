/**
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the shared operations as a hand-written Typert Remote
 *   service on namespace `promptProfiles`.
 * @scope
 *  - The host half: run adapters, the delegating service, `registerRemote`.
 *  - NOT: the method table (shared/remote-contract.ts) or the operations.
 * @invariants
 *  - Inputs cross a strict codec before the operation runs; results are
 *    plain JSON and match their strict result schema.
 *  - The contribution registers only while the plugin fiber lives.
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE } from "../../shared/remote-contract.ts";
import type { LogPort, WarnFn } from "../application/ports.ts";
import { type RegistryService } from "../infra/index.ts";
export { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE };
/**
 * @purpose What `registerRemote` and the delegating service need from the plugin.
 */
interface RemoteOptions {
    service: RegistryService;
    /** Cordis REFLECT reader for the optional driven services. */
    getService?(name: string): unknown;
    warn?: WarnFn;
    log?: LogPort;
}
/**
 * @purpose Delegate Remote calls to the shared operations over the strict gateway shape.
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
 * @purpose Register the whole Remote surface while the `typert` service exists.
 * @returns disposer withdrawing the contribution (the service fiber is a child
 *   of `ctx` and disposes with it).
 */
export declare function registerRemote(ctx: Context, options: RemoteOptions): () => void;
