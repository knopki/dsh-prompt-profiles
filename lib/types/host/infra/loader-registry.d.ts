/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the authoritative in-memory view of every registered section
 *   and profile row, so the service, the editor and the prompt-injection step
 *   read one consistent, deterministically ordered dataset.
 * @scope
 *  - Registration/disposal with the duplicate-config.id policy (SPEC §5.1),
 *    sorted detached views, and the usedIn lookup. Insertion anchoring is a
 *    domain rule and lives in domain/ordering.ts (re-exported here for the
 *    modules and tests that reach it through the registry).
 *  - Pure data structure: no Cordis, no filesystem, no clock.
 *  - NOT: mounting rows (section.ts/profile.ts), serving the registry on ctx
 *    (index.ts), prompt injection.
 * @invariants
 *  - Views are fresh shallow copies in a stable order; mutating one never
 *    affects the registry. Volatile `.get()` fields are unwrapped at READ time
 *    so live settings edits keep flowing into views, sorting and usedIn.
 *  - A duplicate config.id resolves to the registration mounted LAST;
 *    disposing an overridden registration is a no-op, and disposing the winner
 *    reveals the still-mounted earlier one.
 * @keywords registry, sections, profiles, duplicate, usedIn
 * #endregion moduleContract
 */
import type { ConfigId, ProfileView, RowSource, SectionView, UsedInEntry } from "../domain/model.ts";
import { insertionIndex } from "../domain/ordering.ts";
export { insertionIndex };
/** A row handed to the registry by its composition row plugin. */
interface RegisterRow {
    rowId?: string | null;
    config: {
        id: string;
    } & Record<string, unknown>;
    source?: RowSource;
}
/** Pure in-memory registry of section and profile rows. */
export declare class PromptProfilesRegistry {
    #private;
    /** @param options.warn duplicate-id sink (defaults to console.warn). */
    constructor({ warn }?: {
        warn?: (message: string, details?: unknown) => void;
    });
    /**
     * Register one `.../section` row (SPEC §5.1).
     * @returns disposer; a no-op when a later row with the same config.id
     *   already overrode this registration.
     */
    registerSection(row: RegisterRow): () => void;
    /** Register one `.../profile` row; same disposer semantics as registerSection. */
    registerProfile(row: RegisterRow): () => void;
    /** Detached view of every section, sorted by `id`. */
    sections(): SectionView[];
    /** Detached view of every profile, sorted by `title` then `id` (SPEC decision 19). */
    profiles(): ProfileView[];
    /**
     * Which profiles reference a section, with per-profile scope — feeds the
     * editor's read-only «используется в» field (SPEC §2 #26). A section
     * referenced twice contributes one entry per reference.
     */
    usedIn(sectionId: ConfigId): UsedInEntry[];
}
