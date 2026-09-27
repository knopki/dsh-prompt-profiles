/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the profile row life cycle — create, whole-object update,
 *   delete with reference cleanup, the default choice and the per-workspace
 *   last choice — as the one implementation every surface calls.
 * @scope The five profile operations and their payload rules (validation first).
 *  - NOT: pure id/reference rules or the settings/patch mechanics.
 * @invariants
 *  - Every payload is validated BEFORE any write happens.
 *  - `last` stores the choice under the SAME key the assembler reads.
 *  - Deleting the ROW is authoritative and happens first; reference cleanup is
 *    best-effort and never turns a successful delete into a failure.
 * #endregion moduleContract
 */
import { type SectionRef } from "../domain/index.ts";
import { type UseCaseEnv } from "./env.ts";
export interface ProfileCreateResult {
    rowId: string;
    patchId: string;
    configId: string;
    title: string;
    sections: SectionRef[];
}
export interface ProfileUpdateResult {
    /** The row's own qualified id; null only for a row mounted outside a composition row. */
    rowId: string | null;
    patchId: string;
}
/** @purpose Build the five profile operations over the shared environment. */
export declare function createProfileCases(env: UseCaseEnv): {
    /** @purpose Create a profile row. */
    profileCreate: (body?: unknown) => Promise<ProfileCreateResult>;
    /** @purpose Whole-object update of a profile's volatile fields. */
    profileUpdate: (body?: unknown) => Promise<ProfileUpdateResult>;
    /** @purpose Delete a profile row and best-effort-clear its default/last references. */
    profileDelete: (body?: unknown) => Promise<import("./env.ts").DeleteResult>;
    /** @purpose Set (`""`/null = clear) the default profile. */
    defaultSet: (body?: {
        default?: unknown;
        revision?: number;
    }) => Promise<void>;
    /** @purpose Record the workspace's last chosen profile. */
    last: (body?: unknown) => Promise<void>;
};
