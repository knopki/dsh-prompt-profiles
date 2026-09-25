/**
 * Pure registry of prompt sections and profiles (no Cordis at import time).
 * #region moduleContract
 * @modulecontract
 * @purpose Own the authoritative in-memory view of every registered section and
 *   profile row so the service, the editor and the prompt-injection step all
 *   read one consistent, deterministically ordered dataset.
 * @scope
 *  - Registration/disposal with the duplicate-config.id policy (SPEC §5.1),
 *    sorted views, usedIn lookup, and insertionIndex.
 *  - Pure data structure: no Cordis, no filesystem, no clock.
 *  - NOT: mounting rows (section.js/profile.js), serving the registry on ctx
 *    (index.js), prompt injection (PLAN step 3).
 * @invariants
 *  - Views are fresh shallow copies in a stable order; mutating one never
 *    affects the registry. Volatile `.get()` fields are unwrapped at READ time
 *    so live settings edits keep flowing (astra finding B).
 *  - A duplicate config.id resolves to the registration mounted LAST;
 *    disposing an overridden registration is a no-op.
 *  - A section's order is used EXACTLY as the profile states it — equal orders
 *    (with a built-in or a peer) are legal and never normalized.
 * @dependencies USES API: none (pure). Consumers inject warn callbacks.
 * @rationale Q: Why anchor insertion on built-in NAMES, not section.order?
 *   A: Spike R1 proved assembled sections are sorted BEFORE the waterfall and
 *   carry NO `order` field — only names present in that assembly can anchor.
 * @keywords registry, sections, profiles, duplicate, usedIn,
 *   insertionIndex, prompt profiles
 * #endregion moduleContract
 */
/** Pure in-memory registry of section and profile rows. */
export declare class PromptProfilesRegistry {
    #private;
    /**
     * @param {object} [options]
     * @param {(message: string, details?: unknown) => void} [options.warn]
     *   duplicate-id sink (defaults to console.warn).
     */
    constructor({ warn }?: {
        warn?: {
            (...data: any[]): void;
            (...data: any[]): void;
            (message?: any, ...optionalParams: any[]): void;
        } | undefined;
    });
    /**
     * Register one `.../section` row (SPEC §5.1). `source` is
     * `'bundle' | 'user' | 'unknown'`.
     * @returns {() => void} disposer; a no-op when a later row with the same
     *   config.id already overrode this registration.
     */
    registerSection(row: any): () => void;
    /**
     * Register one `.../profile` row (SPEC §5.1); same disposer semantics as
     * {@link registerSection}.
     */
    registerProfile(row: any): () => void;
    /** Detached view of every section, sorted by `id` (SPEC decision). */
    sections(): any[];
    /** Detached view of every profile, sorted by `title` then `id` (SPEC decision 19). */
    profiles(): any[];
    /**
     * Which profiles reference a section, with per-profile scope — feeds the
     * editor's read-only «используется в» field (SPEC §2 #26).
     * @returns {Array<{ profileId: string, scope: string }>} sorted by
     *   profileId; a section referenced twice contributes one entry per ref.
     */
    usedIn(sectionId: any): {
        profileId: any;
        scope: any;
    }[];
}
/**
 * Where our sections must be spliced into an already-sorted
 * `assembly.sections` array. Spike R1 (R1-R2-injection-and-patch.md): the
 * assembly is sorted BEFORE the waterfall and never re-sorted, and its entries
 * carry NO `order` — only a built-in NAME present in that assembly can anchor,
 * so a mirror entry absent from the assembly and foreign names never count.
 *
 * Rule: order `o` goes immediately AFTER the last element whose built-in order
 * is known and `< o` (0 when none). An order EQUAL to a present built-in is NOT
 * shifted — it lands just before that built-in, which keeps the position
 * deterministic (the engine sorts by order, then name).
 *
 * @param {number[]} sectionOrders - our orders EXACTLY as the profile states
 *   them, already ascending (the listener sorts the same way; equal orders keep
 *   profile order).
 * @param {string[]} presentBuiltinNames - names of `assembly.sections` IN ARRAY
 *   ORDER (unknown names are skipped by the scan but occupy slots).
 * @param {Record<string, number>} builtinOrders - name→order map (dotted names
 *   like `tool:bash`; see builtinOrdersByName).
 * @returns {Array<{ order: number, index: number }>} aligned with
 *   sectionOrders; `index` is a position in the ORIGINAL array. Splice from
 *   LAST to FIRST so earlier indices stay valid; equal indices preserve the
 *   input (ascending) order.
 */
export declare function insertionIndex(sectionOrders: any, presentBuiltinNames: any, builtinOrders: any): {
    order: any;
    index: number;
}[];
