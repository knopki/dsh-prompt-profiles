/**
 * #region moduleContract
 * @modulecontract
 * @purpose Translate the raw dsh-settings service into the `SettingsPort` the
 *   operation set consumes: one revision read plus whole-object replace and
 *   per-key mutate, all addressed by namespace.
 * @scope
 *  - The `prompt-profiles` revision lookup and the two write calls.
 *  - NOT: locking, conflict mapping or validation — the caller owns those, and
 *    `mutate` ops are applied against the value settings reads at write time.
 * @invariants
 *  - Every method reads the underlying service at CALL time, so a replaced or
 *    late-appearing settings service is honoured.
 *  - A read failure the caller tolerates (a missing `describe`) degrades to
 *    `undefined`; a throwing `describe` propagates.
 * @keywords settings, adapter, revision, replace, mutate, volatile
 * #endregion moduleContract
 */

import type { SettingsOp, SettingsPort } from "../application/ports.ts";

// #region TYPE_rawSettings
/** The part of the dsh-settings service this adapter calls. */
export interface RawSettingsService {
  describe?(): Array<{ ns?: string; revision?: number }>;
  replace(namespace: string, value: unknown, expectedRevision?: number): unknown;
  mutate(namespace: string, ops: SettingsOp[], expectedRevision?: number): unknown;
}
// #endregion TYPE_rawSettings

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
