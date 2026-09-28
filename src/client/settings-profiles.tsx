/** #region moduleContract
 * @modulecontract
 * @purpose The Profiles tab: profile list with drill-down, modal-free
 *   creation and the composed outline editor.
 * @invariants
 *  - A ref is addressed by occurrence (`row.seq`), never by section id.
 *  - Reorders write integer orders from `insertionOrders` and move the ref too.
 * #endregion moduleContract */

import {
  Button,
  Checkbox,
  IconChevronLeftOutlineMedium,
  IconChevronsUpDownOutlineRegular,
  IconCopyOutlineRegular,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  Menu,
  Modal,
  Tag,
} from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { type CreateFlow, findEntry, makeCreateFlow, makeMutationFlow, optimisticEntry } from "./flows.ts";
import {
  addSectionsToRefs,
  countLabel,
  filterSections,
  idOf,
  insertionOrders,
  normalizeSections,
  type OursOutlineRow,
  type OutlineRow,
  outlineRows,
  refIdOf,
  scopeKeyOf,
} from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { RowEntry, SectionRef, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
import { runSave, useAutosave, useFocusSelect } from "./settings-shared.ts";
import {
  ConfirmDialog,
  DefaultMenu,
  type DragEventLike,
  fieldStyle,
  iconControl,
  inlineError,
  type KeyboardEventLike,
  mutedStyle,
  rowStyle,
  type ValueChangeEvent,
} from "./ui.tsx";

export interface ProfilesTabProps {
  state: StateDocument;
  api: RemoteApi;
  reload: () => Promise<void>;
  t: Translate;
  notify: (text: string) => void;
  drill: string | null;
  setDrill: (id: string | null) => void;
  onOpenSection: (id: string) => void;
  setState: (value: StateDocument | null) => void;
  createFlow?: CreateFlow;
}

interface AddSectionPickerProps {
  sections: RowEntry[];
  alreadyIn: Set<string>;
  onAdd: (ids: string[]) => void;
  onClose: () => void;
  t: Translate;
}

interface ProfileOutlineProps {
  profile: RowEntry;
  state: StateDocument;
  api: RemoteApi;
  reload: () => Promise<void>;
  t: Translate;
  notify: (text: string) => void;
  onBack: () => void;
  onOpenSection: (id: string) => void;
  autoFocusTitle: boolean;
}

// #region COMPONENT_AddSectionPicker
/** @purpose Searchable multi-select picker that adds existing sections to a profile. */
export function AddSectionPicker({
  sections,
  alreadyIn,
  onAdd,
  onClose,
  t,
}: AddSectionPickerProps): React.ReactElement {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const candidates = filterSections(
    sections.filter((s) => !alreadyIn.has(refIdOf(s) ?? "")),
    query,
  );
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Modal open onClose={onClose} title={t("pickerTitle")} closeLabel={t("cancel")}>
      <Input
        icon={<IconSearchOutlineRegular size={14} />}
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(e: ValueChangeEvent) => setQuery(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      <div style={{ maxHeight: "320px", overflowY: "auto", marginTop: "8px" }}>
        {candidates.length === 0 && <p style={mutedStyle}>{t("pickerEmpty")}</p>}
        {candidates.map((s) => {
          const id = refIdOf(s) ?? "";
          return (
            <label key={id} style={{ ...rowStyle, cursor: "pointer" }}>
              <Checkbox checked={selected.has(id)} onChange={() => toggle(id)} label={s.title} />
              <span>{s.title}</span>
              {!String(s.body ?? "").trim() && <Tag>{t("emptyBody")}</Tag>}
            </label>
          );
        })}
      </div>
      <div style={{ textAlign: "right", marginTop: "8px" }}>
        <Button
          variant="primary"
          disabled={selected.size === 0}
          onClick={() => {
            onAdd([...selected]);
            onClose();
          }}
        >
          {`${t("pickerAdd")} (${selected.size})`}
        </Button>
      </div>
    </Modal>
  );
}
// #endregion COMPONENT_AddSectionPicker

// #region COMPONENT_ProfileOutline
/** @purpose The profile composition editor: title autosave, outline rows, add picker. */
export function ProfileOutline({
  profile,
  state,
  api,
  reload,
  t,
  notify,
  onBack,
  onOpenSection,
  autoFocusTitle,
}: ProfileOutlineProps): React.ReactElement {
  const [title, setTitle] = React.useState(profile.title ?? "");
  const [refs, setRefs] = React.useState<SectionRef[]>(normalizeSections(profile.sections));
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [scopeOpen, setScopeOpen] = React.useState<number | null>(null);
  const [error, setError] = React.useState("");
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  useFocusSelect(titleRef, autoFocusTitle);
  const sectionsById = new Map((state.sections ?? []).map((s) => [refIdOf(s) ?? "", s]));
  const builtinOrders = state.builtinOrders ?? {};
  // Our rows in profile order (broken refs are not reorderable).
  const ours = refs.filter((ref) => sectionsById.has(ref.id));
  const saveProfile = () =>
    runSave(
      () => api.profileUpdate(profile.patchId, { title, sections: normalizeSections(refs) }),
      reload,
      t,
      notify,
      setError,
    );
  const flushTitle = useAutosave(title, () => {
    if (title !== (profile.title ?? "")) saveProfile();
  });
  const flushRefs = useAutosave(refs, () => {
    if (JSON.stringify(refs) !== JSON.stringify(profile.sections ?? [])) saveProfile();
  });
  // Leaving the view (back / drill onto a section) must not drop a pending edit.
  const leave = () => {
    flushTitle();
    flushRefs();
    onBack();
  };
  const writeRefs = (next: SectionRef[]) => setRefs(next);
  // #region BLOCK_dragReorder Reorder by dragging a row onto an insertion gap.
  // Gaps include the ends and the neighbours of built-in rows; refs are
  // addressed by occurrence (`row.seq`) so duplicate refs stay independent.
  const [dragId, setDragId] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  // Remove-from-profile confirmation.
  const [confirmRemove, setConfirmRemove] = React.useState<number | null>(null);
  const dragStart = (refSeq: number) => (event: DragEventLike) => {
    setDragId(refSeq);
    if (event?.dataTransfer) {
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData?.("text/plain", String(refSeq));
      } catch (_) {
        /* dataTransfer can be absent/inert in tests */
      }
    }
  };
  const dragEnd = () => {
    setDragId(null);
    setDragOverIndex(null);
  };
  const droppedSeq = (event: DragEventLike): number | null => {
    let from: unknown = dragId;
    if (from === null || from === undefined || from === "") {
      if (typeof event?.dataTransfer?.getData === "function") {
        try {
          from = event.dataTransfer.getData("text/plain");
        } catch (_) {
          from = null;
        }
      }
    }
    if (from === null || from === undefined || from === "") return null;
    const seq = Number(from);
    return Number.isInteger(seq) && seq >= 0 ? seq : null;
  };
  // #endregion BLOCK_dragReorder
  // Every ref mutation addresses an OCCURRENCE index, so duplicate refs to
  // one section stay independent (own scope, order, removal, position).
  const patchRef = (refSeq: number, patch: Partial<SectionRef>) =>
    writeRefs(refs.map((ref, index) => (index === refSeq ? { ...ref, ...patch } : ref)));
  const changeScope = (refSeq: number, scope: string) => patchRef(refSeq, { scope });
  // The numeric field stays free-form: any FINITE number is accepted (drag
  // and the keyboard always produce integers, but a typed value is the
  // user's own); NaN/Infinity are ignored rather than persisted.
  const changeOrder = (refSeq: number, order: number) => {
    if (!Number.isFinite(order)) return;
    patchRef(refSeq, { order });
  };
  const removeRef = (refSeq: number) => writeRefs(refs.filter((_, index) => index !== refSeq));
  const addSections = (ids: string[]) => writeRefs(addSectionsToRefs(refs, ids));
  const completeModes = (state.modes ?? []).filter((m) => m.complete === true);
  const rows = outlineRows({ ...profile, sections: refs }, sectionsById, builtinOrders);
  const brokenRows = rows.filter((row) => row.kind === "broken");
  const scopeMenu = (row: OursOutlineRow) => {
    const { ref, seq } = row;
    const scopeLabel = `${t("scopeLabel")}: ${t(scopeKeyOf(ref.scope))}`;
    // Owner-controlled Menu: open + anchor (rendered in place) + data rows.
    // The anchor is the installed Button primitive, not a hand-styled button.
    // Open state is keyed by OCCURRENCE, so two refs to one section do not
    // share (or fight over) a single menu.
    return (
      <Menu
        open={scopeOpen === seq}
        onClose={() => setScopeOpen(null)}
        anchor={
          <Button
            variant="ghost"
            size="sm"
            aria-label={scopeLabel}
            onClick={() => setScopeOpen((openSeq) => (openSeq === seq ? null : seq))}
          >
            {scopeLabel}
          </Button>
        }
        items={["inherit", "main-only", "subagents-only"].map((scope) => ({
          id: scope,
          label: t(scopeKeyOf(scope)),
        }))}
        selectedId={ref.scope ?? "inherit"}
        onSelect={(scope: string) => {
          changeScope(seq, scope);
          setScopeOpen(null);
        }}
      />
    );
  };
  // Insertion boundaries: one per gap between/around the rendered rows. The
  // integer order attached to a boundary is the order of the row that ends up
  // directly above the drop, +1 (built-in orders included); broken refs carry
  // no order.
  const boundaryOrders = insertionOrders(rows);
  const dropAt = (index: number, fromSeq: number | null) => {
    const order = boundaryOrders[index];
    if (fromSeq === null || typeof order !== "number") return;
    // The two gaps that touch the dragged row itself are no-ops.
    const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === fromSeq);
    if (ownIndex < 0 || ownIndex === index || ownIndex === index - 1) return;
    const withOrder = refs.map((ref, i) => (i === fromSeq ? { ...ref, order } : ref));
    const moved = withOrder[fromSeq];
    const remaining = withOrder.filter((_, i) => i !== fromSeq);
    // Insert before the first ref at or below the drop gap, so every other
    // (especially broken) ref keeps its position; duplicates stay separate
    // because both sides are addressed by occurrence index.
    let insertAt = remaining.length;
    for (let r = index; r < rows.length; r++) {
      const row = rows[r];
      if ((row.kind === "ours" || row.kind === "broken") && row.seq !== fromSeq) {
        const pos = remaining.indexOf(withOrder[row.seq]);
        if (pos >= 0) {
          insertAt = pos;
          break;
        }
      }
    }
    remaining.splice(insertAt, 0, moved);
    writeRefs(remaining);
  };
  // Keyboard path for the drag grip: ↑/↓ move the row one rendered position,
  // reusing the same boundary/order math as a drop (gap above the previous
  // row / below the next one). The numeric input stays the direct-order path.
  const moveRefBy = (refSeq: number, direction: "up" | "down") => {
    const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === refSeq);
    if (ownIndex < 0) return;
    const boundary = direction === "up" ? ownIndex - 1 : ownIndex + 2;
    if (boundary < 0 || boundary > rows.length) return;
    dropAt(boundary, refSeq);
  };
  const dropZone = (index: number) => (
    <div
      key={`drop-${index}`}
      data-drop-index={index}
      style={{
        height: dragOverIndex === index ? "18px" : "6px",
        margin: "2px 0",
        borderRadius: "4px",
        background: dragOverIndex === index ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
      }}
      onDragOver={(event: DragEventLike) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (dragId !== null && dragOverIndex !== index) setDragOverIndex(index);
      }}
      onDrop={(event: DragEventLike) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        const from = droppedSeq(event);
        dragEnd();
        dropAt(index, from);
      }}
    />
  );
  const renderRow = (row: OutlineRow) => {
    if (row.kind === "builtin") {
      return (
        <div key={row.key} style={{ ...rowStyle, opacity: 0.55 }}>
          <span style={{ width: "64px", fontVariantNumeric: "tabular-nums" }}>{String(row.order)}</span>
          <span>{row.name}</span>
          <Tag>{t("builtIn")}</Tag>
        </div>
      );
    }
    if (row.kind === "broken") {
      return (
        <div key={row.key} style={{ ...rowStyle, color: "var(--dsw-alias-state-warning-primary, orange)" }}>
          <span style={{ width: "64px", fontVariantNumeric: "tabular-nums" }}>{String(row.ref.order)}</span>
          <span>
            {row.ref.id}
            {" — "}
            {t("missingSection")}
          </span>
          {iconControl(t("remove"), IconTrashOutlineRegular, () => setConfirmRemove(row.seq))}
        </div>
      );
    }
    const { ref, section, seq } = row;
    return (
      <div key={row.key} style={{ ...rowStyle, opacity: dragId === seq ? 0.5 : 1 }}>
        {/* Focusable grip: a real Button (keyboard + semantics), carrying the
            drag handlers and ↑/↓ reordering. */}
        {iconControl(t("dragHandle"), IconChevronsUpDownOutlineRegular, null, {
          props: {
            draggable: true,
            onDragStart: dragStart(seq),
            onDragEnd: dragEnd,
            onKeyDown: (event: KeyboardEventLike) => {
              if (event?.key === "ArrowUp") {
                event.preventDefault?.();
                moveRefBy(seq, "up");
              } else if (event?.key === "ArrowDown") {
                event.preventDefault?.();
                moveRefBy(seq, "down");
              }
            },
            "data-drag-handle": seq,
          },
        })}
        <input
          type="number"
          value={ref.order}
          aria-label={t("orderLabel")}
          onChange={(e: ValueChangeEvent) => changeOrder(seq, Number(e.target.value))}
          style={{ ...fieldStyle, width: "76px" }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          {section.title}
          {!String(section.body ?? "").trim() && <Tag>{t("emptyBody")}</Tag>}
        </span>
        {scopeMenu(row)}
        {iconControl(t("openInSectionTab"), IconEditOutlineRegular, () => onOpenSection(ref.id))}
        {iconControl(t("remove"), IconTrashOutlineRegular, () => setConfirmRemove(seq))}
      </div>
    );
  };
  const outlineRowsEls: React.ReactElement[] = [];
  rows.forEach((row, index) => {
    outlineRowsEls.push(dropZone(index));
    outlineRowsEls.push(renderRow(row));
  });
  outlineRowsEls.push(dropZone(rows.length));
  return (
    <div>
      <div style={{ ...rowStyle, borderBottom: "none" }}>
        {iconControl(t("back"), IconChevronLeftOutlineMedium, leave, {
          variant: "outline",
          tooltip: false,
          key: "back",
        })}
        <strong style={{ flex: 1 }}>{title || idOf(profile)}</strong>
        {/* Count only the resolvable sections; broken refs are called out. */}
        <Tag>
          {brokenRows.length
            ? `${countLabel(ours.length, t, "sections")} · ${countLabel(brokenRows.length, t, "broken")}`
            : countLabel(ours.length, t, "sections")}
        </Tag>
      </div>
      <hr style={{ border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" }} />
      {inlineError(error)}
      <label style={{ display: "block", marginBottom: "8px" }}>
        {t("titleLabel")}
        <input
          ref={titleRef}
          value={title}
          onChange={(e: ValueChangeEvent) => setTitle(e.target.value)}
          onBlur={flushTitle}
          style={{ ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" }}
        />
      </label>
      <p style={{ ...mutedStyle, fontSize: "12px" }}>{t("builtInNote")}</p>
      <div>{outlineRowsEls}</div>
      <div style={{ marginTop: "8px" }}>
        {/* Icon via the Button `icon` slot — the label is "Add section" with NO
            plus in the text (the leading + is the icon only). */}
        <Button variant="outline" icon={<IconPlusOutlineRegular size={14} />} onClick={() => setPickerOpen(true)}>
          {t("addSection")}
        </Button>
      </div>
      {completeModes.length > 0 && (
        <p style={{ marginTop: "12px", color: "var(--dsw-alias-state-warning-primary, orange)" }}>
          {`⚠ ${t("completeModeWarning")} ${completeModes.map((m) => m.title ?? m.id).join(", ")}`}
        </p>
      )}
      {/* Removing a ref is destructive too — same confirmation as the other
          destructive actions (no silent one-click removal). `confirmRemove` is
          the ref OCCURRENCE, so removing one of two duplicate refs keeps the other. */}
      {confirmRemove !== null && (
        <ConfirmDialog
          open
          title={t("confirmRemoveRef")}
          actionLabel={t("remove")}
          body={sectionsById.get(refs[confirmRemove]?.id ?? "")?.title || refs[confirmRemove]?.id || ""}
          t={t}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const seq = confirmRemove;
            setConfirmRemove(null);
            removeRef(seq);
          }}
        />
      )}
      {pickerOpen && (
        <AddSectionPicker
          sections={state.sections ?? []}
          alreadyIn={new Set(refs.map((ref) => ref.id))}
          onAdd={addSections}
          onClose={() => setPickerOpen(false)}
          t={t}
        />
      )}
    </div>
  );
}
// #endregion COMPONENT_ProfileOutline

// #region COMPONENT_ProfilesTab
/** @purpose Profile list with modal-free creation, default selector and drill-down. */
export function ProfilesTab({
  state,
  api,
  reload,
  t,
  notify,
  drill,
  setDrill,
  onOpenSection,
  setState,
  createFlow,
}: ProfilesTabProps): React.ReactElement {
  const [creating, setCreating] = React.useState(false);
  const [confirming, setConfirming] = React.useState<RowEntry | null>(null);
  const [justCreated, setJustCreated] = React.useState<string | null>(null);
  const [mutating, setMutating] = React.useState(false);
  const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  // Memoized on the current values so the flow never runs against stale
  // state, while the instance (and its busy guard) survives ordinary renders.
  const flow = React.useMemo(
    () =>
      createFlow ??
      makeCreateFlow({
        api,
        t,
        notify,
        reload,
        getState: () => state,
        onState: setState,
        onPending: setCreating,
        onDrill: (id) => {
          setJustCreated(id);
          setDrill(id);
        },
      }),
    [createFlow, api, t, notify, reload, state, setState, setDrill],
  );
  // Duplicate/delete create/remove rows: they only become visible after the
  // host recomposes and mounts them (HMR), so both go through the
  // optimistic-update-and-poll mutation flow.
  const mutation = React.useMemo(
    () =>
      makeMutationFlow({
        api,
        t,
        notify,
        reload,
        getState: () => state,
        onState: setState,
        onPending: setMutating,
      }),
    [api, t, notify, reload, state, setState],
  );
  const drilledProfile = drill ? (profiles.find((p) => idOf(p) === drill) ?? null) : null;
  React.useEffect(() => {
    if (drill && !drilledProfile) setDrill(null);
  }, [drill, drilledProfile, setDrill]);
  if (drilledProfile) {
    const profile = drilledProfile;
    return (
      <ProfileOutline
        profile={profile}
        state={state}
        api={api}
        reload={reload}
        t={t}
        notify={notify}
        autoFocusTitle={justCreated === drill}
        onBack={() => {
          setJustCreated(null);
          setDrill(null);
        }}
        onOpenSection={onOpenSection}
      />
    );
  }
  const duplicateProfile = (profile: RowEntry) =>
    mutation.run({
      mutate: () =>
        api.profileCreate({
          title: `${profile.title} ${t("copySuffix")}`,
          sections: normalizeSections(profile.sections),
        }),
      optimistic: (prior, created) => ({
        ...prior,
        profiles: [...(prior?.profiles ?? []), optimisticEntry("profile", created)],
      }),
      agree: (polled, created) => Boolean(findEntry(polled, created?.patchId ?? created?.rowId ?? created?.configId)),
    });
  const deleteProfile = (profile: RowEntry) =>
    mutation.run({
      mutate: () => api.profileDelete(profile.patchId),
      optimistic: (prior) => ({
        ...prior,
        profiles: (prior?.profiles ?? []).filter((p) => p.patchId !== profile.patchId),
      }),
      agree: (polled) => !findEntry(polled, profile.patchId),
    });
  const setDefault = (value: string) => runSave(() => api.setDefault(value), reload, t, notify);
  return (
    <div>
      {profiles.length === 0 && <p style={mutedStyle}>{t("noProfiles")}</p>}
      {profiles.map((profile) => (
        <div key={idOf(profile)} style={{ ...rowStyle, cursor: "pointer" }} onClick={() => setDrill(idOf(profile))}>
          <span>{profile.title}</span>
          <span style={mutedStyle}>{countLabel((profile.sections ?? []).length, t, "sections")}</span>
          {iconControl(t("editProfile"), IconEditOutlineRegular, () => setDrill(idOf(profile)))}
          {iconControl(
            t("duplicate"),
            IconCopyOutlineRegular,
            (e) => {
              e.stopPropagation();
              duplicateProfile(profile);
            },
            { disabled: mutating },
          )}
          {iconControl(
            t("deleteLabel"),
            IconTrashOutlineRegular,
            (e) => {
              e.stopPropagation();
              setConfirming(profile);
            },
            { disabled: mutating },
          )}
        </div>
      ))}
      <div style={{ marginTop: "8px" }}>
        <Button
          variant="outline"
          disabled={creating || mutating}
          onClick={() => flow.create("profile", { title: t("defaultProfileTitle"), sections: [] })}
        >
          {creating ? t("creating") : t("newProfile")}
        </Button>
      </div>
      <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={mutedStyle}>{t("defaultForNewSessions")}</span>
        <DefaultMenu state={state} t={t} onPick={setDefault} />
      </div>
      {confirming && (
        <ConfirmDialog
          open
          title={t("confirmDeleteProfile")}
          actionLabel={t("deleteLabel")}
          body={confirming.title}
          t={t}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const profile = confirming;
            setConfirming(null);
            deleteProfile(profile);
          }}
        />
      )}
    </div>
  );
}
// #endregion COMPONENT_ProfilesTab
