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
export declare const previewPayload: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    profileId: z.ZodString;
}, z.core.$strip>;
export declare const sectionCreatePayload: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const sectionUpdatePayload: z.ZodObject<{
    revision: z.ZodOptional<z.ZodNumber>;
    rowId: z.ZodString;
    value: z.ZodObject<{
        body: z.ZodString;
        title: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const sectionDeletePayload: z.ZodObject<{
    rowId: z.ZodString;
}, z.core.$strip>;
export declare const sectionRenamePayload: z.ZodObject<{
    id: z.ZodString;
    rowId: z.ZodString;
}, z.core.$strip>;
export declare const profileCreatePayload: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        order: z.ZodNumber;
        scope: z.ZodOptional<z.ZodEnum<{
            inherit: "inherit";
            "main-only": "main-only";
            "subagents-only": "subagents-only";
        }>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const profileUpdatePayload: z.ZodObject<{
    revision: z.ZodOptional<z.ZodNumber>;
    rowId: z.ZodString;
    value: z.ZodObject<{
        title: z.ZodString;
        sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            order: z.ZodNumber;
            scope: z.ZodOptional<z.ZodEnum<{
                inherit: "inherit";
                "main-only": "main-only";
                "subagents-only": "subagents-only";
            }>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const profileDeletePayload: z.ZodObject<{
    revision: z.ZodOptional<z.ZodNumber>;
    rowId: z.ZodString;
}, z.core.$strip>;
/** `last` must name the workspace by at least one key: the registry id or the cwd. */
export declare const lastPayload: z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
    profileId: z.ZodString;
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/** The internal `default` operation: an id string, "" for none, or null to clear. */
export declare const defaultPayload: z.ZodObject<{
    default: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
}, z.core.$strip>;
/**
 * @purpose Apply a business payload schema and report the FIRST violation as a
 *   clean InvalidInputError carrying the labelled field path, so a malformed
 *   request never reaches a write.
 */
export declare function parsePayload<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S>;
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
