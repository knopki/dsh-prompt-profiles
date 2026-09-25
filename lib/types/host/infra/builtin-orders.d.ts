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
 *    (host/entrypoints/plugin.ts).
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
/**
 * Frozen fallback mirror of built-in section orders (name -> order).
 * Verbatim from @deepseek-ai/dsh-system-prompt@0.1.7-rc.1.
 */
export declare const BUILTIN_ORDERS: Readonly<Record<string, number>>;
/**
 * Order-table keys with no assembled-name mapping AND not in the pinned
 * known-unmapped set — i.e. built-ins this bundle has never seen. Empty for
 * the frozen copy; non-empty means an upgrade added/renamed a built-in.
 */
export declare function unmappedBuiltinKeys(orders?: Record<string, number>): string[];
/**
 * Re-key an order table (SECTION_ORDERS-style, UPPER_SNAKE keys) by assembled
 * section name using SECTION_KEY_NAMES.
 *
 * @purpose Produce the name->order view that insertionIndex and the editor
 *   outline consume, since assembly.sections entries are identified by name
 *   and carry no `order` field (spike R1 caveat).
 */
export declare function builtinOrdersByName(orders?: Record<string, number>): Record<string, number>;
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
export declare function parseBuiltinOrders(sourceText: string): Record<string, number>;
/** Test seams of the mirror loader; production code passes neither. */
export interface BuiltinOrdersSeams {
    resolveFile?(options: {
        resolveFrom?: string;
    }): string | null;
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
export declare function loadBuiltinOrders({ resolveFrom, warn, deps, }?: LoadBuiltinOrdersOptions): BuiltinOrdersMirror;
