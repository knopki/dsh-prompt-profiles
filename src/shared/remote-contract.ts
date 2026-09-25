// @ts-nocheck
// TODO(phase 1): remove after typing
/** #region moduleContract
 * @modulecontract
 * @purpose ONE source of truth for the promptProfiles Remote contract: the
 *   method table (name + strict zod args/result schemas) and the descriptor
 *   builder both faces share, so the host descriptors (registered through
 *   ctx.typert.register) and the client descriptors (mounted through
 *   ctx.remote.$mount) can never drift apart in shape.
 * @scope
 *  - Identity constants (package, namespace, service key), the METHOD_SPECS
 *    table, memoized codec factories, and buildRemoteDescriptors(face).
 *  - NOT: the host-side `run` adapters (src/host/remote.ts — they delegate to
 *    the shared operations), the host service/registration, and the client
 *    mount/call helpers (src/client/remote.ts).
 * @invariants
 *  - buildRemoteDescriptors('host') reproduces the exact descriptor field
 *    shape the 2a spike PROVED on live rc.2 and the host committed in 8a27a2f
 *    (id/service/namespace/method/invocation/parameters/result/sourceLocation,
 *    real zod factories in codec.create) — including the historical
 *    sourceLocation line numbers, which are DATA here, not live positions.
 *  - Both faces see the same method set and the same codec typeSymbols; a
 *    method cannot exist on one side and not the other.
 *  - Every args schema is z.strictObject: missing/extra/wrong-typed fields are
 *    rejected before any business code runs, on BOTH sides of the wire.
 * @dependencies
 *  - USES API: zod 4 (bundled into both the host and the client artifact —
 *    the browser module table has no bare `zod` entry).
 * @rationale
 *  - Q: Why keep `line` as a stale literal instead of the new file position?
 *    A: The host descriptors (their sourceLocation included) are public
 *    committed behaviour (MIGRATION phase 2b host half, commit 8a27a2f); the
 *    instruction is to fix the builder, not the tests. The literals preserve
 *    byte-identical host descriptors while the table lives in a new file.
 * @keywords remote, contract, descriptors, method table, zod, strict codecs,
 *   shared, phase 2b
 * #endregion moduleContract */

import { z } from "zod";

// #region CONST_identity
/** Typert package identity (the plugin's npm name, like every contribution). */
export const TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
/** Wire namespace of every endpoint (`promptProfiles/<method>`). */
export const REMOTE_NAMESPACE = "promptProfiles";
/** Cordis service key of the delegating remote service (host side). */
export const REMOTE_SERVICE_KEY = "promptProfilesRemote";
// #endregion CONST_identity

// #region FUNC_memoCreate
/**
 * Memoize one zod schema factory: the registry calls `codec.create()` per
 * decode, and rebuilding a schema on every call is pure waste. Mirrors the
 * generated descriptors' memoized factories (`dsh-goal/lib/typert.host.js`).
 */
export function memoCreate(build) {
  let cached;
  return () => (cached ??= build());
}
// #endregion FUNC_memoCreate

// #region CONST_resultSchemas
/**
 * Shared strict result building blocks. Row views are open-shaped by design
 * (registry views evolve), so entries are JSON records; the recursive
 * plain-JSON guard (host) plus the enclosing strictObject still pin every
 * result structure.
 */
const jsonRow = () => z.record(z.string(), z.unknown());
const jsonRows = () => z.array(jsonRow());
const sectionRef = () => z.strictObject({ id: z.string(), order: z.number(), scope: z.string().optional() });
// #endregion CONST_resultSchemas

// #region CONST_methodSpecs
/**
 * THE method table: one entry per Remote method, each naming its input and
 * result strict zod schema. Host-side `run` adapters (src/host/remote.ts) and
 * the client call helpers (src/client/remote.ts) are both generated from this
 * table.
 *
 * `state` accepts the session hints the MIGRATION 2b contract reserves for
 * the client half ({sessionId?, cwd?, workspaceId?}); the current operation
 * ignores them (state is global, exactly like GET /state today).
 *
 * `line` preserves the sourceLocation line each host descriptor carried when
 * the table lived in src/host/remote.ts (see @rationale in the module
 * contract) — host descriptors must not change in any field.
 */
export const METHOD_SPECS = [
  {
    method: "state",
    line: 115,
    input: () => z.strictObject({
      sessionId: z.string().optional(),
      cwd: z.string().optional(),
      workspaceId: z.string().optional(),
    }),
    result: () => z.strictObject({
      profiles: jsonRows(),
      sections: jsonRows(),
      builtinOrders: z.record(z.string(), z.number()),
      modes: z.array(z.strictObject({ id: z.string(), title: z.string(), complete: z.boolean() })),
      default: z.string(),
      lastByWorkspace: z.record(z.string(), z.string()),
      revision: z.number().nullable(),
    }),
  },
  {
    method: "preview",
    line: 134,
    input: () => z.strictObject({ profileId: z.string(), cwd: z.string().optional() }),
    result: () => z.strictObject({
      profileId: z.string(),
      title: z.string(),
      sections: jsonRows(),
      skipped: z.array(z.strictObject({ id: z.string(), title: z.string(), reason: z.string() })),
      variables: z.record(z.string(), z.string().nullable()),
    }),
  },
  {
    method: "sectionCreate",
    line: 147,
    input: () => z.strictObject({
      id: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
    }),
    result: () => z.strictObject({
      rowId: z.string(),
      patchId: z.string(),
      configId: z.string(),
      title: z.string(),
      body: z.string(),
      emits: z.boolean(),
    }),
  },
  {
    method: "sectionUpdate",
    line: 165,
    input: () => z.strictObject({
      rowId: z.string(),
      value: z.strictObject({ title: z.string(), body: z.string() }),
      revision: z.number().optional(),
    }),
    result: () => z.strictObject({ rowId: z.string(), patchId: z.string(), emits: z.boolean() }),
  },
  {
    method: "sectionDelete",
    line: 176,
    input: () => z.strictObject({ rowId: z.string() }),
    result: () => z.strictObject({ disabled: z.boolean() }),
  },
  {
    method: "sectionRename",
    line: 183,
    input: () => z.strictObject({ rowId: z.string(), id: z.string() }),
    result: () => z.strictObject({
      rowId: z.string(),
      patchId: z.string(),
      id: z.string(),
      affectedProfiles: z.array(z.strictObject({ profileId: z.string(), title: z.string() })),
    }),
  },
  {
    method: "profileCreate",
    line: 195,
    input: () => z.strictObject({
      id: z.string().optional(),
      title: z.string().optional(),
      sections: z.array(sectionRef()).optional(),
    }),
    result: () => z.strictObject({
      rowId: z.string(),
      patchId: z.string(),
      configId: z.string(),
      title: z.string(),
      sections: z.array(sectionRef()),
    }),
  },
  {
    method: "profileUpdate",
    line: 212,
    input: () => z.strictObject({
      rowId: z.string(),
      value: z.strictObject({ title: z.string(), sections: z.array(sectionRef()).optional() }),
      revision: z.number().optional(),
    }),
    result: () => z.strictObject({ rowId: z.string(), patchId: z.string() }),
  },
  {
    method: "profileDelete",
    line: 223,
    input: () => z.strictObject({ rowId: z.string(), revision: z.number().optional() }),
    result: () => z.strictObject({ disabled: z.boolean() }),
  },
  {
    method: "last",
    line: 230,
    input: () => z.strictObject({
      workspaceId: z.string().optional(),
      cwd: z.string().optional(),
      profileId: z.string(),
      revision: z.number().optional(),
    }),
    result: () => z.strictObject({ ok: z.literal(true) }),
  },
  {
    method: "defaultSet",
    line: 242,
    input: () => z.strictObject({ profileId: z.string(), revision: z.number().optional() }),
    result: () => z.strictObject({ ok: z.literal(true) }),
  },
];
// #endregion CONST_methodSpecs

/** Source-location file each face reports in its descriptors. */
const FACE_FILES = {
  host: "src/host/remote.ts",
  client: "src/client/remote.ts",
};

// #region FUNC_buildRemoteDescriptors
/**
 * Build the hand-written invocation descriptors (one per METHOD_SPECS entry)
 * for one face, in the exact field shape the 2a spike proved against the live
 * rc.2 registry: `{ id, service, namespace, method, invocation: { kind:
 * 'direct' }, parameters: [{ name, wire, source: 'json', codec }], result,
 * sourceLocation }`.
 *
 * @purpose Give `ctx.typert.register` (host) and `ctx.remote.$mount`
 *   (client) identical contributions the strict gateway accepts without any
 *   generator pipeline, keeping the plugin independently installable.
 * @param {"host"|"client"} face - which side the descriptors are for (only
 *   the reported sourceLocation differs).
 * @returns {Array<object>} fresh descriptor array (safe to register once).
 */
export function buildRemoteDescriptors(face) {
  const file = FACE_FILES[face] ?? FACE_FILES.host;
  return METHOD_SPECS.map((spec) => ({
    id: `${TYPERT_PACKAGE}#${REMOTE_NAMESPACE}/${spec.method}`,
    service: REMOTE_SERVICE_KEY,
    namespace: REMOTE_NAMESPACE,
    method: spec.method,
    invocation: { kind: "direct" },
    parameters: [{
      name: "input",
      wire: "input",
      source: "json",
      codec: {
        mode: "strict",
        typeSymbol: `${TYPERT_PACKAGE}#${cap(spec.method)}Input`,
        create: memoCreate(spec.input),
      },
    }],
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
function cap(name) {
  return name[0].toUpperCase() + name.slice(1);
}
