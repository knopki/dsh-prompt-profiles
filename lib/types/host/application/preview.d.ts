/**
 * #region moduleContract
 * @modulecontract
 * @purpose Show what a profile would contribute BEFORE a session starts,
 *   without pretending to be the runtime text.
 * @scope The `preview` document only: selection, placeholders, ordered merge,
 *   and the variables actually used.
 *  - NOT: the sealed runtime text or any write.
 * @invariants
 *  - The preview is ILLUSTRATIVE: only a supplied `cwd` is filled host-side,
 *    every other variable stays literal with a `null` value.
 *  - Selection and splice order reuse the sealer's rules, so preview and
 *    runtime cannot disagree about which sections contribute.
 * #endregion moduleContract
 */
import type { UseCaseEnv } from "./env.ts";
/** A section as the preview shows it: interpolated leniently, always emitting. */
interface PreviewSection {
    id: string;
    title: string;
    order: number;
    scope: string;
    text: string;
    emits: true;
}
/** A built-in placeholder at its real engine order. */
interface PreviewBuiltin {
    kind: "builtin";
    name: string;
    title: string;
    order: number;
}
/** One reference that contributes nothing, with the runtime reason. */
interface PreviewSkip {
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
    /** @purpose Illustrative preview of `profileId`, optionally against a session cwd. */
    preview: (input?: PreviewRequest) => PreviewResult;
};
export {};
