/**
 * #region moduleContract
 * @modulecontract
 * @purpose Serve the editor's read model in one call: profiles, sections,
 *   built-in orders, modes, the default, per-workspace choices, and the revision.
 * @scope The `state` read model and the agent-preset mode scan it needs.
 *  - NOT: any write, preview rendering, or row addressing rules.
 * @invariants
 *  - Reading degrades PER OPTIONAL SERVICE: `revision: null`, `modes: []`.
 *  - Rows carry BOTH identifiers: `rowId` and the `patchId` every write uses.
 * #endregion moduleContract
 */

import { parse } from "yaml";
import { errorMessage, PERSONA_PLUGIN_NAME } from "../domain/index.ts";
import type { ProfileView, SectionView, UsedInEntry } from "../domain/model.ts";
import { sectionEmits } from "../domain/ordering.ts";
import type { UseCaseEnv } from "./env.ts";
import type { AgentPresetRecord, AgentPresetsPort, WarnFn } from "./ports.ts";

/** One agent preset as the complete-mode warning reads it. */
export interface ModeView {
  id: string;
  title: string;
  complete: boolean;
}

/** The full editor state document. */
export interface StateResult {
  profiles: Array<ProfileView & { patchId: string }>;
  sections: Array<SectionView & { patchId: string; usedIn: UsedInEntry[]; emits: boolean }>;
  builtinOrders: Record<string, number>;
  modes: ModeView[];
  default: string;
  lastByWorkspace: Record<string, string> | undefined;
  revision: number | null;
}

/** `!!js` custom tag shared with the loader dialect. */
const yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value: unknown) => value }] };

/** Defensive traversal cap; a parsed YAML document is acyclic. */
const MAX_PRESET_DEPTH = 32;

// #region FUNC_hasCompletePersona
/** Depth-first search for a persona row carrying `config.complete === true`, at any depth. */
function hasCompletePersona(node: unknown, depth = 0): boolean {
  if (depth > MAX_PRESET_DEPTH) return false;
  if (Array.isArray(node)) return node.some((child) => hasCompletePersona(child, depth + 1));
  if (node === null || typeof node !== "object") return false;
  const row = node as { name?: unknown; config?: { complete?: unknown } };
  if (row.name === PERSONA_PLUGIN_NAME && row.config?.complete === true) return true;
  return Object.values(node).some((child) => hasCompletePersona(child, depth + 1));
}
// #endregion FUNC_hasCompletePersona

// #region FUNC_modeViews
/**
 * @purpose Build `modes: [{id, title, complete}]` for the editor's
 *   complete-mode warning. `[]` when the service is absent or listing fails.
 */
async function modeViews(agentPresets: AgentPresetsPort | undefined, warn?: WarnFn): Promise<ModeView[]> {
  if (agentPresets == null) return [];
  let presets: AgentPresetRecord[] = [];
  try {
    presets = await agentPresets.list();
  } catch (error) {
    warn?.("prompt-profiles: agentPresets.list failed; modes empty", { error: errorMessage(error) });
    return [];
  }
  const modes: ModeView[] = [];
  for (const preset of presets) {
    let complete = false;
    try {
      const document = await agentPresets.readDocument(preset.id);
      // Preset files use `disabled: !!js ...`, which must NOT abort the parse.
      const entries = parse(document.content ?? "", yamlParseOptions);
      complete = hasCompletePersona(entries);
    } catch (error) {
      warn?.("prompt-profiles: preset document unreadable; complete stays false", {
        preset: preset.id,
        error: errorMessage(error),
      });
    }
    modes.push({ id: preset.id, title: preset.name ?? preset.id, complete });
  }
  return modes;
}
// #endregion FUNC_modeViews

// #region FUNC_createStateCases
/** @purpose Build the state read model over the shared use-case environment. */
export function createStateCases(env: UseCaseEnv) {
  return {
    // #region METHOD_state
    /** @purpose Read the full editor state (degrades per optional service). */
    state: async (_input?: unknown): Promise<StateResult> => {
      const { registry, orders } = env.ports;
      const revision = env.revision() ?? null;
      return {
        profiles: registry.profiles().map((profile) => ({ ...profile, patchId: env.patchIdOf(profile.rowId) })),
        sections: registry.sections().map((section) => ({
          ...section,
          patchId: env.patchIdOf(section.rowId),
          usedIn: registry.usedIn(section.id),
          emits: sectionEmits(section),
        })),
        builtinOrders: orders.orders(),
        modes: await modeViews(env.ports.presets(), env.ports.warn),
        default: registry.defaultId(),
        lastByWorkspace: registry.lastByWorkspace(),
        revision,
      };
    },
    // #endregion METHOD_state
  };
}
// #endregion FUNC_createStateCases
