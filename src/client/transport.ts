/** #region moduleContract
 * @modulecontract
 * @purpose Own the client's Remote transport: mount the contribution in a
 *   Cordis effect, then swap the active api facade to the Remote one.
 * @invariants
 *  - Until the mount settles, data paths await `remoteSettled` rather than racing.
 *  - A failed mount leaves `unavailableApi` in force, reported via the UI error path.
 * #endregion moduleContract */

import type { Translate } from "./i18n.ts";
import { boundT } from "./i18n.ts";
import { clientContribution, makeRemoteApi, type RemoteApi, type RemoteScope } from "./remote.ts";

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

/** Every method rejects until the Remote mount succeeds, so no call can fall back silently. */
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
export const unavailableApi = Object.fromEntries(
  UNAVAILABLE_METHODS.map((method) => [method, raiseRemoteUnavailable]),
) as unknown as RemoteApi;

let activeApi: RemoteApi = unavailableApi;
let remoteSettled: Promise<boolean> = Promise.resolve(false);

// #region FUNC_readyApi
/** @purpose Await the Remote mount outcome, then hand back the api to use. */
export const readyApi = async (): Promise<RemoteApi> => {
  await remoteSettled;
  return activeApi;
};
// #endregion FUNC_readyApi

// #region FUNC_getActiveApi
/** @purpose The api at call time (settings-section inject); Remote once mounted. */
export const getActiveApi = (): RemoteApi => activeApi;
// #endregion FUNC_getActiveApi

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
