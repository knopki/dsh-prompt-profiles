/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the authoritative in-memory view of every registered section
 *   and profile row, so service, editor, and prompt injection read one dataset.
 * @scope
 *  - Registration/disposal with the duplicate-config.id policy, sorted
 *    detached views, and the usedIn lookup.
 *  - NOT: mounting rows or serving the registry on ctx.
 * @invariants
 *  - Views are fresh shallow copies in stable order; volatile fields unwrap at
 *    read time. The last registration wins; disposing it reveals the earlier one.
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
/**
 * Pure in-memory registry of section and profile rows.
 *
 * @purpose Own the authoritative dataset the service, editor, and injection read.
 */
export declare class PromptProfilesRegistry {
    #private;
    /**
     * @purpose Initialize empty section/profile registries with the selected duplicate warning sink.
     */
    constructor({ warn }?: {
        warn?: (message: string, details?: unknown) => void;
    });
    /**
     * @purpose Register a section and return a disposer that restores any shadowed registration.
     */
    registerSection(row: RegisterRow): () => void;
    /**
     * @purpose Register a profile and return a disposer that restores any shadowed registration.
     */
    registerProfile(row: RegisterRow): () => void;
    /** @purpose Return detached section views in stable id order. */
    sections(): SectionView[];
    /** @purpose Return detached profile views in title/id order. */
    profiles(): ProfileView[];
    /** @purpose Report each profile reference to the requested section with its scope. */
    usedIn(sectionId: ConfigId): UsedInEntry[];
}
