/**
 * #region moduleContract
 * @modulecontract
 * @purpose Let any bundle contribute a named markdown fragment through a
 *   dedicated section composition row.
 * @invariants
 *  - The row does not mount until `promptProfiles` exists.
 *  - Disposal unregisters the section.
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
export declare const name = "@knopki/dsh-prompt-profiles/section";
export declare const inject: string[];
/** Config schema for a section row; id is non-volatile because renames are batch operations. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    id: z<string, string, "defined">;
    title: z<string, string, "volatile-defined">;
    body: z<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    id: z<string, string, "defined">;
    title: z<string, string, "volatile-defined">;
    body: z<string, string, "volatile-defined">;
}>>, "plain">;
interface VolatileRef<T> {
    get(): T;
}
/**
 * @purpose Resolved config of one section row handed over by the loader.
 */
type SectionRowConfig = {
    id: string;
    title: VolatileRef<string>;
    body: VolatileRef<string>;
};
/**
 * @purpose Register the section for exactly this row's lifetime.
 */
export declare function apply(ctx: Context, config: SectionRowConfig): void;
export {};
