/**
 * #region moduleContract
 * @modulecontract
 * @purpose Let any bundle contribute a named markdown fragment to prompt
 *   profiles through a dedicated `.../section` composition row.
 * @scope
 *  - The row's Config, its mandatory `promptProfiles` injection, real
 *    registration in `apply` via `ctx.effect`, and settings suppression.
 *  - NOT: the service itself (./plugin.ts) or the profile patch mechanics
 *    (host/infra/).
 * @invariants
 *  - The row does not mount until `promptProfiles` exists (loader orders rows;
 *    the main row is inserted first in our own patch).
 *  - Disposal (row removal or `disabled: true`) unregisters the section —
 *    registration lives exactly as long as the row.
 * @keywords section, subpath plugin, prompt profiles, registration
 * #endregion moduleContract
 */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
/** Cordis plugin identity for section rows. */
export declare const name = "@knopki/dsh-prompt-profiles/section";
/** Mandatory injection: registration requires the promptProfiles service. */
export declare const inject: string[];
/**
 * Config schema for a section row (SPEC §4).
 * `id` is deliberately NOT volatile: the id domain changes only through the
 * batch rename operation (SPEC §2 #16).
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    id: z<string, string, "defined">;
    title: z<string, string, "volatile-defined">;
    body: z<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    id: z<string, string, "defined">;
    title: z<string, string, "volatile-defined">;
    body: z<string, string, "volatile-defined">;
}>>, "plain">;
/** A schemastery `.volatile()` config field: the registry reads it through `get()`. */
interface VolatileRef<T> {
    get(): T;
}
/** Resolved config of one section row: the loader hands volatile fields over as refs. */
export type SectionRowConfig = {
    id: string;
    title: VolatileRef<string>;
    body: VolatileRef<string>;
};
/**
 * Plugin entry point: register this row's section, keep the auto settings page
 * suppressed, and unregister on dispose.
 *
 * @purpose Make the row's config visible in the registry exactly for the row's
 *   lifetime (SPEC §5.1: registration lives while the row lives).
 */
export declare function apply(ctx: Context, config: SectionRowConfig): void;
export {};
