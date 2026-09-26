/** #region moduleContract
 * @modulecontract
 * @purpose The TOLERANT business parse of the promptProfiles payloads the use
 *   cases apply: the same field rules the strict wire codecs publish (they are
 *   composed from src/shared/wire-schemas.ts, so the two cannot drift), with
 *   unknown keys ignored and the business refinements the operations used to
 *   hand-check enforced here.
 * @scope
 *  - The per-method tolerant schemas, their inferred payload types and
 *    `parsePayload`.
 *  - NOT: the strict wire codecs and result schemas (shared/wire-schemas.ts),
 *    cross-field reference resolution (domain/refs.ts) or registry lookups —
 *    those need host state and stay in the use cases.
 * @invariants
 *  - `<method>Payload` accepts rows from other layers and older clients (extra
 *    keys are ignored) but rejects a missing, empty or blank required field.
 *  - A payload is validated BEFORE any write happens.
 * @keywords payload schema, tolerant parse, business rules, validation
 * #endregion moduleContract */

import { z } from "zod";
import { sectionRefFields, WIRE_FIELDS } from "../../shared/wire-schemas.ts";
import { InvalidInputError } from "../domain/errors.ts";

// #region CONST_refinements
/** Business rule on top of `z.string()`: the value must not be blank. */
const nonBlank = (schema: z.ZodString) =>
  schema.refine((value) => value.trim() !== "", { message: "must be a non-empty string" });
/** Business rule on top of `z.string()`: the value must not be empty. */
const nonEmpty = (schema: z.ZodString) =>
  schema.refine((value) => value !== "", { message: "must be a non-empty string" });

/** Tolerant section-ref list: the ref fields are shared, extra ref keys ignored. */
const looseSectionRefs = () => z.array(z.object(sectionRefFields));
// #endregion CONST_refinements

// #region CONST_payloads
export const previewPayload = z.object({ ...WIRE_FIELDS.preview, profileId: nonEmpty(WIRE_FIELDS.preview.profileId) });

export const sectionCreatePayload = z.object(WIRE_FIELDS.sectionCreate);

export const sectionUpdatePayload = z.object({
  ...WIRE_FIELDS.sectionUpdate,
  rowId: nonBlank(WIRE_FIELDS.sectionUpdate.rowId),
  value: z.object({ ...WIRE_FIELDS.sectionValue, title: nonBlank(WIRE_FIELDS.sectionValue.title) }),
});

export const sectionDeletePayload = z.object({
  ...WIRE_FIELDS.sectionDelete,
  rowId: nonBlank(WIRE_FIELDS.sectionDelete.rowId),
});

export const sectionRenamePayload = z.object({
  ...WIRE_FIELDS.sectionRename,
  rowId: nonBlank(WIRE_FIELDS.sectionRename.rowId),
});

export const profileCreatePayload = z.object({ ...WIRE_FIELDS.profileCreate, sections: looseSectionRefs().optional() });

export const profileUpdatePayload = z.object({
  ...WIRE_FIELDS.profileUpdate,
  rowId: nonBlank(WIRE_FIELDS.profileUpdate.rowId),
  value: z.object({
    ...WIRE_FIELDS.profileValue,
    title: nonBlank(WIRE_FIELDS.profileValue.title),
    sections: looseSectionRefs().optional(),
  }),
});

export const profileDeletePayload = z.object({
  ...WIRE_FIELDS.profileDelete,
  rowId: nonBlank(WIRE_FIELDS.profileDelete.rowId),
});

/** `last` must name the workspace by at least one key: the registry id or the cwd. */
export const lastPayload = z
  .object(WIRE_FIELDS.last)
  .refine((value) => (value.workspaceId ?? "") !== "" || (value.cwd ?? "") !== "", {
    message: "workspaceId or cwd is required",
  });

/** The internal `default` operation: an id string, "" for none, or null to clear. */
export const defaultPayload = z.object({ default: z.union([z.string(), z.null()]) });
// #endregion CONST_payloads

// #region FUNC_parsePayload
/**
 * @purpose Apply a business payload schema and report the FIRST violation as a
 *   clean InvalidInputError carrying the labelled field path, so a malformed
 *   request never reaches a write.
 */
export function parsePayload<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".") ?? "";
  const detail = issue?.message ?? "invalid payload";
  throw new InvalidInputError(`${label}: ${path === "" ? detail : `${path}: ${detail}`}`);
}
// #endregion FUNC_parsePayload

// #region TYPE_payloads
export type PreviewPayload = z.output<typeof previewPayload>;
export type SectionCreatePayload = z.output<typeof sectionCreatePayload>;
export type SectionUpdatePayload = z.output<typeof sectionUpdatePayload>;
export type SectionDeletePayload = z.output<typeof sectionDeletePayload>;
export type SectionRenamePayload = z.output<typeof sectionRenamePayload>;
export type ProfileCreatePayload = z.output<typeof profileCreatePayload>;
export type ProfileUpdatePayload = z.output<typeof profileUpdatePayload>;
export type ProfileDeletePayload = z.output<typeof profileDeletePayload>;
export type LastPayload = z.output<typeof lastPayload>;
export type DefaultPayload = z.output<typeof defaultPayload>;
// #endregion TYPE_payloads
