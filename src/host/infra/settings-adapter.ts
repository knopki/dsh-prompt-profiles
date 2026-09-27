/**
 * #region moduleContract
 * @modulecontract
 * @purpose Translate the raw dsh-settings service into the `SettingsPort` the
 *   operation set consumes: one revision read plus whole-object replace and
 *   per-key mutate, all addressed by namespace.
 * @scope
 *  - The `prompt-profiles` revision lookup and the two write calls.
 *  - NOT: locking, conflict mapping or validation.
 * @invariants
 *  - Every method reads the underlying service at call time.
 * #endregion moduleContract
 */

import type { SettingsOp, SettingsPort } from "../application/ports.ts";

/**
 * The part of the dsh-settings service this adapter calls.
 *
 * @purpose Allow adapting the raw settings service to the app port.
 */
export interface RawSettingsService {
  describe?(): Array<{ ns?: string; revision?: number }>;
  replace(namespace: string, value: unknown, expectedRevision?: number): unknown;
  mutate(namespace: string, ops: SettingsOp[], expectedRevision?: number): unknown;
}

// #region FUNC_createSettingsPort
/** @purpose Bind `SettingsPort` to one settings service, with the namespace read at call time. */
export function createSettingsPort(settings: RawSettingsService): SettingsPort {
  return {
    revision: () => settings.describe?.().find((entry) => entry.ns === "prompt-profiles")?.revision,
    replace: async (namespace, value, expectedRevision) => settings.replace(namespace, value, expectedRevision),
    mutate: async (namespace, ops, expectedRevision) => settings.mutate(namespace, ops, expectedRevision),
  };
}
// #endregion FUNC_createSettingsPort
