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
/**
 * Strict wire codecs. These are the schemas `buildRemoteDescriptors` publishes:
 * missing, extra and wrong-typed fields are rejected before any business code
 * runs, on BOTH sides of the wire.
 */
export declare const stateInput: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
    workspaceId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const previewInput: z.ZodObject<{
    profileId: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const sectionCreateInput: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const sectionUpdateInput: z.ZodObject<{
    rowId: z.ZodString;
    value: z.ZodObject<{
        title: z.ZodString;
        body: z.ZodString;
    }, z.core.$strict>;
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const sectionDeleteInput: z.ZodObject<{
    rowId: z.ZodString;
}, z.core.$strict>;
export declare const sectionRenameInput: z.ZodObject<{
    rowId: z.ZodString;
    id: z.ZodString;
}, z.core.$strict>;
export declare const profileCreateInput: z.ZodObject<{
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
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const profileUpdateInput: z.ZodObject<{
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
        }, z.core.$strict>>>;
    }, z.core.$strict>;
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const profileDeleteInput: z.ZodObject<{
    rowId: z.ZodString;
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const lastInput: z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
    profileId: z.ZodString;
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const defaultSetInput: z.ZodObject<{
    profileId: z.ZodString;
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
/**
 * Business parses of the same field rules: unknown keys are ignored (rows from
 * other layers and older clients may carry more than the wire declares) and
 * the refinements the operations used to hand-check are enforced here.
 */
export declare const previewPayload: z.ZodObject<{
    profileId: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const sectionCreatePayload: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const sectionUpdatePayload: z.ZodObject<{
    rowId: z.ZodString;
    value: z.ZodObject<{
        title: z.ZodString;
        body: z.ZodString;
    }, z.core.$strip>;
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const sectionDeletePayload: z.ZodObject<{
    rowId: z.ZodString;
}, z.core.$strip>;
export declare const sectionRenamePayload: z.ZodObject<{
    rowId: z.ZodString;
    id: z.ZodString;
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
    revision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const profileDeletePayload: z.ZodObject<{
    rowId: z.ZodString;
    revision: z.ZodOptional<z.ZodNumber>;
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
/** Strict result schemas: a result that violates its schema fails the call loudly. */
export declare const stateResult: z.ZodObject<{
    profiles: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    sections: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    builtinOrders: z.ZodRecord<z.ZodString, z.ZodNumber>;
    modes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        complete: z.ZodBoolean;
    }, z.core.$strict>>;
    default: z.ZodString;
    lastByWorkspace: z.ZodRecord<z.ZodString, z.ZodString>;
    revision: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export declare const previewResult: z.ZodObject<{
    profileId: z.ZodString;
    title: z.ZodString;
    sections: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    skipped: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>>;
    variables: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export declare const sectionCreateResult: z.ZodObject<{
    rowId: z.ZodString;
    patchId: z.ZodString;
    configId: z.ZodString;
    title: z.ZodString;
    body: z.ZodString;
    emits: z.ZodBoolean;
}, z.core.$strict>;
export declare const sectionUpdateResult: z.ZodObject<{
    rowId: z.ZodString;
    patchId: z.ZodString;
    emits: z.ZodBoolean;
}, z.core.$strict>;
export declare const sectionDeleteResult: z.ZodObject<{
    disabled: z.ZodBoolean;
}, z.core.$strict>;
export declare const sectionRenameResult: z.ZodObject<{
    rowId: z.ZodString;
    patchId: z.ZodString;
    id: z.ZodString;
    affectedProfiles: z.ZodArray<z.ZodObject<{
        profileId: z.ZodString;
        title: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const profileCreateResult: z.ZodObject<{
    rowId: z.ZodString;
    patchId: z.ZodString;
    configId: z.ZodString;
    title: z.ZodString;
    sections: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        order: z.ZodNumber;
        scope: z.ZodOptional<z.ZodEnum<{
            inherit: "inherit";
            "main-only": "main-only";
            "subagents-only": "subagents-only";
        }>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const profileUpdateResult: z.ZodObject<{
    rowId: z.ZodString;
    patchId: z.ZodString;
}, z.core.$strict>;
export declare const profileDeleteResult: z.ZodObject<{
    disabled: z.ZodBoolean;
}, z.core.$strict>;
export declare const okResult: z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strict>;
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
