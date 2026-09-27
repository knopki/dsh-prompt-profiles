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
} from "./wire-schemas.ts";

export const TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
export const REMOTE_NAMESPACE = "promptProfiles";
export const REMOTE_SERVICE_KEY = "promptProfilesRemote";

/**
 * @purpose One Remote method: wire name, strict codecs, descriptor line.
 */
export interface MethodSpec {
  method: string;
  line: number;
  input: () => zmini.ZodMiniType;
  result: () => zmini.ZodMiniType;
}

/** Memoize one schema factory; the registry calls `codec.create()` per decode. */
function memoCreate<T>(build: () => T): () => T {
  let cached: T | undefined;
  return () => (cached ??= build());
}

/** The method table: state accepts reserved client session hints, ignored because state is global. */
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

/** Committed descriptor data, not live source locations; preserve them across source moves. */
const FACE_FILES: Record<string, string> = {
  host: "src/host/remote.ts",
  client: "src/client/remote.ts",
};

// #region FUNC_buildRemoteDescriptors
/**
 * @purpose Give host and client identical contributions the strict gateway accepts.
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
