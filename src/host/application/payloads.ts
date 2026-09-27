/** #region moduleContract
 * @modulecontract
 * @purpose Tolerant business parse of the promptProfiles payloads: shared
 *   wire field shapes with unknown keys ignored and business refinements enforced.
 * @scope Per-method tolerant schemas and `parsePayload`.
 *  - NOT: strict wire codecs, reference resolution, or registry lookups.
 * @invariants
 *  - A payload is validated BEFORE any write happens.
 * #endregion moduleContract */

import { z } from "zod";
import type * as zmini from "zod/mini";
import { sectionRefFields, WIRE_FIELDS } from "../../shared/wire-schemas.ts";
import { InvalidInputError } from "../domain/errors.ts";

/** Business rule on a mini string field: the value must not be blank. */
const nonBlank = <S extends zmini.ZodMiniString>(schema: S): S =>
  schema.check(z.refine<string>((value) => value.trim() !== "", { message: "must be a non-empty string" }));

/** Tolerant section-ref list: the ref fields are shared, extra ref keys ignored. */
const looseSectionRefs = () => z.array(z.object(sectionRefFields));

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

// #region FUNC_parsePayload
/** @purpose Apply a business payload schema, reporting the FIRST violation as a clean InvalidInputError. */
export function parsePayload<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".") ?? "";
  const detail = issue?.message ?? "invalid payload";
  throw new InvalidInputError(`${label}: ${path === "" ? detail : `${path}: ${detail}`}`);
}
// #endregion FUNC_parsePayload
