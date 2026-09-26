/** #region moduleContract
 * @modulecontract
 * @purpose ONE definition of the promptProfiles WIRE shapes both faces of the
 *   Remote contract publish: the strict input codecs, the strict result codecs
 *   and the per-method field rules the host's tolerant business parsers build
 *   on. Shared, not layered, because the client contribution must mount codecs
 *   identical to the host's.
 * @scope
 *  - Field rules (zod 4), the strict `<method>Input` / `<method>Result`
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
 * @dependencies USES API: zod 4 (bundled into both artifacts — the browser
 *   module table has no bare `zod` entry) and the domain scope vocabulary.
 * @keywords wire schemas, zod, strict codec, remote input, result schema
 * #endregion moduleContract */
import { z } from "zod";
/** Field rules of one section reference inside a profile value. */
export declare const sectionRefFields: {
    id: z.ZodString;
    order: z.ZodNumber;
    scope: z.ZodOptional<z.ZodEnum<{
        inherit: "inherit";
        "main-only": "main-only";
        "subagents-only": "subagents-only";
    }>>;
};
/**
 * The per-method field rules, public so the host's tolerant parsers derive
 * their fields from the SAME definitions. A tolerant variant differs only in
 * the wrapper (`z.object` instead of `z.strictObject`) and in the refinements
 * it adds.
 */
export declare const WIRE_FIELDS: {
    readonly preview: {
        profileId: z.ZodString;
        cwd: z.ZodOptional<z.ZodString>;
    };
    readonly sectionCreate: {
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
    };
    readonly sectionValue: {
        title: z.ZodString;
        body: z.ZodString;
    };
    readonly sectionUpdate: {
        rowId: z.ZodString;
        value: z.ZodObject<{
            title: z.ZodString;
            body: z.ZodString;
        }, z.core.$strict>;
        revision: z.ZodOptional<z.ZodNumber>;
    };
    readonly sectionDelete: {
        rowId: z.ZodString;
    };
    readonly sectionRename: {
        rowId: z.ZodString;
        id: z.ZodString;
    };
    readonly profileCreate: {
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
    };
    readonly profileValue: {
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
    };
    readonly profileUpdate: {
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
    };
    readonly profileDelete: {
        rowId: z.ZodString;
        revision: z.ZodOptional<z.ZodNumber>;
    };
    readonly last: {
        workspaceId: z.ZodOptional<z.ZodString>;
        cwd: z.ZodOptional<z.ZodString>;
        profileId: z.ZodString;
        revision: z.ZodOptional<z.ZodNumber>;
    };
    readonly defaultSet: {
        profileId: z.ZodString;
        revision: z.ZodOptional<z.ZodNumber>;
    };
};
/** Strict wire codecs published by `buildRemoteDescriptors` on both faces. */
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
