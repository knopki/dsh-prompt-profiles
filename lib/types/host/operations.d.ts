/**
 * Pure prompt-profile operations shared by EVERY transport (SPEC §5.5).
 * #region moduleContract
 * @modulecontract
 * @purpose Own the operation logic — validation, registry lookups, writer and
 *   settings mutations — exactly once, so the HTTP Fetch routes (lib/api.ts)
 *   and the Typert Remote surface (lib/remote.ts) execute ONE implementation
 *   and can never drift apart.
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
 *  - NOT: transport concerns — HTTP envelopes, statuses-as-headers, CSRF and
 *    platform auth live in lib/api.ts; Typert descriptors and codecs live in
 *    lib/remote.ts. This module only throws ApiError with the documented
 *    status semantics (400/404/409/413/503/500).
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
 *    both transports serialize them verbatim.
 *  - RESIDUAL CONCURRENCY WINDOW (documented, see writer.js): other plugins'
 *    direct configEditor writes when dsh-hmr is absent, and any second DSH
 *    process, are not serialized with these operations.
 * @dependencies
 *  - USES API: ctx.settings.replace / mutate / describe, ctx.configEditor.
 *    documentPath / entries (both OPTIONAL, resolved lazily through the
 *    caller-provided getService reader), ctx.promptProfiles views,
 *    lib/writer.js, lib/resolve.ts.
 * @rationale
 *  - Q: Why extract now, and why keep ApiError here?
 *    A: Phase 2b adds a second transport (Typert Remote) next to the Fetch
 *    routes. Duplicated operation logic is exactly how the historical
 *    findRow divergence bug happened; ApiError is the shared failure
 *    vocabulary both transports translate for themselves.
 *  - Q: Why do operations still receive the deps bag instead of importing
 *    services directly?
 *    A: Optional services degrade PER OPERATION on web and headless surfaces
 *    alike; the lazy getService reader keeps late-appearing services visible
 *    without a mandatory inject.
 * @keywords operations, validation, CRUD, settings.replace, withWriteLock,
 *   toPatchId, rowId, patchId, ApiError, transport-neutral
 * #endregion moduleContract
 */
/**
 * @purpose Carry an operation-status plus a safe message out of the shared
 *   operations so every transport can answer with its own clean failure shape
 *   (HTTP: `{ error: { message } }` + status; Remote: a Remote failure)
 *   instead of a stack.
 */
export declare class ApiError extends Error {
    constructor(status: any, message: any);
}
/**
 * Extract a NON-EMPTY human-readable message from any thrown value —
 * Error (even with an empty .message), string, plain object, null/undefined.
 *
 * @purpose Live bug: the empty-400 round showed failure diagnostics
 *   collapsing when a thrown value had no `.message`; every response body
 *   and every log line now carries a readable message by construction.
 * @param {unknown} error - whatever was thrown.
 * @returns {string} non-empty message.
 */
export declare function errorText(error: any): any;
/**
 * Shared registry-row lookup for every operation that addresses an existing
 * row.
 *
 * @purpose ONE place implementing the id-matching rule, so rename, update,
 *   delete (and any future operation) can never diverge — the live bug was
 *   exactly such a divergence: the registry stored the QUALIFIED loader
 *   entry rowId (`include:prompt-section-f01aa4a5`, from
 *   `ctx.fiber.entry.id` in lib/section.js) while a route looked the row up
 *   by the unqualified patch id and missed with «is not registered».
 *
 * MATCHING ORDER (first hit wins):
 *  1. exact match on the registry `rowId`;
 *  2. normalized match: `toPatchId(value)` against `rowId` (qualified value
 *     → unqualified row) or `toPatchId(rowId)` against `value` (unqualified
 *     value → qualified row) — the direction that actually occurs live;
 *  3. the row's CONFIG id (`candidate.id`), exact or `toPatchId`-normalized,
 *     so callers may address a row by its domain id as well.
 *
 * CANONICAL ID: this helper only FINDS the row. The patch row id used for
 * settings/writer addresses is derived separately by `patchIdOf`, which
 * prefers the canonical id from `configEditor.entries()` and only falls back
 * to `toPatchId` when entries are unavailable.
 *
 * @param {Array<{ id: string, rowId: string }>} registryView - rows from
 *   service.sections() / service.profiles().
 * @param {string} value - row identifier as received (any of the three
 *   forms above).
 * @returns {object | null} the matching registry row view, or null.
 */
export declare function findRow(registryView: any, value: any): any;
/**
 * Normalize the NEW id of a create/rename payload to the two canonical
 * forms under the frozen decision «config.id === full row id»: the stored
 * config id is the FULL `prompt-<kind>-<token>` string.
 *
 * Accepted inputs (all equivalent):
 *  - bare token:            `123123`
 *  - full row id:           `prompt-section-123123`
 *  - qualified loader form: `include:prompt-section-123123` (any `:` chain)
 *
 * @param {"section"|"profile"} kind - supplies the `prompt-<kind>-` prefix.
 * @param {string} value - id as received.
 * @returns {string} the FULL `prompt-<kind>-<token>` form, or null when the
 *   input is not a string or reduces to the bare prefix (pattern checks stay
 *   with the caller, which reports a clear 400).
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
 * Build the shared operation set plus the route table (SPEC §5.5 + preview +
 * frozen live-bugfix contract). Each operation validates, performs at most
 * one logical write path, and returns a plain JSON result (`undefined` means
 * "nothing to report"; the HTTP layer answers `{ ok: true }` for it).
 *
 * @purpose Keep the operation set and the HTTP route table declarative and
 *   transport-neutral, so lib/api.ts (Fetch routes) and lib/remote.ts
 *   (Typert Remote) share ONE implementation of every behaviour.
 * @param {object} deps - { service, settings, configEditor, workspaceRegistry?,
 *   agentPresets?, connection?, warn?, log?, getService? }.
 * @returns {{ ops: Record<string, (input: object) => any>,
 *   routes: Array<{ path: string, method: string, op: string,
 *   run: (body: object, query: URLSearchParams) => any }> }}
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
        /**
         * Illustrative profile preview. `input.profileId` must be a non-empty
         * id (the HTTP layer reads it from its query parameter, hence the
         * historical message text).
         */
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
                scope?: any;
                id: any;
                order: any;
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
         * Set (`""`/null = clear) the default profile. Body contract:
         * `{default: profileId | "" | null, revision?}` — the Remote adapter
         * renames `default` to `profileId` but shares this implementation.
         */
        defaultSet: (body: any) => Promise<void>;
        /** Record the workspace's last chosen profile (SPEC §2 #11). */
        last: (body: any) => Promise<void>;
    };
    routes: ({
        path: string;
        method: string;
        op: string;
        run: () => Promise<{
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
    } | {
        path: string;
        method: string;
        op: string;
        run: (body: any, query: any) => {
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
    } | {
        path: string;
        method: string;
        op: string;
        run: (body: any) => Promise<{
            disabled: boolean;
        }>;
    } | {
        path: string;
        method: string;
        op: string;
        run: (body: any) => Promise<{
            rowId: any;
            patchId: any;
        }>;
    } | {
        path: string;
        method: string;
        op: string;
        run: (body: any) => Promise<void>;
    })[];
};
