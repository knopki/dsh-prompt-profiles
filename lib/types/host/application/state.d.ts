/**
 * #region moduleContract
 * @modulecontract
 * @purpose Serve the editor's read model in one call: profiles, sections,
 *   built-in orders, modes, the default, per-workspace choices, and the revision.
 * @scope The `state` read model and the agent-preset mode scan it needs.
 *  - NOT: any write, preview rendering, or row addressing rules.
 * @invariants
 *  - Reading degrades PER OPTIONAL SERVICE: `revision: null`, `modes: []`.
 *  - Rows carry BOTH identifiers: `rowId` and the `patchId` every write uses.
 * #endregion moduleContract
 */
import type { ProfileView, SectionView, UsedInEntry } from "../domain/model.ts";
import type { UseCaseEnv } from "./env.ts";
/** One agent preset as the complete-mode warning reads it. */
export interface ModeView {
    id: string;
    title: string;
    complete: boolean;
}
/** The full editor state document. */
export interface StateResult {
    profiles: Array<ProfileView & {
        patchId: string;
    }>;
    sections: Array<SectionView & {
        patchId: string;
        usedIn: UsedInEntry[];
        emits: boolean;
    }>;
    builtinOrders: Record<string, number>;
    modes: ModeView[];
    default: string;
    lastByWorkspace: Record<string, string> | undefined;
    revision: number | null;
}
/** @purpose Build the state read model over the shared use-case environment. */
export declare function createStateCases(env: UseCaseEnv): {
    /** @purpose Read the full editor state (degrades per optional service). */
    state: (_input?: unknown) => Promise<StateResult>;
};
