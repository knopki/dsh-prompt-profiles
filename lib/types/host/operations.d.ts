/**
 * Prompt-profile use cases (SPEC §5.5), transport-neutral.
 * #region moduleContract
 * @modulecontract
 * @purpose Own the operation logic — validation, registry lookups, writer and
 *   settings mutations — so every surface built on this bundle executes ONE
 *   implementation and cannot drift apart.
 * @scope
 *  - The eleven operations (state, preview, section create/update/delete/
 *    rename, profile create/update/delete, default, last) with whole-object
 *    validation and the frozen id scheme.
 *  - Writes to EXISTING rows replace the WHOLE config via
 *    ctx.settings.replace(ns, value, revision); creation/removal/disable go
 *    through the writer; rename is the documented batch with rollback and
 *    touches the SECTION ONLY, returning `affectedProfiles` for the user to
 *    fix by hand.
 *  - Every row-addressing operation accepts EITHER the fully qualified loader
 *    entry rowId (`include:prompt-section-1`) OR the unqualified patch row id
 *    (`prompt-section-1`) — toPatchId normalizes internally.
 *  - EVERY mutating path runs inside the bundle's one in-process serializer
 *    (`withWriteLock`), preventing same-process lost updates.
 *  - NOT: transport concerns. Descriptors, codecs and wire envelopes live
 *    with the surface that owns them; this module only throws ApiError with
 *    the documented status semantics (400/404/409/503/500).
 * @invariants
 *  - Every payload is validated BEFORE any write happens: section value
 *    {title non-empty, body string}; profile value {title non-empty,
 *    sections array of {id ∈ registered sections, order finite, scope enum}};
 *    violations throw a clean ApiError 400 and never touch the file
 *    (byte-identical).
 *  - A section body may be empty/whitespace (SPEC §7); state marks it
 *    `emits: false`.
 *  - FROZEN ID SCHEME: on create and rename, `config.id` === the full row id
 *    (`prompt-<kind>-<token>`) === the returned `configId`; callers may still
 *    send a bare token, the full form, or a qualified `include:` form.
 *    Existing rows with old bare config ids are never rewritten.
 *  - `last` stores the choice under the SAME key the assembler reads
 *    (resolveWorkspaceKeys), so a chip choice always reaches the prompt;
 *    `profileId: ""` still means an explicit "none" and an unknown profile id
 *    is a 404.
 *  - Results are plain JSON-safe objects (no class instances, no functions):
 *    surfaces serialize them verbatim.
 *  - RESIDUAL CONCURRENCY WINDOW (documented, see writer.js): other plugins'
 *    direct configEditor writes when dsh-hmr is absent, and any second DSH
 *    process, are not serialized with these operations.
 * @dependencies
 *  - USES API: ctx.settings.replace / mutate / describe, ctx.configEditor.
 *    documentPath / entries (both OPTIONAL, resolved lazily through the
 *    caller-provided getService reader), ctx.promptProfiles views,
 *    lib/writer.js, lib/resolve.ts.
 * @keywords operations, validation, CRUD, settings.replace, withWriteLock,
 *   toPatchId, rowId, patchId, ApiError, transport-neutral
 * #endregion moduleContract
 */
/**
 * @purpose Carry an operation status plus a safe message out of the shared
 *   operations, so each surface translates a failure into its own shape
 *   instead of leaking a stack.
 */
export declare class ApiError extends Error {
    constructor(status: any, message: any);
}
/**
 * @purpose Extract a NON-EMPTY human-readable message from any thrown value —
 *   Error (even with an empty `.message`), string, plain object, null.
 *   Every failure rendered to a user or a log carries a readable message by
 *   construction.
 * @returns {string} non-empty message.
 */
export declare function errorText(error: any): any;
/**
 * @purpose ONE place implementing the row id-matching rule, so every
 *   operation that addresses an existing row resolves it identically. The
 *   registry stores the QUALIFIED loader entry rowId
 *   (`include:prompt-section-f01aa4a5`, from `ctx.fiber.entry.id`), while
 *   callers may send the unqualified patch row id.
 *
 * MATCHING ORDER (first hit wins):
 *  1. exact match on the registry `rowId`;
 *  2. normalized match: `toPatchId(value)` against `rowId` (qualified value
 *     → unqualified row) or `toPatchId(rowId)` against `value` (unqualified
 *     value → qualified row);
 *  3. the row's CONFIG id (`candidate.id`), exact or `toPatchId`-normalized,
 *     so callers may address a row by its domain id as well.
 *
 * @param {Array<{ id: string, rowId: string }>} registryView - rows from
 *   service.sections() / service.profiles().
 * @returns {object | null} the matching registry row view, or null.
 */
export declare function findRow(registryView: any, value: any): any;
/**
 * Normalize the NEW id of a create/rename payload to the canonical
 * `prompt-<kind>-<token>` form under the frozen decision «config.id === full
 * row id»: the stored config id IS that full string.
 *
 * Accepted inputs (all equivalent):
 *  - bare token:            `123123`
 *  - full row id:           `prompt-section-123123`
 *  - qualified loader form: `include:prompt-section-123123` (any `:` chain)
 *
 * @param {"section"|"profile"} kind - supplies the `prompt-<kind>-` prefix.
 * @returns {string} the FULL form, or null when the input is not a string or
 *   reduces to the bare prefix (pattern checks stay with the caller, which
 *   reports a clear 400).
 */
export declare function normalizeNewRowId(kind: any, value: any): any;
/**
 * Injectable source of short random create tokens (8 lowercase hex chars).
 * @purpose Let tests force collisions deterministically (`tokenSource.next`)
 *   without monkey-patching crypto; production always uses a crypto UUID.
 */
export declare const tokenSource: {
    next: () => string;
};
/**
 * @purpose Build the operation set (SPEC §5.5 + preview) once per surface.
 *   Each operation validates, performs at most one logical write path, and
 *   returns a plain JSON result; `undefined` means "nothing to report" and the
 *   surface renders its own acknowledgement for it.
 * @param {object} deps - { service, getService?, settings?, configEditor?,
 *   workspaceRegistry?, agentPresets?, warn?, log? }. Optional services are
 *   read per call through `getService`, so a late-appearing service is picked
 *   up and a missing one degrades per operation instead of blocking the mount.
 * @returns {{ ops: Record<string, (input: object) => any> }}
 */
export declare function createOperations(deps: any): {
    ops: {
        /** Read the full editor state (degrades per optional service). */
        state: () => Promise<{
            profiles: any;
            sections: any;
            builtinOrders: any;
            modes: {
                id: any;
                title: any;
                complete: boolean;
            }[];
            default: any;
            lastByWorkspace: any;
            revision: any;
        }>;
        /** Illustrative preview of `profileId`, optionally against a session cwd. */
        preview: (input: any) => {
            profileId: any;
            title: any;
            sections: {
                kind: string;
                name: string;
                title: string;
                order: unknown;
            }[];
            skipped: {
                id: any;
                title: any;
                reason: string;
            }[];
            variables: any;
        };
        /** Create a section row (SPEC §7: empty body allowed). */
        sectionCreate: (body: any) => Promise<{
            rowId: any;
            patchId: any;
            configId: any;
            title: any;
            body: any;
            emits: boolean;
        }>;
        /** Whole-object update of a section's volatile fields. */
        sectionUpdate: (body: any) => Promise<{
            rowId: any;
            patchId: any;
            emits: boolean;
        }>;
        /** Delete (or disable) a section row. */
        sectionDelete: (body: any) => Promise<{
            disabled: boolean;
        }>;
        /** Rename a section row; profiles are never rewritten (see renameSection). */
        sectionRename: (body: any) => Promise<{
            rowId: any;
            patchId: any;
            id: any;
            affectedProfiles: any;
        }>;
        /** Create a profile row. */
        profileCreate: (body: any) => Promise<{
            rowId: any;
            patchId: any;
            configId: any;
            title: any;
            sections: {
                id: any;
                order: any;
                scope?: any;
            }[] | undefined;
        }>;
        /** Whole-object update of a profile's volatile fields. */
        profileUpdate: (body: any) => Promise<{
            rowId: any;
            patchId: any;
        }>;
        /** Delete a profile row and best-effort-clear its default/last references. */
        profileDelete: (body: any) => Promise<{
            disabled: boolean;
        }>;
        /**
         * Set (`""`/null = clear) the default profile. Input contract:
         * `{default: profileId | "" | null, revision?}`.
         */
        defaultSet: (body: any) => Promise<void>;
        /** Record the workspace's last chosen profile (SPEC §2 #11). */
        last: (body: any) => Promise<void>;
    };
};
