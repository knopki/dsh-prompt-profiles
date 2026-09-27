/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the section row life cycle — create, whole-object update,
 *   delete/disable and the batch rename — as the one implementation every
 *   surface calls.
 * @scope The four section operations and their payload rules (validation first).
 *  - NOT: pure id/reference/ordering rules or the settings and patch mechanics.
 * @invariants
 *  - Every payload is validated BEFORE any write happens.
 *  - An empty section body is valid and non-emitting.
 *  - A created row's `config.id` IS its full row id; old bare config ids are never rewritten.
 *  - PROFILES ARE NEVER TOUCHED by rename.
 * #endregion moduleContract
 */

import {
  InvalidInputError,
  newRowId,
  refNamesRow,
  rowAliases,
  SECTION_PLUGIN_NAME,
  toPatchId,
  UnavailableError,
} from "../domain/index.ts";
import { sectionEmits } from "../domain/ordering.ts";
import { explicitRowId, titleOrDefault, type UseCaseEnv } from "./env.ts";
import {
  parsePayload,
  sectionCreatePayload,
  sectionDeletePayload,
  sectionRenamePayload,
  sectionUpdatePayload,
} from "./payloads.ts";

export interface SectionCreateResult {
  rowId: string;
  patchId: string;
  configId: string;
  title: string;
  body: string;
  emits: boolean;
}

export interface SectionUpdateResult {
  /** The row's own qualified id; null only for a row mounted outside a composition row. */
  rowId: string | null;
  patchId: string;
  emits: boolean;
}

export interface SectionRenameResult {
  rowId: string;
  patchId: string;
  id: string;
  affectedProfiles: Array<{ profileId: string; title: string }>;
}

// #region FUNC_renameSection
/**
 * @purpose Execute the rename batch as ONE writer commit: insert the new row
 *   and remove or disable the old one. Reports `affectedProfiles` for the user
 *   to fix by hand; profiles themselves are never rewritten.
 */
async function renameSection(
  env: UseCaseEnv,
  { rowId: received, id: newId }: { rowId: string; id: string },
): Promise<SectionRenameResult> {
  const patch = env.ports.patch();
  if (!patch) throw new UnavailableError("profile storage service is unavailable");
  const { row: section, patchId } = env.resolveSection(received);
  const oldRowId = patchId;
  // Every id naming THIS section, for the no-op check AND the affected report.
  const aliases = rowAliases(section);
  const affectedProfiles = env.registry
    .profiles()
    .filter((profile) => profile.sections.some((ref) => refNamesRow(ref.id, aliases)))
    .map((profile) => ({ profileId: profile.id, title: profile.title }));
  // The normalized new id already naming THIS row is a collision, not a silent no-op.
  if (refNamesRow(newId, aliases)) throw new InvalidInputError(`section id "${newId}" is already taken`);
  // Uniqueness on FULL id strings; a patch-only duplicate surfaces from the
  // writer's duplicate guard inside the batch (mapped below, rollback already applied).
  const clash = env.registry
    .sections()
    .some(
      (row) =>
        row.rowId !== section.rowId && (row.id === newId || row.rowId === newId || toPatchId(row.rowId) === newId),
    );
  if (clash) throw new InvalidInputError(`section id "${newId}" is already taken`);
  // Only a row THIS patch inserted may be physically removed; anything else is
  // disabled instead. `.inserted` (not source) stays correct for absent rows.
  const bundleOwned = !patch.ownership(oldRowId).inserted;
  try {
    await patch.renameSection({
      row: { id: newId, name: SECTION_PLUGIN_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId,
      oldName: SECTION_PLUGIN_NAME,
      bundleOwned,
    });
  } catch (error) {
    env.mapDuplicate(error);
  }
  return { rowId: newId, patchId: newId, id: newId, affectedProfiles };
}
// #endregion FUNC_renameSection

// #region FUNC_createSectionCases
/** @purpose Build the four section operations over the shared environment. */
export function createSectionCases(env: UseCaseEnv) {
  return {
    // #region METHOD_sectionCreate
    /** @purpose Create a section row; an empty body is valid and non-emitting. */
    sectionCreate: async (body?: unknown): Promise<SectionCreateResult> => {
      const { patch } = env.requireStorage();
      const payload = parsePayload(sectionCreatePayload, body, "section/create");
      const id = explicitRowId("section/create", "section", payload.id);
      // An explicit id may never duplicate a registered config.id; patch
      // row-id duplicates fall to the writer's own duplicate guard.
      if (id !== null && env.registeredConfigIds("section").has(id)) {
        throw new InvalidInputError(`section id "${id}" already exists`);
      }
      const title = titleOrDefault(payload.title, "Section");
      const sectionBody = payload.body ?? "";
      const rowId = id ?? newRowId("section", env.idsInUse("section"));
      // FROZEN ID SCHEME: row id and stored config.id are the SAME full string.
      const row = { id: rowId, name: SECTION_PLUGIN_NAME, config: { id: rowId, title, body: sectionBody } };
      try {
        await patch.insert(row);
      } catch (error) {
        env.mapDuplicate(error);
      }
      return {
        rowId: row.id,
        patchId: row.id,
        configId: row.id,
        title,
        body: sectionBody,
        emits: sectionEmits({ body: sectionBody }),
      };
    },
    // #endregion METHOD_sectionCreate

    // #region METHOD_sectionUpdate
    /** @purpose Whole-object update of a section's volatile fields. */
    sectionUpdate: async (body?: unknown): Promise<SectionUpdateResult> => {
      env.requireStorage();
      const payload = parsePayload(sectionUpdatePayload, body, "section/update");
      const { row, patchId } = env.resolveSection(payload.rowId);
      // VOLATILE-ONLY write: `id` stays in the inherited insert layer.
      await env.settingsWrite(patchId, { title: payload.value.title, body: payload.value.body }, payload.revision);
      return { rowId: row.rowId, patchId, emits: sectionEmits({ body: payload.value.body }) };
    },
    // #endregion METHOD_sectionUpdate

    // #region METHOD_sectionDelete
    /** @purpose Delete (or disable) a section row. */
    sectionDelete: async (body?: unknown) => {
      env.requireStorage();
      const payload = parsePayload(sectionDeletePayload, body, "section/delete");
      const { patchId } = env.resolveSection(payload.rowId);
      return env.deleteRow(patchId, SECTION_PLUGIN_NAME);
    },
    // #endregion METHOD_sectionDelete

    // #region METHOD_sectionRename
    /** @purpose Rename a section row; profiles are never rewritten. */
    sectionRename: (body?: unknown): Promise<SectionRenameResult> => {
      env.requireStorage();
      const payload = parsePayload(sectionRenamePayload, body, "section/rename");
      const id = explicitRowId("section/rename", "section", payload.id);
      if (id === null) throw new InvalidInputError('section/rename: field "id" is required');
      return renameSection(env, { rowId: payload.rowId, id });
    },
    // #endregion METHOD_sectionRename
  };
}
// #endregion FUNC_createSectionCases
