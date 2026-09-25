/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the profile row life cycle — create, whole-object update,
 *   delete with reference cleanup, the default choice and the per-workspace
 *   last choice — as the one implementation every surface calls.
 * @scope
 *  - The five profile operations and their payload rules (validation first).
 *  - Reference resolution for create/update (a typo or a foreign id is
 *    rejected), per-key settings mutations for `default`/`last`, and
 *    best-effort reference cleanup after a delete.
 *  - NOT: pure id/reference rules (domain/) or the settings/patch mechanics
 *    (infra/).
 * @invariants
 *  - Every payload is validated BEFORE any write happens.
 *  - `last` stores the choice under the SAME key the assembler reads, so a
 *    chip choice always reaches the prompt; `profileId: ""` means an explicit
 *    "none" and an unknown profile id is rejected.
 *  - Deleting the ROW is authoritative and happens first; reference cleanup is
 *    best-effort and never turns a successful delete into a failure.
 * @keywords profiles, create, update, delete, default, last, use cases
 * #endregion moduleContract
 */

import {
  defaultPayload,
  errorMessage,
  InvalidInputError,
  lastPayload,
  NotFoundError,
  newRowId,
  PROFILE_PLUGIN_NAME,
  parsePayload,
  profileCreatePayload,
  profileDeletePayload,
  profileUpdatePayload,
  resolveSectionRefId,
  rowAliases,
  type Scope,
  type SectionRef,
} from "../domain/index.ts";
import { explicitRowId, titleOrDefault, type UseCaseEnv } from "./env.ts";
import type { SettingsOp } from "./ports.ts";

// #region TYPE_profileResults
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
// #endregion TYPE_profileResults

// #region FUNC_sectionRefs
/**
 * Resolve every `sections[].id` to the id that must be STORED in the profile —
 * the registered config.id (see resolveSectionRefId). A typo or a foreign id
 * is rejected on CREATE and UPDATE alike; a section already present in the
 * patch but not yet registered (HMR lag) is accepted.
 */
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
// #endregion FUNC_sectionRefs

// #region CONST_workspaceId
/** Shape of a workspace UUID key in `lastByWorkspace`. */
const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// #endregion CONST_workspaceId

// #region FUNC_staleWorkspaceKeys
/**
 * Dead `lastByWorkspace` KEYS to unset on the next `last` write:
 *  - values that match no registered profile (except "" = explicit none);
 *  - keys shaped like a workspace UUID the registry does not know.
 * cwd-shaped keys are ALWAYS kept — they may belong to a session whose
 * workspace is not registered yet. Without a workspaceRegistry no UUID can be
 * proven stale, so such keys are kept. Only the listed keys are touched
 * (per-key `unset`), never the whole dictionary.
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
  // #region FUNC_clearProfileReferences
  /**
   * @purpose Best-effort orphan cleanup after a profile row was deleted:
   *   remove the profile's id from `lastByWorkspace` (per-key `unset` ops) and
   *   reset `default` to "" when it named it. Per-key ops plus the write lock
   *   keep a concurrent `last` from losing its choice; a failure here is not
   *   fatal, because the resolver resets a dangling profile id anyway.
   */
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
  // #endregion FUNC_clearProfileReferences

  return {
    /** Create a profile row. */
    profileCreate: async (body?: unknown): Promise<ProfileCreateResult> => {
      const { patch } = env.requireStorage();
      const payload = parsePayload(profileCreatePayload, body, "profile/create");
      const id = explicitRowId("profile/create", "profile", payload.id);
      const title = titleOrDefault(payload.title, "Profile");
      const sections = payload.sections === undefined ? [] : sectionRefs(env, "profile/create", payload.sections);
      // An explicit id may never duplicate a registered profile's config.id;
      // patch row-id duplicates fall to the writer's own duplicate guard.
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

    /** Whole-object update of a profile's volatile fields. */
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

    /** Delete a profile row and best-effort-clear its default/last references. */
    profileDelete: async (body?: unknown) => {
      env.requireStorage();
      const payload = parsePayload(profileDeletePayload, body, "profile/delete");
      const { row, patchId } = env.resolveProfile(payload.rowId);
      // ORDER MATTERS: delete the ROW first — its writer rollback is the
      // authoritative operation. Reference cleanup then runs best-effort; if
      // it fails, dangling ids remain, which the resolver resets silently
      // (safe degradation). Clearing first could irreversibly lose the user's
      // choice when the deletion itself failed.
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

    /**
     * Set (`""`/null = clear) the default profile. Input contract:
     * `{default: profileId | "" | null, revision?}`.
     */
    defaultSet: async (body?: { default?: unknown; revision?: number }): Promise<void> => {
      env.requireSettings();
      const payload = parsePayload(defaultPayload, body, "default");
      // `null` clears the choice; the operation stores "" for "none".
      const defaultId = payload.default ?? "";
      // Validate against the authoritative patch INSIDE the lock, so a profile
      // whose row is already gone cannot become the default while HMR still
      // exposes it.
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

    /** Record the workspace's last chosen profile (SPEC §2 #11). */
    last: async (body?: unknown): Promise<void> => {
      env.requireSettings();
      const payload = parsePayload(lastPayload, body, "last");
      // New choices go under the FIRST candidate the assembler resolves
      // (the workspace UUID when known, else the cwd) so we stop creating
      // new path keys; reading still walks ALL candidates, so legacy
      // path-keyed choices keep working (no migration, no cleanup).
      const workspaceKeys = await env.ports.workspaces().keys({
        workspaceId: payload.workspaceId,
        cwd: payload.cwd,
      });
      const workspaceKey = workspaceKeys[0] ?? "";
      // Per-key ops applied by settings.mutate against the value it reads at
      // write time: a parallel `last` can never lose another workspace's
      // choice, and the (non-reentrant) write lock is taken once around the
      // whole attempt loop.
      await env.mutateWithRetry(
        ({ revisionAvailable }): SettingsOp[] => {
          // Validity is decided INSIDE the locked mutation, after the awaited
          // key resolution, against the AUTHORITATIVE patch (not the
          // HMR-lagged registry): a profile deleted while we were resolving —
          // or already gone from the file but still listed — must be rejected,
          // never resurrected as a dangling choice.
          if (payload.profileId !== "" && !env.profileSelectable(payload.profileId)) {
            throw new NotFoundError(`profile "${payload.profileId}" is not registered`);
          }
          // Housekeeping unset is computed from the live config inside the
          // lock. It is applied ONLY when a settings revision is available:
          // without CAS a concurrent out-of-lock writer could make a scanned
          // key valid between this scan and settings.mutate, and the unset
          // would delete that choice. No revision → skip pruning (safe), the
          // caller's own key is still set (per-key ops are race-free).
          const ops: SettingsOp[] = revisionAvailable
            ? staleWorkspaceKeys(env, env.registry.lastByWorkspace()).map((key) => ({
                op: "unset",
                path: ["lastByWorkspace", key],
              }))
            : [];
          // Explicit "none" is STORED as an own-property empty string: the
          // resolver treats it as a decision that beats the default; deleting
          // the key would silently fall back to `default`.
          ops.push({ op: "set", path: ["lastByWorkspace", workspaceKey], value: payload.profileId });
          return ops;
        },
        { clientRevision: payload.revision },
      );
    },
  };
}
// #endregion FUNC_createProfileCases
