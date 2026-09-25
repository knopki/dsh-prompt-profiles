/**
 * #region moduleContract
 * @modulecontract
 * @purpose Serve the editor's read model in one call: profiles and sections
 *   with both identifiers, built-in orders, modes, the default and every
 *   per-workspace choice, plus the settings revision.
 * @scope
 *  - The `state` read model and the agent-preset mode scan it needs.
 *  - NOT: any write, preview rendering (preview.ts) or row addressing rules
 *    (env.ts).
 * @invariants
 *  - Reading state degrades PER OPTIONAL SERVICE: it must work without
 *    settings or agentPresets, reporting `revision: null` and `modes: []`.
 *  - A section body may be empty/whitespace (SPEC §7); `emits: false` marks it.
 *  - Rows carry BOTH identifiers: `rowId` (qualified loader entry id) and
 *    `patchId` (the unqualified id every write uses).
 * @keywords state, read model, modes, complete mode, revision
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
    /** Read the full editor state (degrades per optional service). */
    state: (_input?: unknown) => Promise<StateResult>;
};
