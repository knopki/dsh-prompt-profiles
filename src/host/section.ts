// @ts-nocheck
// TODO(phase 1): remove after typing
/**
 * Subpath plugin: registers one prompt section row.
 * #region moduleContract
 * @modulecontract
 * @purpose Let any bundle contribute a named markdown fragment to prompt
 *   profiles through a dedicated `.../section` composition row.
 * @scope
 *  - PLAN step 2: mandatory `inject: ['promptProfiles']`, real registration
 *    of this row's config in `apply` via `ctx.effect`, settings suppression.
 *  - NOT: the service itself (lib/index.js), writing rows to the profile
 *    patch (lib/writer.js, PLAN step 4).
 * @invariants
 *  - The row does not mount until `promptProfiles` exists (loader orders
 *    rows; the main row is inserted first in our own patch).
 *  - Disposal (row removal or `disabled: true`) unregisters the section —
 *    registration lives exactly as long as the row.
 * @dependencies USES API: @deepseek-ai/schemastery (Config),
 *   ctx.promptProfiles.registerSection (lib/index.js), ctx.settings (optional).
 * @rationale
 *  - Q: Why does the row not pass `source` itself?
 *    A: The row plugin cannot see which patch layer its row came from. The
 *    service resolves provenance from profile-patch insert ownership
 *    (writer.provenance, step 4); 'unknown' survives only when configEditor
 *    is absent or the patch is unreadable.
 * @keywords section, subpath plugin, prompt profiles, registration
 * #endregion moduleContract
 */

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
// #endregion CONST_Config

// #region FUNC_apply
/**
 * Plugin entry point: register this row's section, keep the auto settings
 * page suppressed, and unregister on dispose.
 *
 * @purpose Make the row's config visible in the registry exactly for the
 *   row's lifetime (SPEC §5.1: registration lives while the row lives).
 * @param {object} ctx - Cordis plugin context.
 * @param {object} config - Resolved Config (see CONST_Config).
 */
export function apply(ctx, config) {
  ctx.inject(["settings"], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)));
  ctx.effect(() =>
    ctx.promptProfiles.registerSection({
      rowId: ctx.fiber?.entry?.id ?? null,
      config,
      // source is resolved by the service from profile-patch insert
      // ownership (writer.provenance); 'unknown' only when configEditor is
      // absent or the patch is unreadable.
    }),
  );
}
// #endregion FUNC_apply
