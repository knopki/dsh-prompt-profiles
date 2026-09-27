/** #region moduleContract
 * @modulecontract
 * @purpose Own the client's Remote transport: mount the contribution in a
 *   Cordis effect, then swap the active api facade to the Remote one.
 * @invariants
 *  - Until the mount settles, data paths await `remoteSettled` rather than racing.
 *  - A failed mount leaves `unavailableApi` in force, reported via the UI error path.
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
