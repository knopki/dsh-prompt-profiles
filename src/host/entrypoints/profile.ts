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

import type { Context, Fiber } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

// #region CONST_pluginIdentity
/** Cordis plugin identity for profile rows. */
export const name = "@knopki/dsh-prompt-profiles/profile";

/** Mandatory injection: registration requires the promptProfiles service. */
export const inject = ["promptProfiles"];
// #endregion CONST_pluginIdentity

// #region CONST_SectionRef
/**
 * Schema of one section reference inside a profile (SPEC §4).
 * `order` and `scope` belong to the reference, not to the section itself.
 */
const SectionRef = z.object({
  id: z.string().required(),
  order: z.number().required(),
  scope: z.union([z.const("inherit"), z.const("main-only"), z.const("subagents-only")]).default("inherit"),
});
// #endregion CONST_SectionRef

// #region CONST_Config
/**
 * Config schema for a profile row (SPEC §4).
 * `id` is deliberately NOT volatile (rename is a batch writer operation).
 * @internal The schemastery volatile output type is not declaration-portable.
 */
export const Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  sections: z.array(SectionRef).default([]).volatile(),
});

/** A schemastery `.volatile()` config field: the registry reads it through `get()`. */
interface VolatileRef<T> {
  get(): T;
}

/** Resolved config of one profile row: the loader hands volatile fields over as refs. */
export type ProfileRowConfig = {
  id: string;
  title: VolatileRef<string>;
  sections: VolatileRef<Array<{ id: string; order: number; scope?: string }>>;
};
// #endregion CONST_Config

// #region TYPE_rowService
/** The `promptProfiles` surface a composition row consumes. */
interface PromptProfilesRowService {
  registerProfile(row: { rowId: string | null; config: { id: string } & Record<string, unknown> }): () => void;
}

/** The dsh-settings call the row makes to keep its auto page suppressed. */
interface SettingsServiceLike {
  configure(config: unknown, fiber: unknown): () => void;
}
// #endregion TYPE_rowService

// #region FUNC_rowContext
/** Read the `promptProfiles` service off the row's context (no published typing here). */
const promptProfilesOf = (ctx: Context): PromptProfilesRowService =>
  (ctx as Context & { promptProfiles: PromptProfilesRowService }).promptProfiles;

/** Read the optional `settings` service off an injected child context. */
const settingsOf = (ctx: Context): SettingsServiceLike => (ctx as Context & { settings: SettingsServiceLike }).settings;

/** The loader entry id of this row's fiber (set by the loader, not part of the core Fiber type). */
const fiberEntryId = (ctx: Context): string | null =>
  (ctx.fiber as Fiber & { entry?: { id?: string } | null })?.entry?.id ?? null;
// #endregion FUNC_rowContext

// #region FUNC_apply
/**
 * Plugin entry point: register this row's profile, keep the auto settings page
 * suppressed, and unregister on dispose.
 *
 * @purpose Make the row's config visible in the registry exactly for the row's
 *   lifetime (SPEC §5.1).
 */
export function apply(ctx: Context, config: ProfileRowConfig): void {
  ctx.inject(["settings"], (child) => child.effect(() => settingsOf(child).configure({ auto: false }, ctx.fiber)));
  ctx.effect(() =>
    promptProfilesOf(ctx).registerProfile({
      rowId: fiberEntryId(ctx),
      config,
      // source is resolved by the service from profile-patch insert ownership;
      // 'unknown' only when configEditor is absent or the patch is unreadable.
    }),
  );
}
// #endregion FUNC_apply
