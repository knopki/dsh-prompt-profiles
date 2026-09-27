/** #region moduleContract
 * @modulecontract
 * @purpose The composer chip: choose the prompt profile for the next new session.
 * @invariants
 *  - Renders only on a blank session with profiles present.
 *  - A choice is keyed by exactly one value: workspace id, else session cwd.
 *  - Absent key means default, present `""` means explicit none.
 * #endregion moduleContract */

import {
  Button,
  IconChevronDownOutlineRegular,
  IconWarningOutlineRegular,
  Menu,
} from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { errText, idOf, PROFILES_REFRESH_DEBOUNCE_MS, profileLabel, subscribeProfilesChanged } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import { readyApi } from "./transport.ts";
import { chipMaxWidth, triggerChevronStyle, triggerLabelStyle, useNotifier } from "./ui.tsx";

/** The session store the composer reads. */
interface SessionStoreState {
  blank?: boolean;
}
interface WorkspaceItem {
  workspaceId: string;
  sessionIds: string[];
  path?: string;
}
interface WorkspacesStoreState {
  items: WorkspaceItem[];
}
interface SessionRecord {
  cwd?: string;
  projectionValues?: { agentPreset?: unknown };
}
interface SessionsStoreState {
  byId?: Record<string, SessionRecord>;
}
/** A zustand-style store hook: selector only, selected value or undefined. */
export type StoreHook<T> = <R>(selector: (state: T) => R) => R | undefined;

export interface PromptProfileChipProps {
  sessionId: string;
  useSession: StoreHook<SessionStoreState>;
  useWorkspaces: StoreHook<WorkspacesStoreState>;
  useSessions?: StoreHook<SessionsStoreState>;
  t: Translate;
  /** The `last` choice the host stores: exactly one workspace key plus the profile. */
  pick: (choice: { profileId: string; workspaceId?: string; cwd?: string }) => Promise<unknown>;
}

// #region COMPONENT_PromptProfileChip
/**
 * @purpose Select the next-session profile from the composer.
 */
export function PromptProfileChip(props: PromptProfileChipProps): React.ReactElement | null {
  const { sessionId, useSession, useWorkspaces, useSessions = () => undefined, t, pick } = props;
  const session = useSession((s) => s);
  const workspace = useWorkspaces((s) => s.items.find((w) => w.sessionIds.includes(sessionId)));
  const workspaceId = workspace?.workspaceId;
  // A blank Session may not be accounted to a Workspace yet; the host also
  // keys the choice by the Session cwd, so the choice still lands.
  const cwd = useSessions((s) => s?.byId?.[sessionId]?.cwd) ?? workspace?.path;
  // The ACTIVE agent preset, read exactly like the composer's own preset
  // control (`dsh-client-ui-agent-preset` reads
  // `byId[sessionId].projectionValues.agentPreset` from the same session
  // store). Its `complete` flag comes from our /state `modes`
  // (`[{id, title, complete}]`), so no new data source is invented. When the
  // projection carries no preset (or /state lists no such mode) nothing is
  // shown and nothing throws.
  const activeModeId = useSessions((s) => {
    const value = s?.byId?.[sessionId]?.projectionValues?.agentPreset;
    return typeof value === "string" ? value : undefined;
  });
  const [state, setState] = React.useState<StateDocument | null>(null);
  const [open, setOpen] = React.useState(false);
  const { notify, banner } = useNotifier();
  React.useEffect(() => {
    let live = true;
    const load = () =>
      readyApi()
        .then((api) => api.loadState())
        .then((value) => {
          if (live) setState(value);
        })
        .catch((err) => {
          if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"));
        });
    load();
    // The settings page announces every successful profile/section mutation;
    // a burst of edits collapses into ONE re-read (debounce), and the fresh
    // /state is authoritative, so a deleted profile disappears from the
    // trigger and from the menu without a page reload.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeProfilesChanged(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        load();
      }, PROFILES_REFRESH_DEBOUNCE_MS);
    });
    return () => {
      live = false;
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [t, notify]);
  if (session?.blank !== true || !state || !state.profiles?.length) return null;
  const lastKey = workspaceId ?? cwd;
  // Three distinct states, mirroring the host's `resolveProfileId`:
  //  · the key is ABSENT            → the default profile applies;
  //  · the key is present and `''`  → the user explicitly chose "None";
  //  · the key is present and valid → that profile.
  // (A present but stale non-empty id falls back to the default, as on the
  // host; `hasOwnProperty` is what separates "absent" from "explicit none".)
  const lastChoice = state.lastByWorkspace ?? {};
  const hasChoice = lastKey !== undefined && lastKey !== "" && Object.hasOwn(lastChoice, lastKey);
  const chosen = hasChoice ? lastChoice[lastKey] : undefined;
  const chosenProfile = chosen ? state.profiles.find((p) => idOf(p) === chosen) : undefined;
  const selected =
    hasChoice && chosen === "" ? undefined : chosenProfile || state.profiles.find((p) => idOf(p) === state.default);
  // In a `complete: true` mode the engine discards every section, so the
  // chosen profile never reaches the prompt. Say so HERE, in the composer,
  // reusing the settings page's `completeModeWarning` plus the mode title.
  const activeMode = activeModeId ? (state.modes ?? []).find((m) => m.id === activeModeId) : undefined;
  const completeMode = activeMode && activeMode.complete === true ? activeMode : undefined;
  const modeWarning = completeMode ? `${t("completeModeWarning")} ${completeMode.title ?? completeMode.id}` : null;
  const profiles = [...state.profiles].sort((a, b) => a.title.localeCompare(b.title));
  const choose = async (profileId: string): Promise<void> => {
    // No key at all (neither workspaceId nor cwd): the choice cannot be
    // stored, so BLOCK it and explain — never send a doomed request.
    if (!lastKey) {
      setOpen(false);
      notify(t("chooseNeedsWorkspace"));
      return;
    }
    const previous = state;
    // Optimistically keep the explicit "none" as `''` (the host's own
    // explicit-none marker) — storing `undefined` would lose the decision.
    setState({ ...state, lastByWorkspace: { ...state.lastByWorkspace, [lastKey]: profileId || "" } });
    setOpen(false);
    // ALWAYS deliver the choice, keyed by exactly ONE value: the Workspace
    // when the Session is accounted to one, otherwise the Session cwd (the
    // agreed host contract).
    const choice: { profileId: string; workspaceId?: string; cwd?: string } = { profileId };
    if (workspaceId) choice.workspaceId = workspaceId;
    else if (cwd) choice.cwd = cwd;
    try {
      await pick(choice);
      const api = await readyApi();
      const refreshed = await api.loadState();
      setState(refreshed);
    } catch (err) {
      setState(previous);
      notify(errText(err) ? `${t("saveError")} ${errText(err)}`.trim() : t("saveError"));
    }
  };
  // Menu is owner-controlled: `open` + `anchor` (rendered in place) + data
  // rows via `items`; activation arrives on onSelect, dismissal on onClose.
  // Only `none` + the profiles — there is no Settings-navigation API for a
  // third-party plugin in this version, so no "Manage profiles…" entry.
  const items = [
    { id: "none", label: t("none") },
    ...profiles.map((profile) => ({ id: idOf(profile) as string, label: profile.title })),
  ];
  return (
    <>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        // The menu opens upward, portaled out of the composer's clipping.
        side="top"
        portal
        // The chevron is a trailing child: the primitive has no trailing-icon slot.
        anchor={
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("menuLabel")}
            // The complete-mode warning wins the hover text; the blocked state explains itself.
            title={modeWarning ?? (lastKey ? t("menuLabel") : t("chooseNeedsWorkspace"))}
            onClick={() => setOpen(!open)}
            // Dim the trigger in a complete mode — the profile is inert.
            style={completeMode ? { ...chipMaxWidth, opacity: 0.6 } : chipMaxWidth}
          >
            <span style={triggerLabelStyle}>{profileLabel(selected, t)}</span>
            {completeMode && (
              <span
                data-complete-warning={completeMode.id}
                aria-hidden
                style={{
                  color: "var(--dsw-alias-state-warning-primary, orange)",
                  flex: "none",
                  display: "inline-flex",
                }}
              >
                <IconWarningOutlineRegular size={14} />
              </span>
            )}
            <span aria-hidden style={triggerChevronStyle}>
              <IconChevronDownOutlineRegular size={14} />
            </span>
          </Button>
        }
        items={items}
        selectedId={selected ? (idOf(selected) as string) : "none"}
        onSelect={(id: string) => choose(id === "none" ? "" : id)}
      />
      {banner}
    </>
  );
}
// #endregion COMPONENT_PromptProfileChip
