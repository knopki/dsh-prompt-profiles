import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/infra/builtin-orders.ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
var SECTION_ORDERS = {
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
  DEPLOYMENT_PERSONA_SUFFIX: 10200
};
var BUILTIN_ORDERS = Object.freeze(SECTION_ORDERS);
var SECTION_KEY_NAMES = Object.freeze({
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
  WEB_SURFACE: "app:web-surface"
});
var KNOWN_UNMAPPED = Object.freeze([
  "TOOL_PTY",
  "TOOL_LSP",
  "TOOL_SESSION_QUERY",
  "TOOL_WORKFLOW",
  "TOOL_SUBAGENT",
  "TOOL_REPORT",
  "TOOL_COMPUTER_USE",
  "STRUCTURED_OUTPUT",
  "HARNESS_SOURCE"
]);
function unmappedBuiltinKeys(orders = BUILTIN_ORDERS) {
  return Object.keys(orders).filter((key) => SECTION_KEY_NAMES[key] === void 0 && !KNOWN_UNMAPPED.includes(key));
}
function builtinOrdersByName(orders = BUILTIN_ORDERS) {
  const byName = {};
  for (const [key, order] of Object.entries(orders)) {
    const name = SECTION_KEY_NAMES[key];
    if (name !== void 0) byName[name] = order;
  }
  return Object.freeze(byName);
}
function parseBuiltinOrders(sourceText) {
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
  const lines = body.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  if (lines.length === 0) {
    throw new Error("mirror: SECTION_ORDERS literal contains no recognizable entries");
  }
  const entry = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?),?$/;
  const orders = {};
  for (const [index, line] of lines.entries()) {
    const match = entry.exec(line);
    if (!match) {
      throw new Error(
        `mirror: SECTION_ORDERS line ${index + 1} is not a plain key: number pair \u2014 ${JSON.stringify(line)}`
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
function sameOrders(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => key in b && a[key] === b[key]);
}
function resolveSystemPromptFile({
  resolveFrom,
  resolve
} = {}) {
  const resolveWith = resolve ?? ((base, specifier) => createRequire(base).resolve(specifier));
  const bases = [];
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
      }
    }
  }
  return null;
}
function loadBuiltinOrders({
  resolveFrom,
  warn = console.warn,
  deps = {}
} = {}) {
  const resolveFile = deps.resolveFile ?? resolveSystemPromptFile;
  const readFile = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
  try {
    const file = resolveFile({ resolveFrom });
    if (!file) {
      warn("prompt-profiles mirror: dsh-system-prompt not found; using frozen copy", {
        resolveFrom: resolveFrom ?? null
      });
      return { orders: BUILTIN_ORDERS, origin: "fallback", file: null };
    }
    const orders = parseBuiltinOrders(readFile(file));
    if (!sameOrders(orders, BUILTIN_ORDERS)) {
      warn("prompt-profiles mirror: parsed SECTION_ORDERS differs from the frozen copy; using the parsed table", {
        file,
        runtimeKeys: Object.keys(orders).length,
        frozenKeys: Object.keys(BUILTIN_ORDERS).length
      });
    }
    const unmapped = unmappedBuiltinKeys(orders);
    if (unmapped.length > 0) {
      warn(
        "prompt-profiles mirror: built-in section keys have no assembled-name mapping; they provide no insertion anchor",
        { file, unmapped }
      );
    }
    return { orders: Object.freeze(orders), origin: "runtime", file };
  } catch (error) {
    warn("prompt-profiles mirror: parsing failed; using frozen copy", {
      error: error?.message ?? String(error)
    });
    return { orders: BUILTIN_ORDERS, origin: "fallback", file: null };
  }
}

export {
  BUILTIN_ORDERS,
  unmappedBuiltinKeys,
  builtinOrdersByName,
  parseBuiltinOrders,
  loadBuiltinOrders
};
//# sourceMappingURL=chunk-F6D7DTTJ.js.map
