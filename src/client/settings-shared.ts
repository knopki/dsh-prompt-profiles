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
import { errText, notifyProfilesChanged } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import { isRemoteConflict, type RemoteApi } from "./remote.ts";

// #region TYPE_profilesState
export interface ProfilesState {
  state: StateDocument | null;
  setState: (value: StateDocument | null) => void;
  reload: () => Promise<void>;
}
// #endregion TYPE_profilesState

// #region FUNC_useProfilesState
/** @purpose Load the host state document and expose reload/set for the page. */
export function useProfilesState(api: RemoteApi, t: Translate, notify: (text: string) => void): ProfilesState {
  const [state, setState] = React.useState<StateDocument | null>(null);
  const reload = React.useCallback(
    () =>
      api
        .loadState()
        .then(setState)
        .catch((err) => notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"))),
    [api, t, notify],
  );
  React.useEffect(() => {
    reload();
  }, [reload]);
  return { state, setState, reload };
}
// #endregion FUNC_useProfilesState

// #region FUNC_useAutosave
/**
 * @purpose Debounced (~1200 ms) autosave: whenever `value` changes (after the
 *   initial mount), schedule `save()`; a newer change cancels the pending one.
 *   The returned `flush()` saves a pending change immediately — wired to the
 *   field's blur and to the view's back/drill/tab transition, so an edit is
 *   never lost when it is still inside the debounce window. Unmount also
 *   flushes (tab switch, Esc). The skip-first rule plus the create-flow poll
 *   guarantee a freshly created item never autosaves before its row exists.
 */
export function useAutosave(value: unknown, save: () => void, delay = 1200): () => void {
  const latest = React.useRef(save);
  latest.current = save;
  const skipFirst = React.useRef(true);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = React.useRef(false);
  const flush = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (dirty.current) {
      dirty.current = false;
      latest.current();
    }
  }, []);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return undefined;
    }
    dirty.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      dirty.current = false;
      latest.current();
    }, delay);
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [value, delay]);
  // Leaving the view (drill/tab/Esc unmounts the form) must not drop an edit.
  React.useEffect(() => () => flush(), [flush]);
  return flush;
}
// #endregion FUNC_useAutosave

// #region FUNC_runSave
/**
 * @purpose Run one mutation; on 409 re-read the state and re-apply ONCE,
 *   then reload; any remaining failure becomes a notice via `notify`
 *   (the owner's useNotifier banner — Toast itself is component-only) and,
 *   when cheap, an inline error line through `onError`.
 */
export async function runSave(
  fn: () => Promise<unknown>,
  reload: () => Promise<unknown>,
  t: Translate,
  notify: (text: string) => void,
  onError?: (text: string) => void,
): Promise<boolean> {
  const fail = (prefix: string, err: unknown) => {
    const text = `${prefix} ${errText(err)}`.trim();
    notify(text);
    if (onError) onError(text);
  };
  try {
    await fn();
    await reload();
    if (onError) onError("");
    // Composition/title/order/default edits change the roster too.
    notifyProfilesChanged();
    return true;
  } catch (err) {
    // Conflict arrives as the Remote envelope's stale-revision message: the
    // gateway drops the host status, so the message text is the signal.
    if (isRemoteConflict(err)) {
      try {
        await reload();
        await fn();
        await reload();
        if (onError) onError("");
        notifyProfilesChanged();
        return true;
      } catch (retryErr) {
        fail(t("conflictError"), retryErr);
        return false;
      }
    }
    fail(t("saveError"), err);
    return false;
  }
}
// #endregion FUNC_runSave

// #region FUNC_useFocusSelect
/** @purpose Focus the ref'd input and select its text (post-create UX). */
export function useFocusSelect(ref: React.MutableRefObject<HTMLInputElement | null>, active: boolean): void {
  React.useEffect(() => {
    if (active && ref.current && typeof ref.current.focus === "function") {
      ref.current.focus();
      if (typeof ref.current.select === "function") ref.current.select();
    }
  }, [active, ref]);
}
// #endregion FUNC_useFocusSelect
