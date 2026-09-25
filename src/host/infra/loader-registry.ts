/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the authoritative in-memory view of every registered section
 *   and profile row, so the service, the editor and the prompt-injection step
 *   read one consistent, deterministically ordered dataset.
 * @scope
 *  - Registration/disposal with the duplicate-config.id policy (SPEC §5.1),
 *    sorted detached views, and the usedIn lookup. Insertion anchoring is a
 *    domain rule and lives in domain/ordering.ts (re-exported here for the
 *    modules and tests that reach it through the registry).
 *  - Pure data structure: no Cordis, no filesystem, no clock.
 *  - NOT: mounting rows (section.ts/profile.ts), serving the registry on ctx
 *    (index.ts), prompt injection.
 * @invariants
 *  - Views are fresh shallow copies in a stable order; mutating one never
 *    affects the registry. Volatile `.get()` fields are unwrapped at READ time
 *    so live settings edits keep flowing into views, sorting and usedIn.
 *  - A duplicate config.id resolves to the registration mounted LAST;
 *    disposing an overridden registration is a no-op, and disposing the winner
 *    reveals the still-mounted earlier one.
 * @keywords registry, sections, profiles, duplicate, usedIn
 * #endregion moduleContract
 */

import type {
  ConfigId,
  ProfileView,
  RowKind,
  RowSource,
  SectionRef,
  SectionView,
  UsedInEntry,
} from "../domain/model.ts";
import { insertionIndex } from "../domain/ordering.ts";
import { usedIn } from "../domain/refs.ts";

export { insertionIndex };

// #region FUNC_configView
/**
 * Cordis/Schemastery volatile fields arrive as `.get()` wrapper refs. Unwrap
 * AT READ TIME (never once at registration) so live settings edits keep
 * flowing into views; plain values pass through.
 */
const unwrapVolatile = (value: unknown): unknown => {
  if (value != null && typeof (value as { get?: unknown }).get === "function") {
    return (value as { get: () => unknown }).get();
  }
  return value;
};

/** Project a stored config into a plain, one-level read view with CURRENT values. */
function configView(config: { id: string } & Record<string, unknown>): Record<string, unknown> {
  if (config == null || typeof config !== "object") return config;
  const view: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) view[key] = unwrapVolatile(value);
  return view;
}
// #endregion FUNC_configView

// #region TYPE_RegistryEntry
/** One registered row: its loader entry id, its row config and its provenance. */
interface RegistryEntry {
  rowId: string | null;
  config: { id: string } & Record<string, unknown>;
  source: RowSource;
}

/** A row handed to the registry by its composition row plugin. */
interface RegisterRow {
  rowId?: string | null;
  config: { id: string } & Record<string, unknown>;
  source?: RowSource;
}
// #endregion TYPE_RegistryEntry

// #region CLASS_PromptProfilesRegistry
/** Pure in-memory registry of section and profile rows. */
export class PromptProfilesRegistry {
  #warn: (message: string, details?: unknown) => void;
  #sections: Map<string, RegistryEntry>;
  #profiles: Map<string, RegistryEntry>;
  #stacks: Map<string, RegistryEntry[]>;

  /** @param options.warn duplicate-id sink (defaults to console.warn). */
  constructor({ warn = console.warn }: { warn?: (message: string, details?: unknown) => void } = {}) {
    this.#warn = warn;
    this.#sections = new Map();
    this.#profiles = new Map();
    this.#stacks = new Map();
  }

  /**
   * Register one `.../section` row (SPEC §5.1).
   * @returns disposer; a no-op when a later row with the same config.id
   *   already overrode this registration.
   */
  registerSection(row: RegisterRow): () => void {
    return this.#register("section", this.#sections, row);
  }

  /** Register one `.../profile` row; same disposer semantics as registerSection. */
  registerProfile(row: RegisterRow): () => void {
    return this.#register("profile", this.#profiles, row);
  }

  /** Detached view of every section, sorted by `id`. */
  sections(): SectionView[] {
    return (
      [...this.#sections.values()]
        // The row's own Config validated id/title/body before registration, so
        // the projection is total; spreading keeps the view detached.
        .map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source }) as SectionView)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    );
  }

  /** Detached view of every profile, sorted by `title` then `id` (SPEC decision 19). */
  profiles(): ProfileView[] {
    return (
      [...this.#profiles.values()]
        // Same totality argument as sections(): the row Config validated the
        // shape before registration.
        .map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source }) as ProfileView)
        .sort(
          (a, b) =>
            String(a.title ?? "").localeCompare(String(b.title ?? "")) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        )
    );
  }

  /**
   * Which profiles reference a section, with per-profile scope — feeds the
   * editor's read-only «используется в» field (SPEC §2 #26). A section
   * referenced twice contributes one entry per reference.
   */
  usedIn(sectionId: ConfigId): UsedInEntry[] {
    return usedIn(
      [...this.#profiles.values()].map((entry) => {
        const view = configView(entry.config);
        return {
          id: entry.config.id,
          sections: Array.isArray(view.sections) ? (view.sections as SectionRef[]) : [],
        };
      }),
      sectionId,
    );
  }

  /**
   * Shared registration path (SPEC §5.1). Each kind/id keeps a STACK of live
   * registrations; the per-kind Map exposes the top of the stack (later
   * registration wins deterministically). Disposing the top reveals the next
   * surviving registration, so an HMR teardown of an overriding row RESTORES
   * the still-mounted one instead of dropping the id from prompts.
   */
  #register(kind: RowKind, map: Map<string, RegistryEntry>, row: RegisterRow): () => void {
    const { rowId = null, config, source = "unknown" } = row;
    if (!config || typeof config.id !== "string" || config.id === "") {
      throw new TypeError(`prompt-profiles: ${kind} row ${rowId ?? "?"} has no valid config.id`);
    }
    const key = `${kind}:${config.id}`;
    const stack = this.#stacks.get(key) ?? [];
    const winner = stack[stack.length - 1];
    if (winner) {
      this.#warn(
        `prompt-profiles: duplicate ${kind} config.id "${config.id}"` +
          ` — row "${winner.rowId}" is overridden by row "${rowId}" (later registration wins)`,
      );
    }
    const entry: RegistryEntry = { rowId, config, source };
    stack.push(entry);
    this.#stacks.set(key, stack);
    map.set(config.id, entry);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const live = this.#stacks.get(key);
      const index = live?.lastIndexOf(entry) ?? -1;
      if (live === undefined || index < 0) return;
      live.splice(index, 1);
      if (live.length === 0) {
        this.#stacks.delete(key);
        if (map.get(config.id) === entry) map.delete(config.id);
        return;
      }
      // Reveal the latest survivor only when the MAP actually pointed at us.
      if (map.get(config.id) === entry) map.set(config.id, live[live.length - 1]);
    };
  }
}
// #endregion CLASS_PromptProfilesRegistry
