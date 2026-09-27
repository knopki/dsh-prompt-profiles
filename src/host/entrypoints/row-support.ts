/**
 * #region moduleContract
 * @modulecontract
 * @purpose Share the row lifecycle helpers all composition entrypoints repeat.
 * @scope
 *  - Reading the optional settings service, the loader fiber entry id, and
 *    suppressing the auto settings page for a row fiber.
 *  - NOT: registration itself (plugin.ts) or row Config schemas.
 * #endregion moduleContract
 */

import type { Context, Fiber } from "@deepseek-ai/cordis";

interface SettingsServiceLike {
  configure(config: unknown, fiber: unknown): () => void;
}

function settingsOf(ctx: Context): SettingsServiceLike {
  return (ctx as Context & { settings: SettingsServiceLike }).settings;
}

export function fiberEntryId(ctx: Context): string | null {
  return (ctx.fiber as Fiber & { entry?: { id?: string } | null })?.entry?.id ?? null;
}

export function suppressAutoSettings(ctx: Context, fiber: Fiber): void {
  ctx.inject(["settings"], (child) => child.effect(() => settingsOf(child).configure({ auto: false }, fiber)));
}
