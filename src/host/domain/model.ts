/**
 * #region moduleContract
 * @modulecontract
 * @purpose Name the prompt-profile domain once: the two row kinds and their
 *   plugin names, scope values, the reference/row/snapshot shapes and the id
 *   forms every other host module speaks.
 * @scope
 *  - Types and frozen literals only — no logic, no I/O.
 *  - NOT: id algorithms (domain/ids.ts), ordering and skip rules
 *    (domain/ordering.ts), reference matching (domain/refs.ts), wire schemas
 *    (src/shared/wire-schemas.ts).
 * @invariants
 *  - Only the three SCOPES values change selection; any other scope string is
 *    reported as an unknown scope and never coerced.
 * @keywords prompt profiles, domain, model, scope, section ref, row id
 * #endregion moduleContract
 */

// #region CONST_identity
/** Kind of composition row this bundle owns. */
export type RowKind = "section" | "profile";

/** Loader plugin name of the `.../section` composition row. */
export const SECTION_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/section";
/** Loader plugin name of the `.../profile` composition row. */
export const PROFILE_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/profile";

/** Id prefix of every section row id this bundle mints (`prompt-section-<token>`). */
export const SECTION_ID_PREFIX = "prompt-section-";
/** Id prefix of every profile row id this bundle mints (`prompt-profile-<token>`). */
export const PROFILE_ID_PREFIX = "prompt-profile-";

/** The persona row whose `config.complete === true` collapses the prompt. */
export const PERSONA_PLUGIN_NAME = "@deepseek-ai/dsh-persona";
// #endregion CONST_identity

// #region CONST_scopes
/** Scope values a profile reference may carry (SPEC §4). */
export const SCOPES = ["inherit", "main-only", "subagents-only"] as const;
export type Scope = (typeof SCOPES)[number];
// #endregion CONST_scopes

// #region TYPE_ids
/**
 * Loader-qualified entry id of a row: the registry keys on
 * `ctx.fiber.entry.id`, which is `<parent>:<rowId>` (any `:` chain).
 */
export type RowId = string;
/** Unqualified patch row id — the form the profile patch file addresses. */
export type PatchId = string;
/**
 * `config.id` of a row. Frozen id scheme: a row THIS bundle creates stores
 * its full row id as `config.id`; rows from other layers keep their own ids.
 */
export type ConfigId = string;
/** Which patch layer a row was proven to come from. */
export type RowSource = "user" | "bundle" | "unknown";
// #endregion TYPE_ids

// #region TYPE_shapes
/**
 * One section reference inside a profile. `order` and `scope` belong to the
 * reference, not to the section; a `scope` outside SCOPES is preserved as
 * written and reported as unknown by the selection rule.
 */
export interface SectionRef {
  id: ConfigId;
  order: number;
  scope?: string;
}

/** A section as the selection and ordering rules read it. */
export interface Section {
  id: ConfigId;
  title: string;
  body: string;
  disabled?: boolean;
}

/** A profile as the selection and ordering rules read it. */
export interface Profile {
  id: ConfigId;
  title: string;
  sections: SectionRef[];
}

/** Which profiles reference a section (editor feed). */
export interface UsedInEntry {
  profileId: ConfigId;
  scope: string;
}

/** Registry row view of a section: its config plus row identity and source. */
export interface SectionView extends Section {
  rowId: RowId | null;
  source: RowSource;
  patchId?: PatchId;
  usedIn?: UsedInEntry[];
  emits?: boolean;
}

/** Registry row view of a profile: its config plus row identity and source. */
export interface ProfileView extends Profile {
  rowId: RowId | null;
  source: RowSource;
  patchId?: PatchId;
}
// #endregion TYPE_shapes

// #region TYPE_snapshot
/**
 * One sealed section: text frozen at seal time, never re-interpolated. Carries
 * ONLY what the insertion rules read (`id` names the entry, `order` places it,
 * `text` renders it); the profile and section titles are deliberately absent,
 * so the durable record needs no maintenance when presentation changes.
 */
export interface SnapshotSection {
  id: ConfigId;
  order: number;
  text: string;
}

/** A session's frozen contribution to the system prompt; empty means "none". */
export interface Snapshot {
  sections: SnapshotSection[];
}

/** The part of an already-sorted assembly the insertion rules can anchor on. */
export interface AssemblySection {
  name: string;
}

/**
 * One planned insertion. `index` is a BASE index into the ORIGINAL assembly
 * array: consumers apply the plan by splicing from LAST to FIRST.
 */
export interface PlannedInsertion {
  name: string;
  text: string;
  interpolate: false;
  index: number;
}
// #endregion TYPE_snapshot
