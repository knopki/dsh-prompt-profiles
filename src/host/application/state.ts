/**
 * #region moduleContract
 * @modulecontract
 * @purpose Serve the editor's read model in one call: profiles and sections
 *   with both identifiers, built-in orders, modes, the default and every
 *   per-workspace choice, plus the settings revision.
 * @scope
 *  - The `state` read model and the agent-preset mode scan it needs.
 *  - NOT: any write, preview rendering (preview.ts) or row addressing rules
 *    (env.ts).
 * @invariants
 *  - Reading state degrades PER OPTIONAL SERVICE: it must work without
 *    settings or agentPresets, reporting `revision: null` and `modes: []`.
 *  - A section body may be empty/whitespace (SPEC §7); `emits: false` marks it.
 *  - Rows carry BOTH identifiers: `rowId` (qualified loader entry id) and
 *    `patchId` (the unqualified id every write uses).
 * @keywords state, read model, modes, complete mode, revision
 * #endregion moduleContract
 */

import { parse } from "yaml";
import { PERSONA_PLUGIN_NAME } from "../domain/index.ts";
import type { ProfileView, SectionView, UsedInEntry } from "../domain/model.ts";
import type { UseCaseEnv } from "./env.ts";
import type { AgentPresetRecord, AgentPresetsPort, WarnFn } from "./ports.ts";

// #region TYPE_state
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
// #endregion TYPE_state

// #region CONST_yamlDialect
/** `!!js` customTag shared with the loader dialect (SPEC §3). */
const yamlParseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value: unknown) => value }] };
// #endregion CONST_yamlDialect

// #region FUNC_hasCompletePersona
/** Defensive traversal cap; a parsed YAML document is acyclic. */
const MAX_PRESET_DEPTH = 32;
/**
 * Depth-first search for a `@deepseek-ai/dsh-persona` row carrying
 * `config.complete === true`, at ANY depth — through arrays, objects and the
 * `config` ARRAYS of `cordis:group` rows. The preset document shape varies:
 * the raw `presets/*.patch.yml` nests the persona row under
 * `insert[].config.plugins[]`, while `agentPresets.readDocument` may dump the
 * plugin LIST at the top level. One recursive search covers both; no preset
 * name is hardcoded.
 */
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
 *   complete-mode warning (SPEC §2 decision 21): for each agent preset, read
 *   its declared composition and mark `complete: true` when any plugin row
 *   named `@deepseek-ai/dsh-persona` carries `config.complete === true`
 *   ANYWHERE in the parsed document (recursive, see hasCompletePersona). The
 *   roster alone carries no config, so readDocument + parse is the only
 *   detection method. `[]` when the service is absent or listing fails.
 */
async function modeViews(agentPresets: AgentPresetsPort | undefined, warn?: WarnFn): Promise<ModeView[]> {
  if (agentPresets == null) return [];
  let presets: AgentPresetRecord[] = [];
  try {
    presets = await agentPresets.list();
  } catch (error) {
    warn?.("prompt-profiles: agentPresets.list failed; modes empty", { error: errorMessageOf(error) });
    return [];
  }
  const modes: ModeView[] = [];
  for (const preset of presets) {
    let complete = false;
    try {
      const document = await agentPresets.readDocument(preset.id);
      // `yamlParseOptions` carries the `!!js` custom tag: preset files use
      // `disabled: !!js process.platform === 'win32'`, which must NOT abort the
      // parse. A genuinely unparseable document warns below and stays false.
      const entries = parse(document.content ?? "", yamlParseOptions);
      complete = hasCompletePersona(entries);
    } catch (error) {
      warn?.("prompt-profiles: preset document unreadable; complete stays false", {
        preset: preset.id,
        error: errorMessageOf(error),
      });
    }
    modes.push({ id: preset.id, title: preset.name ?? preset.id, complete });
  }
  return modes;
}
// #endregion FUNC_modeViews

/** Message text of an unknown thrown value (the log sink takes plain strings). */
function errorMessageOf(error: unknown): string {
  return (error as { message?: string } | null)?.message ?? String(error);
}

// #region FUNC_createStateCases
/** @purpose Build the state read model over the shared use-case environment. */
export function createStateCases(env: UseCaseEnv) {
  return {
    /** Read the full editor state (degrades per optional service). */
    state: async (_input?: unknown): Promise<StateResult> => {
      const { registry, orders } = env.ports;
      // PER-OPERATION DEGRADATION: reading state must work without the optional
      // settings/agentPresets services; revision is null when unreadable.
      const revision = env.ports.settings()?.revision() ?? null;
      return {
        profiles: registry.profiles().map((profile) => ({ ...profile, patchId: env.patchIdOf(profile.rowId) })),
        sections: registry.sections().map((section) => ({
          ...section,
          patchId: env.patchIdOf(section.rowId),
          usedIn: registry.usedIn(section.id),
          emits: typeof section.body === "string" && section.body.trim() !== "",
        })),
        builtinOrders: orders.orders(),
        modes: await modeViews(env.ports.presets(), env.ports.warn),
        default: registry.defaultId(),
        lastByWorkspace: registry.lastByWorkspace(),
        revision,
      };
    },
  };
}
// #endregion FUNC_createStateCases
