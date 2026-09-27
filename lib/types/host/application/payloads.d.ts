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
import type * as zmini from "zod/mini";
export declare const previewPayload: z.ZodObject<{
    cwd: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
    profileId: zmini.ZodMiniString<string>;
}, z.core.$strip>;
export declare const sectionCreatePayload: z.ZodObject<{
    id: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
    title: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
    body: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
}, z.core.$strip>;
export declare const sectionUpdatePayload: z.ZodObject<{
    revision: zmini.ZodMiniOptional<zmini.ZodMiniNumber<number>>;
    rowId: zmini.ZodMiniString<string>;
    value: z.ZodObject<{
        body: zmini.ZodMiniString<string>;
        title: zmini.ZodMiniString<string>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const sectionDeletePayload: z.ZodObject<{
    rowId: zmini.ZodMiniString<string>;
}, z.core.$strip>;
export declare const sectionRenamePayload: z.ZodObject<{
    id: zmini.ZodMiniString<string>;
    rowId: zmini.ZodMiniString<string>;
}, z.core.$strip>;
export declare const profileCreatePayload: z.ZodObject<{
    id: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
    title: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
    sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: zmini.ZodMiniString<string>;
        order: zmini.ZodMiniNumber<number>;
        scope: zmini.ZodMiniOptional<zmini.ZodMiniEnum<{
            inherit: "inherit";
            "main-only": "main-only";
            "subagents-only": "subagents-only";
        }>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const profileUpdatePayload: z.ZodObject<{
    revision: zmini.ZodMiniOptional<zmini.ZodMiniNumber<number>>;
    rowId: zmini.ZodMiniString<string>;
    value: z.ZodObject<{
        title: zmini.ZodMiniString<string>;
        sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: zmini.ZodMiniString<string>;
            order: zmini.ZodMiniNumber<number>;
            scope: zmini.ZodMiniOptional<zmini.ZodMiniEnum<{
                inherit: "inherit";
                "main-only": "main-only";
                "subagents-only": "subagents-only";
            }>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const profileDeletePayload: z.ZodObject<{
    revision: zmini.ZodMiniOptional<zmini.ZodMiniNumber<number>>;
    rowId: zmini.ZodMiniString<string>;
}, z.core.$strip>;
/** `last` must name the workspace by at least one key: the registry id or the cwd. */
export declare const lastPayload: z.ZodObject<{
    workspaceId: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
    cwd: zmini.ZodMiniOptional<zmini.ZodMiniString<string>>;
    profileId: zmini.ZodMiniString<string>;
    revision: zmini.ZodMiniOptional<zmini.ZodMiniNumber<number>>;
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
