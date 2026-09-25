/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the section row life cycle — create, whole-object update,
 *   delete/disable and the batch rename — as the one implementation every
 *   surface calls.
 * @scope
 *  - The four section operations and their payload rules (validation first).
 *  - Writes to EXISTING rows replace the WHOLE volatile config via
 *    settings.replace; creation/removal/disable go through the patch port;
 *    rename is the documented batch that touches the SECTION ONLY and returns
 *    `affectedProfiles` for the user to fix by hand.
 *  - NOT: pure id/reference/ordering rules (domain/) or the settings and patch
 *    mechanics themselves (infra/).
 * @invariants
 *  - Every payload is validated BEFORE any write happens.
 *  - A section body may be empty/whitespace (SPEC §7).
 *  - FROZEN ID SCHEME: a created row's `config.id` IS its full row id
 *    (`prompt-section-<token>`) and the returned `configId`; existing rows with
 *    old bare config ids are never rewritten.
 *  - PROFILES ARE NEVER TOUCHED by rename.
 * @keywords sections, create, update, delete, rename, use cases
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
    /** Create a section row (SPEC §7: empty body allowed). */
    sectionCreate: (body?: unknown) => Promise<SectionCreateResult>;
    /** Whole-object update of a section's volatile fields. */
    sectionUpdate: (body?: unknown) => Promise<SectionUpdateResult>;
    /** Delete (or disable) a section row. */
    sectionDelete: (body?: unknown) => Promise<import("./env.ts").DeleteResult>;
    /** Rename a section row; profiles are never rewritten. */
    sectionRename: (body?: unknown) => Promise<SectionRenameResult>;
};
