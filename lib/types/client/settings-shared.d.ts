/** #region moduleContract
 * @modulecontract
 * @purpose The hooks the settings tabs share: state loading, debounced
 *   autosave, conflict-retry save and post-create focus.
 * @invariants
 *  - Every mutation goes through `runSave` with one conflict re-apply.
 *  - `useAutosave` skips the mount value and flushes on unmount.
 * #endregion moduleContract */
import * as React from "react";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import { type RemoteApi } from "./remote.ts";
interface ProfilesState {
    state: StateDocument | null;
    setState: (value: StateDocument | null) => void;
    reload: () => Promise<void>;
}
/** @purpose Load the host state document and expose reload/set for the page. */
export declare function useProfilesState(api: RemoteApi, t: Translate, notify: (text: string) => void): ProfilesState;
/** @purpose Debounced autosave with blur/unmount flush; skips the mount value. */
export declare function useAutosave(value: unknown, save: () => void, delay?: number): () => void;
/** @purpose Run one mutation with a single conflict re-apply; failures become notices. */
export declare function runSave(fn: () => Promise<unknown>, reload: () => Promise<unknown>, t: Translate, notify: (text: string) => void, onError?: (text: string) => void): Promise<boolean>;
/** @purpose Focus the ref'd input and select its text (post-create UX). */
export declare function useFocusSelect(ref: React.MutableRefObject<HTMLInputElement | null>, active: boolean): void;
export {};
