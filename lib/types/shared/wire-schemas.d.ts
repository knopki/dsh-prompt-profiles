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
/**
 * The per-method field rules, public so the host's tolerant parsers derive
 * their fields from the SAME definitions. A tolerant variant differs only in
 * the wrapper (`z.object` instead of `z.strictObject`) and in the refinements
 * it adds.
 */
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
