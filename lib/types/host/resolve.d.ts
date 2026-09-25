/**
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve and seal a session's chosen prompt profile into immutable-by-convention text, independently of Cordis.
 * @scope Profile selection, the shared section-skip predicate (sectionSkipReason, used by both the sealer and the host preview), scope filtering, seal-time interpolation, built-in-name insertion planning, once-per-session decision pinning, and a retry-on-failure promise cache for storage opens; NOT: plugin lifecycle or storage implementation.
 * @invariants A persisted snapshot is NEVER rebuilt from live configuration — an EMPTY one included, so a session that started without a profile stays unprofiled (SPEC §2 decision 9); sealed text is FINAL (interpolation resolved at seal time, inserted with interpolate:false); the per-session decision is made once per process and survives storage outages; only built-ins actually present in the assembly anchor insertion; planInsertion returns BASE indices — consumers apply them by splicing from LAST to FIRST (see FUNC_planInsertion).
 * #endregion moduleContract
 */
/**
 * @purpose Select a live profile by workspace override then default, rejecting
 *   stale ids without changing settings. Reads an ORDERED list of workspace
 *   candidates (`workspaceKeys`): the FIRST candidate PRESENT in
 *   `lastByWorkspace` decides — an explicit "" (none) beats the default, a
 *   valid id wins, and a present-but-stale id falls back to the default with
 *   `reset: true`. Only when NO candidate is present does `default` apply, so a
 *   choice stored under the UUID key and one stored under the cwd key for the
 *   same workspace are both reachable (backward compatibility).
 * @param {object} options
 * @param {Record<string,string>} [options.lastByWorkspace]
 * @param {string[]} [options.workspaceKeys] - ordered candidates.
 * @param {string} [options.workspaceKey] - single-key back-compat form.
 * @param {string} [options.defaultId]
 * @param {string[]} [options.profileIds]
 */
export declare function resolveProfileId({ lastByWorkspace, workspaceKey, workspaceKeys, defaultId, profileIds }: {
    lastByWorkspace?: {} | undefined;
    workspaceKey: any;
    workspaceKeys: any;
    defaultId: any;
    profileIds: any;
}): {
    profileId: any;
    reset: boolean;
};
/**
 * The ORDERED key candidates under which a workspace's profile choice is
 * stored by POST /last and read at assemble time — both sides MUST agree or
 * the chip choice never reaches the prompt. The first candidate is where NEW
 * choices are written; reading walks the whole list (see resolveProfileId), so
 * a choice stored under a UUID key and one stored under the cwd key for the
 * same workspace are both honoured (legacy path-keyed choices keep working).
 *
 * RESOLUTION ORDER (duplicates removed, first hit wins):
 *  1. the workspace registry's own membership for THIS session
 *     (`list()` + `workspace.sessionIds`), exactly the id the client's chip
 *     uses — independent of cwd;
 *  2. the canonical workspace id owning `cwd` via `resolveByPath` — an ASYNC
 *     method, whose missing `await` was the live bug that keyed every choice
 *     under the raw cwd while the client wrote a workspace id;
 *  3. the raw `cwd` (documented fallback key, also what a cwd-less/unknown
 *     path degrades to in the assembler);
 *  4. an explicit `workspaceId`.
 * Nothing derivable degrades to the historical degenerate key [""], so a
 * surface without a workspace keeps storing and reading consistently.
 *
 * @purpose Make POST /last and the assembler derive the SAME ordered keys, so
 *   an explicit chip choice reaches `resolveProfileId` and the prompt across
 *   both key shapes.
 * @param {object} options
 * @param {object} [options.workspaceRegistry] - ctx.workspaceRegistry (optional).
 * @param {{ id?: string }|null} [options.session] - the assembling session.
 * @param {string} [options.workspaceId] - client-supplied workspace id.
 * @param {string} [options.cwd] - session/client-supplied working directory.
 * @returns {Promise<string[]>} ordered, duplicate-free candidates (never empty).
 */
export declare function resolveWorkspaceKeys({ workspaceRegistry, session, workspaceId, cwd }?: {}): Promise<any[]>;
/** @purpose Classify a delegated child from its durable session header, tolerating absent agent data. */
export declare function isSubagent(agent: any): boolean;
/** @purpose Identify a seeded delegated child rather than an unrelated seeded root session. */
export declare function isFork(agent: any): boolean;
export declare function interpolateSealedText(sectionId: any, text: any, variables: any): string;
/**
 * THE shared selection rule: why a profile reference contributes NOTHING to an
 * assembly, or null when it does contribute. Both the runtime sealer
 * (buildSnapshot) and the host's GET /preview call this, so the Preview tab
 * can never disagree with what actually reaches the prompt (gap-audit A2).
 *
 * Scope is evaluated first (a scope-filtered reference is skipped even when
 * its section is missing/disabled — the reason the runtime would give), then
 * existence, disabled state, and empty body. Interpolation is NOT part of this
 * predicate: the runtime resolves it against live variables and skips on
 * failure, while preview interpolates leniently.
 *
 * @param {{ id?: string, scope?: string }} ref - the profile reference.
 * @param {{ disabled?: boolean, body?: string } | undefined} section - the
 *   resolved section (undefined when the id is not registered).
 * @param {{ subagent?: boolean, fork?: boolean }} [context] - assembly kind.
 * @returns {string | null} a short human reason, or null when the reference
 *   is emitted.
 */
export declare function sectionSkipReason(ref: any, section: any, { subagent, fork }?: {
    subagent?: boolean | undefined;
    fork?: boolean | undefined;
}): string | null;
/**
 * @purpose Freeze the chosen section's FINAL text (interpolation resolved and
 *   validated at seal time) and order at the first assembly, filtering scopes
 *   and absent/empty/uninterpolatable sections. A section whose body cannot
 *   be interpolated against this assembly's variables is SKIPPED with a
 *   warning instead of persisting text the engine would throw on forever
 *   (astra finding D).
 * @param {object} options
 * @param {(skip: { id: string, reason: string }) => void} [options.onSkip]
 *   diagnostics hook: called for EVERY skipped reference with a short reason
 *   (scope filtered, not found, disabled, empty body, interpolation failed).
 *   Never allowed to break sealing — a throwing sink is swallowed here.
 */
export declare function buildSnapshot({ profile, sectionsById, isSubagent: subagent, isFork: fork, variables, warn, onSkip }: {
    profile: any;
    sectionsById: any;
    isSubagent?: boolean | undefined;
    isFork?: boolean | undefined;
    variables?: {} | undefined;
    warn?: (() => void) | undefined;
    onSkip?: (() => void) | undefined;
}): {
    profileId: any;
    sections: {
        id: any;
        title: any;
        order: any;
        text: string;
    }[];
};
/**
 * @purpose Place sealed sections against known built-ins actually present,
 *   preserving profile order on equal orders.
 * @invariants The profile's order is used EXACTLY as stated — an order equal
 *   to a built-in (or to a peer) is never shifted or normalized; it just
 *   anchors before the equal built-in. Unknown/foreign entries never anchor;
 *   without an earlier known built-in, insertion starts at index zero.
 * @returns Array of rows in insertion (ascending) order; each `index` is a BASE index into the ORIGINAL
 *   assembly array — no positional offsets are baked in. Apply by splicing from LAST to FIRST: descending
 *   application keeps earlier indices valid and equal indices preserve ascending order. Splicing ascending
 *   without adding the row's position would interleave wrongly — the offset responsibility stays with the
 *   consumer by contract.
 */
export declare function planInsertion({ snapshot, assemblySections, builtinOrdersByName }: {
    snapshot: any;
    assemblySections: any;
    builtinOrdersByName: any;
}): any;
/**
 * @purpose Decide a session's snapshot EXACTLY ONCE and keep it stable
 *   (astra finding G, SPEC §2 decision 9): an already-persisted record — EMPTY
 *   INCLUDED — is the session's final decision, so a session that started
 *   without a profile never receives one mid-session. A fresh decision is
 *   memoized and written durable-first (an explicit empty record for "no
 *   profile"), and storage failures degrade to the in-memory decision.
 *
 * STRICT SEALING: an empty snapshot is a decision, not "nothing decided".
 * Consequence: sessions created during the earlier broken-workspace-key window
 * already hold an empty record and stay empty forever — they need a NEW
 * session (documented in SPEC limitations).
 * @param {object} options
 * @param {string} options.sessionId
 * @param {() => object} options.createSnapshot - builds from live config; runs at most once per memo entry.
 * @param {Map<string, { snapshot: object, persisted: boolean }>} options.memo - caller-owned, lives with the plugin.
 * @param {() => Promise<object>} options.openTable - resolves the domain table; may reject while storage is down.
 * @param {(message: string, details?: unknown) => void} [options.warn]
 * @returns {Promise<object>} the sealed snapshot (persisted when possible).
 */
export declare function sealSnapshot({ sessionId, createSnapshot, memo, openTable, warn }: {
    sessionId: any;
    createSnapshot: any;
    memo: any;
    openTable: any;
    warn?: (() => void) | undefined;
}): Promise<any>;
/**
 * @purpose Cache a pending asynchronous open (storage domain) but DROP the
 *   cache on rejection, so a transient failure disables nothing permanently —
 *   the next call starts a fresh attempt (verify-step2b-glm defect 1).
 * @invariants a fulfilled promise stays cached forever; a rejected one is
 *   removed synchronously before the rejection propagates.
 * @param {() => Promise<any>} create - starts the cached operation.
 * @returns {(() => Promise<any>) & { cached: () => Promise<any> | null }} the
 *   getter, plus `cached()` to peek WITHOUT starting (used by disposers).
 */
export declare function retryingCache(create: any): {
    (): any;
    cached(): any;
};
