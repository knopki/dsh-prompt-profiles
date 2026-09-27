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
import { fiberEntryId, suppressAutoSettings } from "./row-support.ts";

export const name = "@knopki/dsh-prompt-profiles/section";

export const inject = ["promptProfiles"];

/** Config schema for a section row; id is non-volatile because renames are batch operations. */
export const Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  body: z.string().required().volatile(),
});

interface VolatileRef<T> {
  get(): T;
}

/**
 * @purpose Resolved config of one section row handed over by the loader.
 */
type SectionRowConfig = { id: string; title: VolatileRef<string>; body: VolatileRef<string> };

interface PromptProfilesRowService {
  registerSection(row: { rowId: string | null; config: { id: string } & Record<string, unknown> }): () => void;
}

const promptProfilesOf = (ctx: Context): PromptProfilesRowService =>
  (ctx as Context & { promptProfiles: PromptProfilesRowService }).promptProfiles;

// #region FUNC_apply
/**
 * @purpose Register the section for exactly this row's lifetime.
 */
export function apply(ctx: Context, config: SectionRowConfig): void {
  suppressAutoSettings(ctx, ctx.fiber);
  ctx.effect(() =>
    promptProfilesOf(ctx).registerSection({
      rowId: fiberEntryId(ctx),
      config,
    }),
  );
}
// #endregion FUNC_apply
