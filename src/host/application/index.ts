/**
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the whole prompt-profile use-case set behind ONE factory,
 *   so every surface executes the same implementation.
 * @scope The `OperationSet` shape and its composition from the per-domain
 *   use case modules.
 *  - NOT: how a surface reaches the ports, the domain rules, or sealing.
 * @invariants
 *  - Results are plain JSON-safe objects: surfaces serialize them verbatim.
 * @keywords operations, use cases, factory, barrel
 * #endregion moduleContract
 */

import { createUseCaseEnv, type DeleteResult } from "./env.ts";
import type { HostPorts } from "./ports.ts";
import { createPreviewCases, type PreviewRequest, type PreviewResult } from "./preview.ts";
import { createProfileCases, type ProfileCreateResult, type ProfileUpdateResult } from "./profiles.ts";
import {
  createSectionCases,
  type SectionCreateResult,
  type SectionRenameResult,
  type SectionUpdateResult,
} from "./sections.ts";
import { createStateCases, type StateResult } from "./state.ts";

/** The create-token source the tests drive to force id collisions. */
export { tokenSource } from "../domain/ids.ts";

export type { DeleteResult } from "./env.ts";
export type { PreviewRequest, PreviewResult } from "./preview.ts";
export type { ProfileCreateResult, ProfileUpdateResult } from "./profiles.ts";
export type { SectionCreateResult, SectionRenameResult, SectionUpdateResult } from "./sections.ts";
export type { ModeView, StateResult } from "./state.ts";

/** Operation names and JSON result types shared by all surfaces. */
export interface OperationSet {
  state: (input?: unknown) => Promise<StateResult>;
  preview: (input?: PreviewRequest) => PreviewResult;
  sectionCreate: (body?: unknown) => Promise<SectionCreateResult>;
  sectionUpdate: (body?: unknown) => Promise<SectionUpdateResult>;
  sectionDelete: (body?: unknown) => Promise<DeleteResult>;
  sectionRename: (body?: unknown) => Promise<SectionRenameResult>;
  profileCreate: (body?: unknown) => Promise<ProfileCreateResult>;
  profileUpdate: (body?: unknown) => Promise<ProfileUpdateResult>;
  profileDelete: (body?: unknown) => Promise<DeleteResult>;
  /** `default` accepts an id string, "" for none, or null to clear. */
  defaultSet: (body?: { default?: unknown; revision?: number }) => Promise<void>;
  last: (body?: unknown) => Promise<void>;
}

// #region FUNC_createOperations
/** @purpose Build the operation set once per surface over the driven ports. */
export function createOperations(ports: HostPorts): OperationSet {
  const env = createUseCaseEnv(ports);
  const ops: OperationSet = {
    ...createStateCases(env),
    ...createPreviewCases(env),
    ...createSectionCases(env),
    ...createProfileCases(env),
  };
  return ops;
}
// #endregion FUNC_createOperations
