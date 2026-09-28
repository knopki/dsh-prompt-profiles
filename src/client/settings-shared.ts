/** #region moduleContract
 * @modulecontract
 * @purpose The hooks the settings tabs share: state loading, debounced
 *   autosave, conflict-retry save and post-create focus.
 * @invariants
 *  - Every mutation goes through `runSave` with one conflict re-apply.
 *  - `useAutosave` skips the mount value and flushes on unmount.
 * #endregion moduleContract */

import * as React from "react";
import { errorNote, notifyProfilesChanged } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import { isRemoteConflict, type RemoteApi } from "./remote.ts";

interface ProfilesState {
  state: StateDocument | null;
  setState: (value: StateDocument | null) => void;
  reload: () => Promise<void>;
}

// #region FUNC_useProfilesState
/** @purpose Load the host state document and expose reload/set for the page. */
export function useProfilesState(api: RemoteApi, t: Translate, notify: (text: string) => void): ProfilesState {
  const [state, setState] = React.useState<StateDocument | null>(null);
  const reload = React.useCallback(
    () =>
      api
        .loadState()
        .then(setState)
        .catch((err) => notify(errorNote(err, t, t("loadError")))),
    [api, t, notify],
  );
  React.useEffect(() => {
    reload();
  }, [reload]);
  return { state, setState, reload };
}
// #endregion FUNC_useProfilesState

// #region FUNC_useAutosave
/** @purpose Debounced autosave with blur/unmount flush; skips the mount value. */
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
/** @purpose Run one mutation with a single conflict re-apply; failures become notices. */
export async function runSave(
  fn: () => Promise<unknown>,
  reload: () => Promise<unknown>,
  t: Translate,
  notify: (text: string) => void,
  onError?: (text: string) => void,
): Promise<boolean> {
  const fail = (prefix: string, err: unknown) => {
    const text = errorNote(err, t, prefix);
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
