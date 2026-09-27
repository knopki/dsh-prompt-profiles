/** #region moduleContract
 * @modulecontract
 * @purpose The composer chip: choose the prompt profile for the next new session.
 * @invariants
 *  - Renders only on a blank session with profiles present.
 *  - A choice is keyed by exactly one value: workspace id, else session cwd.
 *  - Absent key means default, present `""` means explicit none.
 * #endregion moduleContract */
import * as React from "react";
import type { Translate } from "./i18n.ts";
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
    projectionValues?: {
        agentPreset?: unknown;
    };
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
    pick: (choice: {
        profileId: string;
        workspaceId?: string;
        cwd?: string;
    }) => Promise<unknown>;
}
/**
 * @purpose Select the next-session profile from the composer.
 */
export declare function PromptProfileChip(props: PromptProfileChipProps): React.ReactElement | null;
export {};
