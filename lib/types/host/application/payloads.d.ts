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
/** @purpose Apply a business payload schema, reporting the FIRST violation as a clean InvalidInputError. */
export declare function parsePayload<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S>;
