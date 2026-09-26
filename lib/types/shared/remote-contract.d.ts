/**
 * #region moduleContract
 * @modulecontract
 * @purpose ONE source of truth for the promptProfiles Remote contract: the
 *   method table (name + strict payload schemas + descriptor line) and the
 *   descriptor builder both faces share, so the host contribution
 *   (`ctx.typert.register`) and the client contribution
 *   (`ctx.remote.$mount`) can never drift apart.
 * @scope
 *  - Identity constants, the METHOD_SPECS table over the strict wire schemas
 *    (src/shared/wire-schemas.ts), the memoized codec factories and
 *    buildRemoteDescriptors(face).
 *  - NOT: the host-side run adapters (src/host/entrypoints/remote.ts),
 *    argument business rules (host/application/payloads.ts), and the client
 *    mount/call helpers (src/client/remote.ts).
 * @invariants
 *  - Descriptors have the exact field shape the 2a spike proved on live rc.2
 *    (id/service/namespace/method/invocation/parameters/result/sourceLocation,
 *    real zod factories in codec.create). The `line` values are DATA, not live
 *    positions: they are the committed host descriptor locations and must stay
 *    byte-identical.
 *  - Both faces see the same method set and the same codec typeSymbols; every
 *    args schema rejects unknown and wrong-typed fields.
 * @dependencies USES API: zod 4 (bundled into both artifacts — the browser
 *   module table has no bare `zod` entry).
 * @keywords remote, contract, descriptors, method table, zod, strict codecs
 * #endregion moduleContract
 */
import type { z } from "zod";
/** Typert package identity (the plugin's npm name, like every contribution). */
export declare const TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
/** Wire namespace of every endpoint (`promptProfiles/<method>`). */
export declare const REMOTE_NAMESPACE = "promptProfiles";
/** Cordis service key of the delegating remote service (host side). */
export declare const REMOTE_SERVICE_KEY = "promptProfilesRemote";
/** One Remote method: its wire name, strict input codec, result codec and descriptor line. */
export interface MethodSpec {
    method: string;
    line: number;
    input: () => z.ZodType;
    result: () => z.ZodType;
}
/**
 * Memoize one zod schema factory: the registry calls `codec.create()` per
 * decode, and rebuilding a schema on every call is pure waste.
 */
export declare function memoCreate<T>(build: () => T): () => T;
/**
 * THE method table. `state` accepts the session hints the 2b contract
 * reserves for the client half; the operation ignores them (state is global).
 */
export declare const METHOD_SPECS: readonly MethodSpec[];
/**
 * @purpose Give `ctx.typert.register` (host) and `ctx.remote.$mount` (client)
 *   identical contributions the strict gateway accepts without any generator
 *   pipeline: `{ id, service, namespace, method, invocation, parameters,
 *   result, sourceLocation }`, with one `input` parameter per invocation.
 */
export declare function buildRemoteDescriptors(face: "host" | "client"): Array<Record<string, unknown>>;
