/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the operation logic — validation, registry lookups, writer and
 *   settings mutations — so every surface built on this bundle executes ONE
 *   implementation and cannot drift apart.
 * @scope
 *  - The eleven operations (state, preview, section create/update/delete/
 *    rename, profile create/update/delete, default, last).
 *  - Writes to EXISTING rows replace the WHOLE volatile config via
 *    ctx.settings.replace(ns, value, revision); creation/removal/disable go
 *    through the writer; rename is the documented batch that touches the
 *    SECTION ONLY and returns `affectedProfiles` for the user to fix by hand.
 *  - NOT: pure rules. Ids, reference matching, ordering, skip reasons and the
 *    payload schemas live in src/host/domain/ and are only APPLIED here.
 * @invariants
 *  - Every payload is validated BEFORE any write happens: a violation throws
 *    InvalidInputError and leaves the patch file byte-identical.
 *  - A section body may be empty/whitespace (SPEC §7); state marks it
 *    `emits: false`.
 *  - FROZEN ID SCHEME: a created row's `config.id` IS its full row id
 *    (`prompt-<kind>-<token>`) and the returned `configId`; existing rows with
 *    old bare config ids are never rewritten.
 *  - `last` stores the choice under the SAME key the assembler reads
 *    (the workspace-keys adapter), so a chip choice always reaches the prompt;
 *    `profileId: ""` still means an explicit "none" and an unknown profile id
 *    is a NotFoundError.
 *  - EVERY mutating path runs inside the bundle's one in-process serializer
 *    (the write-lock port), preventing same-process lost updates.
 *  - Results are plain JSON-safe objects (no class instances, no functions):
 *    surfaces serialize them verbatim.
 * @dependencies USES: the driven ports in host/application/ports.ts (registry
 *   views, built-in orders, patch rows, settings, workspace keys, agent
 *   presets) — all OPTIONAL services are read through the ports' per-call
 *   resolvers, never directly.
 * @keywords operations, validation, CRUD, settings.replace, ids, ports
 * #endregion moduleContract
 */
import type { HostPorts } from "./application/ports.ts";
/** The create-token source the tests drive to force id collisions. */
export { tokenSource } from "./domain/ids.ts";
/**
 * @purpose Build the operation set (SPEC §5.5 + preview) once per surface.
 *   Each operation validates, performs at most one logical write path, and
 *   returns a plain JSON result; `undefined` means "nothing to report" and the
 *   surface renders its own acknowledgement for it.
 * @param {HostPorts} deps - the driven ports (host/application/ports.ts).
 *   Optional services are read per call through the ports' resolvers, so a
 *   late-appearing service is picked up and a missing one degrades per
 *   operation instead of blocking the mount. `deps.resolve` is added for the
 *   rename path (internal).
 * @returns {{ ops: Record<string, (input: object) => any> }}
 */
export declare function createOperations(deps: HostPorts): {
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
            rowId: string | null;
            patchId: unknown;
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
            sections: any;
        }>;
        /** Whole-object update of a profile's volatile fields. */
        profileUpdate: (body: any) => Promise<{
            rowId: string | null;
            patchId: unknown;
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
