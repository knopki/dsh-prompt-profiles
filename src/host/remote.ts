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
import {
  buildRemoteDescriptors,
  METHOD_SPECS,
  REMOTE_NAMESPACE,
  REMOTE_SERVICE_KEY,
  TYPERT_PACKAGE,
} from "../shared/remote-contract.ts";
import { InternalError } from "./domain/errors.ts";
import { createHostPorts } from "./infra/index.ts";
import { createOperations } from "./operations.ts";

export { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE };

// #region CONST_hostRunners
/**
 * Host-side adapters: one per METHOD_SPECS entry, delegating each Remote
 * method to the ONE shared operation set. The schemas/descriptors live in the
 * shared contract; only the dispatch behaviour is host-specific.
 *
 * `defaultSet` adapts onto the shared implementation, whose input names the
 * field `default`; `profileId: ""` means "none".
 */
const HOST_RUNNERS = {
  state: (ops, input) => ops.state(input),
  preview: (ops, input) => ops.preview(input),
  sectionCreate: (ops, input) => ops.sectionCreate(input),
  sectionUpdate: (ops, input) => ops.sectionUpdate(input),
  sectionDelete: (ops, input) => ops.sectionDelete(input),
  sectionRename: (ops, input) => ops.sectionRename(input),
  profileCreate: (ops, input) => ops.profileCreate(input),
  profileUpdate: (ops, input) => ops.profileUpdate(input),
  profileDelete: (ops, input) => ops.profileDelete(input),
  last: (ops, input) => ops.last(input),
  defaultSet: (ops, input) => ops.defaultSet({ default: input.profileId, revision: input.revision }),
};
// #endregion CONST_hostRunners

// #region FUNC_assertPlainJson
/**
 * Recursive JSON-safety guard for Remote results. Strict zod schemas pin the
 * STRUCTURE, but `z.unknown()` row entries would happily carry a class
 * instance or a function across the wire — the gateway's assertJsonValue
 * would then fail at encode time with an opaque boundary error. This guard
 * fails fast inside the method, as a clean InternalError.
 *
 * @purpose Guarantee the invariant «results are plain JSON-safe objects» at
 *   the source instead of relying on the transport's boundary check.
 * @param {unknown} value - operation result.
 * @param {string} method - Remote method name, for the error message.
 * @param {Set<object>} [ancestors] - cycle guard.
 * @returns {void} throws InternalError on the first violation.
 */
function assertPlainJson(value, method, ancestors = new Set()) {
  const fail = (why) => {
    throw new InternalError(`remote ${method}: result is not JSON-safe (${why})`);
  };
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
    if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length)
      fail("sparse or decorated array");
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
export function remoteInvocations() {
  return buildRemoteDescriptors("host");
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
 *   operation set (no duplicated logic).
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
   * @param {object} options - { service, getService?, warn?, log? }; composed
   *   into the host ports passed to createOperations.
   */
  constructor(ctx, options = {}) {
    super(ctx, REMOTE_SERVICE_KEY, { namespace: REMOTE_NAMESPACE });
    const getService =
      options.getService ??
      ((name) => {
        try {
          return ctx.get?.(name) ?? undefined;
        } catch {
          return undefined; // absent/throwing service: degrade, never block
        }
      });
    const { ops } = createOperations(
      createHostPorts({
        service: options.service,
        getService,
        warn: options.warn,
        log: options.log,
      }),
    );
    const dispatch = new Map(METHOD_SPECS.map((spec) => [spec.method, spec]));

    // #region METHOD_invoke
    /**
     * ONE dispatch path for every method: run the shared operation (via the
     * HOST_RUNNERS adapter), normalize `undefined` to `{ ok: true }`, enforce
     * JSON-safety and the strict result schema. Business errors (DomainError)
     * propagate unchanged so the gateway reports a Remote failure with the
     * operation's own message preserved.
     */
    const invoke = async (method, input) => {
      const spec = dispatch.get(method);
      const value = await HOST_RUNNERS[method](ops, input);
      const result = value === undefined ? { ok: true } : value;
      assertPlainJson(result, method);
      const parsed = spec.result().safeParse(result);
      if (!parsed.success) {
        throw new InternalError(
          `remote ${method}: result violates its strict schema (${parsed.error.issues[0]?.path?.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""})`,
        );
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
 *   when (and only while) the `typert` service exists, with loud lifecycle
 *   diagnostics.
 * @param {object} ctx - the `typert` inject child (ctx.typert + ctx.get).
 * @param {object} options - { service, warn?, log? }.
 * @returns {() => void} disposer withdrawing the contribution (the service
 *   fiber is a child of `ctx` and disposes with it).
 */
export function registerRemote(ctx, options) {
  const warn =
    options.warn ??
    ((message, details) => {
      try {
        ctx.logger?.warn?.(message, details ?? "");
      } catch {
        /* diagnostics only */
      }
    });
  const log = options.log ?? {
    warn,
    error: (message, details) => {
      try {
        (ctx.logger?.error ?? ctx.logger?.warn ?? console.error)(message, details ?? "");
      } catch {
        /* diagnostics only */
      }
    },
    info: (message, details) => {
      try {
        ctx.logger?.info?.(message, details ?? "");
      } catch {
        /* diagnostics only */
      }
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
    // down; the Remote surface is simply absent.
    log.error("prompt-profiles remote: typert contribution rejected", {
      package: TYPERT_PACKAGE,
      error: error?.message ?? String(error),
    });
    return () => {};
  }
  // The service fiber is scoped to THIS context: disposing the effect's owner
  // (plugin unload, typert disappearance) disposes it with us.
  ctx.plugin(PromptProfilesRemote, {
    service: options.service,
    getService: (name) => {
      try {
        return ctx.get?.(name) ?? undefined;
      } catch {
        return undefined;
      }
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
