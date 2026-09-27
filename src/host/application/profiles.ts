/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the profile row life cycle — create, whole-object update,
 *   delete with reference cleanup, the default choice and the per-workspace
 *   last choice — as the one implementation every surface calls.
 * @scope The five profile operations and their payload rules (validation first).
 *  - NOT: pure id/reference rules or the settings/patch mechanics.
 * @invariants
 *  - Every payload is validated BEFORE any write happens.
 *  - `last` stores the choice under the SAME key the assembler reads.
 *  - Deleting the ROW is authoritative and happens first; reference cleanup is
 *    best-effort and never turns a successful delete into a failure.
 * #endregion moduleContract
 */

import {
  errorMessage,
  InvalidInputError,
  NotFoundError,
  newRowId,
  PROFILE_PLUGIN_NAME,
  resolveSectionRefId,
  rowAliases,
  type Scope,
  type SectionRef,
} from "../domain/index.ts";
import { explicitRowId, titleOrDefault, type UseCaseEnv } from "./env.ts";
import {
  defaultPayload,
  lastPayload,
  parsePayload,
  profileCreatePayload,
  profileDeletePayload,
  profileUpdatePayload,
} from "./payloads.ts";
import type { SettingsOp } from "./ports.ts";

export interface ProfileCreateResult {
  rowId: string;
  patchId: string;
  configId: string;
  title: string;
  sections: SectionRef[];
}

export interface ProfileUpdateResult {
  /** The row's own qualified id; null only for a row mounted outside a composition row. */
  rowId: string | null;
  patchId: string;
}

/** One reference as the payload schemas parse it. */
interface ParsedSectionRef {
  id: string;
  order: number;
  scope?: Scope;
}

/** Resolve every `sections[].id` to the id STORED in the profile; a typo or foreign id is rejected. */
function sectionRefs(env: UseCaseEnv, label: string, refs: readonly ParsedSectionRef[]): SectionRef[] {
  const targets = env.sectionTargets();
  const pending = env.pendingSectionIds();
  return refs.map((ref, index) => {
    const id = resolveSectionRefId(ref.id, { targets, pending });
    if (id === null) {
      throw new InvalidInputError(`${label}: sections[${index}].id "${ref.id}" is not a registered section`);
    }
    return { id, order: ref.order, ...(ref.scope != null ? { scope: ref.scope } : {}) };
  });
}

/** Shape of a workspace UUID key in `lastByWorkspace`. */
const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// #region FUNC_staleWorkspaceKeys
/**
 * @purpose Dead `lastByWorkspace` KEYS to unset on the next `last` write.
 *   Only proven-dead keys are pruned; unknown UUID/cwd keys are retained.
 */
function staleWorkspaceKeys(env: UseCaseEnv, value: Record<string, string> | undefined): string[] {
  const profileIds = new Set(env.registry.profiles().map((row) => row.id));
  const workspaces = env.ports.workspaces();
  const stale: string[] = [];
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (entry !== "" && !profileIds.has(entry)) {
      stale.push(key);
      continue;
    } // dangling profile choice
    if (WORKSPACE_ID.test(key) && workspaces.knows(key) === false) stale.push(key); // stale workspace id
  }
  return stale;
}
// #endregion FUNC_staleWorkspaceKeys

// #region FUNC_createProfileCases
/** @purpose Build the five profile operations over the shared environment. */
export function createProfileCases(env: UseCaseEnv) {
  const clearProfileReferences = async (profile: { id: string; rowId: string | null }): Promise<boolean> => {
    const aliases = rowAliases(profile);
    return env.mutateWithRetry(() => {
      const ops: SettingsOp[] = [];
      for (const [key, value] of Object.entries(env.registry.lastByWorkspace() ?? {})) {
        if (aliases.has(value)) ops.push({ op: "unset", path: ["lastByWorkspace", key] });
      }
      if (aliases.has(env.registry.defaultId())) ops.push({ op: "set", path: ["default"], value: "" });
      return ops;
    });
  };

  return {
    // #region METHOD_profileCreate
    /** @purpose Create a profile row. */
    profileCreate: async (body?: unknown): Promise<ProfileCreateResult> => {
      const { patch } = env.requireStorage();
      const payload = parsePayload(profileCreatePayload, body, "profile/create");
      const id = explicitRowId("profile/create", "profile", payload.id);
      const title = titleOrDefault(payload.title, "Profile");
      const sections = payload.sections === undefined ? [] : sectionRefs(env, "profile/create", payload.sections);
      // An explicit id may never duplicate a registered config.id; patch
      // row-id duplicates fall to the writer's own duplicate guard.
      if (id !== null && env.registeredConfigIds("profile").has(id)) {
        throw new InvalidInputError(`profile id "${id}" already exists`);
      }
      const rowId = id ?? newRowId("profile", env.idsInUse("profile"));
      // FROZEN ID SCHEME: row id === stored config.id (full form).
      const row = { id: rowId, name: PROFILE_PLUGIN_NAME, config: { id: rowId, title, sections } };
      try {
        await patch.insert(row);
      } catch (error) {
        env.mapDuplicate(error);
      }
      return { rowId: row.id, patchId: row.id, configId: row.id, title, sections };
    },
    // #endregion METHOD_profileCreate

    // #region METHOD_profileUpdate
    /** @purpose Whole-object update of a profile's volatile fields. */
    profileUpdate: async (body?: unknown): Promise<ProfileUpdateResult> => {
      env.requireStorage();
      const payload = parsePayload(profileUpdatePayload, body, "profile/update");
      const value = {
        title: payload.value.title,
        sections:
          payload.value.sections === undefined ? [] : sectionRefs(env, "profile/update", payload.value.sections),
      };
      const { row, patchId } = env.resolveProfile(payload.rowId);
      // VOLATILE-ONLY whole-object write: the `sections` array replaces
      // wholesale, `id` is inherited.
      await env.settingsWrite(patchId, value, payload.revision);
      return { rowId: row.rowId, patchId };
    },
    // #endregion METHOD_profileUpdate

    // #region METHOD_profileDelete
    /** @purpose Delete a profile row and best-effort-clear its default/last references. */
    profileDelete: async (body?: unknown) => {
      env.requireStorage();
      const payload = parsePayload(profileDeletePayload, body, "profile/delete");
      const { row, patchId } = env.resolveProfile(payload.rowId);
      // ORDER MATTERS: delete the ROW first — reference cleanup then runs
      // best-effort, and dangling ids remain safe (the resolver resets them).
      const result = await env.deleteRow(patchId, PROFILE_PLUGIN_NAME);
      try {
        await clearProfileReferences(row);
      } catch (error) {
        try {
          env.ports.log?.warn?.(
            "prompt-profiles: profile deleted but its default/lastByWorkspace references were not cleared",
            { profileId: row.id, error: errorMessage(error) },
          );
        } catch {
          // logging must never turn a successful delete into a failure
        }
      }
      return result;
    },
    // #endregion METHOD_profileDelete

    // #region METHOD_defaultSet
    /** @purpose Set (`""`/null = clear) the default profile. */
    defaultSet: async (body?: { default?: unknown; revision?: number }): Promise<void> => {
      env.requireSettings();
      const payload = parsePayload(defaultPayload, body, "default");
      // `null` clears the choice; the operation stores "" for "none".
      const defaultId = payload.default ?? "";
      // Validity is checked against the authoritative patch INSIDE the lock.
      await env.mutateWithRetry(
        (): SettingsOp[] => {
          if (defaultId !== "" && !env.profileSelectable(defaultId)) {
            throw new NotFoundError(`profile "${defaultId}" is not registered`);
          }
          return [{ op: "set", path: ["default"], value: defaultId }];
        },
        { clientRevision: body?.revision },
      );
    },
    // #endregion METHOD_defaultSet

    // #region METHOD_last
    /** @purpose Record the workspace's last chosen profile. */
    last: async (body?: unknown): Promise<void> => {
      env.requireSettings();
      const payload = parsePayload(lastPayload, body, "last");
      // New choices go under the FIRST candidate the assembler resolves, so no
      // new path keys are created; reading still walks ALL candidates, so
      // legacy path-keyed choices keep working.
      const workspaceKeys = await env.ports.workspaces().keys({
        workspaceId: payload.workspaceId,
        cwd: payload.cwd,
      });
      const workspaceKey = workspaceKeys[0] ?? "";
      // Per-key ops applied against the value read at write time: a parallel
      // `last` can never lose another workspace's choice.
      await env.mutateWithRetry(
        ({ revisionAvailable }): SettingsOp[] => {
          // Validity is decided INSIDE the locked mutation against the
          // AUTHORITATIVE patch: a profile deleted mid-resolution is rejected,
          // never resurrected as a dangling choice.
          if (payload.profileId !== "" && !env.profileSelectable(payload.profileId)) {
            throw new NotFoundError(`profile "${payload.profileId}" is not registered`);
          }
          // Pruning runs ONLY with a settings revision: without CAS a
          // concurrent writer could make a scanned key valid before mutate,
          // and the unset would delete that choice.
          const ops: SettingsOp[] = revisionAvailable
            ? staleWorkspaceKeys(env, env.registry.lastByWorkspace()).map((key) => ({
                op: "unset",
                path: ["lastByWorkspace", key],
              }))
            : [];
          // Explicit "none" is STORED as empty string: deleting the key would
          // silently fall back to `default`.
          ops.push({ op: "set", path: ["lastByWorkspace", workspaceKey], value: payload.profileId });
          return ops;
        },
        { clientRevision: payload.revision },
      );
    },
    // #endregion METHOD_last
  };
}
// #endregion FUNC_createProfileCases
