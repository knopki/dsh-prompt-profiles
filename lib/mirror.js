/**
 * Mirror of the installed dsh-system-prompt SECTION_ORDERS table.
 * #region moduleContract
 * @modulecontract
 * @purpose Keep the prompt-profiles registry honest about the built-in
 *   section orderings actually installed in this DSH, so order collisions
 *   are detected against reality rather than a stale copy.
 * @scope
 *  - Pure parsing of the `SECTION_ORDERS` object literal from the text of an
 *    installed `@deepseek-ai/dsh-system-prompt/lib/index.js` (no `eval`).
 *  - Best-effort location of that file (`createRequire` chain, see
 *    FUNC_resolveSystemPromptFile), comparison against the frozen fallback
 *    copy, and warn-and-fallback behavior (SPEC §5.2).
 *  - NOT: consuming the mirror (lib/registry.js), serving it (lib/index.js).
 * @invariants
 *  - `parseBuiltinOrders` never executes source text; it only regex-scans it.
 *  - `loadBuiltinOrders` never throws: every failure path warns and returns
 *    the frozen fallback copy (SPEC §7 "mirror не распарсился").
 * @dependencies
 *  - READS: the installed @deepseek-ai/dsh-system-prompt (best effort).
 *  - USES API: node:module.createRequire (CJS resolution honors NODE_PATH,
 *    which the mise-launched DSH process sets — verified in this session).
 * @rationale
 *  - Q: Why createRequire instead of import.meta.resolve?
 *    A: ESM resolution ignores NODE_PATH; CJS resolution honors it. The DSH
 *    process inherits NODE_PATH from its mise shim, and that is the only
 *    mechanism that locates the package from inside the profile tree
 *    (verified live; see .spike/step2a-registry.md).
 * @keywords mirror, SECTION_ORDERS, builtin orders, parse, resolve, fallback
 * #endregion moduleContract
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { BUILTIN_ORDERS } from "./builtin-orders.js";

// #region FUNC_parseBuiltinOrders
/**
 * Extract the module-local `SECTION_ORDERS` object from the text of an
 * installed `@deepseek-ai/dsh-system-prompt/lib/index.js`.
 *
 * @purpose Turn untrusted source text into a plain name→number table without
 *   executing any of it, so the mirror can follow DSH upgrades safely.
 * @param {string} sourceText - full text of the package's lib/index.js.
 * @returns {Record<string, number>} plain object, insertion order preserved.
 * @throws {Error} descriptive error when the table is missing, unreadable as
 *   an object literal, or contains no valid entries.
 */
export function parseBuiltinOrders(sourceText) {
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
  const entry = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g;
  const orders = {};
  let count = 0;
  let match;
  while ((match = entry.exec(body)) !== null) {
    const value = Number(match[2]);
    if (!Number.isFinite(value)) {
      throw new Error(`mirror: SECTION_ORDERS entry ${match[1]} has non-finite value ${match[2]}`);
    }
    if (match[1] in orders) {
      throw new Error(`mirror: SECTION_ORDERS key ${match[1]} appears twice`);
    }
    orders[match[1]] = value;
    count += 1;
  }
  if (count === 0) {
    throw new Error("mirror: SECTION_ORDERS literal contains no recognizable entries");
  }
  return orders;
}
// #endregion FUNC_parseBuiltinOrders

// #region FUNC_sameOrders
/**
 * Structural comparison of two order tables (key sets and values).
 *
 * @purpose Decide whether the runtime mirror diverged from the frozen copy
 *   without depending on key order or object identity.
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 * @returns {boolean} true when both key sets and all values match.
 */
export function sameOrders(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => key in b && a[key] === b[key]);
}
// #endregion FUNC_sameOrders

// #region FUNC_resolveSystemPromptFile
/**
 * Locate the installed `@deepseek-ai/dsh-system-prompt/lib/index.js`.
 *
 * Resolution strategy (first hit wins, all failures collected for the
 * warning message):
 *  1. `createRequire` rooted at `resolveFrom` (the profile directory, e.g.
 *     `ctx.profileContext.dir`) resolving the package, then `.../lib/index.js`;
 *  2. the same two specifiers rooted at THIS module (the installed bundle).
 *
 * @purpose Find the live built-in orders table with no hard dependency on
 *   where the DSH process was started from.
 * @param {object} [options]
 * @param {string} [options.resolveFrom] - directory to resolve from first.
 * @param {(base: string, specifier: string) => string} [options.resolve]
 *   test seam replacing the createRequire lookup (defaults to real CJS resolve).
 * @returns {string|null} absolute path to lib/index.js, or null when not found.
 */
export function resolveSystemPromptFile({ resolveFrom, resolve } = {}) {
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
 * Resolution order: installed package text (parsed, no eval) → frozen copy
 * from lib/builtin-orders.js. A divergence between the parsed table and the
 * frozen copy also warns but KEEPS the runtime table (it reflects the
 * actually-installed DSH; the copy exists only as a fallback — SPEC §5.2).
 *
 * @purpose Give the service a best-effort, never-throwing view of the real
 *   built-in section orders.
 * @param {object} [options]
 * @param {string} [options.resolveFrom] - profile directory to resolve from.
 * @param {(message: string, details?: unknown) => void} [options.warn]
 *   warning sink (defaults to console.warn).
 * @param {object} [options.deps] - test seams (not used by production code):
 *   `resolveFile({ resolveFrom }) => string|null` and
 *   `readFile(path) => string`.
 * @returns {{ orders: Record<string, number>, origin: "runtime"|"fallback", file: string|null }}
 */
export function loadBuiltinOrders({ resolveFrom, warn = console.warn, deps = {} } = {}) {
  const resolveFile = deps.resolveFile ?? resolveSystemPromptFile;
  const readFile = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
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
    return { orders: Object.freeze(orders), origin: "runtime", file };
  } catch (error) {
    warn("prompt-profiles mirror: parsing failed; using frozen copy", {
      error: error?.message ?? String(error),
    });
    return { orders: BUILTIN_ORDERS, origin: "fallback", file: null };
  }
}
// #endregion FUNC_loadBuiltinOrders
