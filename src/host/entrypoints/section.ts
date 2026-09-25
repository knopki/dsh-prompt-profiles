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

import type { Context, Fiber } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

// #region CONST_pluginIdentity
/** Cordis plugin identity for section rows. */
export const name = "@knopki/dsh-prompt-profiles/section";

/** Mandatory injection: registration requires the promptProfiles service. */
export const inject = ["promptProfiles"];
// #endregion CONST_pluginIdentity

// #region CONST_Config
/**
 * Config schema for a section row (SPEC §4).
 * `id` is deliberately NOT volatile: the id domain changes only through the
 * batch rename operation (SPEC §2 #16).
 */
export const Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  body: z.string().required().volatile(),
});

/** A schemastery `.volatile()` config field: the registry reads it through `get()`. */
interface VolatileRef<T> {
  get(): T;
}

/** Resolved config of one section row: the loader hands volatile fields over as refs. */
export type SectionRowConfig = { id: string; title: VolatileRef<string>; body: VolatileRef<string> };
// #endregion CONST_Config

// #region TYPE_rowService
/** The `promptProfiles` surface a composition row consumes. */
interface PromptProfilesRowService {
  registerSection(row: { rowId: string | null; config: { id: string } & Record<string, unknown> }): () => void;
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
 * Plugin entry point: register this row's section, keep the auto settings page
 * suppressed, and unregister on dispose.
 *
 * @purpose Make the row's config visible in the registry exactly for the row's
 *   lifetime (SPEC §5.1: registration lives while the row lives).
 */
export function apply(ctx: Context, config: SectionRowConfig): void {
  ctx.inject(["settings"], (child) => child.effect(() => settingsOf(child).configure({ auto: false }, ctx.fiber)));
  ctx.effect(() =>
    promptProfilesOf(ctx).registerSection({
      rowId: fiberEntryId(ctx),
      config,
      // source is resolved by the service from profile-patch insert ownership;
      // 'unknown' only when configEditor is absent or the patch is unreadable.
    }),
  );
}
// #endregion FUNC_apply
