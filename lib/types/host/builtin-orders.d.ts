/**
 * Fallback copy of DSH built-in system-prompt section orders.
 * #region moduleContract
 * @modulecontract
 * @purpose Keep a deterministic baseline of built-in section ordering so the
 *   prompt-profiles UI and insertion anchoring keep working even when the
 *   runtime parse of the installed @deepseek-ai/dsh-system-prompt fails.
 * @scope
 *  - Hardcoded mirror of the SECTION_ORDERS table (name -> order), plus the
 *    verified SECTION_ORDERS-key -> assembled-section-name mapping used to
 *    build the name-keyed view (FUNC_builtinOrdersByName) and the pinned
 *    known-unmapped key set (FUNC_unmappedBuiltinKeys).
 *  - NOT: parsing the live package (that lives in lib/mirror.js).
 * @invariants
 *  - BUILTIN_ORDERS is deeply frozen; nothing may mutate the fallback table.
 *  - Every key is either mapped by SECTION_KEY_NAMES or listed in
 *    KNOWN_UNMAPPED; unmappedBuiltinKeys reports anything else, so a DSH
 *    upgrade cannot silently lose an insertion anchor.
 * @dependencies READS: nothing at runtime — pure static data copied from
 *   @deepseek-ai/dsh-system-prompt@0.1.7-rc.1 lib/index.js lines 10-43.
 * @rationale
 *  - Q: Why a verbatim copy instead of importing the live table?
 *    A: The installed package's internal const is not exported; SPEC §5.2 fixes
 *    the design as "parse at startup, fall back to a hardcoded copy".
 * @keywords SECTION_ORDERS, mirror, builtin orders, fallback, prompt profiles
 * #endregion moduleContract
 **/
/**
 * Frozen fallback mirror of built-in section orders (name -> order).
 * Verbatim from @deepseek-ai/dsh-system-prompt@0.1.7-rc.1.
 */
export declare const BUILTIN_ORDERS: Readonly<{
    HARNESS_IDENTITY: number;
    DEPLOYMENT_PERSONA_PREFIX: number;
    PLAN_POLICY: number;
    TEAM_POLICY: number;
    PTC_ONLY: number;
    FILE_REFERENCE: number;
    TOOL_BASH: number;
    TOOL_PWSH: number;
    TOOL_READ: number;
    TOOL_WRITE: number;
    TOOL_EDIT: number;
    TOOL_GLOB: number;
    TOOL_GREP: number;
    TOOL_JOBS: number;
    TOOL_PTY: number;
    TOOL_WEB_SEARCH: number;
    TOOL_WEB_FETCH: number;
    TOOL_LSP: number;
    TOOL_SESSION_QUERY: number;
    TOOL_GOAL: number;
    TOOL_WORKFLOW: number;
    TOOL_RALPH: number;
    TOOL_SUBAGENT: number;
    TOOL_REPORT: number;
    TOOL_COMPUTER_USE: number;
    MCP_SERVERS: number;
    TOOLS_SDK: number;
    DELIVERABLE_FILE_REFERENCES: number;
    STRUCTURED_OUTPUT: number;
    HARNESS_SOURCE: number;
    WEB_SURFACE: number;
    DEPLOYMENT_PERSONA_SUFFIX: number;
}>;
/**
 * Order-table keys with no assembled-name mapping AND not in the pinned
 * known-unmapped set — i.e. built-ins this bundle has never seen. Empty for
 * the frozen copy; non-empty means an upgrade added/renamed a built-in.
 * @param {Record<string, number>} [orders] - key→order table.
 * @returns {string[]} unwelcome keys, in table order.
 */
export declare function unmappedBuiltinKeys(orders?: Readonly<{
    HARNESS_IDENTITY: number;
    DEPLOYMENT_PERSONA_PREFIX: number;
    PLAN_POLICY: number;
    TEAM_POLICY: number;
    PTC_ONLY: number;
    FILE_REFERENCE: number;
    TOOL_BASH: number;
    TOOL_PWSH: number;
    TOOL_READ: number;
    TOOL_WRITE: number;
    TOOL_EDIT: number;
    TOOL_GLOB: number;
    TOOL_GREP: number;
    TOOL_JOBS: number;
    TOOL_PTY: number;
    TOOL_WEB_SEARCH: number;
    TOOL_WEB_FETCH: number;
    TOOL_LSP: number;
    TOOL_SESSION_QUERY: number;
    TOOL_GOAL: number;
    TOOL_WORKFLOW: number;
    TOOL_RALPH: number;
    TOOL_SUBAGENT: number;
    TOOL_REPORT: number;
    TOOL_COMPUTER_USE: number;
    MCP_SERVERS: number;
    TOOLS_SDK: number;
    DELIVERABLE_FILE_REFERENCES: number;
    STRUCTURED_OUTPUT: number;
    HARNESS_SOURCE: number;
    WEB_SURFACE: number;
    DEPLOYMENT_PERSONA_SUFFIX: number;
}>): string[];
/**
 * Re-key an order table (SECTION_ORDERS-style, UPPER_SNAKE keys) by assembled
 * section name using SECTION_KEY_NAMES.
 *
 * @purpose Produce the name→order view that insertionIndex and the editor
 *   outline consume, since assembly.sections entries are identified by name
 *   and carry no `order` field (spike R1 caveat).
 * @param {Record<string, number>} [orders] - key→order table; defaults to the
 *   frozen BUILTIN_ORDERS copy.
 * @returns {Record<string, number>} frozen name→order table (mapped keys only).
 */
export declare function builtinOrdersByName(orders?: Readonly<{
    HARNESS_IDENTITY: number;
    DEPLOYMENT_PERSONA_PREFIX: number;
    PLAN_POLICY: number;
    TEAM_POLICY: number;
    PTC_ONLY: number;
    FILE_REFERENCE: number;
    TOOL_BASH: number;
    TOOL_PWSH: number;
    TOOL_READ: number;
    TOOL_WRITE: number;
    TOOL_EDIT: number;
    TOOL_GLOB: number;
    TOOL_GREP: number;
    TOOL_JOBS: number;
    TOOL_PTY: number;
    TOOL_WEB_SEARCH: number;
    TOOL_WEB_FETCH: number;
    TOOL_LSP: number;
    TOOL_SESSION_QUERY: number;
    TOOL_GOAL: number;
    TOOL_WORKFLOW: number;
    TOOL_RALPH: number;
    TOOL_SUBAGENT: number;
    TOOL_REPORT: number;
    TOOL_COMPUTER_USE: number;
    MCP_SERVERS: number;
    TOOLS_SDK: number;
    DELIVERABLE_FILE_REFERENCES: number;
    STRUCTURED_OUTPUT: number;
    HARNESS_SOURCE: number;
    WEB_SURFACE: number;
    DEPLOYMENT_PERSONA_SUFFIX: number;
}>): Readonly<{}>;
