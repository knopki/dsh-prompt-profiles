/** #region moduleContract
 * @modulecontract
 * @purpose Define the promptProfiles wire shapes published by both Remote faces.
 * @scope
 *  - Strict codecs, result schemas, and `WIRE_FIELDS` for tolerant parsers.
 *  - NOT: the method table (remote-contract.ts) or business parsing.
 * @invariants
 *  - Inputs reject missing, extra and wrong-typed fields.
 *  - Each field rule is defined once; strict and tolerant parsers share it.
 * #endregion moduleContract */
import * as z from "zod/mini";
/** Field rules of one section reference inside a profile value. */
export declare const sectionRefFields: {
    id: z.ZodMiniString<string>;
    order: z.ZodMiniNumber<number>;
    scope: z.ZodMiniOptional<z.ZodMiniEnum<{
        inherit: "inherit";
        "main-only": "main-only";
        "subagents-only": "subagents-only";
    }>>;
};
/** Per-method field rules the host's tolerant parsers derive from. */
export declare const WIRE_FIELDS: {
    readonly preview: {
        profileId: z.ZodMiniString<string>;
        cwd: z.ZodMiniOptional<z.ZodMiniString<string>>;
    };
    readonly sectionCreate: {
        id: z.ZodMiniOptional<z.ZodMiniString<string>>;
        title: z.ZodMiniOptional<z.ZodMiniString<string>>;
        body: z.ZodMiniOptional<z.ZodMiniString<string>>;
    };
    readonly sectionValue: {
        title: z.ZodMiniString<string>;
        body: z.ZodMiniString<string>;
    };
    readonly sectionUpdate: {
        rowId: z.ZodMiniString<string>;
        value: z.ZodMiniObject<{
            title: z.ZodMiniString<string>;
            body: z.ZodMiniString<string>;
        }, z.core.$strict>;
        revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
    };
    readonly sectionDelete: {
        rowId: z.ZodMiniString<string>;
    };
    readonly sectionRename: {
        rowId: z.ZodMiniString<string>;
        id: z.ZodMiniString<string>;
    };
    readonly profileCreate: {
        id: z.ZodMiniOptional<z.ZodMiniString<string>>;
        title: z.ZodMiniOptional<z.ZodMiniString<string>>;
        sections: z.ZodMiniOptional<z.ZodMiniArray<z.ZodMiniObject<{
            id: z.ZodMiniString<string>;
            order: z.ZodMiniNumber<number>;
            scope: z.ZodMiniOptional<z.ZodMiniEnum<{
                inherit: "inherit";
                "main-only": "main-only";
                "subagents-only": "subagents-only";
            }>>;
        }, z.core.$strict>>>;
    };
    readonly profileValue: {
        title: z.ZodMiniString<string>;
        sections: z.ZodMiniOptional<z.ZodMiniArray<z.ZodMiniObject<{
            id: z.ZodMiniString<string>;
            order: z.ZodMiniNumber<number>;
            scope: z.ZodMiniOptional<z.ZodMiniEnum<{
                inherit: "inherit";
                "main-only": "main-only";
                "subagents-only": "subagents-only";
            }>>;
        }, z.core.$strict>>>;
    };
    readonly profileUpdate: {
        rowId: z.ZodMiniString<string>;
        value: z.ZodMiniObject<{
            title: z.ZodMiniString<string>;
            sections: z.ZodMiniOptional<z.ZodMiniArray<z.ZodMiniObject<{
                id: z.ZodMiniString<string>;
                order: z.ZodMiniNumber<number>;
                scope: z.ZodMiniOptional<z.ZodMiniEnum<{
                    inherit: "inherit";
                    "main-only": "main-only";
                    "subagents-only": "subagents-only";
                }>>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
        revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
    };
    readonly profileDelete: {
        rowId: z.ZodMiniString<string>;
        revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
    };
    readonly last: {
        workspaceId: z.ZodMiniOptional<z.ZodMiniString<string>>;
        cwd: z.ZodMiniOptional<z.ZodMiniString<string>>;
        profileId: z.ZodMiniString<string>;
        revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
    };
    readonly defaultSet: {
        profileId: z.ZodMiniString<string>;
        revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
    };
};
/** Strict wire codecs published by `buildRemoteDescriptors` on both faces. */
export declare const stateInput: z.ZodMiniObject<{
    sessionId: z.ZodMiniOptional<z.ZodMiniString<string>>;
    cwd: z.ZodMiniOptional<z.ZodMiniString<string>>;
    workspaceId: z.ZodMiniOptional<z.ZodMiniString<string>>;
}, z.core.$strict>;
export declare const previewInput: z.ZodMiniObject<{
    profileId: z.ZodMiniString<string>;
    cwd: z.ZodMiniOptional<z.ZodMiniString<string>>;
}, z.core.$strict>;
export declare const sectionCreateInput: z.ZodMiniObject<{
    id: z.ZodMiniOptional<z.ZodMiniString<string>>;
    title: z.ZodMiniOptional<z.ZodMiniString<string>>;
    body: z.ZodMiniOptional<z.ZodMiniString<string>>;
}, z.core.$strict>;
export declare const sectionUpdateInput: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    value: z.ZodMiniObject<{
        title: z.ZodMiniString<string>;
        body: z.ZodMiniString<string>;
    }, z.core.$strict>;
    revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
}, z.core.$strict>;
export declare const sectionDeleteInput: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
}, z.core.$strict>;
export declare const sectionRenameInput: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    id: z.ZodMiniString<string>;
}, z.core.$strict>;
export declare const profileCreateInput: z.ZodMiniObject<{
    id: z.ZodMiniOptional<z.ZodMiniString<string>>;
    title: z.ZodMiniOptional<z.ZodMiniString<string>>;
    sections: z.ZodMiniOptional<z.ZodMiniArray<z.ZodMiniObject<{
        id: z.ZodMiniString<string>;
        order: z.ZodMiniNumber<number>;
        scope: z.ZodMiniOptional<z.ZodMiniEnum<{
            inherit: "inherit";
            "main-only": "main-only";
            "subagents-only": "subagents-only";
        }>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const profileUpdateInput: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    value: z.ZodMiniObject<{
        title: z.ZodMiniString<string>;
        sections: z.ZodMiniOptional<z.ZodMiniArray<z.ZodMiniObject<{
            id: z.ZodMiniString<string>;
            order: z.ZodMiniNumber<number>;
            scope: z.ZodMiniOptional<z.ZodMiniEnum<{
                inherit: "inherit";
                "main-only": "main-only";
                "subagents-only": "subagents-only";
            }>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
    revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
}, z.core.$strict>;
export declare const profileDeleteInput: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
}, z.core.$strict>;
export declare const lastInput: z.ZodMiniObject<{
    workspaceId: z.ZodMiniOptional<z.ZodMiniString<string>>;
    cwd: z.ZodMiniOptional<z.ZodMiniString<string>>;
    profileId: z.ZodMiniString<string>;
    revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
}, z.core.$strict>;
export declare const defaultSetInput: z.ZodMiniObject<{
    profileId: z.ZodMiniString<string>;
    revision: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
}, z.core.$strict>;
/** Strict result schemas: a result that violates its schema fails the call loudly. */
export declare const stateResult: z.ZodMiniObject<{
    profiles: z.ZodMiniArray<z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniUnknown>>;
    sections: z.ZodMiniArray<z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniUnknown>>;
    builtinOrders: z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniNumber<number>>;
    modes: z.ZodMiniArray<z.ZodMiniObject<{
        id: z.ZodMiniString<string>;
        title: z.ZodMiniString<string>;
        complete: z.ZodMiniBoolean<boolean>;
    }, z.core.$strict>>;
    default: z.ZodMiniString<string>;
    lastByWorkspace: z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniString<string>>;
    revision: z.ZodMiniNullable<z.ZodMiniNumber<number>>;
}, z.core.$strict>;
export declare const previewResult: z.ZodMiniObject<{
    profileId: z.ZodMiniString<string>;
    title: z.ZodMiniString<string>;
    sections: z.ZodMiniArray<z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniUnknown>>;
    skipped: z.ZodMiniArray<z.ZodMiniObject<{
        id: z.ZodMiniString<string>;
        title: z.ZodMiniString<string>;
        reason: z.ZodMiniString<string>;
        detail: z.ZodMiniOptional<z.ZodMiniString<string>>;
    }, z.core.$strict>>;
    variables: z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniNullable<z.ZodMiniString<string>>>;
}, z.core.$strict>;
export declare const sectionCreateResult: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    patchId: z.ZodMiniString<string>;
    configId: z.ZodMiniString<string>;
    title: z.ZodMiniString<string>;
    body: z.ZodMiniString<string>;
    emits: z.ZodMiniBoolean<boolean>;
}, z.core.$strict>;
export declare const sectionUpdateResult: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    patchId: z.ZodMiniString<string>;
    emits: z.ZodMiniBoolean<boolean>;
}, z.core.$strict>;
export declare const sectionDeleteResult: z.ZodMiniObject<{
    disabled: z.ZodMiniBoolean<boolean>;
}, z.core.$strict>;
export declare const sectionRenameResult: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    patchId: z.ZodMiniString<string>;
    id: z.ZodMiniString<string>;
    affectedProfiles: z.ZodMiniArray<z.ZodMiniObject<{
        profileId: z.ZodMiniString<string>;
        title: z.ZodMiniString<string>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const profileCreateResult: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    patchId: z.ZodMiniString<string>;
    configId: z.ZodMiniString<string>;
    title: z.ZodMiniString<string>;
    sections: z.ZodMiniArray<z.ZodMiniObject<{
        id: z.ZodMiniString<string>;
        order: z.ZodMiniNumber<number>;
        scope: z.ZodMiniOptional<z.ZodMiniEnum<{
            inherit: "inherit";
            "main-only": "main-only";
            "subagents-only": "subagents-only";
        }>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const profileUpdateResult: z.ZodMiniObject<{
    rowId: z.ZodMiniString<string>;
    patchId: z.ZodMiniString<string>;
}, z.core.$strict>;
export declare const profileDeleteResult: z.ZodMiniObject<{
    disabled: z.ZodMiniBoolean<boolean>;
}, z.core.$strict>;
export declare const okResult: z.ZodMiniObject<{
    ok: z.ZodMiniLiteral<true>;
}, z.core.$strict>;
