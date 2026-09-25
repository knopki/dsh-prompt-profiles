/**
 * Built-in section orders: the runtime mirror of the installed
 * dsh-system-prompt table plus the frozen fallback copy.
 * #region moduleContract
 * @modulecontract
 * @purpose Keep the prompt-profiles registry honest about the built-in section
 *   orderings actually installed in this DSH — and keep the UI and insertion
 *   anchoring working when the runtime parse fails — so order collisions are
 *   detected against reality rather than a stale copy.
 * @scope
 *  - Pure parsing of the `SECTION_ORDERS` object literal from the text of an
 *    installed `@deepseek-ai/dsh-system-prompt/lib/index.js` (no `eval`), a
 *    best-effort file location (`createRequire` chain), warn-and-fallback
 *    loading, the hardcoded fallback table, and the verified
 *    SECTION_ORDERS-key -> assembled-section-name mapping.
 *  - NOT: consuming the mirror (infra/loader-registry.ts), serving it
 *    (host/index.ts).
 * @invariants
 *  - `BUILTIN_ORDERS` is deeply frozen; nothing may mutate the fallback table.
 *  - `parseBuiltinOrders` never executes source text; it only regex-scans it,
 *    and it requires EVERY non-empty line of the literal to be a plain
 *    `KEY: number` pair — a changed upstream grammar fails the whole parse
 *    (M5) instead of yielding a silently partial table.
 *  - `loadBuiltinOrders` never throws: every failure path warns and returns
 *    the frozen fallback copy (SPEC §7 "mirror не распарсился"), and a parsed
 *    table's keys with no assembled-name mapping are reported with a warning.
 *  - Every key is either mapped by SECTION_KEY_NAMES or listed in
 *    KNOWN_UNMAPPED; unmappedBuiltinKeys reports anything else, so a DSH
 *    upgrade cannot silently lose an insertion anchor.
 * @dependencies READS: the installed @deepseek-ai/dsh-system-prompt (best
 *   effort) via node:module.createRequire — CJS resolution honors NODE_PATH,
 *   which the mise-launched DSH process sets (verified in this session).
 * @keywords SECTION_ORDERS, mirror, builtin orders, fallback, prompt profiles
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

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
export const BUILTIN_ORDERS: Readonly<Record<string, number>> = Object.freeze(SECTION_ORDERS);

// #region CONST_SECTION_KEY_NAMES
/**
 * SECTION_ORDERS key -> assembled section name, for the keys whose dotted
 * name was verified against the installed 0.1.7-rc.1 packages (2026-09-24;
 * see .spike/step2a-registry.md). Assembled sections carry names like
 * `tool:bash` while SECTION_ORDERS keys are `TOOL_BASH`; the mapping is
 * per-call-site convention, not a rule, so only verified entries are listed.
 * Unmapped keys simply provide no anchor for insertionIndex.
 */
const SECTION_KEY_NAMES: Readonly<Record<string, string | undefined>> = Object.freeze({
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
const KNOWN_UNMAPPED: readonly string[] = Object.freeze([
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
 */
export function unmappedBuiltinKeys(orders: Record<string, number> = BUILTIN_ORDERS): string[] {
  return Object.keys(orders).filter((key) => SECTION_KEY_NAMES[key] === undefined && !KNOWN_UNMAPPED.includes(key));
}
// #endregion FUNC_unmappedBuiltinKeys

// #region FUNC_builtinOrdersByName
/**
 * Re-key an order table (SECTION_ORDERS-style, UPPER_SNAKE keys) by assembled
 * section name using SECTION_KEY_NAMES.
 *
 * @purpose Produce the name->order view that insertionIndex and the editor
 *   outline consume, since assembly.sections entries are identified by name
 *   and carry no `order` field (spike R1 caveat).
 */
export function builtinOrdersByName(orders: Record<string, number> = BUILTIN_ORDERS): Record<string, number> {
  const byName: Record<string, number> = {};
  for (const [key, order] of Object.entries(orders)) {
    const name = SECTION_KEY_NAMES[key];
    if (name !== undefined) byName[name] = order;
  }
  return Object.freeze(byName);
}
// #endregion FUNC_builtinOrdersByName

// #region FUNC_parseBuiltinOrders
/**
 * Extract the module-local `SECTION_ORDERS` object from the text of an
 * installed `@deepseek-ai/dsh-system-prompt/lib/index.js`.
 *
 * @purpose Turn untrusted source text into a plain name->number table without
 *   executing any of it, so the mirror can follow DSH upgrades safely.
 * @throws descriptive error when the table is missing, unreadable as an object
 *   literal, contains no valid entries, or contains ANY line that is not a
 *   plain `KEY: <number>` pair (M5: a changed upstream grammar must fail loudly
 *   and fall back rather than yield a silently PARTIAL table).
 */
export function parseBuiltinOrders(sourceText: string): Record<string, number> {
  const text = String(sourceText ?? "");
  const start = text.indexOf("const SECTION_ORDERS = {");
  if (start < 0) {
    throw new Error("mirror: `const SECTION_ORDERS = {` not found in dsh-system-prompt source");
  }
  const open = text.indexOf("{", start);
  const close = text.indexOf("};", open);
  if (open < 0 || close < 0 || close < open) {
    throw new Error("mirror: SECTION_ORDERS literal is malformed (unbalanced braces)");
  }
  const body = text.slice(open + 1, close);
  // Strict grammar: every non-empty line must be exactly one `KEY: number,`
  // pair. Comments, spreads, computed keys, string values or two pairs on one
  // line all throw — a partial parse would silently drop anchors.
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) {
    throw new Error("mirror: SECTION_ORDERS literal contains no recognizable entries");
  }
  const entry = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?),?$/;
  const orders: Record<string, number> = {};
  for (const [index, line] of lines.entries()) {
    const match = entry.exec(line);
    if (!match) {
      throw new Error(
        `mirror: SECTION_ORDERS line ${index + 1} is not a plain key: number pair — ${JSON.stringify(line)}`,
      );
    }
    const value = Number(match[2]);
    if (!Number.isFinite(value)) {
      throw new Error(`mirror: SECTION_ORDERS entry ${match[1]} has non-finite value ${match[2]}`);
    }
    if (match[1] in orders) {
      throw new Error(`mirror: SECTION_ORDERS key ${match[1]} appears twice`);
    }
    orders[match[1]] = value;
  }
  return orders;
}
// #endregion FUNC_parseBuiltinOrders

// #region FUNC_sameOrders
/** Structural comparison of two order tables (keys and values). Internal: the divergence warning's only caller. */
function sameOrders(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => key in b && a[key] === b[key]);
}
// #endregion FUNC_sameOrders

// #region TYPE_mirrorOptions
/** Test seams of the mirror loader; production code passes neither. */
export interface BuiltinOrdersSeams {
  resolveFile?(options: { resolveFrom?: string }): string | null;
  readFile?(path: string): string;
}

/** The mirror result: the order table, where it came from, and the file parsed. */
export interface BuiltinOrdersMirror {
  orders: Record<string, number>;
  origin: "runtime" | "fallback";
  file: string | null;
}

export interface LoadBuiltinOrdersOptions {
  resolveFrom?: string;
  warn?: (message: string, details?: unknown) => void;
  deps?: BuiltinOrdersSeams;
}
// #endregion TYPE_mirrorOptions

// #region FUNC_resolveSystemPromptFile
/**
 * Locate the installed `@deepseek-ai/dsh-system-prompt/lib/index.js`. Tries
 * createRequire rooted at `resolveFrom` first, then at this module. Internal:
 * loadBuiltinOrders' default resolver; the `resolve` seam is for tests.
 * @returns absolute path to lib/index.js, or null when not found.
 */
function resolveSystemPromptFile({
  resolveFrom,
  resolve,
}: {
  resolveFrom?: string;
  resolve?: (base: string, specifier: string) => string;
} = {}): string | null {
  const resolveWith = resolve ?? ((base: string, specifier: string) => createRequire(base).resolve(specifier));
  const bases: string[] = [];
  if (resolveFrom) bases.push(resolveFrom.endsWith("/") ? resolveFrom : `${resolveFrom}/`);
  bases.push(import.meta.url);
  const specifiers = ["@deepseek-ai/dsh-system-prompt/lib/index.js", "@deepseek-ai/dsh-system-prompt"];
  for (const base of bases) {
    for (const specifier of specifiers) {
      try {
        const resolved = resolveWith(base, specifier);
        if (typeof resolved === "string" && resolved.endsWith("lib/index.js")) return resolved;
        if (typeof resolved === "string") return `${resolved.replace(/\/$/, "")}/lib/index.js`;
      } catch {
        // try the next base/specifier; every failure ends in the frozen-copy fallback.
      }
    }
  }
  return null;
}
// #endregion FUNC_resolveSystemPromptFile

// #region FUNC_loadBuiltinOrders
/**
 * Load the built-in orders mirror with warn-and-fallback semantics.
 *
 * Resolution order: installed package text (parsed, no eval) -> frozen copy
 * from this module. A divergence between the parsed table and the frozen copy
 * also warns but KEEPS the runtime table (it reflects the actually-installed
 * DSH; the copy exists only as a fallback — SPEC §5.2).
 *
 * @purpose Give the service a best-effort, never-throwing view of the real
 *   built-in section orders.
 */
export function loadBuiltinOrders({
  resolveFrom,
  warn = console.warn,
  deps = {},
}: LoadBuiltinOrdersOptions = {}): BuiltinOrdersMirror {
  const resolveFile = deps.resolveFile ?? resolveSystemPromptFile;
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  try {
    const file = resolveFile({ resolveFrom });
    if (!file) {
      warn("prompt-profiles mirror: dsh-system-prompt not found; using frozen copy", {
        resolveFrom: resolveFrom ?? null,
      });
      return { orders: BUILTIN_ORDERS, origin: "fallback", file: null };
    }
    const orders = parseBuiltinOrders(readFile(file));
    if (!sameOrders(orders, BUILTIN_ORDERS)) {
      warn("prompt-profiles mirror: parsed SECTION_ORDERS differs from the frozen copy; using the parsed table", {
        file,
        runtimeKeys: Object.keys(orders).length,
        frozenKeys: Object.keys(BUILTIN_ORDERS).length,
      });
    }
    // M5: a built-in with no assembled-name mapping gets no insertion anchor —
    // say so explicitly instead of losing it silently on a DSH upgrade.
    const unmapped = unmappedBuiltinKeys(orders);
    if (unmapped.length > 0) {
      warn(
        "prompt-profiles mirror: built-in section keys have no assembled-name mapping; they provide no insertion anchor",
        { file, unmapped },
      );
    }
    return { orders: Object.freeze(orders), origin: "runtime", file };
  } catch (error) {
    warn("prompt-profiles mirror: parsing failed; using frozen copy", {
      error: (error as Error)?.message ?? String(error),
    });
    return { orders: BUILTIN_ORDERS, origin: "fallback", file: null };
  }
}
// #endregion FUNC_loadBuiltinOrders
