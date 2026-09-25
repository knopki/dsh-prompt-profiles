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
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import {
  buildRemoteDescriptors,
  METHOD_SPECS,
  type MethodSpec,
  REMOTE_NAMESPACE,
  REMOTE_SERVICE_KEY,
  TYPERT_PACKAGE,
} from "../../shared/remote-contract.ts";
import { createOperations, type OperationSet, type PreviewRequest } from "../application/index.ts";
import type { LogPort, WarnFn } from "../application/ports.ts";
import { InternalError } from "../domain/errors.ts";
import { createHostPorts, type RegistryService } from "../infra/index.ts";

export { REMOTE_NAMESPACE, REMOTE_SERVICE_KEY, TYPERT_PACKAGE };

// #region TYPE_remoteOptions
/** What `registerRemote` and the delegating service need from the plugin. */
export interface RemoteOptions {
  service: RegistryService;
  /** Cordis REFLECT reader for the optional driven services. */
  getService?(name: string): unknown;
  warn?: WarnFn;
  log?: LogPort;
}
// #endregion TYPE_remoteOptions

// #region CONST_hostRunners
/**
 * Host-side adapters: one per METHOD_SPECS entry, delegating each Remote
 * method to the ONE shared operation set. The schemas/descriptors live in the
 * shared contract; only the dispatch behaviour is host-specific.
 */
const HOST_RUNNERS: Record<string, (ops: OperationSet, input: unknown) => unknown> = {
  state: (ops, input) => ops.state(input),
  preview: (ops, input) => ops.preview(input as PreviewRequest | undefined),
  sectionCreate: (ops, input) => ops.sectionCreate(input),
  sectionUpdate: (ops, input) => ops.sectionUpdate(input),
  sectionDelete: (ops, input) => ops.sectionDelete(input),
  sectionRename: (ops, input) => ops.sectionRename(input),
  profileCreate: (ops, input) => ops.profileCreate(input),
  profileUpdate: (ops, input) => ops.profileUpdate(input),
  profileDelete: (ops, input) => ops.profileDelete(input),
  last: (ops, input) => ops.last(input),
  defaultSet: (ops, input) => {
    // The wire field is `profileId`; the shared operation names it `default`.
    const { profileId, revision } = (input ?? {}) as { profileId?: unknown; revision?: number };
    return ops.defaultSet({ default: profileId, revision });
  },
};
// #endregion CONST_hostRunners

// #region FUNC_assertPlainJson
/**
 * Recursive JSON-safety guard for Remote results. Strict zod schemas pin the
 * STRUCTURE, but row entries typed as unknown would happily carry a class
 * instance or a function across the wire — the gateway's own boundary check
 * would then fail with an opaque error. This guard fails fast inside the
 * method, as a clean InternalError.
 *
 * @purpose Guarantee the invariant «results are plain JSON-safe objects» at
 *   the source instead of relying on the transport's boundary check.
 */
function assertPlainJson(value: unknown, method: string, ancestors: Set<object> = new Set()): void {
  const fail: (why: string) => never = (why) => {
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
 *
 * @purpose Give `ctx.typert.register` a contribution the strict gateway
 *   accepts without any generator pipeline, keeping the plugin independently
 *   installable.
 */
export function remoteInvocations(): Array<Record<string, unknown>> {
  return buildRemoteDescriptors("host");
}
// #endregion FUNC_remoteInvocations

// #region CLASS_PromptProfilesRemote
/**
 * The delegating Typert Remote service (Cordis key `promptProfilesRemote`,
 * wire namespace `promptProfiles`). Extends `TypertRemoteService` so its
 * constructor installs the exact 3-field `typertRemote` binding the gateway's
 * `validateBinding` demands — identity metadata, not auth.
 */
export class PromptProfilesRemote extends TypertRemoteService {
  /**
   * One own-property dispatch closure per method-table entry; the gateway
   * resolves them through a context proxy receiver, so closures rather than
   * prototype methods keep proxied dispatch identical to a direct call.
   */
  [method: string]: unknown;

  constructor(ctx: Context, options: RemoteOptions) {
    super(ctx, REMOTE_SERVICE_KEY, { namespace: REMOTE_NAMESPACE });
    const getService =
      options.getService ??
      ((name: string) => {
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
    const dispatch: Record<string, MethodSpec> = Object.fromEntries(METHOD_SPECS.map((spec) => [spec.method, spec]));

    // #region METHOD_invoke
    /**
     * ONE dispatch path for every method: run the shared operation, normalize
     * `undefined` to `{ ok: true }`, enforce JSON-safety and the strict result
     * schema. Business errors (DomainError) propagate unchanged so the gateway
     * reports a Remote failure with the operation's own message preserved.
     */
    const invoke = async (method: string, input: unknown): Promise<unknown> => {
      const value = await HOST_RUNNERS[method](ops, input);
      const result = value === undefined ? { ok: true } : value;
      assertPlainJson(result, method);
      const parsed = dispatch[method].result().safeParse(result);
      if (!parsed.success) {
        throw new InternalError(
          `remote ${method}: result violates its strict schema (${parsed.error.issues[0]?.path?.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""})`,
        );
      }
      return parsed.data;
    };
    // #endregion METHOD_invoke

    for (const spec of METHOD_SPECS) this[spec.method] = (input: unknown) => invoke(spec.method, input);
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
 * @returns disposer withdrawing the contribution (the service fiber is a child
 *   of `ctx` and disposes with it).
 */
export function registerRemote(ctx: Context, options: RemoteOptions): () => void {
  const warn =
    options.warn ??
    ((message: string, details?: unknown) => {
      try {
        ctx.logger?.warn?.(message, details ?? "");
      } catch {
        // diagnostics only
      }
    });
  const log: LogPort = options.log ?? {
    warn,
    error: (message, details) => {
      try {
        if (ctx.logger?.error) ctx.logger.error(message, details ?? "");
        else if (ctx.logger?.warn) ctx.logger.warn(message, details ?? "");
        else console.error(message, details ?? "");
      } catch {
        // diagnostics only
      }
    },
    info: (message, details) => {
      try {
        ctx.logger?.info?.(message, details ?? "");
      } catch {
        // diagnostics only
      }
    },
  };
  // The hand-written contribution registers WITHOUT the generated `model`
  // field the registry type declares (proven against the real rc.2 registry);
  // the cast is the narrowest way to state that here.
  const contribution = {
    package: TYPERT_PACKAGE,
    face: "host",
    schemas: [],
    invocations: remoteInvocations(),
  } as unknown as TypertContribution;
  let disposeContribution = () => {};
  try {
    disposeContribution = ctx.typert.register(contribution) ?? (() => {});
  } catch (error) {
    // LOUD but non-fatal: a broken registration must never take the plugin
    // down; the Remote surface is simply absent.
    log.error?.("prompt-profiles remote: typert contribution rejected", {
      package: TYPERT_PACKAGE,
      error: (error as { message?: string } | null)?.message ?? String(error),
    });
    return () => {};
  }
  // The service fiber is scoped to THIS context: disposing the effect's owner
  // (plugin unload, typert disappearance) disposes it with us.
  ctx.plugin(PromptProfilesRemote, {
    service: options.service,
    getService: (name: string) => {
      try {
        return ctx.get?.(name) ?? undefined;
      } catch {
        return undefined;
      }
    },
    warn,
    log,
  });
  log.info?.("prompt-profiles remote: mounted", {
    namespace: REMOTE_NAMESPACE,
    methods: contribution.invocations.length,
  });
  return () => {
    try {
      disposeContribution();
    } catch (error) {
      warn("prompt-profiles remote: contribution withdrawal failed", {
        error: (error as { message?: string } | null)?.message ?? String(error),
      });
    }
  };
}
// #endregion FUNC_registerRemote
