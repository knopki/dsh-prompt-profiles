/** #region moduleContract
 * @modulecontract
 * @purpose The hooks the settings page shares across its tabs: load the host
 *   state document, autosave a field value after a debounce, run one mutation
 *   with the conflict re-apply, and the post-create focus/select.
 * @scope
 *  - `useProfilesState`, `useAutosave`, `runSave`, `useFocusSelect`.
 *  - NOT: the components that use them (settings-profiles/sections/preview).
 * @invariants
 *  - Every mutation goes through `runSave`: on a stale-revision failure the
 *    state is re-read and the write re-applied ONCE, then the failure becomes
 *    a notice and an optional inline error line.
 *  - `useAutosave` skips the first value (the mount value) and flushes on
 *    unmount, so leaving a view never drops an edit still inside the debounce.
 * @keywords settings hooks, autosave, run save, conflict retry, focus select
 * #endregion moduleContract */
import { React } from "./element.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import { type RemoteApi } from "./remote.ts";
export interface ProfilesState {
    state: StateDocument | null;
    setState: (value: StateDocument | null) => void;
    reload: () => Promise<void>;
}
/** @purpose Load the host state document and expose reload/set for the page. */
export declare function useProfilesState(api: RemoteApi, t: Translate, notify: (text: string) => void): ProfilesState;
/**
 * @purpose Debounced (~1200 ms) autosave: whenever `value` changes (after the
 *   initial mount), schedule `save()`; a newer change cancels the pending one.
 *   The returned `flush()` saves a pending change immediately — wired to the
 *   field's blur and to the view's back/drill/tab transition, so an edit is
 *   never lost when it is still inside the debounce window. Unmount also
 *   flushes (tab switch, Esc). The skip-first rule plus the create-flow poll
 *   guarantee a freshly created item never autosaves before its row exists.
 */
export declare function useAutosave(value: unknown, save: () => void, delay?: number): () => void;
/**
 * @purpose Run one mutation; on 409 re-read the state and re-apply ONCE,
 *   then reload; any remaining failure becomes a notice via `notify`
 *   (the owner's useNotifier banner — Toast itself is component-only) and,
 *   when cheap, an inline error line through `onError`.
 */
export declare function runSave(fn: () => Promise<unknown>, reload: () => Promise<unknown>, t: Translate, notify: (text: string) => void, onError?: (text: string) => void): Promise<boolean>;
/** @purpose Focus the ref'd input and select its text (post-create UX). */
export declare function useFocusSelect(ref: React.MutableRefObject<HTMLInputElement | null>, active: boolean): void;
