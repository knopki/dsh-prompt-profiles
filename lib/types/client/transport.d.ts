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
import { type RemoteApi, type RemoteScope } from "./remote.ts";
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
    remote: {
        $mount(contribution: unknown): Promise<unknown> | unknown;
    };
    effect(callback: () => unknown): unknown;
    inject(keys: string[], callback: (scope: RemoteScope) => (() => void) | undefined): (() => void) | undefined;
    logger?: {
        error?: (message: string, details: Record<string, unknown>) => void;
    };
}
export declare const unavailableApi: RemoteApi;
/** @purpose Await the Remote mount outcome, then hand back the api to use. */
export declare const readyApi: () => Promise<RemoteApi>;
/** @purpose The api at call time (settings-section inject); Remote once mounted. */
export declare const getActiveApi: () => RemoteApi;
/**
 * @purpose Mount the client contribution inside a Cordis effect: $mount,
 *   then ctx.inject on the namespace; both disposers run when the plugin
 *   fiber dies, so the namespace service disappears with the plugin.
 */
export declare function mountRemote(ctx: PluginCtx): void;
