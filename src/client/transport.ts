/** #region moduleContract
 * @modulecontract
 * @purpose Own the client's Remote transport: mount the mirrored contribution
 *   through `ctx.remote.$mount` inside a Cordis effect, then swap the active
 *   api facade to the Remote one via
 *   `ctx.inject(['remote', 'remote.promptProfiles'])` — the namespace service
 *   is NOT reachable bare.
 * @scope
 *  - The active-api holder, the mount lifecycle and the plugin-context shape
 *    this bundle declares in `inject`.
 *  - NOT: the descriptors and the facade itself (src/client/remote.ts).
 * @invariants
 *  - Until the mount settles, every data path awaits `remoteSettled`, so a
 *    call issued before mount WAITS rather than racing.
 *  - A failed mount is loud (logger.error/console.error with the stage) and
 *    leaves `unavailableApi` in force: the UI reports it through its normal
 *    error path, never a silent second transport.
 * @keywords remote mount, cordis effect, inject, unavailable api, plugin ctx
 * #endregion moduleContract */

import type { Translate } from "./i18n.ts";
import { boundT } from "./i18n.ts";
import { clientContribution, makeRemoteApi, type RemoteApi, type RemoteScope } from "./remote.ts";

// #region TYPE_pluginCtx
/** One slot row as this bundle registers it (the platform owns the full type). */
export interface SlotRegistration {
  name: string;
  id: string;
  order: number;
  locale: string;
  label?: () => string;
  inject?: (sessionId: string) => Record<string, unknown>;
}

/** The Cordis plugin-context surface this bundle touches — exactly its `inject` list. */
export interface PluginCtx {
  locale: {
    register(ns: string, dictionaries: Record<string, Record<string, string>>): void;
    bind?(ns: string): Translate;
  };
  slots: {
    inject(name: string, callback: () => unknown): unknown;
    register(options: SlotRegistration, component: unknown): unknown;
  };
  remote: { $mount(contribution: unknown): Promise<unknown> | unknown };
  effect(callback: () => unknown): unknown;
  inject(keys: string[], callback: (scope: RemoteScope) => (() => void) | undefined): (() => void) | undefined;
  logger?: { error?: (message: string, details: Record<string, unknown>) => void };
}
// #endregion TYPE_pluginCtx

// #region FUNC_remoteUnavailableApi
/**
 * @purpose The facade in force until the Remote mount succeeds: every method
 *   fails with ONE clear message, which the existing UI error paths (chip
 *   notify, settings placeholder, inline error) render. It exists so no call
 *   can ever fall back to another transport or resolve with stale silence.
 */
const raiseRemoteUnavailable = () => Promise.reject(new Error(boundT("remoteUnavailable")));
const UNAVAILABLE_METHODS = [
  "loadState",
  "preview",
  "sectionCreate",
  "sectionUpdate",
  "sectionDelete",
  "sectionRename",
  "profileCreate",
  "profileUpdate",
  "profileDelete",
  "setDefault",
  "last",
] as const;
// Object.fromEntries cannot infer the facade's named methods; the method list
// above is exactly RemoteApi's surface.
export const unavailableApi = Object.fromEntries(
  UNAVAILABLE_METHODS.map((method) => [method, raiseRemoteUnavailable]),
) as unknown as RemoteApi;
// #endregion FUNC_remoteUnavailableApi

// #region CONST_activeApi
let activeApi: RemoteApi = unavailableApi;
let remoteSettled: Promise<boolean> = Promise.resolve(false);

/** @purpose Await the Remote mount outcome, then hand back the api to use. */
export const readyApi = async (): Promise<RemoteApi> => {
  await remoteSettled;
  return activeApi;
};

/** @purpose The api at call time (settings-section inject); Remote once mounted. */
export const getActiveApi = (): RemoteApi => activeApi;
// #endregion CONST_activeApi

// #region FUNC_mountRemote
/**
 * @purpose Mount the client contribution inside a Cordis effect: $mount,
 *   then ctx.inject on the namespace; both disposers run when the plugin
 *   fiber dies, so the namespace service disappears with the plugin.
 */
export function mountRemote(ctx: PluginCtx): void {
  let settle!: (value: boolean) => void;
  remoteSettled = new Promise((resolve) => {
    settle = resolve;
  });
  const loud = (stage: string, error: unknown) => {
    const message = (error as { message?: string } | null | undefined)?.message ?? String(error);
    const details = { stage, error: message };
    try {
      (ctx.logger?.error ?? console.error)(
        "prompt-profiles client: Remote mount failed; the UI now reports it",
        details,
      );
    } catch (_) {
      /* diagnostics only */
    }
    settle(false);
  };
  ctx.effect(() => {
    let disposeMount: () => unknown = () => {};
    let disposeInject: () => void = () => {};
    void (async () => {
      try {
        const mounted = await ctx.remote.$mount(clientContribution);
        disposeMount = typeof mounted === "function" ? (mounted as () => unknown) : () => {};
        // Both keys declared: 'remote' for the service itself and the dotted
        // namespace key — scope.remote.promptProfiles resolves only under
        // this inject (proven pattern; bare access throws "without inject").
        disposeInject =
          ctx.inject(["remote", "remote.promptProfiles"], (scope) => {
            activeApi = makeRemoteApi(scope);
            settle(true);
            return () => {};
          }) ?? (() => {});
      } catch (error) {
        loud("$mount", error);
      }
    })();
    return async () => {
      try {
        disposeInject();
      } catch (_) {
        /* already gone */
      }
      try {
        await disposeMount();
      } catch (_) {
        /* already gone */
      }
    };
  });
}
// #endregion FUNC_mountRemote
