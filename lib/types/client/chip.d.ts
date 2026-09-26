/** #region moduleContract
 * @modulecontract
 * @purpose The composer chip: choose the prompt profile for the next new
 *   session, with the three states the host resolves (absent key → default,
 *   explicit "" → none, a valid id → that profile) and an honest warning when
 *   the ACTIVE agent preset is a complete mode, which discards every section.
 * @scope
 *  - `PromptProfileChip` and the narrow store/prop shapes it reads from the
 *    slot injection.
 *  - NOT: the mount lifecycle (src/client/transport.ts), the settings page or
 *    any host operation.
 * @invariants
 *  - Renders ONLY on a blank session with profiles present.
 *  - A choice is keyed by exactly ONE value: the Workspace when the Session is
 *    accounted to one, otherwise the Session cwd; with neither, the click is
 *    blocked with an explanation instead of sending a doomed request.
 *  - A burst of settings mutations collapses into one debounced /state re-read.
 * @keywords chip, composer, profile choice, complete mode, store hooks
 * #endregion moduleContract */
import * as React from "react";
import type { Translate } from "./i18n.ts";
/** The session store the composer reads. */
export interface SessionStoreState {
    blank?: boolean;
}
export interface WorkspaceItem {
    workspaceId: string;
    sessionIds: string[];
    path?: string;
}
export interface WorkspacesStoreState {
    items: WorkspaceItem[];
}
export interface SessionRecord {
    cwd?: string;
    projectionValues?: {
        agentPreset?: unknown;
    };
}
export interface SessionsStoreState {
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
    pick: (choice: {
        profileId: string;
        workspaceId?: string;
        cwd?: string;
    }) => Promise<unknown>;
}
/**
 * @purpose Chooses a prompt profile for the next new session. The control is
 *   built from the installed primitives — `Button` (ghost/sm, the compact
 *   capsule the neighbouring composer controls use, carrying its own hover/
 *   focus/active states) and `Menu` — instead of hand-written inline
 *   geometry, which had lost the hover background.
 */
export declare function PromptProfileChip(props: PromptProfileChipProps): React.ReactElement | null;
