/**
 * #region moduleContract
 * @modulecontract
 * @purpose Share payload helpers, row addressing, id sets, settings writes
 *   and the delete path across the per-domain use case modules.
 * @scope Shared helpers and port wiring only.
 *  - NOT: the operations themselves, the ports, the adapters, or any surface.
 * @invariants
 *  - Every payload is validated BEFORE anything is written.
 *  - Mutations run inside the bundle's one write lock.
 *  - Optional services resolve per call, so late services are picked up.
 * @keywords use cases, environment, validation, row addressing, write lock
 * #endregion moduleContract
 */

import {
  ConflictError,
  configIds,
  errorMessage,
  findRow,
  InvalidInputError,
  idPrefix,
  NotFoundError,
  normalizeExplicitRowId,
  PROFILE_PLUGIN_NAME,
  SECTION_ID_PREFIX,
  SECTION_PLUGIN_NAME,
  sectionRefTargets,
  takenIds,
  toPatchId,
  UnavailableError,
} from "../domain/index.ts";
import type { ConfigId, ProfileView, RowKind, SectionView } from "../domain/model.ts";
import type { HostPorts, LoaderRegistryPort, PatchPort, PatchRowRecord, SettingsOp, SettingsPort } from "./ports.ts";

/** One addressed registry row plus the normalized patch id every write uses. */
interface AddressedRow<Row> {
  row: Row;
  patchId: string;
}

/** Result of a delete path: `true` when the row could only be disabled. */
export interface DeleteResult {
  disabled: boolean;
}

/** Everything an operation use case module receives. */
export interface UseCaseEnv {
  ports: HostPorts;
  registry: LoaderRegistryPort;
  /**
   * The canonical patch row id for a registry view row; the view type allows a
   * null rowId for a row mounted outside a composition row.
   */
  patchIdOf(rowId: string | null): string;
  sectionTargets(): Map<string, ConfigId>;
  pendingSectionIds(): Set<string>;
  /** Every id a NEW row of `kind` must not reuse. */
  idsInUse(kind: RowKind): Set<string>;
  /** Registered config ids of `kind` an explicit new id must not duplicate. */
  registeredConfigIds(kind: RowKind): Set<string>;
  resolveSection(received: string): AddressedRow<SectionView>;
  resolveProfile(received: string): AddressedRow<ProfileView>;
  /** Can this profile still be chosen, per the authoritative patch? */
  profileSelectable(profileId: string): boolean;
  requireSettings(): SettingsPort;
  requireStorage(): { settings: SettingsPort; patch: PatchPort };
  settingsWrite(namespace: string, value: unknown, revision?: number): Promise<void>;
  mutateWithRetry(
    buildOps: (state: { revisionAvailable: boolean }) => SettingsOp[],
    options?: { clientRevision?: number },
  ): Promise<boolean>;
  deleteRow(patchId: string, name: string): Promise<DeleteResult>;
  mapDuplicate(error: unknown): never;
  /** Guarded settings revision (`undefined` when missing or unreadable). */
  revision(): number | undefined;
}

// #region FUNC_titleOrDefault
/** Title with a DEFAULT allowed (frozen contract): missing or blank uses the fallback. */
export function titleOrDefault(value: string | undefined, fallback: string): string {
  return value === undefined || value.trim() === "" ? fallback : value;
}
// #endregion FUNC_titleOrDefault

// #region FUNC_explicitRowId
/**
 * Normalize an EXPLICIT create/rename id to the full `prompt-<kind>-<token>`
 * form, or null when the payload named no id (the server mints one). A
 * malformed id is rejected here, before anything is written.
 */
export function explicitRowId(label: string, kind: RowKind, value: unknown): string | null {
  if (value === undefined) return null;
  const full = normalizeExplicitRowId(kind, value);
  if (full === null) {
    const prefix = idPrefix(kind);
    throw new InvalidInputError(
      `${label}: field "id" must be a bare token, ${prefix}<token>, or include:${prefix}<token>`,
    );
  }
  return full;
}
// #endregion FUNC_explicitRowId

// #region FUNC_createUseCaseEnv
/**
 * @purpose Build the shared use-case environment over one driven-ports bag.
 *   The environment is created once per surface; every optional service is
 *   still read per call, so a late-appearing service is honoured.
 */
export function createUseCaseEnv(ports: HostPorts): UseCaseEnv {
  const { registry } = ports;

  const patchPath = () => ports.patch()?.path();

  /**
   * The canonical patch row id for a registry rowId. PREFERRED: the true id
   * from `configEditor.entries()` (matched in EITHER form, since the fiber
   * entry id and the entry list may use different qualification), returned
   * normalized. DOCUMENTED FALLBACK: `toPatchId` — strip the leading
   * `<parent>:` prefix chain and keep the last segment.
   */
  const patchIdOf = (rowId: string | null): string =>
    ports.patch()?.patchIdOf(rowId as string) ?? toPatchId(rowId as string);

  /** Registered sections' id targets — see domain/refs.ts sectionRefTargets. */
  const sectionTargets = () => sectionRefTargets(registry.sections());

  /**
   * Section row ids already written to the profile patch but not yet
   * registered (HMR lag). Counts ONLY rows that really are OUR sections
   * (matching plugin `name`, present `config`, not disabled); an unreadable
   * patch degrades to registered-only.
   */
  const pendingSectionIds = (): Set<string> => {
    try {
      if (patchPath() === undefined) return new Set();
      return new Set(
        (ports.patch()?.rows() ?? [])
          .filter(
            (row): row is PatchRowRecord & { id: string } =>
              typeof row.id === "string" &&
              row.id.startsWith(SECTION_ID_PREFIX) &&
              row.name === SECTION_PLUGIN_NAME &&
              row.hasConfig &&
              !row.disabled,
          )
          .map((row) => row.id),
      );
    } catch {
      return new Set();
    }
  };

  /**
   * Can this profile still be chosen, per the AUTHORITATIVE patch rather than
   * the HMR-lagged registry? A row absent from this patch but registered from
   * an inherited/bundle layer stays valid; an unreadable patch trusts the registry.
   */
  const profileSelectable = (profileId: string): boolean => {
    const entry = registry.profiles().find((row) => row.id === profileId);
    if (!entry) return false;
    let rows: PatchRowRecord[] = [];
    try {
      const patch = ports.patch();
      if (!patch || patch.path() === undefined) return true; // no patch view: trust the registry
      rows = patch.rows();
    } catch {
      return true; // the registry already said yes and we cannot prove absence
    }
    const row = rows.find((candidate) => candidate.id === entry.rowId || candidate.configId === profileId);
    if (row) return row.name === PROFILE_PLUGIN_NAME && !row.disabled;
    return entry.source !== "user"; // absent: only a removed user row is definitively gone
  };

  /**
   * Registered config ids of `kind` (domain/ids.ts configIds). A NEW id must
   * never duplicate one of these; duplicate row ids already present in the
   * patch are caught by the writer's own duplicate guard on the FULL row id
   * (an id matching only a bundle row's id is an override, by design).
   */
  const registeredConfigIds = (kind: RowKind) =>
    configIds(kind === "section" ? registry.sections() : registry.profiles());

  /**
   * Resolve a row received in ANY of the accepted forms (qualified loader
   * entry rowId, unqualified patch row id, or the row's own config.id —
   * old-scheme rows keep bare config ids) via the one shared findRow matcher,
   * then derive the normalized patchId used for every settings/writer address.
   */
  const resolveSection = (received: string): AddressedRow<SectionView> => {
    const row = findRow(registry.sections(), received);
    if (!row)
      throw new NotFoundError(`section row "${received}" is not registered`, {
        reason: "row-not-found",
        params: { id: received },
      });
    return { row, patchId: patchIdOf(row.rowId) };
  };
  const resolveProfile = (received: string): AddressedRow<ProfileView> => {
    const row = findRow(registry.profiles(), received);
    if (!row)
      throw new NotFoundError(`profile row "${received}" is not registered`, {
        reason: "row-not-found",
        params: { id: received },
      });
    return { row, patchId: patchIdOf(row.rowId) };
  };

  /** Mutations that store volatile config require settings. */
  const requireSettings = (): SettingsPort => {
    const store = ports.settings();
    if (!store) throw new UnavailableError("profile storage service is unavailable");
    return store;
  };
  /** Row mutations additionally need the profile patch (configEditor). */
  const requireStorage = (): { settings: SettingsPort; patch: PatchPort } => {
    const store = ports.settings();
    const patch = ports.patch();
    if (!store || !patch) throw new UnavailableError("profile storage service is unavailable");
    return { settings: store, patch };
  };

  /** Known settings-layer failures map to clean statuses with their real message (never a bare 500). */
  const mapSettingsError = (error: unknown, revision: number | undefined): never => {
    if ((error as { code?: unknown } | null)?.code === "SETTINGS_CONFLICT") {
      throw new ConflictError(`configuration changed since read (expected revision ${revision})`, {
        reason: "conflict",
        params: { expected: revision },
      });
    }
    const message = errorMessage(error);
    if (/is not volatile/.test(message)) throw new InvalidInputError(message);
    if (/No configurable plugin entry/.test(message)) throw new NotFoundError(message);
    throw error;
  };

  /**
   * @purpose Replace settings writes wrapped in the bundle's shared write
   *   serializer, so operation updates never interleave with writer mutations
   *   in this process. Updates replace ONLY the volatile fields — `id` belongs
   *   to the inherited insert layer, and dsh-settings `replace(ns, value)`
   *   rejects every key that is not marked volatile in the row Config.
   */
  const settingsWrite = async (namespace: string, value: unknown, revision?: number): Promise<void> => {
    try {
      const store = requireSettings();
      await ports.lock.run(() => store.replace(namespace, value, typeof revision === "number" ? revision : undefined));
    } catch (error) {
      mapSettingsError(error, revision);
    }
  };

  /** Bounded attempts before a /last or cleanup gives up. */
  const MAX_MUTATE_ATTEMPTS = 5;
  /** The current `prompt-profiles` settings revision (undefined when unknown). */
  const currentRevision = (): number | undefined => {
    try {
      return ports.settings()?.revision();
    } catch {
      return undefined;
    }
  };
  // #region FUNC_mutateWithRetry
  /**
   * @purpose Atomic read-modify-write of the `prompt-profiles` config, correct
   *   WITH or WITHOUT a settings revision. Per-key ops never clobber a
   *   concurrent writer's keys; SETTINGS_CONFLICT re-reads and retries, and the
   *   cap yields a clean 409. Never nests the non-reentrant lock.
   */
  const mutateWithRetry = async (
    buildOps: (state: { revisionAvailable: boolean }) => SettingsOp[],
    { clientRevision }: { clientRevision?: number } = {},
  ): Promise<boolean> =>
    ports.lock.run(async () => {
      for (let attempt = 1; ; attempt += 1) {
        const expected = currentRevision();
        if (
          attempt === 1 &&
          typeof clientRevision === "number" &&
          typeof expected === "number" &&
          clientRevision !== expected
        ) {
          throw new ConflictError(`configuration changed since read (expected revision ${clientRevision})`, {
            reason: "conflict",
            params: { expected: clientRevision },
          });
        }
        const ops = buildOps({ revisionAvailable: typeof expected === "number" }); // read + decide INSIDE the lock
        if (ops.length === 0) return false;
        try {
          await requireSettings().mutate("prompt-profiles", ops, typeof expected === "number" ? expected : undefined);
          return true;
        } catch (error) {
          if ((error as { code?: unknown } | null)?.code !== "SETTINGS_CONFLICT") mapSettingsError(error, expected);
          if (attempt >= MAX_MUTATE_ATTEMPTS) {
            throw new ConflictError(`configuration kept changing; gave up after ${MAX_MUTATE_ATTEMPTS} attempts`, {
              reason: "conflict",
            });
          }
          // conflict: re-read the config/revision and retry
        }
      }
    });
  // #endregion FUNC_mutateWithRetry

  /** Every id a NEW row of `kind` must not reuse: registered rows plus every id already in the patch file. */
  const idsInUse = (kind: RowKind): Set<string> => {
    const rows = kind === "section" ? registry.sections() : registry.profiles();
    let fromPatch: string[] = [];
    try {
      const patch = ports.patch();
      if (patch && patch.path() !== undefined) fromPatch = [...patch.rowIds()];
    } catch {
      // patch unreadable: the insert port's own duplicate guard still protects us
    }
    return takenIds(rows, fromPatch);
  };

  // #region FUNC_deleteRow
  /**
   * @purpose Delete for both kinds: user-owned rows are removed,
   *   bundle-provided rows get a bare disabled override. `patchId` must
   *   already be NORMALIZED.
   */
  const deleteRow = async (patchId: string, name: string): Promise<DeleteResult> => {
    const patch = ports.patch();
    if (!patch) throw new UnavailableError("profile storage service is unavailable");
    const ownership = patch.ownership(patchId);
    if (ownership.source === "user") {
      const removed = await patch.remove(patchId);
      if (!removed)
        throw new NotFoundError(`row "${patchId}" not found in the profile patch`, {
          reason: "row-not-found",
          params: { id: patchId },
        });
      return { disabled: false };
    }
    await patch.disable(patchId, name);
    return { disabled: true };
  };
  // #endregion FUNC_deleteRow

  /** Map the patch port's duplicate guard («already exists») to a clean 400, never a 500. */
  const mapDuplicate = (error: unknown): never => {
    const message = (error as { message?: string } | null)?.message;
    if (/already exists/.test(message ?? "")) throw new InvalidInputError(message ?? "");
    throw error;
  };

  return {
    ports,
    registry,
    patchIdOf,
    sectionTargets,
    pendingSectionIds,
    idsInUse,
    registeredConfigIds,
    resolveSection,
    resolveProfile,
    profileSelectable,
    requireSettings,
    requireStorage,
    settingsWrite,
    mutateWithRetry,
    deleteRow,
    mapDuplicate,
    revision: currentRevision,
  };
}
// #endregion FUNC_createUseCaseEnv
