import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  BUILTIN_ORDERS,
  unmappedBuiltinKeys
} from "./chunk-B5Q6S2BJ.js";

// src/host/mirror.ts
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
      throw new Error(`mirror: SECTION_ORDERS line ${index + 1} is not a plain key: number pair \u2014 ${JSON.stringify(line)}`);
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
function resolveSystemPromptFile({ resolveFrom, resolve } = {}) {
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
function loadBuiltinOrders({ resolveFrom, warn = console.warn, deps = {} } = {}) {
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
      warn("prompt-profiles mirror: built-in section keys have no assembled-name mapping; they provide no insertion anchor", {
        file,
        unmapped
      });
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
  parseBuiltinOrders,
  loadBuiltinOrders
};
//# sourceMappingURL=chunk-WTGZWZNI.js.map
