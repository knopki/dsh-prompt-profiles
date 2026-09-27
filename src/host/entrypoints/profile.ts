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
import z from "@deepseek-ai/schemastery";
import { fiberEntryId, suppressAutoSettings } from "./row-support.ts";

export const name = "@knopki/dsh-prompt-profiles/profile";

export const inject = ["promptProfiles"];

/** Schema of one section reference; ordering and scope belong to the reference. */
const SectionRef = z.object({
  id: z.string().required(),
  order: z.number().required(),
  scope: z.union([z.const("inherit"), z.const("main-only"), z.const("subagents-only")]).default("inherit"),
});

/**
 * Config schema for a profile row.
 * @internal The schemastery volatile output type is not declaration-portable.
 */
export const Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  sections: z.array(SectionRef).default([]).volatile(),
});

interface VolatileRef<T> {
  get(): T;
}

/**
 * @purpose Resolved config of one profile row handed over by the loader.
 */
type ProfileRowConfig = {
  id: string;
  title: VolatileRef<string>;
  sections: VolatileRef<Array<{ id: string; order: number; scope?: string }>>;
};

interface PromptProfilesRowService {
  registerProfile(row: { rowId: string | null; config: { id: string } & Record<string, unknown> }): () => void;
}

const promptProfilesOf = (ctx: Context): PromptProfilesRowService =>
  (ctx as Context & { promptProfiles: PromptProfilesRowService }).promptProfiles;

// #region FUNC_apply
/**
 * @purpose Register this row for exactly its lifetime.
 */
export function apply(ctx: Context, config: ProfileRowConfig): void {
  suppressAutoSettings(ctx, ctx.fiber);
  ctx.effect(() =>
    promptProfilesOf(ctx).registerProfile({
      rowId: fiberEntryId(ctx),
      config,
    }),
  );
}
// #endregion FUNC_apply
