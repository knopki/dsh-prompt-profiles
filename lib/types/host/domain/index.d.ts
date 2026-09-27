/**
 * #region moduleContract
 * @modulecontract
 * @purpose Provide a host-only entry point for domain rules and shapes.
 * @scope Re-exports only. NOT for shared/client use: ids.ts needs node:crypto,
 *   so shared/client consumers import exact modules instead.
 * #endregion moduleContract
 */
export * from "./errors.ts";
export * from "./ids.ts";
export * from "./model.ts";
export * from "./ordering.ts";
export * from "./refs.ts";
