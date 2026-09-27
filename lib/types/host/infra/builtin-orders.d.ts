/**
 * #region moduleContract
 * @modulecontract
 * @purpose Mirror the installed system-prompt section order table at runtime,
 *   with a frozen fallback copy keeping insertion anchoring working on parse failure.
 * @scope
 *  - Strict literal parsing (no execution), warn-and-fallback loading, and the
 *    verified key-to-name anchors.
 *  - NOT: consuming the mirror (loader-registry) or serving it (plugin entrypoint).
 * @invariants
 *  - `BUILTIN_ORDERS` is deeply frozen. Unknown grammar fails instead of
 *    yielding a partial table; every failure warns and returns the fallback.
 * #endregion moduleContract
 */
/**
 * Frozen fallback for the installed built-in order table.
 *
 * @purpose Keep insertion anchoring working when runtime parsing fails.
 */
export declare const BUILTIN_ORDERS: Readonly<Record<string, number>>;
/**
 * Order-table keys with no assembled-name mapping AND not in the pinned
 * known-unmapped set — i.e. built-ins this bundle has never seen. Empty for
 * the frozen copy; non-empty means an upgrade added/renamed a built-in.
 */
export declare function unmappedBuiltinKeys(orders?: Record<string, number>): string[];
/** @purpose Map order-table keys to assembled section names. */
export declare function builtinOrdersByName(orders?: Record<string, number>): Record<string, number>;
/**
 * Extract the module-local `SECTION_ORDERS` object from the text of an
 * installed `@deepseek-ai/dsh-system-prompt/lib/index.js`.
 *
 * @purpose Turn untrusted source text into a plain name->number table without
 *   executing any of it, so the mirror can follow DSH upgrades safely.
 * @throws descriptive error when the table is missing, unreadable as an object
 *   literal, contains no valid entries, or contains any line that is not a
 *   plain `KEY: <number>` pair: unknown literal entries fail rather than
 *   silently producing a partial table.
 */
export declare function parseBuiltinOrders(sourceText: string): Record<string, number>;
/**
 * Test seams of the mirror loader; production code passes neither.
 *
 * @purpose Expose the file-resolution and file-read seams for tests.
 */
export interface BuiltinOrdersSeams {
    resolveFile?(options: {
        resolveFrom?: string;
    }): string | null;
    readFile?(path: string): string;
}
/**
 * The mirror result: the order table, where it came from, and the file parsed.
 *
 * @purpose Carry the loaded order table with its origin.
 */
export interface BuiltinOrdersMirror {
    orders: Record<string, number>;
    origin: "runtime" | "fallback";
    file: string | null;
}
/**
 * @purpose Options for loading the built-in orders mirror.
 */
export interface LoadBuiltinOrdersOptions {
    resolveFrom?: string;
    warn?: (message: string, details?: unknown) => void;
    deps?: BuiltinOrdersSeams;
}
/**
 * @purpose Give the service a best-effort, never-throwing view of the real
 *   built-in section orders: the runtime table wins, the frozen copy is the fallback.
 */
export declare function loadBuiltinOrders({ resolveFrom, warn, deps, }?: LoadBuiltinOrdersOptions): BuiltinOrdersMirror;
