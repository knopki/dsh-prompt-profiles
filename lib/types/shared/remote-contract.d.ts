/** #region moduleContract
 * @modulecontract
 * @purpose ONE source of truth for the promptProfiles Remote contract: the
 *   method table (name + strict zod args/result schemas) and the descriptor
 *   builder both faces share, so the host descriptors (registered through
 *   ctx.typert.register) and the client descriptors (mounted through
 *   ctx.remote.$mount) can never drift apart in shape.
 * @scope
 *  - Identity constants (package, namespace, service key), the METHOD_SPECS
 *    table, memoized codec factories, and buildRemoteDescriptors(face).
 *  - NOT: the host-side `run` adapters (src/host/remote.ts — they delegate to
 *    the shared operations), the host service/registration, and the client
 *    mount/call helpers (src/client/remote.ts).
 * @invariants
 *  - buildRemoteDescriptors('host') reproduces the exact descriptor field
 *    shape the 2a spike PROVED on live rc.2 and the host committed in 8a27a2f
 *    (id/service/namespace/method/invocation/parameters/result/sourceLocation,
 *    real zod factories in codec.create) — including the historical
 *    sourceLocation line numbers, which are DATA here, not live positions.
 *  - Both faces see the same method set and the same codec typeSymbols; a
 *    method cannot exist on one side and not the other.
 *  - Every args schema is z.strictObject: missing/extra/wrong-typed fields are
 *    rejected before any business code runs, on BOTH sides of the wire.
 * @dependencies
 *  - USES API: zod 4 (bundled into both the host and the client artifact —
 *    the browser module table has no bare `zod` entry).
 * @rationale
 *  - Q: Why keep `line` as a stale literal instead of the new file position?
 *    A: The host descriptors (their sourceLocation included) are public
 *    committed behaviour (MIGRATION phase 2b host half, commit 8a27a2f); the
 *    instruction is to fix the builder, not the tests. The literals preserve
 *    byte-identical host descriptors while the table lives in a new file.
 * @keywords remote, contract, descriptors, method table, zod, strict codecs,
 *   shared, phase 2b
 * #endregion moduleContract */
import { z } from "zod";
/** Typert package identity (the plugin's npm name, like every contribution). */
export declare const TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
/** Wire namespace of every endpoint (`promptProfiles/<method>`). */
export declare const REMOTE_NAMESPACE = "promptProfiles";
/** Cordis service key of the delegating remote service (host side). */
export declare const REMOTE_SERVICE_KEY = "promptProfilesRemote";
/**
 * Memoize one zod schema factory: the registry calls `codec.create()` per
 * decode, and rebuilding a schema on every call is pure waste. Mirrors the
 * generated descriptors' memoized factories (`dsh-goal/lib/typert.host.js`).
 */
export declare function memoCreate(build: any): () => any;
/**
 * THE method table: one entry per Remote method, each naming its input and
 * result strict zod schema. Host-side `run` adapters (src/host/remote.ts) and
 * the client call helpers (src/client/remote.ts) are both generated from this
 * table.
 *
 * `state` accepts the session hints the MIGRATION 2b contract reserves for
 * the client half ({sessionId?, cwd?, workspaceId?}); the current operation
 * ignores them (state is global, exactly like GET /state today).
 *
 * `line` preserves the sourceLocation line each host descriptor carried when
 * the table lived in src/host/remote.ts (see @rationale in the module
 * contract) — host descriptors must not change in any field.
 */
export declare const METHOD_SPECS: ({
    method: string;
    line: number;
    input: () => z.ZodObject<{
        sessionId: z.ZodOptional<z.ZodString>;
        cwd: z.ZodOptional<z.ZodString>;
        workspaceId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
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
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        profileId: z.ZodString;
        cwd: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
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
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
        rowId: z.ZodString;
        patchId: z.ZodString;
        configId: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        emits: z.ZodBoolean;
    }, z.core.$strict>;
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        rowId: z.ZodString;
        value: z.ZodObject<{
            title: z.ZodString;
            body: z.ZodString;
        }, z.core.$strict>;
        revision: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
        rowId: z.ZodString;
        patchId: z.ZodString;
        emits: z.ZodBoolean;
    }, z.core.$strict>;
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        rowId: z.ZodString;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
        disabled: z.ZodBoolean;
    }, z.core.$strict>;
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        rowId: z.ZodString;
        id: z.ZodString;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
        rowId: z.ZodString;
        patchId: z.ZodString;
        id: z.ZodString;
        affectedProfiles: z.ZodArray<z.ZodObject<{
            profileId: z.ZodString;
            title: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            order: z.ZodNumber;
            scope: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
        rowId: z.ZodString;
        patchId: z.ZodString;
        configId: z.ZodString;
        title: z.ZodString;
        sections: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            order: z.ZodNumber;
            scope: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        rowId: z.ZodString;
        value: z.ZodObject<{
            title: z.ZodString;
            sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                order: z.ZodNumber;
                scope: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
        revision: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
        rowId: z.ZodString;
        patchId: z.ZodString;
    }, z.core.$strict>;
} | {
    method: string;
    line: number;
    input: () => z.ZodObject<{
        profileId: z.ZodString;
        revision: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    result: () => z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>;
})[];
/**
 * Build the hand-written invocation descriptors (one per METHOD_SPECS entry)
 * for one face, in the exact field shape the 2a spike proved against the live
 * rc.2 registry: `{ id, service, namespace, method, invocation: { kind:
 * 'direct' }, parameters: [{ name, wire, source: 'json', codec }], result,
 * sourceLocation }`.
 *
 * @purpose Give `ctx.typert.register` (host) and `ctx.remote.$mount`
 *   (client) identical contributions the strict gateway accepts without any
 *   generator pipeline, keeping the plugin independently installable.
 * @param {"host"|"client"} face - which side the descriptors are for (only
 *   the reported sourceLocation differs).
 * @returns {Array<object>} fresh descriptor array (safe to register once).
 */
export declare function buildRemoteDescriptors(face: any): {
    id: string;
    service: string;
    namespace: string;
    method: string;
    invocation: {
        kind: string;
    };
    parameters: {
        name: string;
        wire: string;
        source: string;
        codec: {
            mode: string;
            typeSymbol: string;
            create: () => any;
        };
    }[];
    result: {
        mode: string;
        typeSymbol: string;
        create: () => any;
    };
    sourceLocation: {
        file: any;
        line: number;
        column: number;
    };
}[];
