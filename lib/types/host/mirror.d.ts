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
 *  - `parseBuiltinOrders` never executes source text; it only regex-scans it,
 *    and it requires EVERY non-empty line of the literal to be a plain
 *    `KEY: number` pair — a changed upstream grammar fails the whole parse
 *    (M5) instead of yielding a silently partial table.
 *  - `loadBuiltinOrders` never throws: every failure path warns and returns
 *    the frozen fallback copy (SPEC §7 "mirror не распарсился"), and a parsed
 *    table's keys with no assembled-name mapping are reported with a warning.
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
/**
 * Extract the module-local `SECTION_ORDERS` object from the text of an
 * installed `@deepseek-ai/dsh-system-prompt/lib/index.js`.
 *
 * @purpose Turn untrusted source text into a plain name→number table without
 *   executing any of it, so the mirror can follow DSH upgrades safely.
 * @param {string} sourceText - full text of the package's lib/index.js.
 * @returns {Record<string, number>} plain object, insertion order preserved.
 * @throws {Error} descriptive error when the table is missing, unreadable as
 *   an object literal, contains no valid entries, or contains ANY line that is
 *   not a plain `KEY: <number>` pair (M5: a changed upstream grammar must fail
 *   loudly and fall back rather than yield a silently PARTIAL table).
 */
export declare function parseBuiltinOrders(sourceText: any): {};
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
export declare function loadBuiltinOrders({ resolveFrom, warn, deps }?: {
    deps?: {} | undefined;
    warn?: {
        (...data: any[]): void;
        (...data: any[]): void;
        (message?: any, ...optionalParams: any[]): void;
    } | undefined;
}): {
    orders: Readonly<{}>;
    origin: string;
    file: any;
};
