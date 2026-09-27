/** #region moduleContract
 * @modulecontract
 * @purpose ONE definition of the promptProfiles WIRE shapes both faces of the
 *   Remote contract publish: the strict input codecs, the strict result codecs
 *   and the per-method field rules the host's tolerant business parsers build
 *   on. Shared, not layered, because the client contribution must mount codecs
 *   identical to the host's.
 * @scope
 *  - Field rules (zod 4 via the `zod/mini` subpath), the strict `<method>Input` / `<method>Result`
 *    schemas and `WIRE_FIELDS`, the field maps the tolerant payload parsers
 *    derive from.
 *  - NOT: the method table and descriptor builder (remote-contract.ts) or the
 *    tolerant business parse (host/application/payloads.ts).
 * @invariants
 *  - An input rejects missing, extra and wrong-typed fields; a result is
 *    validated as strictly as the host produces it.
 *  - Every field rule is defined exactly once: the strict codec and the
 *    tolerant parser compose the same `WIRE_FIELDS` entry, so the wire and the
 *    business rules cannot drift.
 * @dependencies USES API: zod 4 via the `zod/mini` subpath (bundled
 *   into both artifacts — the browser module table has no bare `zod` entry).
 *   Mini keeps only the strict wire surface (`strictObject`, `object`,
 *   `record`, `array`, `enum`, `literal`, `string`, `number`, `boolean`,
 *   `unknown`, `optional`, `nullable` as free functions); the tolerant host
 *   parsers stay on zod classic (host bundle only).
 * @keywords wire schemas, zod mini, strict codec, remote input, result schema
 * #endregion moduleContract */

import * as z from "zod/mini";
import { SCOPES } from "../host/domain/model.ts";

// #region CONST_fieldRules
/** Optional optimistic-concurrency revision every mutating payload may carry. */
const revision = z.optional(z.number());

/** Field rules of one section reference inside a profile value. */
export const sectionRefFields = { id: z.string(), order: z.number(), scope: z.optional(z.enum(SCOPES)) };

/** One row view — open-shaped by design (registry views evolve). */
const jsonRow = () => z.record(z.string(), z.unknown());
const jsonRows = () => z.array(jsonRow());

// The session hints `state` reserves for the client half; the operation
// ignores them (state is global).
const stateFields = {
  sessionId: z.optional(z.string()),
  cwd: z.optional(z.string()),
  workspaceId: z.optional(z.string()),
};
const previewFields = { profileId: z.string(), cwd: z.optional(z.string()) };
const sectionCreateFields = { id: z.optional(z.string()), title: z.optional(z.string()), body: z.optional(z.string()) };
const sectionValueFields = { title: z.string(), body: z.string() };
const sectionUpdateFields = { rowId: z.string(), value: z.strictObject(sectionValueFields), revision };
const sectionDeleteFields = { rowId: z.string() };
const sectionRenameFields = { rowId: z.string(), id: z.string() };
const profileCreateFields = {
  id: z.optional(z.string()),
  title: z.optional(z.string()),
  sections: z.optional(z.array(z.strictObject(sectionRefFields))),
};
const profileValueFields = { title: z.string(), sections: z.optional(z.array(z.strictObject(sectionRefFields))) };
const profileUpdateFields = { rowId: z.string(), value: z.strictObject(profileValueFields), revision };
const profileDeleteFields = { rowId: z.string(), revision };
const lastFields = {
  workspaceId: z.optional(z.string()),
  cwd: z.optional(z.string()),
  profileId: z.string(),
  revision,
};
const defaultSetFields = { profileId: z.string(), revision };

/**
 * The per-method field rules, public so the host's tolerant parsers derive
 * their fields from the SAME definitions. A tolerant variant differs only in
 * the wrapper (`z.object` instead of `z.strictObject`) and in the refinements
 * it adds.
 */
export const WIRE_FIELDS = {
  preview: previewFields,
  sectionCreate: sectionCreateFields,
  sectionValue: sectionValueFields,
  sectionUpdate: sectionUpdateFields,
  sectionDelete: sectionDeleteFields,
  sectionRename: sectionRenameFields,
  profileCreate: profileCreateFields,
  profileValue: profileValueFields,
  profileUpdate: profileUpdateFields,
  profileDelete: profileDeleteFields,
  last: lastFields,
  defaultSet: defaultSetFields,
} as const;
// #endregion CONST_fieldRules

// #region CONST_inputs
/** Strict wire codecs published by `buildRemoteDescriptors` on both faces. */
export const stateInput = z.strictObject(stateFields);

export const previewInput = z.strictObject(previewFields);

export const sectionCreateInput = z.strictObject(sectionCreateFields);

export const sectionUpdateInput = z.strictObject(sectionUpdateFields);

export const sectionDeleteInput = z.strictObject(sectionDeleteFields);

export const sectionRenameInput = z.strictObject(sectionRenameFields);

export const profileCreateInput = z.strictObject(profileCreateFields);

export const profileUpdateInput = z.strictObject(profileUpdateFields);

export const profileDeleteInput = z.strictObject(profileDeleteFields);

export const lastInput = z.strictObject(lastFields);

export const defaultSetInput = z.strictObject(defaultSetFields);
// #endregion CONST_inputs

// #region CONST_results
/** Strict result schemas: a result that violates its schema fails the call loudly. */
export const stateResult = z.strictObject({
  profiles: jsonRows(),
  sections: jsonRows(),
  builtinOrders: z.record(z.string(), z.number()),
  modes: z.array(z.strictObject({ id: z.string(), title: z.string(), complete: z.boolean() })),
  default: z.string(),
  lastByWorkspace: z.record(z.string(), z.string()),
  revision: z.nullable(z.number()),
});

export const previewResult = z.strictObject({
  profileId: z.string(),
  title: z.string(),
  sections: jsonRows(),
  skipped: z.array(z.strictObject({ id: z.string(), title: z.string(), reason: z.string() })),
  variables: z.record(z.string(), z.nullable(z.string())),
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
