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
 * Host-side adapters: one per method-table entry, delegating each Remote
 * method to the one shared operation set.
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

// #region FUNC_assertPlainJson
/**
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

function remoteInvocations(): Array<Record<string, unknown>> {
  return buildRemoteDescriptors("host");
}

// #region CLASS_PromptProfilesRemote
/**
 * @purpose Delegate Remote calls to the shared operations over the strict gateway shape.
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
    const ops = createOperations(
      createHostPorts({
        service: options.service,
        getService,
        warn: options.warn,
        log: options.log,
      }),
    );
    const dispatch: Record<string, MethodSpec> = Object.fromEntries(METHOD_SPECS.map((spec) => [spec.method, spec]));

    // #region FUNC_invoke
    /**
     * @purpose Validate and normalize one operation result before it crosses Remote.
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
    // #endregion FUNC_invoke

    for (const spec of METHOD_SPECS) this[spec.method] = (input: unknown) => invoke(spec.method, input);
  }
}
// #endregion CLASS_PromptProfilesRemote

// #region FUNC_registerRemote
/**
 * @purpose Register the whole Remote surface while the `typert` service exists.
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
  // The hand-written contribution has no generated `model` field that the
  // registry type declares; the cast states that narrowly.
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
