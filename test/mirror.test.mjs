/**
 * Mirror tests — parse, resolve, fallback.
 * #region moduleContract
 * @modulecontract
 * @purpose Verify the SECTION_ORDERS mirror: pure parse without eval,
 *   descriptive failures on garbage, warn-and-fallback loading, and the
 *   name-keyed view used for assembly anchoring.
 * @scope The mirror parse plus the name-keyed view for assembly anchoring.
 *   The real-file test skips gracefully when the system-prompt package is
 *   unresolvable.
 * @rationale
 *  - Q: Why inject deps (resolveFile/readFile) instead of real fs in the
 *    fallback tests?
 *    A: The failure paths need deterministic garbage input; the real-file
 *    path is covered separately and skips when the package is absent.
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  BUILTIN_ORDERS,
  builtinOrdersByName,
  loadBuiltinOrders,
  parseBuiltinOrders,
  unmappedBuiltinKeys,
} from "../lib/infra/builtin-orders.js";

const SAMPLE = `
import { Service } from "@deepseek-ai/cordis";
const CONTEXT_ORDERS = { SANDBOX_POLICY: 110 };
const SECTION_ORDERS = {
	HARNESS_IDENTITY: -1e3,
	DEPLOYMENT_PERSONA_PREFIX: 0,
	PLAN_POLICY: 500,
	TOOL_BASH: 1e3,
	DEPLOYMENT_PERSONA_SUFFIX: 10200
};
const AFTER = 1;
`;

test("parseBuiltinOrders extracts the table without eval", () => {
  const orders = parseBuiltinOrders(SAMPLE);
  assert.deepEqual(orders, {
    HARNESS_IDENTITY: -1000,
    DEPLOYMENT_PERSONA_PREFIX: 0,
    PLAN_POLICY: 500,
    TOOL_BASH: 1000,
    DEPLOYMENT_PERSONA_SUFFIX: 10200,
  });
});

test("parseBuiltinOrders throws descriptively on garbage input", () => {
  assert.throws(() => parseBuiltinOrders(""), /SECTION_ORDERS/);
  assert.throws(() => parseBuiltinOrders("const SECTION_ORDERS = 42;"), /not found/);
  assert.throws(() => parseBuiltinOrders("const SECTION_ORDERS = {};"), /no recognizable entries/);
  assert.throws(() => parseBuiltinOrders("const SECTION_ORDERS = { /* empty */ };"), /not a plain key: number pair/);
});

test("parseBuiltinOrders refuses a PARTIALLY parseable table", () => {
  // One changed upstream line must fail the whole parse, not silently drop it.
  assert.throws(
    () =>
      parseBuiltinOrders(
        "const SECTION_ORDERS = {\n\tTOOL_BASH: 1e3,\n\tTOOL_READ: 1100,\n\tTOOL_NEW: compute(1),\n};",
      ),
    /line 3 is not a plain key: number pair/,
  );
  // Two pairs on one line is a grammar change too.
  assert.throws(
    () => parseBuiltinOrders("const SECTION_ORDERS = {\n\tA: 1, B: 2,\n};"),
    /line 1 is not a plain key: number pair/,
  );
});

test("loadBuiltinOrders parses the real installed dsh-system-prompt", {
  skip: (() => {
    try {
      createRequire(import.meta.url).resolve("@deepseek-ai/dsh-system-prompt");
      return false;
    } catch {
      return "dsh-system-prompt not resolvable from here";
    }
  })(),
}, () => {
  const warnings = [];
  const result = loadBuiltinOrders({ warn: (message) => warnings.push(message) });
  assert.equal(result.origin, "runtime", "resolved and parsed the installed package");
  assert.ok(result.file, "resolved the package lib/index.js");
  assert.equal(Object.keys(result.orders).length, 32);
  assert.equal(result.orders.HARNESS_IDENTITY, -1000);
  assert.equal(result.orders.DEPLOYMENT_PERSONA_SUFFIX, 10200);
  assert.deepEqual(result.orders, BUILTIN_ORDERS, "runtime table matches the frozen copy");
  assert.deepEqual(warnings, [], "no fallback and no divergence warning");
});

test("loadBuiltinOrders falls back on garbage input and warns", () => {
  const warnings = [];
  const result = loadBuiltinOrders({
    warn: (m) => warnings.push(m),
    deps: { resolveFile: () => "/fake/lib/index.js", readFile: () => "export default 1; garbage" },
  });
  assert.equal(result.origin, "fallback");
  assert.equal(result.orders, BUILTIN_ORDERS);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /parsing failed/);
});

test("loadBuiltinOrders falls back when the package cannot be resolved", () => {
  const warnings = [];
  const result = loadBuiltinOrders({
    resolveFrom: "/nonexistent",
    warn: (m) => warnings.push(m),
    deps: { resolveFile: () => null },
  });
  assert.equal(result.origin, "fallback");
  assert.match(warnings[0], /not found/);
});

test("loadBuiltinOrders parses runtime input and freezes it", () => {
  const result = loadBuiltinOrders({
    warn: () => {},
    deps: { resolveFile: () => "/fake/lib/index.js", readFile: () => SAMPLE },
  });
  assert.equal(result.origin, "runtime");
  assert.equal(result.orders.TOOL_BASH, 1000);
  assert.ok(Object.isFrozen(result.orders));
});

test("loadBuiltinOrders warns when the runtime table diverges from the copy", () => {
  const warnings = [];
  const diverged = SAMPLE.replace("PLAN_POLICY: 500", "PLAN_POLICY: 550");
  const result = loadBuiltinOrders({
    warn: (m) => warnings.push(m),
    deps: { resolveFile: () => "/fake/lib/index.js", readFile: () => diverged },
  });
  assert.equal(result.origin, "runtime");
  assert.equal(result.orders.PLAN_POLICY, 550);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /differs/);
});

test("loadBuiltinOrders reports built-in keys with no assembled-name mapping", () => {
  const warnings = [];
  const upgraded = SAMPLE.replace("TOOL_BASH: 1e3,", "TOOL_BASH: 1e3,\n\tTOOL_FRESH: 1111,");
  const result = loadBuiltinOrders({
    warn: (m, d) => warnings.push({ m, d }),
    deps: { resolveFile: () => "/fake/lib/index.js", readFile: () => upgraded },
  });
  assert.equal(result.origin, "runtime");
  assert.equal(result.orders.TOOL_FRESH, 1111, "the runtime table still wins");
  const unmapped = warnings.find((w) => /no assembled-name mapping/.test(w.m));
  assert.ok(unmapped, "unmapped keys are reported");
  assert.deepEqual(unmapped.d.unmapped, ["TOOL_FRESH"]);
});

test("builtinOrdersByName maps verified keys to dotted section names", () => {
  const byName = builtinOrdersByName(BUILTIN_ORDERS);
  assert.equal(byName["harness:identity"], -1000);
  assert.equal(byName["deployment:persona-prefix"], 0);
  assert.equal(byName["plan:policy"], 500);
  assert.equal(byName["tool:bash"], 1000);
  assert.equal(byName["deployment:persona-suffix"], 10200);
  assert.ok(Object.isFrozen(byName));
});

/** @purpose Pin the name mapping and the total built-in set so a platform upgrade breaks a test instead of silently losing anchors. */
test("builtin name mapping is frozen against the installed built-in set", () => {
  const EXPECTED_NAMES = [
    "app:web-surface",
    "context:file-reference",
    "deployment:persona-prefix",
    "deployment:persona-suffix",
    "harness:identity",
    "mcp-resource-servers",
    "plan:policy",
    "team:policy",
    "tool:bash",
    "tool:edit",
    "tool:glob",
    "tool:goal",
    "tool:grep",
    "tool:jobs",
    "tool:pwsh",
    "tool:ralph",
    "tool:read",
    "tool:web_fetch",
    "tool:web_search",
    "tool:write",
    "tools:ptc-only",
    "tools:sdk",
    "ui:deliverable-file-references",
  ];
  assert.deepEqual(
    Object.keys(builtinOrdersByName(BUILTIN_ORDERS)).sort(),
    EXPECTED_NAMES,
    "the assembled-name mapping changed — map the new built-in or pin it as known-unmapped",
  );
  assert.equal(Object.keys(BUILTIN_ORDERS).length, 32, "built-in count is pinned");
  assert.deepEqual(
    unmappedBuiltinKeys(BUILTIN_ORDERS),
    [],
    "every fallback key is either mapped or in the pinned known-unmapped set",
  );
  // A NEW built-in is reported and takes no anchor.
  assert.deepEqual(unmappedBuiltinKeys({ ...BUILTIN_ORDERS, TOOL_FRESH: 1 }), ["TOOL_FRESH"]);
  assert.equal(builtinOrdersByName({ ...BUILTIN_ORDERS, TOOL_FRESH: 1 })["tool:fresh"], undefined);
});
