/**
 * #region moduleContract
 * @modulecontract
 * @purpose Let any bundle contribute a named ordered set of section references
 *   through a dedicated `.../profile` composition row.
 * @scope
 *  - The row's Config (including the section-reference shape), its mandatory
 *    `promptProfiles` injection, real registration in `apply` via
 *    `ctx.effect`, and settings suppression.
 *  - NOT: the service itself (./plugin.ts), snapshot resolution and sealing
 *    (host/application/assembler.ts), or the profile patch mechanics
 *    (host/infra/).
 * @invariants
 *  - The row does not mount until `promptProfiles` exists.
 *  - Disposal (row removal or `disabled: true`) unregisters the profile.
 * @keywords profile, subpath plugin, prompt profiles, registration
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
/** Cordis plugin identity for profile rows. */
export declare const name = "@knopki/dsh-prompt-profiles/profile";
/** Mandatory injection: registration requires the promptProfiles service. */
export declare const inject: string[];
/** A schemastery `.volatile()` config field: the registry reads it through `get()`. */
interface VolatileRef<T> {
    get(): T;
}
/** Resolved config of one profile row: the loader hands volatile fields over as refs. */
export type ProfileRowConfig = {
    id: string;
    title: VolatileRef<string>;
    sections: VolatileRef<Array<{
        id: string;
        order: number;
        scope?: string;
    }>>;
};
/**
 * Plugin entry point: register this row's profile, keep the auto settings page
 * suppressed, and unregister on dispose.
 *
 * @purpose Make the row's config visible in the registry exactly for the row's
 *   lifetime (SPEC §5.1).
 */
export declare function apply(ctx: Context, config: ProfileRowConfig): void;
export {};
