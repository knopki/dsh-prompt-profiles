/** #region moduleContract
 * @purpose Let users choose a prompt profile before a session's first turn and
 *   manage profiles/sections from a settings page.
 * @scope Client UI only: conversation chip + settings.section page; NOT the
 *   host API implementation (lib/api.js owns the endpoints).
 * @invariants Chip renders only on a blank session with profiles present;
 *   every mutation goes through /__dsh-prompt-profiles endpoints with a
 *   debounced autosave (no Save button); pure ordering/slug/plan helpers are
 *   exported on the module object for the shim test.
 * @dependencies USES: same-origin /__dsh-prompt-profiles endpoints; React and
 *   @deepseek-ai/dsh-client-ui-primitives from the baseline module table.
 * @rationale No client build tooling exists, so the file is hand-written inside
 *   window.__ModuleLoader__.load and uses createElement only.
 */
window.__ModuleLoader__.load({
  id: "@knopki/dsh-prompt-profiles",
  factory(require) {
    const React = require("react");
    const {
      Menu, Modal, Tag, Toast, Tooltip, Input, SegmentedTabs, Checkbox, Button,
      IconChevronUpOutlineMedium, IconChevronDownOutlineMedium, IconChevronsUpDownOutlineRegular,
      IconChevronLeftOutlineMedium, IconEditOutlineRegular, IconCopyOutlineRegular,
      IconTrashOutlineRegular, IconPlusOutlineRegular, IconSearchOutlineRegular,
      IconWarningOutlineRegular,
    } = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;
    const NS = "promptProfiles";
    const messages = {
      // chip
      profile: "profile", none: "None", manage: "Manage profiles…",
      loadError: "Could not load prompt profiles.", saveError: "Could not save prompt profile.",
      selected: "Prompt profile selected", menuLabel: "Choose a prompt profile",
      manageUnavailable: "Settings cannot be opened from plugins in this DSH version — open Settings ▸ Prompt profiles manually.",
      // settings page
      nav: "Prompt profiles",
      tabProfiles: "Profiles", tabSections: "Sections", tabPreview: "Preview",
      back: "← back",
      searchPlaceholder: "Search…",
      newProfile: "+ New profile", newSection: "+ New section", addSection: "+ Add section",
      defaultForNewSessions: "Default for new sessions",
      builtIn: "built-in", builtInNote: "Some built-in sections may be absent in a given mode.",
      scopeLabel: "Scope", scopeInherit: "inherit", scopeMainOnly: "main-only", scopeSubagentsOnly: "subagents-only",
      sourceLabel: "source", sourceUser: "user", sourceBundle: "bundle",
      usedIn: "Used in", notUsed: "not used",
      openInSectionTab: "Open in Sections", remove: "Remove from profile",
      duplicate: "Duplicate", deleteLabel: "Delete", renameId: "Change id",
      titleLabel: "Title", bodyLabel: "Body", orderLabel: "Order",
      cancel: "Cancel", confirm: "Confirm",
      confirmDeleteProfile: "Delete this profile?", confirmDeleteSection: "Delete this section?",
      confirmRename: "Change section id?", renameNote: "References in all profiles will be updated.",
      newIdLabel: "New id", newTitleLabel: "Title",
      collision: "collides with a built-in order — effective +0.5",
      missingSection: "section not found", emptyBody: "empty body — not emitted",
      completeModeWarning: "Profile sections are discarded in complete modes:",
      conflictError: "Concurrent edit — state reloaded.",
      pickerTitle: "Add sections", pickerAdd: "Add", pickerEmpty: "No sections to add",
      previewEmpty: "Select a profile to preview.", noProfiles: "No profiles yet.", noSections: "No sections yet.",
      sectionsWord: "sections",
    };

    // #region HELPERS_pure Pure helpers (exported for the shim test).
    // #region FUNC_slugify
    /** @purpose Turn a free-form title into a config-safe slug (^[a-z0-9][a-z0-9-]*$). */
    function slugify(title, fallback = "item") {
      const slug = String(title ?? "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64)
        .replace(/-+$/g, "");
      return slug || fallback;
    }
    // #endregion FUNC_slugify

    // #region FUNC_uniqueSlug
    /** @purpose Make a slug unique among taken ids by appending -2, -3, … */
    function uniqueSlug(title, taken, fallback = "item") {
      // Duck-typed membership (has()) so cross-realm Sets/objects both work.
      const has = (value) => (taken && typeof taken.has === "function"
        ? taken.has(value)
        : Object.prototype.hasOwnProperty.call(taken ?? {}, value));
      const base = slugify(title, fallback);
      if (!has(base)) return base;
      for (let n = 2; ; n++) {
        const candidate = `${base}-${n}`;
        if (!has(candidate)) return candidate;
      }
    }
    // #endregion FUNC_uniqueSlug

    // #region FUNC_effectiveOrder
    /** @purpose Resolve the display/effective order: a built-in collision lands +0.5 after it. */
    function effectiveOrder(order, builtinOrders) {
      const values = builtinOrders instanceof Array ? builtinOrders : Object.values(builtinOrders ?? {});
      return values.includes(order) ? order + 0.5 : order;
    }
    // #endregion FUNC_effectiveOrder

    // #region FUNC_planMove
    /**
     * @purpose Compute the new order for moving one of OUR profile rows up/down.
     * @ensures Midpoint between the new neighbours; at the ends ±1; a value that
     *   would collide with a built-in order is shifted +0.5 (insertion after it).
     *   Returns the orders in the NEW arrangement (the moved element already at
     *   its new position), or null when the move is impossible.
     */
    function planMove(orders, index, direction, builtinOrders = []) {
      if (index < 0 || index >= orders.length) return null;
      const builtins = new Set(builtinOrders instanceof Array ? builtinOrders : Object.values(builtinOrders ?? {}));
      const out = orders.slice();
      let value;
      let target;
      if (direction === "up") {
        if (index === 0) return null;
        const lower = index >= 2 ? orders[index - 2] : null;
        const upper = orders[index - 1];
        value = lower === null ? upper - 1 : (lower + upper) / 2;
        target = index - 1;
      } else if (direction === "down") {
        if (index === orders.length - 1) return null;
        const lower = orders[index + 1];
        const upper = index + 2 < orders.length ? orders[index + 2] : null;
        value = upper === null ? lower + 1 : (lower + upper) / 2;
        target = index + 1;
      } else return null;
      if (builtins.has(value)) value = value + 0.5;
      out.splice(index, 1);
      out.splice(target, 0, value);
      return out;
    }
    // #endregion FUNC_planMove

    // #region FUNC_outlineRows
    /**
     * @purpose Merge a profile's section refs with the built-in mirror into an
     *   ordered outline: builtin rows (grey, read-only), ours rows (with
     *   effective order and collision flag), broken refs (missing/disabled).
     */
    function outlineRows(profile, sectionsById, builtinOrders) {
      const builtins = builtinOrders ?? {};
      const byId = sectionsById instanceof Map
        ? sectionsById
        : new Map(Object.entries(sectionsById ?? {}).map(([id, section]) => [id, section]));
      const rows = [];
      for (const [name, order] of Object.entries(builtins)) {
        rows.push({ kind: "builtin", name, order, key: `builtin:${name}` });
      }
      for (const ref of profile?.sections ?? []) {
        const section = byId.get(ref.id);
        if (!section) {
          rows.push({ kind: "broken", ref, key: `broken:${ref.id}` });
          continue;
        }
        const collides = effectiveOrder(ref.order, builtins) !== ref.order;
        rows.push({
          kind: "ours", ref, section, collides,
          displayOrder: effectiveOrder(ref.order, builtins),
          key: `ours:${ref.id}`,
        });
      }
      rows.sort((a, b) => {
        const oa = a.kind === "ours" ? a.displayOrder : a.order;
        const ob = b.kind === "ours" ? b.displayOrder : b.order;
        if (oa !== ob) return oa - ob;
        return a.kind === "builtin" ? -1 : 1;
      });
      return rows;
    }
    // #endregion FUNC_outlineRows

    // #region FUNC_filterSections
    /** @purpose Case-insensitive search over section title and id. */
    function filterSections(sections, query) {
      const q = String(query ?? "").trim().toLowerCase();
      if (!q) return sections.slice();
      return sections.filter((s) =>
        String(s.title ?? "").toLowerCase().includes(q) || String(s.id ?? "").toLowerCase().includes(q));
    }
    // #endregion FUNC_filterSections

    // #region FUNC_previewPlan
    /**
     * @purpose Map the host preview response into a render plan: consecutive
     *   built-in entries collapse into one placeholder group, ours sections
     *   keep order/title/text, skipped sections carry their reason.
     */
    function previewPlan(response) {
      const r = response ?? {};
      const items = Array.isArray(r.sections) ? r.sections : [];
      const plan = [];
      let builtins = [];
      const flush = () => {
        if (builtins.length) { plan.push({ kind: "builtins", names: builtins }); builtins = []; }
      };
      for (const item of items) {
        const isBuiltin = item && (item.builtin === true || item.kind === "builtin" || item.ours === false);
        if (isBuiltin) builtins.push(item.title ?? item.name ?? item.id ?? "?");
        else {
          flush();
          plan.push({ kind: "ours", id: item?.id, title: item?.title ?? item?.id ?? "?", order: item?.order, text: item?.text ?? item?.body ?? "" });
        }
      }
      flush();
      const skipped = (Array.isArray(r.skipped) ? r.skipped : [])
        .map((s) => ({ id: s?.id, title: s?.title ?? s?.id ?? "?", reason: s?.reason ?? "" }));
      return { plan, skipped };
    }
    // #endregion FUNC_previewPlan

    const helpers = {
      slugify, uniqueSlug, effectiveOrder, planMove, outlineRows, filterSections, previewPlan,
    };
    // #endregion HELPERS_pure

    // #region FUNC_request
    /** @purpose Same-origin JSON request; errors surface as ApiError(status, message). */
    class ApiError extends Error {
      constructor(status, message) { super(message); this.status = status; }
    }
    async function request(path, options) {
      const response = await fetch(`/__dsh-prompt-profiles/${path}`, {
        ...options,
        headers: { "content-type": "application/json", ...(options?.headers || {}) },
      });
      if (!response.ok) {
        let message = `Prompt profiles request failed (${response.status})`;
        try {
          const data = await response.json();
          if (data?.error?.message) message = data.error.message;
        } catch (_) { /* non-JSON error body — keep the status message */ }
        throw new ApiError(response.status, message);
      }
      return response.json();
    }
    const post = (body) => ({ method: "POST", body: JSON.stringify(body) });
    // #endregion FUNC_request

    // #region FUNC_clientApi
    /** @purpose Endpoint facade injected into the settings page component. */
    const clientApi = {
      loadState: () => request("state"),
      preview: (profileId) => request(`preview?profileId=${encodeURIComponent(profileId)}`),
      sectionCreate: (value) => request("section/create", post(value)),
      sectionUpdate: (rowId, ops) => request("section/update", post({ rowId, ops })),
      sectionDelete: (rowId) => request("section/delete", post({ rowId })),
      sectionRename: (rowId, id) => request("section/rename", post({ rowId, id })),
      profileCreate: (value) => request("profile/create", post(value)),
      profileUpdate: (rowId, ops) => request("profile/update", post({ rowId, ops })),
      profileDelete: (rowId) => request("profile/delete", post({ rowId })),
      setDefault: (value) => request("default", post({ default: value })),
    };
    // #endregion FUNC_clientApi

    // #region FUNC_useNotifier
    /**
     * @purpose Installed notification pattern (same as dsh-client-ui-workspace's
     *   RowActionToast): the owner keeps {seq, text}; the Toast COMPONENT is
     *   rendered keyed by seq and unmounts itself through onDone. Toast uses
     *   hooks internally, so calling it as a plain function is an invalid hook
     *   call — it must only ever be used as a createElement type.
     */
    function useNotifier() {
      const [notice, setNotice] = React.useState(null);
      const seq = React.useRef(0);
      const notify = React.useCallback((text) => {
        seq.current += 1;
        setNotice({ seq: seq.current, text: String(text ?? "") });
      }, []);
      const dismiss = React.useCallback(() => setNotice(null), []);
      const banner = notice && h(Toast, {
        key: `notice-${notice.seq}`,
        text: notice.text,
        icon: h(IconWarningOutlineRegular, {}),
        onDone: dismiss,
      });
      return { notify, dismiss, banner };
    }
    // #endregion FUNC_useNotifier

    // #region COMPONENT_PromptProfileChip
    /** @purpose Chooses a profile for the next new session in this workspace. */
    function PromptProfileChip(props) {
      const { sessionId, useSession, useWorkspaces, t, pick } = props;
      const session = useSession((s) => s);
      const workspaceId = useWorkspaces((s) => s.items.find((w) => w.sessionIds.includes(sessionId))?.workspaceId);
      const [state, setState] = React.useState(null);
      const [open, setOpen] = React.useState(false);
      const { notify, banner } = useNotifier();
      React.useEffect(() => {
        let live = true;
        request("state").then((value) => { if (live) setState(value); }).catch(() => {
          if (live) notify(t("loadError"));
        });
        return () => { live = false; };
      }, [t, notify]);
      if (!session || session.blank !== true || !state || !state.profiles?.length) return null;
      const last = workspaceId ? state.lastByWorkspace?.[workspaceId] : undefined;
      const selected = state.profiles.find((p) => p.id === last) || state.profiles.find((p) => p.id === state.default);
      const profiles = [...state.profiles].sort((a, b) => a.title.localeCompare(b.title));
      const choose = async (profileId) => {
        if (!workspaceId) return; // no workspace yet — nothing to persist `last` for
        const previous = state;
        setState({ ...state, lastByWorkspace: { ...state.lastByWorkspace, [workspaceId]: profileId || undefined } });
        setOpen(false);
        try {
          await pick(profileId, workspaceId);
          const refreshed = await request("state");
          setState(refreshed);
        } catch (_) {
          setState(previous);
          notify(t("saveError"));
        }
      };
      // Menu is owner-controlled: `open` + `anchor` (rendered in place) + data
      // rows via `items`; activation arrives on onSelect, dismissal on onClose.
      const items = [
        { id: "none", label: t("none") },
        ...profiles.map((profile) => ({ id: profile.id, label: profile.title })),
        { type: "separator", id: "sep-manage" },
        // No proven Settings-navigation API exists for plugins (see .spike/step6-settings-page.md).
        { id: "manage", label: t("manage"), disabled: true },
      ];
      return h("span", { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
        h(Menu, {
          open,
          onClose: () => setOpen(false),
          anchor: h(Tooltip, { label: t("menuLabel") },
            h("button", {
              type: "button", onClick: () => setOpen(!open),
              style: { color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-l2)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", padding: "4px 8px", cursor: "pointer" },
            }, `${t("profile")}: ${selected?.title || t("none")} ▾`)),
          items,
          selectedId: selected?.id || "none",
          onSelect: (id) => { if (id !== "manage") choose(id === "none" ? "" : id); },
        }),
        banner);
    }
    // #endregion COMPONENT_PromptProfileChip

    // #region SETTINGS_shared Shared hooks and small controls for the settings page.

    // #region FUNC_useProfilesState
    /** @purpose Load the host state document and expose reload/set for the page. */
    function useProfilesState(api, t, notify) {
      const [state, setState] = React.useState(null);
      const reload = React.useCallback(() => api.loadState()
        .then(setState)
        .catch(() => notify(t("loadError"))), [api, t, notify]);
      React.useEffect(() => { reload(); }, [reload]);
      return { state, setState, reload };
    }
    // #endregion FUNC_useProfilesState

    // #region FUNC_useAutosave
    /**
     * @purpose Debounced (~500 ms) autosave: whenever `value` changes (after the
     *   initial mount), schedule `save()`; a newer change cancels the pending one.
     */
    function useAutosave(value, save, delay = 500) {
      const latest = React.useRef(save);
      latest.current = save;
      const skipFirst = React.useRef(true);
      React.useEffect(() => {
        if (skipFirst.current) { skipFirst.current = false; return; }
        const timer = setTimeout(() => latest.current(), delay);
        return () => clearTimeout(timer);
      }, [value, delay]);
    }
    // #endregion FUNC_useAutosave

    // #region FUNC_runSave
    /**
     * @purpose Run one mutation; on 409 re-read the state and re-apply ONCE,
     *   then reload; any remaining failure becomes a notice via `notify`
     *   (the owner's useNotifier banner — Toast itself is component-only).
     */
    async function runSave(fn, reload, t, notify) {
      try {
        await fn();
        await reload();
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          try {
            await reload();
            await fn();
            await reload();
            return true;
          } catch (retryErr) {
            notify(`${t("conflictError")} ${retryErr instanceof Error ? retryErr.message : ""}`.trim());
            return false;
          }
        }
        notify(`${t("saveError")} ${err instanceof Error ? err.message : ""}`.trim());
        return false;
      }
    }
    // #endregion FUNC_runSave

    const iconButton = (label, Icon, onClick, extra) => h(Tooltip, { key: label + (extra?.keySuffix ?? "") , label },
      h("button", {
        type: "button", onClick,
        "aria-label": label,
        style: { background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--dsw-alias-label-primary)", display: "inline-flex" },
      }, h(Icon, { size: 14 })));

    const mutedStyle = { color: "var(--dsw-alias-label-secondary)" };
    const rowStyle = {
      display: "flex", alignItems: "center", gap: "8px", padding: "8px 4px",
      borderBottom: "1px solid var(--dsw-alias-border-l2)",
    };
    const fieldStyle = {
      color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-l2)",
      border: "1px solid var(--dsw-alias-border-l2)",
      borderRadius: "8px", padding: "6px 8px", fontFamily: "inherit", fontSize: "inherit",
    };

    // #region COMPONENT_ConfirmDialog
    /** @purpose Generic two-button confirmation modal for destructive actions. */
    function ConfirmDialog({ open, title, body, actionLabel, extraChildren, onCancel, onConfirm, t }) {
      return h(Modal, {
        open, onClose: onCancel, title, closeLabel: t("cancel"),
        footer: h(React.Fragment, null,
          h(Button, { variant: "outline", onClick: onCancel }, t("cancel")),
          h(Button, { variant: "primary", onClick: onConfirm }, actionLabel || t("confirm"))),
      }, h("p", { style: mutedStyle }, body), extraChildren);
    }
    // #endregion COMPONENT_ConfirmDialog
    // #endregion SETTINGS_shared

    // #region SETTINGS_ProfilesTab

    // #region COMPONENT_AddSectionPicker
    /**
     * @purpose Picker with search and multi-select that adds existing sections
     *   to a profile (the ONLY add path — cross-tab drag is impossible).
     */
    function AddSectionPicker({ sections, alreadyIn, onAdd, onClose, t }) {
      const [query, setQuery] = React.useState("");
      const [selected, setSelected] = React.useState(() => new Set());
      const candidates = filterSections(
        sections.filter((s) => !alreadyIn.has(s.id)), query);
      const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return h(Modal, { open: true, onClose: onClose, title: t("pickerTitle"), closeLabel: t("cancel") },
        h(Input, {
          icon: h(IconSearchOutlineRegular, { size: 14 }),
          placeholder: t("searchPlaceholder"), value: query,
          onChange: (e) => setQuery(e.target.value), style: { width: "100%", boxSizing: "border-box" },
        }),
        h("div", { style: { maxHeight: "320px", overflowY: "auto", marginTop: "8px" } },
          candidates.length === 0 && h("p", { style: mutedStyle }, t("pickerEmpty")),
          candidates.map((s) => h("label", { key: s.id, style: { ...rowStyle, cursor: "pointer" } },
            h(Checkbox, { checked: selected.has(s.id), onChange: () => toggle(s.id), label: s.title }),
            h("span", null, s.title),
            !String(s.body ?? "").trim() && h(Tag, null, t("emptyBody"))))),
        h("div", { style: { textAlign: "right", marginTop: "8px" } },
          h(Button, {
            variant: "primary", disabled: selected.size === 0,
            onClick: () => { onAdd([...selected]); onClose(); },
          }, `${t("pickerAdd")} (${selected.size})`)));
    }
    // #endregion COMPONENT_AddSectionPicker

    // #region COMPONENT_ProfileOutline
    /**
     * @purpose The profile composition form: outline of built-ins (read-only)
     *   and our rows with scope selector, ↑↓ reorder, numeric order field,
     *   add-section picker, and the complete-mode warning.
     */
    function ProfileOutline({ profile, state, api, reload, t, notify, onBack, onOpenSection }) {
      const [refs, setRefs] = React.useState(profile.sections ?? []);
      const [pickerOpen, setPickerOpen] = React.useState(false);
      const [scopeOpen, setScopeOpen] = React.useState(null);
      const sectionsById = new Map(state.sections.map((s) => [s.id, s]));
      const builtinOrders = state.builtinOrders ?? {};
      // Our rows in profile order (broken refs are not reorderable).
      const ours = refs.filter((ref) => sectionsById.has(ref.id));
      useAutosave(refs, () => {
        runSave(() => api.profileUpdate(profile.rowId, [{ op: "set", path: ["sections"], value: refs }]), reload, t, notify);
      });
      const writeRefs = (next) => setRefs(next);
      // #region BLOCK_move Reorder via ↑↓: midpoint between new neighbours (±1 + builtin-collision +0.5 at the ends).
      const move = (refId, direction) => {
        const index = ours.findIndex((ref) => ref.id === refId);
        if (index < 0) return;
        const next = planMove(ours.map((ref) => ref.order), index, direction, builtinOrders);
        if (!next) return;
        // planMove returns orders in the NEW arrangement — mirror that arrangement on the refs.
        const reordered = ours.slice();
        const [moved] = reordered.splice(index, 1);
        reordered.splice(direction === "up" ? index - 1 : index + 1, 0, moved);
        const byId = new Map(reordered.map((ref, i) => [ref.id, next[i]]));
        writeRefs(refs.map((ref) => (byId.has(ref.id) ? { ...ref, order: byId.get(ref.id) } : ref)));
      };
      // #endregion BLOCK_move
      const changeScope = (refId, scope) =>
        writeRefs(refs.map((ref) => (ref.id === refId ? { ...ref, scope } : ref)));
      const changeOrder = (refId, order) =>
        writeRefs(refs.map((ref) => (ref.id === refId ? { ...ref, order } : ref)));
      const removeRef = (refId) => writeRefs(refs.filter((ref) => ref.id !== refId));
      const addSections = (ids) => {
        const maxOrder = refs.reduce((max, ref) => Math.max(max, ref.order ?? 0), 0);
        writeRefs([...refs, ...ids.map((id, i) => ({ id, order: maxOrder + 100 * (i + 1), scope: "inherit" }))]);
      };
      const completeModes = (state.modes ?? []).filter((m) => m.complete === true);
      const rows = outlineRows({ ...profile, sections: refs }, sectionsById, builtinOrders);
      const scopeMenu = (ref) => {
        const scopeKeyOf = (scope) => scope === "main-only" ? "scopeMainOnly" : scope === "subagents-only" ? "scopeSubagentsOnly" : "scopeInherit";
        // Owner-controlled Menu: open + anchor (rendered in place) + data rows.
        return h(Menu, {
          open: scopeOpen === ref.id,
          onClose: () => setScopeOpen(null),
          anchor: h("button", {
            type: "button", onClick: () => setScopeOpen((openId) => (openId === ref.id ? null : ref.id)),
            style: { ...fieldStyle, cursor: "pointer" },
          }, `${t("scopeLabel")}: ${t(scopeKeyOf(ref.scope))} ▾`),
          items: ["inherit", "main-only", "subagents-only"].map((scope) => ({ id: scope, label: t(scopeKeyOf(scope)) })),
          selectedId: ref.scope ?? "inherit",
          onSelect: (scope) => { changeScope(ref.id, scope); setScopeOpen(null); },
        });
      };
      return h("div", null,
        h("div", { style: { ...rowStyle, borderBottom: "none" } },
          h("button", { type: "button", onClick: onBack, style: { ...fieldStyle, cursor: "pointer" } },
            h(IconChevronLeftOutlineMedium, { size: 14 }), ` ${t("back")}`),
          h("strong", { style: { flex: 1 } }, profile.title),
          h(Tag, null, `${refs.length} ${t("sectionsWord")}`)),
        h("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
        h("p", { style: { ...mutedStyle, fontSize: "12px" } }, t("builtInNote")),
        rows.map((row) => {
          if (row.kind === "builtin") {
            return h("div", { key: row.key, style: { ...rowStyle, opacity: 0.55 } },
              h("span", { style: { width: "64px", fontVariantNumeric: "tabular-nums" } }, String(row.order)),
              h("span", { flex: 1 }, row.name),
              h(Tag, null, t("builtIn")));
          }
          if (row.kind === "broken") {
            return h("div", { key: row.key, style: { ...rowStyle, color: "var(--dsw-alias-state-warning-primary, orange)" } },
              h("span", { style: { width: "64px", fontVariantNumeric: "tabular-nums" } }, String(row.ref.order)),
              h("span", { flex: 1 }, row.ref.id, " — ", t("missingSection")),
              iconButton(t("remove"), IconTrashOutlineRegular, () => removeRef(row.ref.id)));
          }
          const { ref, section, collides, displayOrder } = row;
          return h("div", { key: row.key, style: rowStyle },
            h("span", { style: mutedStyle, title: "reorder" }, h(IconChevronsUpDownOutlineRegular, { size: 14 })),
            h("span", {
              style: { width: "72px", fontVariantNumeric: "tabular-nums", color: collides ? "var(--dsw-alias-state-warning-primary, orange)" : "inherit" },
              title: collides ? t("collision") : undefined,
            }, collides ? `${ref.order} + 0.5` : String(displayOrder)),
            h("span", { flex: 1 }, section.title,
              !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody")),
              collides && h(Tag, null, "⚠ +0.5")),
            scopeMenu(ref),
            h("input", {
              type: "number", value: ref.order, "aria-label": t("orderLabel"),
              onChange: (e) => changeOrder(ref.id, Number(e.target.value)),
              style: { ...fieldStyle, width: "76px" },
            }),
            iconButton("↑", IconChevronUpOutlineMedium, () => move(ref.id, "up")),
            iconButton("↓", IconChevronDownOutlineMedium, () => move(ref.id, "down")),
            iconButton(t("openInSectionTab"), IconEditOutlineRegular, () => onOpenSection(ref.id)),
            iconButton(t("remove"), IconTrashOutlineRegular, () => removeRef(ref.id)));
        }),
        h("div", { style: { marginTop: "8px" } },
          h(Button, { variant: "outline", onClick: () => setPickerOpen(true) },
            h(IconPlusOutlineRegular, { size: 14 }), ` ${t("addSection")}`)),
        completeModes.length > 0 && h("p", {
          style: { marginTop: "12px", color: "var(--dsw-alias-state-warning-primary, orange)" },
        }, `⚠ ${t("completeModeWarning")} ${completeModes.map((m) => m.title ?? m.id).join(", ")}`),
        pickerOpen && h(AddSectionPicker, {
          sections: state.sections,
          alreadyIn: new Set(refs.map((ref) => ref.id)),
          onAdd: addSections, onClose: () => setPickerOpen(false), t,
        }));
    }
    // #endregion COMPONENT_ProfileOutline

    // #region COMPONENT_ProfilesTab
    /** @purpose Profile list, new-profile creation, default selector, drill-down. */
    function ProfilesTab({ state, api, reload, t, notify, drill, setDrill, onOpenSection }) {
      const [creating, setCreating] = React.useState(false);
      const [newTitle, setNewTitle] = React.useState("");
      const [confirming, setConfirming] = React.useState(null);
      const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
      if (drill) {
        const profile = profiles.find((p) => p.id === drill);
        if (profile) {
          return h(ProfileOutline, {
            profile, state, api, reload, t, notify,
            onBack: () => setDrill(null),
            onOpenSection,
          });
        }
        setDrill(null);
      }
      const createProfile = async () => {
        const title = newTitle.trim();
        setCreating(false); setNewTitle("");
        if (!title) return;
        const taken = new Set((state.profiles ?? []).map((p) => p.id));
        await runSave(() => api.profileCreate({
          id: uniqueSlug(title, taken, "profile"), title, sections: [],
        }), reload, t, notify);
      };
      const duplicateProfile = (profile) => runSave(() => {
        const taken = new Set((state.profiles ?? []).map((p) => p.id));
        return api.profileCreate({
          id: uniqueSlug(`${profile.title} copy`, taken, "profile"),
          title: `${profile.title} (copy)`,
          sections: profile.sections ?? [],
        });
      }, reload, t, notify);
      const deleteProfile = (profile) => runSave(() => api.profileDelete(profile.rowId), reload, t, notify)
        .then(() => { if (state.default === profile.id) { /* host resets silently (SPEC §7) */ } });
      const setDefault = (value) => runSave(() => api.setDefault(value), reload, t, notify);
      return h("div", null,
        profiles.length === 0 && h("p", { style: mutedStyle }, t("noProfiles")),
        profiles.map((profile) => h("div", {
          key: profile.id, style: { ...rowStyle, cursor: "pointer" },
          onClick: () => setDrill(profile.id),
        },
          h("span", { flex: 1 }, profile.title, state.default === profile.id && h(Tag, null, "★")),
          h("span", { style: mutedStyle }, `${(profile.sections ?? []).length} ${t("sectionsWord")}`),
          iconButton("edit", IconEditOutlineRegular, () => setDrill(profile.id)),
          iconButton(t("duplicate"), IconCopyOutlineRegular, (e) => { e.stopPropagation(); duplicateProfile(profile); }),
          iconButton(t("deleteLabel"), IconTrashOutlineRegular, (e) => { e.stopPropagation(); setConfirming(profile); }))),
        h("div", { style: { marginTop: "8px" } },
          h(Button, { variant: "outline", onClick: () => setCreating(true) }, t("newProfile"))),
        h("div", { style: { marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" } },
          h("span", { style: mutedStyle }, t("defaultForNewSessions")),
          h(DefaultMenu, { state, t, onPick: setDefault })),
        creating && h(ConfirmDialog, {
          open: true, title: t("newProfile"), actionLabel: t("confirm"),
          body: "", t,
          onCancel: () => setCreating(false), onConfirm: createProfile,
          extraChildren: h("input", {
            placeholder: t("newTitleLabel"), value: newTitle, autoFocus: true,
            onChange: (e) => setNewTitle(e.target.value), style: { ...fieldStyle, width: "100%", boxSizing: "border-box" } }),
        }),
        confirming && h(ConfirmDialog, {
          open: true, title: t("confirmDeleteProfile"), actionLabel: t("deleteLabel"),
          body: confirming.title, t,
          onCancel: () => setConfirming(null),
          onConfirm: () => { const profile = confirming; setConfirming(null); deleteProfile(profile); },
        }));
    }

    // #region COMPONENT_DefaultMenu
    /** @purpose «Default for new sessions» selector (none + sorted profiles). */
    function DefaultMenu({ state, t, onPick }) {
      const [open, setOpen] = React.useState(false);
      const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
      const selected = profiles.find((p) => p.id === state.default);
      // Owner-controlled Menu: open + anchor (rendered in place) + data rows.
      return h(Menu, {
        open,
        onClose: () => setOpen(false),
        anchor: h("button", {
          type: "button", onClick: () => setOpen(!open),
          style: { ...fieldStyle, cursor: "pointer" },
        }, `${selected?.title || t("none")} ▾`),
        items: [
          { id: "none", label: t("none") },
          ...profiles.map((p) => ({ id: p.id, label: p.title })),
        ],
        selectedId: state.default || "none",
        onSelect: (id) => { setOpen(false); onPick(id === "none" ? "" : id); },
      });
    }
    // #endregion COMPONENT_DefaultMenu
    // #endregion COMPONENT_ProfilesTab
    // #endregion SETTINGS_ProfilesTab

    // #region SETTINGS_SectionsTab

    // #region COMPONENT_SectionForm
    /**
     * @purpose Section editor: title + body (autosaved), read-only used-in with
     *   scopes, source, duplicate/delete/rename-id actions. No scope control
     *   (SPEC decision 26).
     */
    function SectionForm({ section, state, api, reload, t, notify, onBack }) {
      const [title, setTitle] = React.useState(section.title);
      const [body, setBody] = React.useState(section.body ?? "");
      const [confirmDelete, setConfirmDelete] = React.useState(false);
      const [renameValue, setRenameValue] = React.useState(section.id);
      const [confirmRename, setConfirmRename] = React.useState(false);
      useAutosave(title, () => {
        if (title !== section.title) {
          runSave(() => api.sectionUpdate(section.rowId, [{ op: "set", path: ["title"], value: title }]), reload, t, notify);
        }
      });
      useAutosave(body, () => {
        if (body !== (section.body ?? "")) {
          runSave(() => api.sectionUpdate(section.rowId, [{ op: "set", path: ["body"], value: body }]), reload, t, notify);
        }
      });
      const duplicate = () => runSave(() => {
        const taken = new Set((state.sections ?? []).map((s) => s.id));
        return api.sectionCreate({
          id: uniqueSlug(`${section.title} copy`, taken, "section"),
          title: `${section.title} (copy)`, body: section.body ?? "",
        });
      }, reload, t, notify);
      const remove = () => runSave(() => api.sectionDelete(section.rowId), reload, t, notify).then(() => onBack());
      const rename = () => {
        const id = slugify(renameValue, section.id);
        setConfirmRename(false);
        if (!id || id === section.id) return;
        runSave(() => api.sectionRename(section.rowId, id), reload, t, notify);
      };
      const usedIn = section.usedIn ?? [];
      const emptyBody = !String(body ?? "").trim();
      return h("div", null,
        h("div", { style: { ...rowStyle, borderBottom: "none" } },
          h("button", { type: "button", onClick: onBack, style: { ...fieldStyle, cursor: "pointer" } },
            h(IconChevronLeftOutlineMedium, { size: 14 }), ` ${t("back")}`),
          h("strong", { style: { flex: 1 } }, section.id),
          iconButton(t("duplicate"), IconCopyOutlineRegular, duplicate),
          iconButton(t("deleteLabel"), IconTrashOutlineRegular, () => setConfirmDelete(true))),
        h("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
        h("label", { style: { display: "block", marginBottom: "8px" } },
          t("titleLabel"), h("input", {
            value: title, onChange: (e) => setTitle(e.target.value), style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" },
          })),
        h("label", { style: { display: "block", marginBottom: "8px" } },
          t("bodyLabel"),
          h("textarea", {
            value: body, rows: 8, onChange: (e) => setBody(e.target.value),
            style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px", resize: "vertical" },
          }),
          emptyBody && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("emptyBody"))),
        h("div", { style: mutedStyle, marginBottom: "4px" },
          `${t("usedIn")}: `,
          usedIn.length === 0 ? t("notUsed")
            : usedIn.map((u) => h("span", { key: u.profileId, style: { marginRight: "8px" } },
              `${u.profileId} — ${t("scopeLabel")}: ${u.scope}`))),
        h("div", { style: mutedStyle, marginBottom: "8px" },
          `${t("sourceLabel")}: ${t(section.source === "bundle" ? "sourceBundle" : "sourceUser")}`),
        h("div", { style: { display: "flex", gap: "8px" } },
          h(Button, { variant: "outline", onClick: () => { setRenameValue(section.id); setConfirmRename(true); } }, t("renameId"))),
        confirmDelete && h(ConfirmDialog, {
          open: true, title: t("confirmDeleteSection"), actionLabel: t("deleteLabel"),
          body: section.title, t, onCancel: () => setConfirmDelete(false), onConfirm: () => { setConfirmDelete(false); remove(); },
        }),
        confirmRename && h(ConfirmDialog, {
          open: true, title: t("confirmRename"), actionLabel: t("confirm"),
          body: t("renameNote"), t, onCancel: () => setConfirmRename(false), onConfirm: rename,
          extraChildren: h("input", {
            value: renameValue, autoFocus: true,
            onChange: (e) => setRenameValue(e.target.value), style: { ...fieldStyle, width: "100%", boxSizing: "border-box" } }),
        }));
    }
    // #endregion COMPONENT_SectionForm

    // #region COMPONENT_SectionsTab
    /** @purpose Section list with search, used-in, source, and drill-down. */
    function SectionsTab({ state, api, reload, t, notify, drill, setDrill }) {
      const [query, setQuery] = React.useState("");
      const [creating, setCreating] = React.useState(false);
      const [newTitle, setNewTitle] = React.useState("");
      const sections = filterSections(state.sections ?? [], query);
      if (drill) {
        const live = (state.sections ?? []).find((s) => s.id === drill);
        if (live) return h(SectionForm, { section: live, state, api, reload, t, notify, onBack: () => setDrill(null) });
        setDrill(null);
      }
      const create = async () => {
        const title = newTitle.trim();
        setCreating(false); setNewTitle("");
        if (!title) return;
        const taken = new Set((state.sections ?? []).map((s) => s.id));
        await runSave(() => api.sectionCreate({ id: uniqueSlug(title, taken, "section"), title, body: "" }), reload, t, notify);
      };
      return h("div", null,
        h("div", { style: { display: "flex", gap: "8px", marginBottom: "8px" } },
          h(Input, {
            icon: h(IconSearchOutlineRegular, { size: 14 }),
            placeholder: t("searchPlaceholder"), value: query,
            onChange: (e) => setQuery(e.target.value), style: { flex: 1 },
          }),
          h(Button, { variant: "outline", onClick: () => setCreating(true) },
            h(IconPlusOutlineRegular, { size: 14 }), ` ${t("newSection")}`)),
        sections.length === 0 && h("p", { style: mutedStyle }, t("noSections")),
        sections.map((section) => h("div", {
          key: section.id, style: { ...rowStyle, cursor: "pointer" },
          onClick: () => setDrill(section.id),
        },
          h("span", { flex: 1 }, section.title,
            !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody"))),
          h("span", { style: mutedStyle },
            `${t("usedIn")}: `,
            (section.usedIn ?? []).length === 0 ? t("notUsed")
              : (section.usedIn ?? []).map((u) => u.profileId).join(", ")),
          h(Tag, null, `${t("sourceLabel")}: ${t(section.source === "bundle" ? "sourceBundle" : "sourceUser")}`))),
        creating && h(ConfirmDialog, {
          open: true, title: t("newSection"), actionLabel: t("confirm"), body: "", t,
          onCancel: () => setCreating(false), onConfirm: create,
          extraChildren: h("input", {
            placeholder: t("newTitleLabel"), value: newTitle, autoFocus: true,
            onChange: (e) => setNewTitle(e.target.value), style: { ...fieldStyle, width: "100%", boxSizing: "border-box" } }),
        }));
    }
    // #endregion COMPONENT_SectionsTab
    // #endregion SETTINGS_SectionsTab

    // #region SETTINGS_PreviewTab

    // #region COMPONENT_PreviewTab
    /**
     * @purpose Profile selector + host preview: our sections in final order,
     *   visually separated from built-in placeholder groups, skipped sections
     *   with reasons.
     */
    function PreviewTab({ state, api, t, notify }) {
      const [profileId, setProfileId] = React.useState(state.default || (state.profiles?.[0]?.id ?? ""));
      const [data, setData] = React.useState(null);
      React.useEffect(() => {
        let live = true;
        setData(null);
        if (!profileId) return undefined;
        api.preview(profileId)
          .then((value) => { if (live) setData(previewPlan(value)); })
          .catch(() => { if (live) notify(t("loadError")); });
        return () => { live = false; };
      }, [profileId, api, t, notify]);
      const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
      const selected = profiles.find((p) => p.id === profileId);
      return h("div", null,
        h("div", { style: { marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" } },
          h("span", { style: mutedStyle }, "Profile"),
          h(DefaultMenu, { state: { ...state, default: profileId }, t, onPick: setProfileId })),
        !profileId && h("p", { style: mutedStyle }, t("noProfiles")),
        profileId && !data && h("p", { style: mutedStyle }, "…"),
        data && data.plan.map((entry, i) => {
          if (entry.kind === "builtins") {
            return h("div", {
              key: `b${i}`,
              style: { ...mutedStyle, padding: "8px", margin: "8px 0", borderRadius: "8px", background: "var(--dsw-alias-bg-l2)" },
            }, `⟨${t("builtIn")}⟩  ${entry.names.join(", ")}`);
          }
          return h("div", {
            key: entry.id ?? `o${i}`,
            style: { padding: "8px 0", borderTop: "1px solid var(--dsw-alias-border-l2)" },
          },
            h("div", null,
              h("span", { style: { ...mutedStyle, width: "72px", display: "inline-block", fontVariantNumeric: "tabular-nums" } },
                entry.order !== undefined ? String(entry.order) : ""),
              h("strong", null, ` ${entry.title}`)),
            h("pre", {
              style: { margin: "4px 0 0 72px", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px" },
            }, entry.text));
        }),
        data && data.skipped.length > 0 && h("div", { style: { marginTop: "12px" } },
          data.skipped.map((s) => h("div", {
            key: s.id ?? s.title,
            style: { ...mutedStyle, fontStyle: "italic" },
          }, `⟨skipped⟩ ${s.title} — ${s.reason}`))),
        data && selected && data.plan.length === 0 && data.skipped.length === 0
          && h("p", { style: mutedStyle }, t("noSections")));
    }
    // #endregion COMPONENT_PreviewTab
    // #endregion SETTINGS_PreviewTab

    // #region COMPONENT_PromptProfilesSection
    /**
     * @purpose Settings page shell: three tabs with drill-down INSIDE a tab;
     *   back via ← back, Esc, or a repeated click on the active tab. No URL
     *   or deep-link state.
     */
    function PromptProfilesSection(props) {
      const { t, api } = props;
      const { notify, banner } = useNotifier();
      const { state, reload } = useProfilesState(api ?? clientApi, t, notify);
      const [tab, setTab] = React.useState("profiles");
      const [drill, setDrillState] = React.useState({ profiles: null, sections: null });
      const setDrill = (value) => setDrillState((prev) => ({ ...prev, [tab]: value }));
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === "Escape") setDrillState((prev) => ({ ...prev, [tab]: null }));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [tab]);
      const selectTab = (value) => {
        if (value === tab) setDrillState((prev) => ({ ...prev, [tab]: null }));
        else setTab(value);
      };
      const onOpenSection = (sectionId) => {
        setTab("sections");
        setDrillState((prev) => ({ ...prev, sections: sectionId }));
      };
      if (!state) return h("div", null, h("p", { style: mutedStyle }, "…"), banner);
      return h("div", null,
        h(SegmentedTabs, {
          items: [
            { value: "profiles", label: t("tabProfiles"), id: "pp-tab-profiles", panelId: "pp-tab-profiles-panel" },
            { value: "sections", label: t("tabSections"), id: "pp-tab-sections", panelId: "pp-tab-sections-panel" },
            { value: "preview", label: t("tabPreview"), id: "pp-tab-preview", panelId: "pp-tab-preview-panel" },
          ],
          value: tab, onChange: selectTab, label: t("nav"),
        }),
        h("div", { style: { marginTop: "12px" } },
          tab === "profiles" && h(ProfilesTab, {
            state, api: api ?? clientApi, reload, t, notify,
            drill: drill.profiles, setDrill, onOpenSection,
          }),
          tab === "sections" && h(SectionsTab, {
            state, api: api ?? clientApi, reload, t, notify,
            drill: drill.sections, setDrill,
          }),
          tab === "preview" && h(PreviewTab, { state, api: api ?? clientApi, t, notify })),
        banner);
    }
    // #endregion COMPONENT_PromptProfilesSection

    return {
      inject: [],
      helpers,
      apply(ctx) {
        ctx.locale.register(NS, { en: messages });
        ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
          name: "conversation.input.left",
          id: "prompt-profile",
          order: 10,
          locale: NS,
          inject: (sessionId) => ({
            pick: (profileId, workspaceId) => request("last", {
              method: "POST", body: JSON.stringify({ workspaceId, profileId }),
            }),
            sessionId,
          }),
        }, PromptProfileChip));
        ctx.slots.inject("settings.section", () => {
          const bound = typeof ctx.locale.bind === "function" ? ctx.locale.bind(NS) : null;
          return ctx.slots.register({
            name: "settings.section",
            id: "prompt-profiles",
            order: 25,
            label: () => (bound ? bound("nav") : messages.en.nav),
            locale: NS,
            inject: () => ({ api: clientApi }),
          }, PromptProfilesSection);
        });
      },
    };
  },
});
