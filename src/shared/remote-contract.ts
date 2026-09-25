/**
 * #region moduleContract
 * @modulecontract
 * @purpose ONE source of truth for the promptProfiles Remote contract: the
 *   method table (name + strict payload schemas + descriptor line) and the
 *   descriptor builder both faces share, so the host contribution
 *   (`ctx.typert.register`) and the client contribution
 *   (`ctx.remote.$mount`) can never drift apart.
 * @scope
 *  - Identity constants, the METHOD_SPECS table over the domain payload
 *    schemas (src/host/domain/validation.ts), the memoized codec factories and
 *    buildRemoteDescriptors(face).
 *  - NOT: the host-side run adapters (src/host/remote.ts), argument business
 *    rules (domain/validation.ts payload variants), and the client mount/call
 *    helpers (src/client/remote.ts).
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
import {
  defaultSetInput,
  lastInput,
  okResult,
  previewInput,
  previewResult,
  profileCreateInput,
  profileCreateResult,
  profileDeleteInput,
  profileDeleteResult,
  profileUpdateInput,
  profileUpdateResult,
  sectionCreateInput,
  sectionCreateResult,
  sectionDeleteInput,
  sectionDeleteResult,
  sectionRenameInput,
  sectionRenameResult,
  sectionUpdateInput,
  sectionUpdateResult,
  stateInput,
  stateResult,
} from "../host/domain/validation.ts";

// #region CONST_identity
/** Typert package identity (the plugin's npm name, like every contribution). */
export const TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
/** Wire namespace of every endpoint (`promptProfiles/<method>`). */
export const REMOTE_NAMESPACE = "promptProfiles";
/** Cordis service key of the delegating remote service (host side). */
export const REMOTE_SERVICE_KEY = "promptProfilesRemote";
// #endregion CONST_identity

// #region TYPE_MethodSpec
/** One Remote method: its wire name, strict input codec, result codec and descriptor line. */
export interface MethodSpec {
  method: string;
  line: number;
  input: () => z.ZodType;
  result: () => z.ZodType;
}
// #endregion TYPE_MethodSpec

// #region FUNC_memoCreate
/**
 * Memoize one zod schema factory: the registry calls `codec.create()` per
 * decode, and rebuilding a schema on every call is pure waste.
 */
export function memoCreate<T>(build: () => T): () => T {
  let cached: T | undefined;
  return () => (cached ??= build());
}
// #endregion FUNC_memoCreate

// #region CONST_methodSpecs
/**
 * THE method table. `state` accepts the session hints the 2b contract
 * reserves for the client half; the operation ignores them (state is global).
 */
export const METHOD_SPECS: readonly MethodSpec[] = [
  { method: "state", line: 115, input: () => stateInput, result: () => stateResult },
  { method: "preview", line: 134, input: () => previewInput, result: () => previewResult },
  { method: "sectionCreate", line: 147, input: () => sectionCreateInput, result: () => sectionCreateResult },
  { method: "sectionUpdate", line: 165, input: () => sectionUpdateInput, result: () => sectionUpdateResult },
  { method: "sectionDelete", line: 176, input: () => sectionDeleteInput, result: () => sectionDeleteResult },
  { method: "sectionRename", line: 183, input: () => sectionRenameInput, result: () => sectionRenameResult },
  { method: "profileCreate", line: 195, input: () => profileCreateInput, result: () => profileCreateResult },
  { method: "profileUpdate", line: 212, input: () => profileUpdateInput, result: () => profileUpdateResult },
  { method: "profileDelete", line: 223, input: () => profileDeleteInput, result: () => profileDeleteResult },
  { method: "last", line: 230, input: () => lastInput, result: () => okResult },
  { method: "defaultSet", line: 242, input: () => defaultSetInput, result: () => okResult },
];
// #endregion CONST_methodSpecs

/** Source-location file each face reports in its descriptors. */
const FACE_FILES: Record<string, string> = {
  host: "src/host/remote.ts",
  client: "src/client/remote.ts",
};

// #region FUNC_buildRemoteDescriptors
/**
 * @purpose Give `ctx.typert.register` (host) and `ctx.remote.$mount` (client)
 *   identical contributions the strict gateway accepts without any generator
 *   pipeline: `{ id, service, namespace, method, invocation, parameters,
 *   result, sourceLocation }`, with one `input` parameter per invocation.
 */
export function buildRemoteDescriptors(face: "host" | "client"): Array<Record<string, unknown>> {
  const file = FACE_FILES[face] ?? FACE_FILES.host;
  return METHOD_SPECS.map((spec) => ({
    id: `${TYPERT_PACKAGE}#${REMOTE_NAMESPACE}/${spec.method}`,
    service: REMOTE_SERVICE_KEY,
    namespace: REMOTE_NAMESPACE,
    method: spec.method,
    invocation: { kind: "direct" },
    parameters: [
      {
        name: "input",
        wire: "input",
        source: "json",
        codec: {
          mode: "strict",
          typeSymbol: `${TYPERT_PACKAGE}#${cap(spec.method)}Input`,
          create: memoCreate(spec.input),
        },
      },
    ],
    result: {
      mode: "strict",
      typeSymbol: `${TYPERT_PACKAGE}#${cap(spec.method)}Result`,
      create: memoCreate(spec.result),
    },
    sourceLocation: { file, line: spec.line, column: 1 },
  }));
}
// #endregion FUNC_buildRemoteDescriptors

/** `sectionCreate` → `SectionCreate` (type-symbol segment for the codec). */
function cap(name: string): string {
  return name[0].toUpperCase() + name.slice(1);
}
