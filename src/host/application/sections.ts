/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the section row life cycle — create, whole-object update,
 *   delete/disable and the batch rename — as the one implementation every
 *   surface calls.
 * @scope
 *  - The four section operations and their payload rules (validation first).
 *  - Writes to EXISTING rows replace the WHOLE volatile config via
 *    settings.replace; creation/removal/disable go through the patch port;
 *    rename is the documented batch that touches the SECTION ONLY and returns
 *    `affectedProfiles` for the user to fix by hand.
 *  - NOT: pure id/reference/ordering rules (domain/) or the settings and patch
 *    mechanics themselves (infra/).
 * @invariants
 *  - Every payload is validated BEFORE any write happens.
 *  - A section body may be empty/whitespace (SPEC §7).
 *  - FROZEN ID SCHEME: a created row's `config.id` IS its full row id
 *    (`prompt-section-<token>`) and the returned `configId`; existing rows with
 *    old bare config ids are never rewritten.
 *  - PROFILES ARE NEVER TOUCHED by rename.
 * @keywords sections, create, update, delete, rename, use cases
 * #endregion moduleContract
 */

import {
  InvalidInputError,
  newRowId,
  parsePayload,
  refNamesRow,
  rowAliases,
  SECTION_PLUGIN_NAME,
  sectionCreatePayload,
  sectionDeletePayload,
  sectionRenamePayload,
  sectionUpdatePayload,
  toPatchId,
  UnavailableError,
} from "../domain/index.ts";
import { explicitRowId, titleOrDefault, type UseCaseEnv } from "./env.ts";

// #region TYPE_sectionResults
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
// #endregion TYPE_sectionResults

// #region FUNC_renameSection
/**
 * @purpose Execute the rename batch (SPEC §2 #16) as ONE writer commit: guard
 *   the new full row id, then insert the new row and remove or disable the old
 *   one — a single read-modify-write held inside one exclusivity gate. The
 *   incoming rowId may be qualified or not; every file address below uses the
 *   NORMALIZED patch row id. The new id arrives already normalized to the FULL
 *   `prompt-section-<token>` form, so it is BOTH the new row id and the new
 *   `config.id`.
 *
 * Rename reports `affectedProfiles` — every registered profile still naming
 * the OLD id — and the user fixes those references by hand.
 */
async function renameSection(
  env: UseCaseEnv,
  { rowId: received, id: newId }: { rowId: string; id: string },
): Promise<SectionRenameResult> {
  const patch = env.ports.patch();
  if (!patch) throw new UnavailableError("profile storage service is unavailable");
  const { row: section, patchId } = env.resolveSection(received);
  const oldRowId = patchId;
  // Every id that names THIS section, used for the no-op check AND for the
  // affectedProfiles report.
  const aliases = rowAliases(section);
  const affectedProfiles = env.registry
    .profiles()
    .filter((profile) => profile.sections.some((ref) => refNamesRow(ref.id, aliases)))
    .map((profile) => ({ profileId: profile.id, title: profile.title }));
  // The normalized new id already naming THIS row means nothing would change;
  // it is reported as a collision rather than a silent no-op, so a repeated
  // rename into the same id fails cleanly.
  if (refNamesRow(newId, aliases)) throw new InvalidInputError(`section id "${newId}" is already taken`);
  // Uniqueness on FULL id strings: the new id must not duplicate another
  // registered section's config.id or row id. A duplicate row id already in
  // the patch surfaces from the writer's duplicate guard inside the batch
  // below (mapped to a clean rejection with the rollback already applied).
  const clash = env.registry
    .sections()
    .some(
      (row) =>
        row.rowId !== section.rowId && (row.id === newId || row.rowId === newId || toPatchId(row.rowId) === newId),
    );
  if (clash) throw new InvalidInputError(`section id "${newId}" is already taken`);
  // Only a row THIS patch inserted may be physically removed; a bare override
  // or a lower-layer row we can only override is disabled instead. `.inserted`
  // (not `.source === 'bundle'`) keeps this correct now that an absent row
  // reports 'unknown' rather than 'bundle'.
  const bundleOwned = !patch.ownership(oldRowId).inserted;
  try {
    await patch.renameSection({
      row: { id: newId, name: SECTION_PLUGIN_NAME, config: { id: newId, title: section.title, body: section.body } },
      oldRowId,
      oldName: SECTION_PLUGIN_NAME,
      bundleOwned,
    });
  } catch (error) {
    // A row id already present in the patch (but not registered) surfaces from
    // the writer's duplicate guard mid-batch; the rollback already restored the
    // file — report it as a clean rejection.
    env.mapDuplicate(error);
  }
  return { rowId: newId, patchId: newId, id: newId, affectedProfiles };
}
// #endregion FUNC_renameSection

// #region FUNC_createSectionCases
/** @purpose Build the four section operations over the shared environment. */
export function createSectionCases(env: UseCaseEnv) {
  return {
    /** Create a section row (SPEC §7: empty body allowed). */
    sectionCreate: async (body?: unknown): Promise<SectionCreateResult> => {
      const { patch } = env.requireStorage();
      const payload = parsePayload(sectionCreatePayload, body, "section/create");
      const id = explicitRowId("section/create", "section", payload.id);
      // An explicit id may never duplicate a registered section's config.id;
      // patch row-id duplicates fall to the writer's own duplicate guard.
      if (id !== null && env.registeredConfigIds("section").has(id)) {
        throw new InvalidInputError(`section id "${id}" already exists`);
      }
      const title = titleOrDefault(payload.title, "Section");
      const sectionBody = payload.body ?? "";
      const rowId = id ?? newRowId("section", env.idsInUse("section"));
      // FROZEN ID SCHEME: the row id and the stored config.id are the SAME full
      // `prompt-section-<token>` string, so a profile ref (which is a config.id)
      // addresses the row exactly.
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
        emits: sectionBody.trim() !== "",
      };
    },

    /** Whole-object update of a section's volatile fields. */
    sectionUpdate: async (body?: unknown): Promise<SectionUpdateResult> => {
      env.requireStorage();
      const payload = parsePayload(sectionUpdatePayload, body, "section/update");
      const { row, patchId } = env.resolveSection(payload.rowId);
      // VOLATILE-ONLY whole-object write: `id` stays in the inherited insert
      // layer (settings would reject it).
      await env.settingsWrite(patchId, { title: payload.value.title, body: payload.value.body }, payload.revision);
      return { rowId: row.rowId, patchId, emits: payload.value.body.trim() !== "" };
    },

    /** Delete (or disable) a section row. */
    sectionDelete: async (body?: unknown) => {
      env.requireStorage();
      const payload = parsePayload(sectionDeletePayload, body, "section/delete");
      const { patchId } = env.resolveSection(payload.rowId);
      return env.deleteRow(patchId, SECTION_PLUGIN_NAME);
    },

    /** Rename a section row; profiles are never rewritten. */
    sectionRename: (body?: unknown): Promise<SectionRenameResult> => {
      env.requireStorage();
      const payload = parsePayload(sectionRenamePayload, body, "section/rename");
      const id = explicitRowId("section/rename", "section", payload.id);
      if (id === null) throw new InvalidInputError('section/rename: field "id" is required');
      return renameSection(env, { rowId: payload.rowId, id });
    },
  };
}
// #endregion FUNC_createSectionCases
