/**
 * #region moduleContract
 * @modulecontract
 * @purpose Let any bundle contribute a named ordered set of section
 *   references through a dedicated profile composition row.
 * @invariants
 *  - The row does not mount until `promptProfiles` exists.
 *  - Disposal unregisters the profile.
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
export declare const name = "@knopki/dsh-prompt-profiles/profile";
export declare const inject: string[];
interface VolatileRef<T> {
    get(): T;
}
/**
 * @purpose Resolved config of one profile row handed over by the loader.
 */
type ProfileRowConfig = {
    id: string;
    title: VolatileRef<string>;
    sections: VolatileRef<Array<{
        id: string;
        order: number;
        scope?: string;
    }>>;
};
/**
 * @purpose Register this row for exactly its lifetime.
 */
export declare function apply(ctx: Context, config: ProfileRowConfig): void;
export {};
