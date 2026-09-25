/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give the host one import for the whole prompt-profile domain —
 *   vocabulary, ids, errors, ordering, references and payload schemas.
 * @scope
 *  - Re-exports only.
 *  - NOT for the CLIENT bundle: ids.ts pulls `node:crypto`, so shared code
 *    must import the exact domain module it needs (validation.ts) instead of
 *    this barrel.
 * @keywords domain, barrel, prompt profiles
 * #endregion moduleContract
 */

export * from "./errors.ts";
export * from "./ids.ts";
export * from "./model.ts";
export * from "./ordering.ts";
export * from "./refs.ts";
export * from "./validation.ts";
