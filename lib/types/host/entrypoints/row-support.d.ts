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
export declare function fiberEntryId(ctx: Context): string | null;
export declare function suppressAutoSettings(ctx: Context, fiber: Fiber): void;
