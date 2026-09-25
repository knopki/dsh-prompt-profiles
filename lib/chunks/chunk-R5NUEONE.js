import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/builtin-orders.ts
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

export {
  BUILTIN_ORDERS,
  unmappedBuiltinKeys,
  builtinOrdersByName
};
//# sourceMappingURL=chunk-R5NUEONE.js.map
