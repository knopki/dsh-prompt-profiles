/**
 * #region moduleContract
 * @modulecontract
 * @purpose ONE definition of the promptProfiles payload shapes: the strict
 *   wire codecs the Remote descriptors publish on both faces, the tolerant
 *   business parse the operations apply, and the strict result schemas the
 *   host validates its answers against.
 * @scope
 *  - Field rules and refinements per method (zod 4), the inferred payload
 *    types, and `parsePayload`.
 *  - NOT: the method table and descriptor builder (src/shared/remote-contract.ts),
 *    cross-field reference resolution (refs.ts) or registry lookups — those
 *    need host state and stay in the operations.
 * @invariants
 *  - `<method>Input` is the STRICT wire codec: unknown keys are rejected, which
 *    is what both faces have published since phase 2b.
 *  - `<method>Payload` is the TOLERANT business parse of the same fields:
 *    unknown keys are ignored, and the business refinements (non-blank titles,
 *    a required workspace key) are applied on top.
 *  - A shape change lands in both variants at once, so the wire and the
 *    business rules cannot drift.
 * @keywords zod, payload schema, strict codec, remote input, result schema
 * #endregion moduleContract
 */

import { z } from "zod";
import { InvalidInputError } from "./errors.ts";
import { SCOPES } from "./model.ts";

// #region CONST_fields
/** Optional optimistic-concurrency revision every mutating payload may carry. */
const revision = z.number().optional();
/** Business rule on top of `z.string()`: the value must not be blank. */
const nonBlank = (schema: z.ZodString) =>
  schema.refine((value) => value.trim() !== "", { message: "must be a non-empty string" });
/** Business rule on top of `z.string()`: the value must not be empty. */
const nonEmpty = (schema: z.ZodString) =>
  schema.refine((value) => value !== "", { message: "must be a non-empty string" });

/** Field rules of one section reference inside a profile value. */
const sectionRefFields = { id: z.string(), order: z.number(), scope: z.enum(SCOPES).optional() };
/** Field rules of one row view — open-shaped by design (registry views evolve). */
const jsonRow = () => z.record(z.string(), z.unknown());
const jsonRows = () => z.array(jsonRow());
// #endregion CONST_fields

// #region CONST_inputs
/**
 * Strict wire codecs. These are the schemas `buildRemoteDescriptors` publishes:
 * missing, extra and wrong-typed fields are rejected before any business code
 * runs, on BOTH sides of the wire.
 */
export const stateInput = z.strictObject({
  sessionId: z.string().optional(),
  cwd: z.string().optional(),
  workspaceId: z.string().optional(),
});

export const previewInput = z.strictObject({ profileId: z.string(), cwd: z.string().optional() });

export const sectionCreateInput = z.strictObject({
  id: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
});

export const sectionUpdateInput = z.strictObject({
  rowId: z.string(),
  value: z.strictObject({ title: z.string(), body: z.string() }),
  revision,
});

export const sectionDeleteInput = z.strictObject({ rowId: z.string() });

export const sectionRenameInput = z.strictObject({ rowId: z.string(), id: z.string() });

export const profileCreateInput = z.strictObject({
  id: z.string().optional(),
  title: z.string().optional(),
  sections: z.array(z.strictObject(sectionRefFields)).optional(),
});

export const profileUpdateInput = z.strictObject({
  rowId: z.string(),
  value: z.strictObject({ title: z.string(), sections: z.array(z.strictObject(sectionRefFields)).optional() }),
  revision,
});

export const profileDeleteInput = z.strictObject({ rowId: z.string(), revision });

export const lastInput = z.strictObject({
  workspaceId: z.string().optional(),
  cwd: z.string().optional(),
  profileId: z.string(),
  revision,
});

export const defaultSetInput = z.strictObject({ profileId: z.string(), revision });
// #endregion CONST_inputs

// #region CONST_payloads
/**
 * Business parses of the same field rules: unknown keys are ignored (rows from
 * other layers and older clients may carry more than the wire declares) and
 * the refinements the operations used to hand-check are enforced here.
 */
export const previewPayload = z.object({ profileId: nonEmpty(z.string()), cwd: z.string().optional() });

export const sectionCreatePayload = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
});

export const sectionUpdatePayload = z.object({
  rowId: nonBlank(z.string()),
  value: z.object({ title: nonBlank(z.string()), body: z.string() }),
  revision,
});

export const sectionDeletePayload = z.object({ rowId: nonBlank(z.string()) });

export const sectionRenamePayload = z.object({ rowId: nonBlank(z.string()), id: z.string() });

export const profileCreatePayload = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  sections: z.array(z.object(sectionRefFields)).optional(),
});

export const profileUpdatePayload = z.object({
  rowId: nonBlank(z.string()),
  value: z.object({ title: nonBlank(z.string()), sections: z.array(z.object(sectionRefFields)).optional() }),
  revision,
});

export const profileDeletePayload = z.object({ rowId: nonBlank(z.string()), revision });

/** `last` must name the workspace by at least one key: the registry id or the cwd. */
export const lastPayload = z
  .object({
    workspaceId: z.string().optional(),
    cwd: z.string().optional(),
    profileId: z.string(),
    revision,
  })
  .refine((value) => (value.workspaceId ?? "") !== "" || (value.cwd ?? "") !== "", {
    message: "workspaceId or cwd is required",
  });

/** The internal `default` operation: an id string, "" for none, or null to clear. */
export const defaultPayload = z.object({ default: z.union([z.string(), z.null()]) });
// #endregion CONST_payloads

// #region CONST_results
/** Strict result schemas: a result that violates its schema fails the call loudly. */
export const stateResult = z.strictObject({
  profiles: jsonRows(),
  sections: jsonRows(),
  builtinOrders: z.record(z.string(), z.number()),
  modes: z.array(z.strictObject({ id: z.string(), title: z.string(), complete: z.boolean() })),
  default: z.string(),
  lastByWorkspace: z.record(z.string(), z.string()),
  revision: z.number().nullable(),
});

export const previewResult = z.strictObject({
  profileId: z.string(),
  title: z.string(),
  sections: jsonRows(),
  skipped: z.array(z.strictObject({ id: z.string(), title: z.string(), reason: z.string() })),
  variables: z.record(z.string(), z.string().nullable()),
});

export const sectionCreateResult = z.strictObject({
  rowId: z.string(),
  patchId: z.string(),
  configId: z.string(),
  title: z.string(),
  body: z.string(),
  emits: z.boolean(),
});

export const sectionUpdateResult = z.strictObject({ rowId: z.string(), patchId: z.string(), emits: z.boolean() });

export const sectionDeleteResult = z.strictObject({ disabled: z.boolean() });

export const sectionRenameResult = z.strictObject({
  rowId: z.string(),
  patchId: z.string(),
  id: z.string(),
  affectedProfiles: z.array(z.strictObject({ profileId: z.string(), title: z.string() })),
});

export const profileCreateResult = z.strictObject({
  rowId: z.string(),
  patchId: z.string(),
  configId: z.string(),
  title: z.string(),
  sections: z.array(z.strictObject(sectionRefFields)),
});

export const profileUpdateResult = z.strictObject({ rowId: z.string(), patchId: z.string() });

export const profileDeleteResult = z.strictObject({ disabled: z.boolean() });

export const okResult = z.strictObject({ ok: z.literal(true) });
// #endregion CONST_results

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
