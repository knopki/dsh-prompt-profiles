/**
 * #region moduleContract
 * @modulecontract
 * @purpose Show the user what a profile would contribute BEFORE a session
 *   starts, without pretending to be the runtime text.
 * @scope
 *  - The `preview` document only: selection via the shared skip predicate,
 *    built-in placeholders, ordered merge, and the variables actually used.
 *  - NOT: the sealed runtime text (assembler.ts) or any write.
 * @invariants
 *  - The preview is ILLUSTRATIVE: only `{{cwd}}` is filled host-side, every
 *    other variable stays literal and is reported with a `null` value, and
 *    unknown or malformed references are NOT rejected.
 *  - Selection and splice order reuse the SAME rules the sealer applies
 *    (domain/ordering.ts), so preview and runtime cannot disagree about which
 *    sections contribute.
 * @keywords preview, illustrative, variables, cwd, insertion
 * #endregion moduleContract
 */
import type { UseCaseEnv } from "./env.ts";
/** A section as the preview shows it: interpolated leniently, always emitting. */
export interface PreviewSection {
    id: string;
    title: string;
    order: number;
    scope: string;
    text: string;
    emits: true;
}
/** A built-in placeholder at its real engine order. */
export interface PreviewBuiltin {
    kind: "builtin";
    name: string;
    title: string;
    order: number;
}
/** One reference that contributes nothing, with the runtime reason. */
export interface PreviewSkip {
    id: string;
    title: string;
    reason: string;
}
export interface PreviewResult {
    profileId: string;
    title: string;
    sections: Array<PreviewSection | PreviewBuiltin>;
    skipped: PreviewSkip[];
    variables: Record<string, string | null>;
}
/** The raw query/body fields `preview` reads; a missing profileId is rejected. */
export interface PreviewRequest {
    profileId?: unknown;
    cwd?: unknown;
}
/** @purpose Build the preview use case over the shared environment. */
export declare function createPreviewCases(env: UseCaseEnv): {
    /** Illustrative preview of `profileId`, optionally against a session cwd. */
    preview: (input?: PreviewRequest) => PreviewResult;
};
