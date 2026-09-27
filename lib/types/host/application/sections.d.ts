/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the section row life cycle — create, whole-object update,
 *   delete/disable and the batch rename — as the one implementation every
 *   surface calls.
 * @scope The four section operations and their payload rules (validation first).
 *  - NOT: pure id/reference/ordering rules or the settings and patch mechanics.
 * @invariants
 *  - Every payload is validated BEFORE any write happens.
 *  - An empty section body is valid and non-emitting.
 *  - A created row's `config.id` IS its full row id; old bare config ids are never rewritten.
 *  - PROFILES ARE NEVER TOUCHED by rename.
 * #endregion moduleContract
 */
import { type UseCaseEnv } from "./env.ts";
export interface SectionCreateResult {
    rowId: string;
    patchId: string;
    configId: string;
    title: string;
    body: string;
    emits: boolean;
}
export interface SectionUpdateResult {
    /** The row's own qualified id; null only for a row mounted outside a composition row. */
    rowId: string | null;
    patchId: string;
    emits: boolean;
}
export interface SectionRenameResult {
    rowId: string;
    patchId: string;
    id: string;
    affectedProfiles: Array<{
        profileId: string;
        title: string;
    }>;
}
/** @purpose Build the four section operations over the shared environment. */
export declare function createSectionCases(env: UseCaseEnv): {
    /** @purpose Create a section row; an empty body is valid and non-emitting. */
    sectionCreate: (body?: unknown) => Promise<SectionCreateResult>;
    /** @purpose Whole-object update of a section's volatile fields. */
    sectionUpdate: (body?: unknown) => Promise<SectionUpdateResult>;
    /** @purpose Delete (or disable) a section row. */
    sectionDelete: (body?: unknown) => Promise<import("./env.ts").DeleteResult>;
    /** @purpose Rename a section row; profiles are never rewritten. */
    sectionRename: (body?: unknown) => Promise<SectionRenameResult>;
};
