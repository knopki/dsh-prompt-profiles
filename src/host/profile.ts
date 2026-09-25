// @ts-nocheck
// TODO(phase 1): remove after typing
/**
 * Subpath plugin: registers one prompt profile row.
 * #region moduleContract
 * @modulecontract
 * @purpose Let any bundle contribute a named ordered set of section
 *   references through a dedicated `.../profile` composition row.
 * @scope
 *  - PLAN step 2: mandatory `inject: ['promptProfiles']`, real registration
 *    of this row's config in `apply` via `ctx.effect`, settings suppression.
 *  - NOT: the service itself (lib/index.js), snapshot resolution and sealing
 *    (PLAN step 3), writing rows (lib/writer.js, PLAN step 4).
 * @invariants
 *  - The row does not mount until `promptProfiles` exists.
 *  - Disposal (row removal or `disabled: true`) unregisters the profile.
 * @dependencies USES API: @deepseek-ai/schemastery (Config),
 *   ctx.promptProfiles.registerProfile (lib/index.js), ctx.settings (optional).
 * @rationale
 *  - Q: Why is `sections` written as a whole array?
 *    A: SPEC §4 — the UI writes the array in one set-op, mirroring
 *      allowedModels in dsh-client-ui-settings-subagent.
 *  - Q: Why does the row not pass `source` itself?
 *    A: The service resolves provenance from profile-patch insert ownership
 *      (writer.provenance, step 4); 'unknown' survives only when
 *      configEditor is absent or the patch is unreadable.
 * @keywords profile, subpath plugin, prompt profiles, registration
 * #endregion moduleContract
 */

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
  scope: z.union([
    z.const("inherit"),
    z.const("main-only"),
    z.const("subagents-only"),
  ]).default("inherit"),
});
// #endregion CONST_SectionRef

// #region CONST_Config
/**
 * Config schema for a profile row (SPEC §4).
 * `id` is deliberately NOT volatile (rename is a batch writer operation).
 */
/** @internal Phase 0: schemastery's Dict is not declaration-portable under pnpm. */
export const Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  sections: z.array(SectionRef).default([]).volatile(),
});
// #endregion CONST_Config

// #region FUNC_apply
/**
 * Plugin entry point: register this row's profile, keep the auto settings
 * page suppressed, and unregister on dispose.
 *
 * @purpose Make the row's config visible in the registry exactly for the
 *   row's lifetime (SPEC §5.1).
 * @param {object} ctx - Cordis plugin context.
 * @param {object} config - Resolved Config (see CONST_Config).
 */
export function apply(ctx, config) {
  ctx.inject(["settings"], (child) =>
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)),
  );
  ctx.effect(() =>
    ctx.promptProfiles.registerProfile({
      rowId: ctx.fiber?.entry?.id ?? null,
      config,
      // source is resolved by the service from profile-patch insert
      // ownership (writer.provenance); 'unknown' only when configEditor is
      // absent or the patch is unreadable.
    }),
  );
}
// #endregion FUNC_apply
