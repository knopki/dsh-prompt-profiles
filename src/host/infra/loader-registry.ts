/**
 * #region moduleContract
 * @modulecontract
 * @purpose Own the authoritative in-memory view of every registered section
 *   and profile row, so service, editor, and prompt injection read one dataset.
 * @scope
 *  - Registration/disposal with the duplicate-config.id policy, sorted
 *    detached views, and the usedIn lookup.
 *  - NOT: mounting rows or serving the registry on ctx.
 * @invariants
 *  - Views are fresh shallow copies in stable order; volatile fields unwrap at
 *    read time. The last registration wins; disposing it reveals the earlier one.
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

const unwrapVolatile = (value: unknown): unknown => {
  if (value != null && typeof (value as { get?: unknown }).get === "function") {
    return (value as { get: () => unknown }).get();
  }
  return value;
};

// #region FUNC_configView
/** @purpose Project a stored config into a plain read view with current values. */
function configView(config: { id: string } & Record<string, unknown>): Record<string, unknown> {
  if (config == null || typeof config !== "object") return config;
  const view: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) view[key] = unwrapVolatile(value);
  return view;
}
// #endregion FUNC_configView

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

// #region CLASS_PromptProfilesRegistry
/**
 * Pure in-memory registry of section and profile rows.
 *
 * @purpose Own the authoritative dataset the service, editor, and injection read.
 */
export class PromptProfilesRegistry {
  #warn: (message: string, details?: unknown) => void;
  #sections: Map<string, RegistryEntry>;
  #profiles: Map<string, RegistryEntry>;
  #stacks: Map<string, RegistryEntry[]>;

  // #region METHOD_constructor
  /**
   * @purpose Initialize empty section/profile registries with the selected duplicate warning sink.
   */
  constructor({ warn = console.warn }: { warn?: (message: string, details?: unknown) => void } = {}) {
    this.#warn = warn;
    this.#sections = new Map();
    this.#profiles = new Map();
    this.#stacks = new Map();
  }
  // #endregion METHOD_constructor

  // #region METHOD_registerSection
  /**
   * @purpose Register a section and return a disposer that restores any shadowed registration.
   */
  registerSection(row: RegisterRow): () => void {
    return this.#register("section", this.#sections, row);
  }
  // #endregion METHOD_registerSection

  // #region METHOD_registerProfile
  /**
   * @purpose Register a profile and return a disposer that restores any shadowed registration.
   */
  registerProfile(row: RegisterRow): () => void {
    return this.#register("profile", this.#profiles, row);
  }
  // #endregion METHOD_registerProfile

  // #region METHOD_sections
  /** @purpose Return detached section views in stable id order. */
  sections(): SectionView[] {
    return (
      [...this.#sections.values()]
        // The row's own Config validated id/title/body before registration, so
        // the projection is total; spreading keeps the view detached.
        .map((entry) => ({ ...configView(entry.config), rowId: entry.rowId, source: entry.source }) as SectionView)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    );
  }
  // #endregion METHOD_sections

  // #region METHOD_profiles
  /** @purpose Return detached profile views in title/id order. */
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
  // #endregion METHOD_profiles

  // #region METHOD_usedIn
  /** @purpose Report each profile reference to the requested section with its scope. */
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
  // #endregion METHOD_usedIn

  /** Later registration wins; disposing it restores the prior live entry. */
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
