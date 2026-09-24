/**
 * Mirror tests — parse, resolve, fallback.
 * #region moduleContract
 * @modulecontract
 * @purpose Verify the SECTION_ORDERS mirror: pure parse without eval,
 *   descriptive failures on garbage, warn-and-fallback loading, and the
 *   name-keyed view used for assembly anchoring.
 * @scope lib/mirror.js and lib/builtin-orders.js (PLAN step 2). The
 *   real-file test skips gracefully when dsh-system-prompt is unresolvable.
 * @rationale
 *  - Q: Why inject deps (resolveFile/readFile) instead of real fs in the
 *    fallback tests?
 *    A: The failure paths need deterministic garbage input; the real-file
 *    path is covered separately and skips when the package is absent.
 * #endregion moduleContract
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  parseBuiltinOrders,
  loadBuiltinOrders,
  resolveSystemPromptFile,
  sameOrders,
} from "../lib/mirror.js";
import { BUILTIN_ORDERS, builtinOrdersByName } from "../lib/builtin-orders.js";

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

// #region SECTION_parse
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
  assert.throws(() => parseBuiltinOrders("const SECTION_ORDERS = { /* empty */ };"), /no recognizable entries/);
});
// #endregion SECTION_parse

// #region SECTION_realFile
test("parseBuiltinOrders parses the real installed dsh-system-prompt", { skip: (() => {
  try { createRequire(import.meta.url).resolve("@deepseek-ai/dsh-system-prompt"); return false; }
  catch { return "dsh-system-prompt not resolvable from here"; }
})() }, () => {
  const file = resolveSystemPromptFile({ resolveFrom: undefined });
  assert.ok(file, "resolveSystemPromptFile found the file");
  const orders = parseBuiltinOrders(readFileSync(file, "utf8"));
  assert.equal(Object.keys(orders).length, 32);
  assert.equal(orders.HARNESS_IDENTITY, -1000);
  assert.equal(orders.DEPLOYMENT_PERSONA_SUFFIX, 10200);
  assert.ok(sameOrders(orders, BUILTIN_ORDERS), "runtime table matches frozen copy");
});
// #endregion SECTION_realFile

// #region SECTION_fallback
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
// #endregion SECTION_fallback

// #region SECTION_nameView
test("builtinOrdersByName maps verified keys to dotted section names", () => {
  const byName = builtinOrdersByName(BUILTIN_ORDERS);
  assert.equal(byName["harness:identity"], -1000);
  assert.equal(byName["deployment:persona-prefix"], 0);
  assert.equal(byName["plan:policy"], 500);
  assert.equal(byName["tool:bash"], 1000);
  assert.equal(byName["deployment:persona-suffix"], 10200);
  assert.ok(Object.isFrozen(byName));
});
// #endregion SECTION_nameView
