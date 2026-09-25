/**
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the whole prompt-profile use-case set behind ONE factory that
 *   takes the driven-ports bag, so every surface executes the same
 *   implementation and cannot drift apart.
 * @scope
 *  - The `OperationSet` shape, its composition from the per-domain use case
 *    modules, and the create-token source the tests drive.
 *  - NOT: how a surface reaches the ports (infra/index.ts), the domain rules
 *    (host/domain/) or the sealing step (assembler.ts).
 * @invariants
 *  - Results are plain JSON-safe objects (no class instances, no functions):
 *    surfaces serialize them verbatim.
 *  - Operation names are the method names every surface publishes.
 * @keywords operations, use cases, factory, barrel
 * #endregion moduleContract
 */
import { type DeleteResult } from "./env.ts";
import type { HostPorts } from "./ports.ts";
import { type PreviewRequest, type PreviewResult } from "./preview.ts";
import { type ProfileCreateResult, type ProfileUpdateResult } from "./profiles.ts";
import { type SectionCreateResult, type SectionRenameResult, type SectionUpdateResult } from "./sections.ts";
import { type StateResult } from "./state.ts";
/** The create-token source the tests drive to force id collisions. */
export { tokenSource } from "../domain/ids.ts";
export type { DeleteResult } from "./env.ts";
export type { PreviewRequest, PreviewResult } from "./preview.ts";
export type { ProfileCreateResult, ProfileUpdateResult } from "./profiles.ts";
export type { SectionCreateResult, SectionRenameResult, SectionUpdateResult } from "./sections.ts";
export type { ModeView, StateResult } from "./state.ts";
/**
 * THE operation set. Keys are the operation names every surface publishes as
 * its method names; each operation takes the raw JSON body its surface decoded
 * and returns a plain JSON result (`undefined` means "nothing to report").
 */
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
    defaultSet: (body?: {
        default?: unknown;
        revision?: number;
    }) => Promise<void>;
    last: (body?: unknown) => Promise<void>;
}
/**
 * @purpose Build the operation set once per surface over the driven ports.
 *   Optional services are read per call through the ports, so a
 *   late-appearing service is picked up and a missing one degrades per
 *   operation instead of blocking the mount.
 */
export declare function createOperations(ports: HostPorts): {
    ops: OperationSet;
};
