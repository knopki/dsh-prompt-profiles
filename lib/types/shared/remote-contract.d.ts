/**
 * #region moduleContract
 * @modulecontract
 * @purpose Hold the one method table and descriptor builder both Remote
 *   faces share, so host and client contributions cannot drift apart.
 * @invariants
 *  - Descriptor schema and fields are an invariant shared by both faces.
 *  - The source-location line values and FACE_FILES paths are committed
 *    descriptor data and must not change.
 *  - Every args schema rejects unknown and wrong-typed fields.
 * #endregion moduleContract
 */
import type * as zmini from "zod/mini";
export declare const TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
export declare const REMOTE_NAMESPACE = "promptProfiles";
export declare const REMOTE_SERVICE_KEY = "promptProfilesRemote";
/**
 * @purpose One Remote method: wire name, strict codecs, descriptor line.
 */
export interface MethodSpec {
    method: string;
    line: number;
    input: () => zmini.ZodMiniType;
    result: () => zmini.ZodMiniType;
}
/** The method table: state accepts reserved client session hints, ignored because state is global. */
export declare const METHOD_SPECS: readonly MethodSpec[];
/**
 * @purpose Give host and client identical contributions the strict gateway accepts.
 */
export declare function buildRemoteDescriptors(face: "host" | "client"): Array<Record<string, unknown>>;
