// @ts-nocheck
// TODO(phase 1): remove after typing
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

// #region CONST_SECTION_ORDERS Verbatim copy from @deepseek-ai/dsh-system-prompt@0.1.7-rc.1 lib/index.js (lines 10-43).
// Fallback only: the runtime parse of the installed package wins; this copy is used when parsing fails (SPEC §5.2).
const SECTION_ORDERS = {
  HARNESS_IDENTITY: -1e3,
  DEPLOYMENT_PERSONA_PREFIX: 0,
  PLAN_POLICY: 500,
  TEAM_POLICY: 600,
  PTC_ONLY: 800,
  FILE_REFERENCE: 900,
  TOOL_BASH: 1e3,
  TOOL_PWSH: 1010,
  TOOL_READ: 1100,
  TOOL_WRITE: 1200,
  TOOL_EDIT: 1300,
  TOOL_GLOB: 1400,
  TOOL_GREP: 1500,
  TOOL_JOBS: 1600,
  TOOL_PTY: 1700,
  TOOL_WEB_SEARCH: 2e3,
  TOOL_WEB_FETCH: 2100,
  TOOL_LSP: 2200,
  TOOL_SESSION_QUERY: 2300,
  TOOL_GOAL: 2400,
  TOOL_WORKFLOW: 2600,
  TOOL_RALPH: 2700,
  TOOL_SUBAGENT: 2800,
  TOOL_REPORT: 2900,
  TOOL_COMPUTER_USE: 3e3,
  MCP_SERVERS: 3100,
  TOOLS_SDK: 5e3,
  DELIVERABLE_FILE_REFERENCES: 9e3,
  STRUCTURED_OUTPUT: 9900,
  HARNESS_SOURCE: 1e4,
  WEB_SURFACE: 10100,
  DEPLOYMENT_PERSONA_SUFFIX: 10200,
};
// #endregion CONST_SECTION_ORDERS

/**
 * Frozen fallback mirror of built-in section orders (name -> order).
 * Verbatim from @deepseek-ai/dsh-system-prompt@0.1.7-rc.1.
 */
export const BUILTIN_ORDERS = Object.freeze(SECTION_ORDERS);

// #region CONST_SECTION_KEY_NAMES
/**
 * SECTION_ORDERS key -> assembled section name, for the keys whose dotted
 * name was verified against the installed 0.1.7-rc.1 packages (2026-09-24;
 * see .spike/step2a-registry.md). Assembled sections carry names like
 * `tool:bash` while SECTION_ORDERS keys are `TOOL_BASH`; the mapping is
 * per-call-site convention, not a rule, so only verified entries are listed.
 * Unmapped keys simply provide no anchor for insertionIndex.
 */
const SECTION_KEY_NAMES = Object.freeze({
  HARNESS_IDENTITY: "harness:identity",
  DEPLOYMENT_PERSONA_PREFIX: "deployment:persona-prefix",
  DEPLOYMENT_PERSONA_SUFFIX: "deployment:persona-suffix",
  PLAN_POLICY: "plan:policy",
  TEAM_POLICY: "team:policy",
  PTC_ONLY: "tools:ptc-only",
  FILE_REFERENCE: "context:file-reference",
  TOOL_BASH: "tool:bash",
  TOOL_PWSH: "tool:pwsh",
  TOOL_READ: "tool:read",
  TOOL_WRITE: "tool:write",
  TOOL_EDIT: "tool:edit",
  TOOL_GLOB: "tool:glob",
  TOOL_GREP: "tool:grep",
  TOOL_JOBS: "tool:jobs",
  TOOL_WEB_SEARCH: "tool:web_search",
  TOOL_WEB_FETCH: "tool:web_fetch",
  TOOL_GOAL: "tool:goal",
  TOOL_RALPH: "tool:ralph",
  MCP_SERVERS: "mcp-resource-servers",
  TOOLS_SDK: "tools:sdk",
  DELIVERABLE_FILE_REFERENCES: "ui:deliverable-file-references",
  WEB_SURFACE: "app:web-surface",
});
// #endregion CONST_SECTION_KEY_NAMES

// #region CONST_KNOWN_UNMAPPED
/**
 * SECTION_ORDERS keys that intentionally have NO assembled-name mapping: their
 * dotted names were never verified against installed DSH output, so they
 * provide no insertion anchor. Pinned here and in the freeze test so a DSH
 * upgrade that adds/renames a built-in is REPORTED (unmappedBuiltinKeys)
 * instead of silently losing an anchor.
 */
const KNOWN_UNMAPPED = Object.freeze([
  "TOOL_PTY",
  "TOOL_LSP",
  "TOOL_SESSION_QUERY",
  "TOOL_WORKFLOW",
  "TOOL_SUBAGENT",
  "TOOL_REPORT",
  "TOOL_COMPUTER_USE",
  "STRUCTURED_OUTPUT",
  "HARNESS_SOURCE",
]);
// #endregion CONST_KNOWN_UNMAPPED

// #region FUNC_unmappedBuiltinKeys
/**
 * Order-table keys with no assembled-name mapping AND not in the pinned
 * known-unmapped set — i.e. built-ins this bundle has never seen. Empty for
 * the frozen copy; non-empty means an upgrade added/renamed a built-in.
 * @param {Record<string, number>} [orders] - key→order table.
 * @returns {string[]} unwelcome keys, in table order.
 */
export function unmappedBuiltinKeys(orders = BUILTIN_ORDERS) {
  return Object.keys(orders).filter((key) => SECTION_KEY_NAMES[key] === undefined && !KNOWN_UNMAPPED.includes(key));
}
// #endregion FUNC_unmappedBuiltinKeys

// #region FUNC_builtinOrdersByName
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
export function builtinOrdersByName(orders = BUILTIN_ORDERS) {
  const byName = {};
  for (const [key, order] of Object.entries(orders)) {
    const name = SECTION_KEY_NAMES[key];
    if (name !== undefined) byName[name] = order;
  }
  return Object.freeze(byName);
}
// #endregion FUNC_builtinOrdersByName
