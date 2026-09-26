/** #region moduleContract
 * @modulecontract
 * @purpose The Sections tab of the settings page: the searchable section list
 *   with source/used-in badges and drill-down, plus the section editor — title
 *   and body with whole-object autosave, duplicate/delete through the
 *   optimistic mutation flow, and the Change-id dialog.
 * @scope
 *  - `SectionsTab` and `SectionForm`.
 *  - NOT: the Profiles/Preview tabs, the api facade or the host rules.
 * @invariants
 *  - An EMPTY title is never written (the server rejects it) and no write
 *    happens before the create-flow poll confirmed the row in /state.
 *  - A rename sends the typed id VERBATIM: the host owns prefixing, and it does
 *    NOT rewrite profile references — leftovers are reported, not fixed here.
 *  - A bundle-owned row's id cannot be changed: the host would disable rather
 *    than rewrite the bundle, so the action is blocked with a reason.
 * @keywords settings, sections tab, section form, rename id, autosave
 * #endregion moduleContract */

import {
  Button,
  IconChevronLeftOutlineMedium,
  IconCopyOutlineRegular,
  IconSearchOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  Tag,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { h, React } from "./element.ts";
import { type CreateFlow, findEntry, makeCreateFlow, makeMutationFlow, optimisticEntry } from "./flows.ts";
import {
  canSaveSection,
  dedupeRowPrefix,
  filterSections,
  idOf,
  refIdOf,
  renameNotice,
  scopeKeyOf,
  sourceKindOf,
  usedInProfileName,
} from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { RowEntry, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
import { runSave, useAutosave, useFocusSelect } from "./settings-shared.ts";
import {
  ConfirmDialog,
  fieldStyle,
  iconControl,
  inlineError,
  mutedStyle,
  rowStyle,
  type ValueChangeEvent,
} from "./ui.ts";

// #region TYPE_sectionsTab
export interface SectionsTabProps {
  state: StateDocument;
  api: RemoteApi;
  reload: () => Promise<void>;
  t: Translate;
  notify: (text: string) => void;
  drill: string | null;
  setDrill: (id: string | null) => void;
  setState: (value: StateDocument | null) => void;
  createFlow?: CreateFlow;
}

export interface SectionFormProps {
  section: RowEntry;
  state: StateDocument;
  api: RemoteApi;
  reload: () => Promise<void>;
  t: Translate;
  notify: (text: string) => void;
  onBack: () => void;
  onRenamed: (id: string) => void;
  onDrill: (id: string | null) => void;
  setState: (value: StateDocument | null) => void;
  autoFocusTitle: boolean;
}
// #endregion TYPE_sectionsTab

// #region COMPONENT_SectionForm
/**
 * @purpose Section editor: title + body (whole-object autosaved), an
 *   inline error line next to the fields, read-only used-in with scopes,
 *   source, duplicate/delete/rename-id actions. No scope control
 *   (SPEC decision 26). After creation the title is focused + selected.
 */
export function SectionForm({
  section,
  state,
  api,
  reload,
  t,
  notify,
  onBack,
  onRenamed,
  onDrill,
  setState,
  autoFocusTitle,
}: SectionFormProps): React.ReactElement {
  const [title, setTitle] = React.useState(section.title);
  const [body, setBody] = React.useState(section.body ?? "");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState<string | null>(refIdOf(section));
  const [confirmRename, setConfirmRename] = React.useState(false);
  const [error, setError] = React.useState("");
  const [mutating, setMutating] = React.useState(false);
  // Inline hint inside the Change-id dialog (empty value). Kept LAST so the
  // shim's stateQueue sequences stay positional.
  const [renameHint, setRenameHint] = React.useState("");
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  useFocusSelect(titleRef, autoFocusTitle === true);
  // Duplicate/delete/rename change which rows exist — and a rename does NOT
  // rewrite profile references (the profiles keep naming the old id): all
  // three go through the optimistic + poll mutation flow, never a bare
  // runSave-reload.
  const mutation = makeMutationFlow({
    api,
    t,
    notify,
    reload,
    getState: () => state,
    onState: setState,
    onPending: setMutating,
  });
  // The row is confirmed when /state already carries it — the create flow
  // only drills AFTER the poll, so this holds in every real mount; the gate
  // below is the belt-and-suspenders against any pre-poll write.
  const confirmed =
    Boolean(section?.patchId) &&
    (state?.sections ?? []).some((s) => s.patchId === section.patchId || idOf(s) === idOf(section));
  const titleOk = String(title ?? "").trim() !== "";
  const saveSection = (): Promise<boolean> => {
    // NEVER write an empty title (server 400 `value.title must be a
    // non-empty string`) and never write before the poll confirmed the row.
    if (!canSaveSection(title, confirmed)) return Promise.resolve(false);
    return runSave(() => api.sectionUpdate(section.patchId, { title, body }), reload, t, notify, setError);
  };
  const flushTitle = useAutosave(title, () => {
    if (title !== section.title) saveSection();
  });
  const flushBody = useAutosave(body, () => {
    if (body !== (section.body ?? "")) saveSection();
  });
  // Leaving the view must not drop an edit still inside the debounce window.
  const leave = () => {
    flushTitle();
    flushBody();
    onBack();
  };
  const duplicate = () =>
    mutation.run({
      mutate: () =>
        api.sectionCreate({
          title: `${section.title} ${t("copySuffix")}`,
          body: section.body ?? "",
        }),
      optimistic: (prior, created) => ({
        ...prior,
        sections: [...(prior?.sections ?? []), optimisticEntry("section", created)],
      }),
      agree: (polled, created) => Boolean(findEntry(polled, created?.configId ?? created?.patchId ?? created?.rowId)),
      // Creation-style navigation: open the COPY, not the row it came from.
      onDone: (polled, created) => {
        const copy = findEntry(polled, created?.configId ?? created?.patchId ?? created?.rowId);
        if (copy && onDrill) onDrill(idOf(copy));
      },
    });
  const remove = () =>
    mutation.run({
      mutate: () => api.sectionDelete(section.patchId),
      optimistic: (prior) => ({
        ...prior,
        sections: (prior?.sections ?? []).filter((s) => s.patchId !== section.patchId),
      }),
      agree: (polled) => !findEntry(polled, section.patchId),
      onDone: () => onBack(),
    });
  const rename = () => {
    // The field is pre-filled with the current configId and the typed value
    // is sent VERBATIM — the host owns prefixing (a bare token gets the
    // prompt-section- prefix server-side); the client never adds one.
    const typed = dedupeRowPrefix(String(renameValue ?? "").trim());
    const oldId = refIdOf(section) ?? "";
    if (!typed) {
      // Empty/whitespace: keep the dialog open, hint, send nothing.
      setRenameHint(t("renameEmpty"));
      return;
    }
    setRenameHint("");
    setConfirmRename(false);
    // Unchanged id: the host now answers 400, so treat Confirm as a no-op —
    // the dialog just closes, no request, no toast.
    if (typed === oldId) return;
    // The host canonicalizes the NEW id to the full `prompt-<kind>-<token>`
    // form, so the polled row carries THAT id: agree and drill on the stored
    // configId (the raw token never equals a configId, so comparing it to
    // refIdOf() would poll until timeout and drop the drill).
    const prefix = /^prompt-(?:section|profile)-/.exec(oldId)?.[0] ?? "";
    const newId = prefix && !typed.startsWith(prefix) ? `${prefix}${typed}` : typed;
    return mutation.run({
      mutate: () => api.sectionRename(section.patchId, typed),
      // The host canonicalizes the id and leaves profile references alone:
      // the polled row carries the new id, and the response lists any profile
      // still pointing at the old one — only a full /state reload reconciles
      // the outlines.
      agree: (polled) => (polled?.sections ?? []).some((s) => refIdOf(s) === newId),
      onDone: (polled, result) => {
        // Nothing stale → no extra notice (the rename is its own confirmation);
        // otherwise the leftover references are listed for a manual fix.
        const notice = renameNotice(result, t);
        if (notice && notify) notify(notice);
        const live = (polled?.sections ?? []).find((s) => refIdOf(s) === newId);
        if (onRenamed) onRenamed(live ? (refIdOf(live) ?? newId) : newId);
      },
    });
  };
  const usedIn = section.usedIn ?? [];
  const sourceKind = sourceKindOf(section.source);
  // A bundle-owned row lives in a lower layer we do not own. The host would
  // NOT edit the bundle: for such a row it DISABLES the old row in our
  // profile patch instead of removing it, and any rename leaves the profile
  // references naming the old id (reported as `affectedProfiles`). We
  // therefore disallow the id change as product policy — no bundle file is
  // ever written. `unknown` is treated like `user` (we cannot prove bundle
  // ownership).
  const bundleOwned = section.source === "bundle";
  const emptyBody = !String(body ?? "").trim();
  return h(
    "div",
    null,
    h(
      "div",
      { style: { ...rowStyle, borderBottom: "none" } },
      iconControl(t("back"), IconChevronLeftOutlineMedium, leave, { variant: "outline", tooltip: false, key: "back" }),
      h("strong", { style: { flex: 1 } }, idOf(section)),
      iconControl(t("duplicate"), IconCopyOutlineRegular, duplicate, { disabled: mutating }),
      iconControl(t("deleteLabel"), IconTrashOutlineRegular, () => setConfirmDelete(true), { disabled: mutating }),
    ),
    h("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
    inlineError(error),
    h(
      "label",
      { style: { display: "block", marginBottom: "8px" } },
      t("titleLabel"),
      h("input", {
        ref: titleRef,
        value: title,
        onChange: (e: ValueChangeEvent) => setTitle(e.target.value),
        onBlur: flushTitle,
        style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" },
      }),
      !titleOk && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("titleRequired")),
    ),
    h(
      "label",
      { style: { display: "block", marginBottom: "8px" } },
      t("bodyLabel"),
      h("textarea", {
        value: body,
        rows: 8,
        onChange: (e: ValueChangeEvent) => setBody(e.target.value),
        onBlur: flushBody,
        style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px", resize: "vertical" },
      }),
      emptyBody && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("emptyBody")),
    ),
    h(
      "div",
      { style: mutedStyle, marginBottom: "4px" },
      `${t("usedIn")}: `,
      usedIn.length === 0
        ? t("notUsed")
        : usedIn.map((u, index) =>
            h(
              "span",
              {
                // profileId alone repeats when one profile references the section
                // with two scopes — the index keeps every React key unique.
                key: `${u.profileId}:${u.scope}:${index}`,
                style: { marginRight: "8px" },
              },
              `${usedInProfileName(state, u.profileId)} — ${t("scopeLabel")}: ${t(scopeKeyOf(u.scope))}`,
            ),
          ),
    ),
    sourceKind &&
      h(
        "div",
        { style: mutedStyle, marginBottom: "8px" },
        `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}`,
      ),
    h(
      "div",
      { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
      h(
        Button,
        {
          variant: "outline",
          disabled: mutating || bundleOwned,
          // Both the button's own label and the confirmation carry the honest
          // warning that profile references are NOT rewritten any more.
          title: bundleOwned ? t("renameIdLocked") : t("renameNote"),
          onClick: () => {
            setRenameValue(refIdOf(section));
            setRenameHint("");
            setConfirmRename(true);
          },
        },
        t("renameId"),
      ),
      // Blocked with a plain-language reason instead of a silent dead button.
      bundleOwned && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("renameIdLocked")),
    ),
    confirmDelete &&
      h(ConfirmDialog, {
        open: true,
        title: t("confirmDeleteSection"),
        actionLabel: t("deleteLabel"),
        body: section.title,
        t,
        onCancel: () => setConfirmDelete(false),
        onConfirm: () => {
          setConfirmDelete(false);
          remove();
        },
      }),
    confirmRename &&
      h(ConfirmDialog, {
        open: true,
        title: t("confirmRename"),
        actionLabel: t("confirm"),
        body: t("renameNote"),
        t,
        onCancel: () => {
          setConfirmRename(false);
          setRenameHint("");
        },
        onConfirm: rename,
        extraChildren: h(
          React.Fragment,
          null,
          h("input", {
            value: renameValue,
            autoFocus: true,
            onChange: (e: ValueChangeEvent) => setRenameValue(e.target.value),
            style: { ...fieldStyle, width: "100%", boxSizing: "border-box" },
          }),
          // Soft hint: the id may not be blank (the dialog stays open).
          renameHint && h("p", { style: { ...mutedStyle, marginTop: "8px", marginBottom: 0 } }, renameHint),
        ),
      }),
  );
}
// #endregion COMPONENT_SectionForm

// #region COMPONENT_SectionsTab
/**
 * @purpose Section list with search, used-in, source, drill-down, and a
 *   modal-free create action (POST default title → poll /state → drill
 *   into the editor with the title focused and selected). The create
 *   button is disabled while a create is in flight.
 */
export function SectionsTab({
  state,
  api,
  reload,
  t,
  notify,
  drill,
  setDrill,
  setState,
  createFlow,
}: SectionsTabProps): React.ReactElement {
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [justCreated, setJustCreated] = React.useState<string | null>(null);
  const sections = filterSections(state.sections ?? [], query);
  const flow =
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
    });
  if (drill) {
    const live = (state.sections ?? []).find((s) => idOf(s) === drill);
    if (live)
      return h(SectionForm, {
        // Key on the row id: after DUPLICATE the drill moves to the copy and
        // React must remount the form with the copy's state, not reuse the
        // original's useState values.
        key: idOf(live),
        section: live,
        state,
        api,
        reload,
        t,
        notify,
        autoFocusTitle: justCreated === drill,
        onBack: () => {
          setJustCreated(null);
          setDrill(null);
        },
        // After a rename the drill must follow the NEW id or the form drops
        // back to the list (the old id no longer resolves).
        onRenamed: (id: string) => {
          setJustCreated(null);
          setDrill(id);
        },
        // Duplicate opens the copy (creation-style drill).
        onDrill: (id: string | null) => {
          setJustCreated(null);
          setDrill(id);
        },
        setState,
      });
    setDrill(null);
  }
  return h(
    "div",
    null,
    h(
      "div",
      { style: { display: "flex", gap: "8px", marginBottom: "8px" } },
      h(Input, {
        icon: h(IconSearchOutlineRegular, { size: 14 }),
        placeholder: t("searchPlaceholder"),
        value: query,
        onChange: (e: ValueChangeEvent) => setQuery(e.target.value),
        style: { flex: 1 },
      }),
      h(
        Button,
        {
          variant: "outline",
          disabled: creating,
          onClick: () => flow.create("section", { title: t("defaultSectionTitle"), body: "" }),
        },
        creating ? t("creating") : t("newSection"),
      ),
    ),
    sections.length === 0 && h("p", { style: mutedStyle }, t("noSections")),
    sections.map((section) => {
      const sourceKind = sourceKindOf(section.source);
      return h(
        "div",
        {
          key: idOf(section),
          style: { ...rowStyle, cursor: "pointer" },
          onClick: () => setDrill(idOf(section)),
        },
        h("span", { flex: 1 }, section.title, !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody"))),
        h(
          "span",
          { style: mutedStyle },
          `${t("usedIn")}: `,
          (section.usedIn ?? []).length === 0
            ? t("notUsed")
            : (section.usedIn ?? []).map((u) => usedInProfileName(state, u.profileId)).join(", "),
        ),
        // Source badge only for `bundle`/`unknown`; `user` rows stay calm.
        sourceKind &&
          h(Tag, null, `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}`),
      );
    }),
  );
}
// #endregion COMPONENT_SectionsTab
