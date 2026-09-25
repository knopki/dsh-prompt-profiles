// @ts-nocheck
// TODO(phase 1): remove after typing
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
 *  - Descriptor construction (input/result zod 4 strict schemas, memoized
 *    `create` factories), the `PromptProfilesRemote` service (delegation to
 *    the shared operations), and `registerRemote` (plugin fiber + typert
 *    contribution + loud lifecycle logs).
 *  - NOT: operation logic (lib/operations.ts — ONE implementation shared
 *    with the Fetch routes), the HTTP envelope (lib/api.ts), the client-side
 *    mirrored contribution (src/client, phase 2 client half).
 * @invariants
 *  - Every input crosses a STRICT zod codec (`z.strictObject`): missing
 *    required fields, extra fields and wrong types are rejected BEFORE the
 *    operation runs, so a malformed call can never touch the patch file.
 *  - Every result is plain JSON (recursive guard: no class instances, no
 *    functions, no cycles, no non-finite numbers) AND validated against its
 *    strict result schema; a violation is a thrown ApiError 500 — the call
 *    surfaces as a Remote failure, never a silent success.
 *  - Business failures are the SAME ApiError objects the operations throw
 *    for the HTTP path; the gateway wraps them as Remote failures with the
 *    message preserved.
 *  - `undefined`-returning operations (`last`, `defaultSet`) answer
 *    `{ ok: true }`, mirroring the HTTP `{ ok: true }` envelope.
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
import { z } from "zod";
import { createOperations, ApiError } from "./operations.ts";

// #region CONST_identity
/** Typert package identity (the plugin's npm name, like every contribution). */
export const TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
/** Wire namespace of every endpoint (`promptProfiles/<method>`). */
export const REMOTE_NAMESPACE = "promptProfiles";
/** Cordis service key of the delegating remote service (see @rationale). */
export const REMOTE_SERVICE_KEY = "promptProfilesRemote";
// #endregion CONST_identity

// #region FUNC_memoCreate
/**
 * Memoize one zod schema factory: the registry calls `codec.create()` per
 * decode, and rebuilding a schema on every call is pure waste. Mirrors the
 * generated descriptors' memoized factories (`dsh-goal/lib/typert.host.js`).
 */
function memoCreate(build) {
  let cached;
  return () => (cached ??= build());
}
// #endregion FUNC_memoCreate

// #region CONST_resultSchemas
/**
 * Shared strict result building blocks. Row views are open-shaped by design
 * (registry views evolve), so entries are JSON records; the recursive
 * plain-JSON guard plus the enclosing strictObject still pin every result
 * structure (no extra top-level field, no missing field, no wrong type).
 */
const jsonRow = () => z.record(z.string(), z.unknown());
const jsonRows = () => z.array(jsonRow());
const sectionRef = () => z.strictObject({ id: z.string(), order: z.number(), scope: z.string().optional() });
// #endregion CONST_resultSchemas

// #region CONST_methodSpecs
/**
 * THE method table: one entry per Remote method, each naming its input and
 * result strict zod schema and delegating to the shared operations. This
 * table is the single source both the descriptors (below) and the service
 * methods (CLASS_PromptProfilesRemote) are generated from — a method cannot
 * exist on one side and not the other.
 *
 * `state` accepts the session hints the MIGRATION 2b contract reserves for
 * the client half ({sessionId?, cwd?, workspaceId?}); the current operation
 * ignores them (state is global, exactly like GET /state today).
 */
const METHOD_SPECS = [
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
    run: (ops, input) => ops.state(input),
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
    run: (ops, input) => ops.preview(input),
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
    run: (ops, input) => ops.sectionCreate(input),
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
    run: (ops, input) => ops.sectionUpdate(input),
  },
  {
    method: "sectionDelete",
    line: 176,
    input: () => z.strictObject({ rowId: z.string() }),
    result: () => z.strictObject({ disabled: z.boolean() }),
    run: (ops, input) => ops.sectionDelete(input),
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
    run: (ops, input) => ops.sectionRename(input),
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
    run: (ops, input) => ops.profileCreate(input),
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
    run: (ops, input) => ops.profileUpdate(input),
  },
  {
    method: "profileDelete",
    line: 223,
    input: () => z.strictObject({ rowId: z.string(), revision: z.number().optional() }),
    result: () => z.strictObject({ disabled: z.boolean() }),
    run: (ops, input) => ops.profileDelete(input),
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
    run: (ops, input) => ops.last(input),
  },
  {
    method: "defaultSet",
    line: 242,
    input: () => z.strictObject({ profileId: z.string(), revision: z.number().optional() }),
    result: () => z.strictObject({ ok: z.literal(true) }),
    // Adapter onto the shared implementation: the operation keeps the HTTP
    // `/default` body contract (`{default: id|""}`); `profileId: ""` means
    // "none", exactly like the HTTP route.
    run: (ops, input) => ops.defaultSet({ default: input.profileId, revision: input.revision }),
  },
];
// #endregion CONST_methodSpecs

// #region FUNC_assertPlainJson
/**
 * Recursive JSON-safety guard for Remote results. Strict zod schemas pin the
 * STRUCTURE, but `z.unknown()` row entries would happily carry a class
 * instance or a function across the wire — the gateway's assertJsonValue
 * would then fail at encode time with an opaque boundary error. This guard
 * fails fast inside the method, as a clean ApiError 500.
 *
 * @purpose Guarantee the invariant «results are plain JSON-safe objects» at
 *   the source instead of relying on the transport's boundary check.
 * @param {unknown} value - operation result.
 * @param {string} method - Remote method name, for the error message.
 * @param {Set<object>} [ancestors] - cycle guard.
 * @returns {void} throws ApiError(500) on the first violation.
 */
function assertPlainJson(value, method, ancestors = new Set()) {
  const fail = (why) => { throw new ApiError(500, `remote ${method}: result is not JSON-safe (${why})`); };
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("non-finite number");
    return;
  }
  if (typeof value !== "object") fail(`${typeof value} (${String(value)})`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) fail("class instance");
  if (ancestors.has(value)) fail("cycle");
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) fail("sparse or decorated array");
    for (const item of value) assertPlainJson(item, method, ancestors);
  } else {
    if (Object.getOwnPropertySymbols(value).length > 0) fail("symbol key");
    for (const item of Object.values(value)) assertPlainJson(item, method, ancestors);
  }
  ancestors.delete(value);
}
// #endregion FUNC_assertPlainJson

// #region FUNC_remoteInvocations
/**
 * Build the hand-written invocation descriptors (one per METHOD_SPECS entry),
 * in the exact field shape the 2a spike proved against the live rc.2
 * registry: `{ id, service, namespace, method, invocation: { kind: 'direct'
 * }, parameters: [{ name, wire, source: 'json', codec }], result, sourceLocation }`.
 *
 * @purpose Give `ctx.typert.register` a contribution the strict gateway
 *   accepts without any generator pipeline, keeping the plugin independently
 *   installable (MIGRATION "Out of scope").
 * @returns {Array<object>} fresh descriptor array (safe to register once).
 */
export function remoteInvocations() {
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
    sourceLocation: { file: "src/host/remote.ts", line: spec.line, column: 1 },
  }));
}

/** `sectionCreate` → `SectionCreate` (type-symbol segment for the codec). */
function cap(name) {
  return name[0].toUpperCase() + name.slice(1);
}
// #endregion FUNC_remoteInvocations

// #region CLASS_PromptProfilesRemote
/**
 * The delegating Typert Remote service (Cordis key `promptProfilesRemote`,
 * wire namespace `promptProfiles`). Extends `TypertRemoteService` so its
 * constructor installs the exact 3-field `typertRemote` binding
 * (`bindTypertRemote(this, this.name, { namespace })`) the gateway's
 * `validateBinding` demands — identity metadata, not auth.
 *
 * @purpose Host every Remote method on a Service the gateway can resolve by
 *   `descriptor.service`, with all behaviour delegated to the ONE shared
 *   operation set (no duplicated logic, identical error semantics to HTTP).
 */
export class PromptProfilesRemote extends TypertRemoteService {
  /**
   * Builds the shared operations and installs ONE own-property arrow method
   * per table entry. The methods are CONSTRUCTOR CLOSURES on purpose: the
   * gateway calls them through a context proxy receiver
   * (`receiverContext.extend({ invocation }).get(service)`), and class
   * private fields (`#`) or prototype methods relying on `this` brand checks
   * fail with «Receiver must be an instance of class». Arrow closures ignore
   * the receiver entirely, so proxied dispatch behaves exactly like a direct
   * call.
   *
   * @purpose Host every Remote method on a Service the gateway can resolve by
   *   `descriptor.service`, with all behaviour delegated to the ONE shared
   *   operation set (no duplicated logic, identical error semantics to HTTP).
   *
   * @param {object} ctx - Cordis plugin context.
   * @param {object} options - plugin config: { service, getService?, warn?, log? }
   *   forwarded to createOperations (same deps contract as registerApi).
   */
  constructor(ctx, options = {}) {
    super(ctx, REMOTE_SERVICE_KEY, { namespace: REMOTE_NAMESPACE });
    const getService = options.getService ?? ((name) => {
      try {
        return ctx.get?.(name) ?? undefined;
      } catch {
        return undefined; // absent/throwing service: degrade, never block
      }
    });
    const { ops } = createOperations({
      service: options.service,
      getService,
      warn: options.warn,
      log: options.log,
    });
    const dispatch = new Map(METHOD_SPECS.map((spec) => [spec.method, spec]));

    // #region METHOD_invoke
    /**
     * ONE dispatch path for every method: run the shared operation, normalize
     * `undefined` to `{ ok: true }` (the HTTP envelope semantics), enforce
     * JSON-safety and the strict result schema. Business errors (ApiError)
     * propagate unchanged so the gateway reports a Remote failure with the
     * operation's own status semantics preserved in the message.
     */
    const invoke = async (method, input) => {
      const spec = dispatch.get(method);
      const value = await spec.run(ops, input);
      const result = value === undefined ? { ok: true } : value;
      assertPlainJson(result, method);
      const parsed = spec.result().safeParse(result);
      if (!parsed.success) {
        throw new ApiError(500, `remote ${method}: result violates its strict schema (${parsed.error.issues[0]?.path?.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""})`);
      }
      return parsed.data;
    };
    // #endregion METHOD_invoke

    // Remote methods (one-line delegates generated from the table —
    // grace-lite: no per-method regions on trivial forwarders).
    for (const spec of METHOD_SPECS) this[spec.method] = (input) => invoke(spec.method, input);
  }
}
// #endregion CLASS_PromptProfilesRemote

// #region FUNC_registerRemote
/**
 * Mount the Remote half inside a Cordis effect: the delegating service fiber
 * plus the strict contribution on `ctx.typert.register`. Both die with the
 * calling fiber — the registry withdrawal is what the smoke test asserts.
 *
 * @purpose Give the plugin ONE call that registers the whole Remote surface
 *   when (and only while) the `typert` service exists, with the same loud
 *   lifecycle diagnostics the HTTP mount has.
 * @param {object} ctx - the `typert` inject child (ctx.typert + ctx.get).
 * @param {object} options - { service, warn?, log? } (registerApi contract).
 * @returns {() => void} disposer withdrawing the contribution (the service
 *   fiber is a child of `ctx` and disposes with it).
 */
export function registerRemote(ctx, options) {
  const warn = options.warn ?? ((message, details) => {
    try { ctx.logger?.warn?.(message, details ?? ""); } catch { /* diagnostics only */ }
  });
  const log = options.log ?? {
    warn,
    error: (message, details) => {
      try { (ctx.logger?.error ?? ctx.logger?.warn ?? console.error)(message, details ?? ""); } catch { /* diagnostics only */ }
    },
    info: (message, details) => {
      try { ctx.logger?.info?.(message, details ?? ""); } catch { /* diagnostics only */ }
    },
  };
  const contribution = {
    package: TYPERT_PACKAGE,
    face: "host",
    schemas: [],
    invocations: remoteInvocations(),
  };
  let disposeContribution = () => {};
  try {
    disposeContribution = ctx.typert.register(contribution) ?? (() => {});
  } catch (error) {
    // LOUD but non-fatal: a broken registration must never take the plugin
    // (or the HTTP routes) down; the Remote surface is simply absent.
    log.error("prompt-profiles remote: typert contribution rejected", {
      package: TYPERT_PACKAGE, error: error?.message ?? String(error),
    });
    return () => {};
  }
  // The service fiber is scoped to THIS context: disposing the effect's owner
  // (plugin unload, typert disappearance) disposes it with us.
  ctx.plugin(PromptProfilesRemote, {
    service: options.service,
    getService: (name) => {
      try { return ctx.get?.(name) ?? undefined; } catch { return undefined; }
    },
    warn,
    log,
  });
  log.info("prompt-profiles remote: mounted", {
    namespace: REMOTE_NAMESPACE,
    methods: contribution.invocations.length,
  });
  return () => {
    try {
      disposeContribution();
    } catch (error) {
      warn("prompt-profiles remote: contribution withdrawal failed", { error: error?.message ?? String(error) });
    }
  };
}
// #endregion FUNC_registerRemote
