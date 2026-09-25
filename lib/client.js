/** #region moduleContract
 * @purpose Let users choose a prompt profile before a session's first turn and
 *   manage profiles/sections from a settings page.
 * @scope Client UI only: conversation chip + settings.section page; NOT the
 *   host API implementation (lib/api.js owns the endpoints).
 * @invariants Chip renders only on a blank session with profiles present;
 *   every mutation goes through /__dsh-prompt-profiles endpoints with a
 *   debounced autosave (no Save button); writes send the unqualified
 *   `patchId` in the `rowId` field with WHOLE-object `value` (no path ops);
 *   creation has NO modal — POST a default title, poll /state until the new
 *   patchId appears, then drill into the edit view with the title focused
 *   and selected. Pure helpers and the create/save flow factories are
 *   exported on the module object for the shim test.
 * @dependencies USES: same-origin /__dsh-prompt-profiles endpoints; React and
 *   @deepseek-ai/dsh-client-ui-primitives from the baseline module table.
 * @rationale No client build tooling exists, so the file is hand-written inside
 *   window.__ModuleLoader__.load and uses createElement only.
 * #endregion moduleContract
 */
window.__ModuleLoader__.load({
  id: "@knopki/dsh-prompt-profiles",
  factory(require) {
    const React = require("react");
    const {
      Menu, Modal, Tag, Toast, Tooltip, Input, SegmentedTabs, Checkbox, Button,
      IconChevronsUpDownOutlineRegular, IconChevronDownOutlineRegular,
      IconChevronLeftOutlineMedium, IconEditOutlineRegular, IconCopyOutlineRegular,
      IconTrashOutlineRegular, IconPlusOutlineRegular, IconSearchOutlineRegular,
      IconWarningOutlineRegular,
    } = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;
    const NS = "promptProfiles";
    const messages = {
      // chip
      none: "None",
      loadError: "Could not load prompt profiles.", saveError: "Could not save prompt profile.",
      selected: "Prompt profile selected", menuLabel: "Choose a prompt profile",
      // settings page
      nav: "Prompt profiles",
      tabProfiles: "Profiles", tabSections: "Sections", tabPreview: "Preview",
      back: "Back",
      searchPlaceholder: "Search…",
      newProfile: "+ New profile", newSection: "+ New section", addSection: "Add section",
      creating: "creating…",
      defaultSectionTitle: "New section", defaultProfileTitle: "New profile",
      createError: "Could not create:", createTimeout: "the new item did not appear in time — retry or reload the page.",
      defaultForNewSessions: "Default for new sessions",
      builtIn: "built-in", builtInNote: "Some built-in sections may be absent in a given mode.",
      scopeLabel: "Scope", scopeInherit: "inherit", scopeMainOnly: "main-only", scopeSubagentsOnly: "subagents-only",
      sourceLabel: "source", sourceUser: "user", sourceBundle: "bundle", sourceUnknown: "unknown",
      usedIn: "Used in", notUsed: "not used",
      openInSectionTab: "Open in Sections", remove: "Remove from profile",
      duplicate: "Duplicate", deleteLabel: "Delete", renameId: "Change id",
      titleLabel: "Title", bodyLabel: "Body", orderLabel: "Order",
      cancel: "Cancel", confirm: "Confirm",
      confirmDeleteProfile: "Delete this profile?", confirmDeleteSection: "Delete this section?",
      confirmRename: "Change section id?", renameNote: "References in all profiles will be updated.",
      newIdLabel: "New id",
      titleRequired: "Enter a name — a section needs a non-empty title before it can be saved.",
      dragHandle: "Drag to reorder",
      missingSection: "section not found", emptyBody: "empty body — not emitted",
      completeModeWarning: "Profile sections are discarded in complete modes:",
      conflictError: "Concurrent edit — state reloaded.",
      pickerTitle: "Add sections", pickerAdd: "Add", pickerEmpty: "No sections to add",
      previewEmpty: "Select a profile to preview.", noProfiles: "No profiles yet.", noSections: "No sections yet.",
      sectionsWord: "sections",
    };

    // #region HELPERS_pure Pure helpers (exported for the shim test).
    // #region FUNC_idOf
    /** @purpose Stable display/key id of a /state entry: configId first. */
    function idOf(entry) {
      return entry?.configId ?? entry?.patchId ?? entry?.id ?? null;
    }
    // #endregion FUNC_idOf

    // #region FUNC_refIdOf
    /**
     * @purpose The domain id of a /state entry for use in section refs: the
     *   configId VERBATIM (in this bundle configId IS the full row-id string,
     *   prefix included). The client must never prepend or strip a prefix —
     *   the historical bug was the client doubling the prefix
     *   ("prompt-section-prompt-section-…"), which the host rejects.
     */
    function refIdOf(entry) {
      return idOf(entry);
    }
    // #endregion FUNC_refIdOf

    // #region FUNC_dedupeRowPrefix
    /**
     * @purpose Collapse an accidentally DOUBLED row-id prefix to a single one
     *   ("prompt-section-prompt-section-x" → "prompt-section-x"). A single
     *   prefix and a bare id pass through untouched — refs carry configId
     *   verbatim, so this is a guard, not a transformation.
     */
    function dedupeRowPrefix(id) {
      return String(id ?? "").replace(
        /^(prompt-(?:section|profile)-)(?:prompt-(?:section|profile)-)+/,
        "$1",
      );
    }
    // #endregion FUNC_dedupeRowPrefix

    // #region FUNC_normalizeSections
    /**
     * @purpose Guard for a profile's section refs before they are sent: each
     *   ref keeps the configId it came with; only a doubled prefix (the old
     *   mangling bug) is collapsed.
     */
    function normalizeSections(refs) {
      return (refs ?? []).map((ref) => (ref ? { ...ref, id: dedupeRowPrefix(ref.id) } : ref));
    }
    // #endregion FUNC_normalizeSections

    // #region FUNC_addSectionsToRefs
    /**
     * @purpose Append picked section ids to a profile's refs: ids VERBATIM
     *   (they come from configId), orders stepped +100 past the current
     *   maximum, default scope inherit.
     */
    function addSectionsToRefs(refs, ids, step = 100) {
      const base = normalizeSections(refs);
      const maxOrder = base.reduce((max, ref) => Math.max(max, ref.order ?? 0), 0);
      return [...base, ...(ids ?? []).map((id, i) => ({
        id: dedupeRowPrefix(id), order: maxOrder + step * (i + 1), scope: "inherit",
      }))];
    }
    // #endregion FUNC_addSectionsToRefs

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

    // #region FUNC_insertionOrders
    /**
     * @purpose Orders for the drag-and-drop INSERTION BOUNDARIES of an outline:
     *   entry i is the gap before `rows[i]`, and the last entry is the gap after
     *   the final row — so built-in rows are valid neighbours/targets too.
     * @param {Array<{kind: string, order?: number}>} rows - the rendered outline.
     * @returns {number[]} one order per boundary: midpoint between the nearest
     *   ordered neighbours, ±1 at the edges (100 when nothing is ordered).
     * @invariants Built-in orders participate; broken refs carry no order; no
     *   +0.5 collision adjustment (equal orders are normal).
     */
    function insertionOrders(rows) {
      const orderOf = (row) => (row && row.kind !== "broken" && typeof row.order === "number" ? row.order : null);
      const list = rows ?? [];
      const out = [];
      for (let i = 0; i <= list.length; i++) {
        let lower = null;
        for (let j = i - 1; j >= 0; j--) { lower = orderOf(list[j]); if (lower !== null) break; }
        let upper = null;
        for (let j = i; j < list.length; j++) { upper = orderOf(list[j]); if (upper !== null) break; }
        out[i] = lower === null && upper === null ? 100
          : lower === null ? upper - 1
            : upper === null ? lower + 1
              : (lower + upper) / 2;
      }
      return out;
    }
    // #endregion FUNC_insertionOrders

    // #region FUNC_canSaveSection
    /**
     * @purpose Gate for the section autosave: only a row CONFIRMED in /state and
     *   carrying a NON-EMPTY (trimmed) title may be written. The empty-title
     *   request (`value.title must be a non-empty string`) and the pre-poll
     *   write are both blocked here.
     */
    function canSaveSection(title, confirmed) {
      return confirmed === true && String(title ?? "").trim() !== "";
    }
    // #endregion FUNC_canSaveSection

    // #region FUNC_sourceKindOf
    /**
     * @purpose Which `source` badge to render: only `bundle` and `unknown` are
     *   worth showing; `user` rows are the calm default and get no badge.
     * @returns {"bundle"|"unknown"|null}
     */
    function sourceKindOf(source) {
      if (source === "bundle") return "bundle";
      if (source === "unknown") return "unknown";
      return null;
    }
    // #endregion FUNC_sourceKindOf

    // #region FUNC_usedInProfileName
    /**
     * @purpose Resolve a used-in profile reference to its human title, falling
     *   back to the raw id when the profile is missing from /state.
     */
    function usedInProfileName(state, profileId) {
      const profile = (state?.profiles ?? []).find((p) => idOf(p) === profileId);
      return profile?.title || profileId;
    }
    // #endregion FUNC_usedInProfileName

    // #region FUNC_outlineRows
    /**
     * @purpose Merge a profile's section refs with the built-in mirror into an
     *   ordered outline: builtin rows (grey, read-only), ours rows, broken refs
     *   (missing/disabled). Orders are the PERSISTED ones — no +0.5 half-step is
     *   computed or displayed; an order equal to a built-in is normal.
     */
    function outlineRows(profile, sectionsById, builtinOrders) {
      const builtins = builtinOrders ?? {};
      // Duck-typed Map detection (get+has) so a Map from another realm works too
      // — `instanceof Map` is false across the vm boundary and Object.entries
      // on a Map yields [], which silently turned every ref into a broken row.
      const mapLike = !!sectionsById
        && typeof sectionsById.get === "function"
        && typeof sectionsById.has === "function";
      const byId = mapLike
        ? sectionsById
        : new Map(Object.entries(sectionsById ?? {}).map(([id, section]) => [id, section]));
      const rows = [];
      for (const [name, order] of Object.entries(builtins)) {
        rows.push({ kind: "builtin", name, order, key: `builtin:${name}` });
      }
      for (const rawRef of profile?.sections ?? []) {
        const ref = rawRef ? { ...rawRef, id: dedupeRowPrefix(rawRef.id) } : rawRef;
        const section = byId.get(ref.id);
        if (!section) {
          rows.push({ kind: "broken", ref, order: ref.order, key: `broken:${ref.id}` });
          continue;
        }
        rows.push({ kind: "ours", ref, section, order: ref.order, key: `ours:${ref.id}` });
      }
      rows.sort((a, b) => {
        // Broken refs take no part in the composition order — keep them after
        // the resolvable rows (they are actionable only via Remove).
        if (a.kind === "broken" || b.kind === "broken") {
          if (a.kind === b.kind) return 0;
          return a.kind === "broken" ? 1 : -1;
        }
        const oa = a.order ?? 0;
        const ob = b.order ?? 0;
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
        String(s.title ?? "").toLowerCase().includes(q) || String(idOf(s) ?? "").toLowerCase().includes(q));
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
      slugify, uniqueSlug, insertionOrders, outlineRows, filterSections, previewPlan, idOf,
      refIdOf, dedupeRowPrefix, normalizeSections, addSectionsToRefs,
      canSaveSection, sourceKindOf, usedInProfileName,
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

    // #region FUNC_errText
    /** @purpose Duck-typed error message (cross-realm-safe, unlike instanceof). */
    function errText(err) {
      return err && typeof err.message === "string" ? err.message : "";
    }
    // #endregion FUNC_errText

    // #region FUNC_clientApi
    /**
     * @purpose Endpoint facade over the frozen host contract. WRITES send the
     *   unqualified `patchId` in the `rowId` field; update/delete payloads
     *   carry WHOLE objects in `value` — no path ops. `rowId` from /state is
     *   display/debug only.
     */
    const makeApi = (req) => ({
      loadState: () => req("state"),
      preview: (profileId) => req(`preview?profileId=${encodeURIComponent(profileId)}`),
      sectionCreate: (value) => req("section/create", post(value)),
      sectionUpdate: (patchId, value) => req("section/update", post({ rowId: patchId, value })),
      sectionDelete: (patchId) => req("section/delete", post({ rowId: patchId })),
      sectionRename: (patchId, id) => req("section/rename", post({ rowId: patchId, id })),
      profileCreate: (value) => req("profile/create", post(value)),
      profileUpdate: (patchId, value) => req("profile/update", post({ rowId: patchId, value })),
      profileDelete: (patchId) => req("profile/delete", post({ rowId: patchId })),
      setDefault: (value) => req("default", post({ default: value })),
    });
    const clientApi = makeApi(request);
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

    // #region FLOW_create
    /**
     * @purpose Modal-free creation flow: POST a default title, insert the
     *   create response into the local state OPTIMISTICALLY (the host returns
     *   the unqualified id in BOTH rowId and patchId — the include: prefix
     *   only appears after HMR recomposition), then poll GET /state until
     *   the new patchId appears so the mounted row (source, usedIn, emits)
     *   replaces the optimistic one, then hand the fresh state + drill
     *   target back to the owner. While a create is in flight a second
     *   create() is rejected as busy — the owner also disables its button
     *   via onPending. Any failure becomes a notify with the SERVER message
     *   (the {error:{message}} text).
     */
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function findEntry(state, patchId) {
      for (const key of ["sections", "profiles"]) {
        const hit = (state?.[key] ?? []).find((entry) => entry
          && (entry.patchId === patchId || entry.configId === patchId || entry.rowId === patchId));
        if (hit) return hit;
      }
      return null;
    }

    /** @purpose Shape a create response like a /state entry (optimistic render). */
    function optimisticEntry(kind, created) {
      const id = created?.configId ?? created?.patchId ?? created?.rowId;
      if (kind === "section") {
        return {
          rowId: created?.rowId ?? id, patchId: created?.patchId ?? id, configId: id,
          title: created?.title ?? "", body: created?.body ?? "",
          usedIn: [], source: "user",
          emits: typeof created?.body === "string" && created.body.trim() !== "",
        };
      }
      return {
        rowId: created?.rowId ?? id, patchId: created?.patchId ?? id, configId: id,
        title: created?.title ?? "", sections: created?.sections ?? [],
        usedIn: [], source: "user",
      };
    }

    function makeCreateFlow({
      api, t, notify, reload, getState, onState, onDrill, onPending,
      pollInterval = 500, pollDeadline = 10000,
    }) {
      let busy = false;
      const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
      async function pollFor(patchId) {
        for (let attempt = 1; ; attempt++) {
          const state = await api.loadState();
          const found = findEntry(state, patchId);
          if (found) return { state, found };
          if (attempt >= maxTries) {
            throw new ApiError(504, `${t("createTimeout")}`);
          }
          await sleep(pollInterval);
        }
      }
      async function create(kind, value) {
        if (busy) return { ok: false, busy: true };
        busy = true;
        if (onPending) onPending(true);
        try {
          const created = kind === "section"
            ? await api.sectionCreate(value)
            : await api.profileCreate(value);
          // Optimistic insert: render the new row immediately from the create
          // response (host returns the unqualified id; source/usedIn unknown
          // until the row mounts).
          const prior = getState ? getState() : null;
          const listKey = kind === "section" ? "sections" : "profiles";
          if (onState && prior) {
            onState({ ...prior, [listKey]: [...(prior?.[listKey] ?? []), optimisticEntry(kind, created)] });
          }
          const { state, found } = await pollFor(created.patchId ?? created.rowId);
          if (onState) onState(state);
          if (onDrill) onDrill(idOf(found));
          return { ok: true, item: found, created };
        } catch (err) {
          notify(`${t("createError")} ${errText(err)}`.trim());
          if (reload) { try { await reload(); } catch (_) { /* keep the notify */ } }
          return { ok: false, error: err };
        } finally {
          busy = false;
          if (onPending) onPending(false);
        }
      }
    return { create, isBusy: () => busy };
    }
    // #endregion FLOW_create

    // #region FLOW_mutation
    /**
     * @purpose Optimistic-update-and-poll flow for any mutation that creates
     *   or removes a row (duplicate, delete, rename id). Rows in this bundle
     *   become visible only after the host recomposes and mounts them (HMR),
     *   so a plain reload right after the POST races the mount: apply the
     *   change to the local state immediately (optimistic(prior, result)),
     *   POST (mutate), then poll GET /state every pollInterval until the
     *   server document agrees (agree(state, result)), then hand the polled
     *   document back (onState) — the same pattern makeCreateFlow uses. On
     *   failure the PRIOR state is restored and the SERVER error text is
     *   notified. While in flight a second run() is rejected as busy — the
     *   owner disables its controls via onPending.
     */
    function makeMutationFlow({
      api, t, notify, reload, getState, onState, onPending,
      pollInterval = 500, pollDeadline = 10000,
    }) {
      let busy = false;
      const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
      async function run({ mutate, optimistic, agree, onDone }) {
        if (busy) return { ok: false, busy: true };
        busy = true;
        if (onPending) onPending(true);
        const prior = getState ? getState() : null;
        try {
          const result = await mutate();
          if (onState && prior && optimistic) onState(optimistic(prior, result));
          let state = prior;
          for (let attempt = 1; ; attempt++) {
            state = await api.loadState();
            if (!agree || agree(state, result)) break;
            if (attempt >= maxTries) throw new ApiError(504, `${t("createTimeout")}`);
            await sleep(pollInterval);
          }
          if (onState) onState(state);
          if (onDone) onDone(state, result);
          return { ok: true, result };
        } catch (err) {
          if (onState && prior) onState(prior); // restore the pre-click local state
          notify(`${t("createError")} ${errText(err)}`.trim());
          if (reload) { try { await reload(); } catch (_) { /* keep the notify */ } }
          return { ok: false, error: err };
        } finally {
          busy = false;
          if (onPending) onPending(false);
        }
      }
      return { run, isBusy: () => busy };
    }
    // #endregion FLOW_mutation

    // #region COMPONENT_PromptProfileChip
    /**
     * @purpose Chooses a prompt profile for the next new session. The control
     *   deliberately mirrors the installed composer controls
     *   (`conversation.input.permission` and the model selector): the same
     *   h28 / r24 capsule, `0 4px 0 8px` padding, 4px gap and 13/500/20 type.
     *   A third-party plugin cannot import their hashed CSS-module classes, so
     *   the installed values are replicated verbatim — never invented sizes.
     */
    const composerControlStyle = {
      minWidth: 0, maxWidth: "220px", height: "28px",
      color: "var(--dsw-alias-label-secondary)",
      cursor: "pointer", background: "transparent", border: "none",
      borderRadius: "24px", outline: "none",
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "0 4px 0 8px", fontSize: "13px", fontWeight: 500, lineHeight: "20px",
    };
    const chipLabelStyle = { textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden" };
    const chipChevronStyle = { color: "var(--dsw-alias-label-caption)", flex: "none", display: "inline-flex" };

    function PromptProfileChip(props) {
      const { sessionId, useSession, useWorkspaces, useSessions = () => undefined, t, pick } = props;
      const session = useSession((s) => s);
      const workspace = useWorkspaces((s) => s.items.find((w) => w.sessionIds.includes(sessionId)));
      const workspaceId = workspace?.workspaceId;
      // A blank Session may not be accounted to a Workspace yet; the host also
      // keys the choice by the Session cwd, so the choice still lands.
      const cwd = useSessions((s) => s?.byId?.[sessionId]?.cwd) ?? workspace?.path;
      const [state, setState] = React.useState(null);
      const [open, setOpen] = React.useState(false);
      const { notify, banner } = useNotifier();
      React.useEffect(() => {
        let live = true;
        request("state").then((value) => { if (live) setState(value); }).catch((err) => {
          if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"));
        });
        return () => { live = false; };
      }, [t, notify]);
      if (!session || session.blank !== true || !state || !state.profiles?.length) return null;
      const lastKey = workspaceId ?? cwd;
      const last = lastKey ? state.lastByWorkspace?.[lastKey] : undefined;
      const selected = state.profiles.find((p) => idOf(p) === last) || state.profiles.find((p) => idOf(p) === state.default);
      const profiles = [...state.profiles].sort((a, b) => a.title.localeCompare(b.title));
      const choose = async (profileId) => {
        const previous = state;
        if (lastKey) {
          setState({ ...state, lastByWorkspace: { ...state.lastByWorkspace, [lastKey]: profileId || undefined } });
        }
        setOpen(false);
        // ALWAYS deliver the choice: workspaceId when the Session is accounted
        // to a Workspace, otherwise the Session cwd (the agreed host contract).
        const choice = { profileId };
        if (workspaceId) choice.workspaceId = workspaceId;
        if (cwd) choice.cwd = cwd;
        try {
          await pick(choice);
          const refreshed = await request("state");
          setState(refreshed);
        } catch (err) {
          setState(previous);
          notify(errText(err) ? `${t("saveError")} ${errText(err)}`.trim() : t("saveError"));
        }
      };
      // Menu is owner-controlled: `open` + `anchor` (rendered in place) + data
      // rows via `items`; activation arrives on onSelect, dismissal on onClose.
      // Only `none` + the profiles — there is no Settings-navigation API for a
      // third-party plugin in this version, so no "Manage profiles…" entry.
      const items = [
        { id: "none", label: t("none") },
        ...profiles.map((profile) => ({ id: idOf(profile), label: profile.title })),
      ];
      return h("span", { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
        h(Menu, {
          open,
          onClose: () => setOpen(false),
          anchor: h(Tooltip, { label: t("menuLabel") },
            h("button", {
              type: "button", onClick: () => setOpen(!open),
              "aria-label": t("menuLabel"), title: t("menuLabel"),
              style: composerControlStyle,
            },
              h("span", { style: chipLabelStyle }, selected?.title || t("none")),
              h("span", { "aria-hidden": true, style: chipChevronStyle }, h(IconChevronDownOutlineRegular, { size: 14 })))),
          items,
          selectedId: selected ? idOf(selected) : "none",
          onSelect: (id) => choose(id === "none" ? "" : id),
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
        .catch((err) => notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"))), [api, t, notify]);
      React.useEffect(() => { reload(); }, [reload]);
      return { state, setState, reload };
    }
    // #endregion FUNC_useProfilesState

    // #region FUNC_useAutosave
    /**
     * @purpose Debounced (~1200 ms) autosave: whenever `value` changes (after the
     *   initial mount), schedule `save()`; a newer change cancels the pending one.
     *   The returned `flush()` saves a pending change immediately — wired to the
     *   field's blur and to the view's back/drill/tab transition, so an edit is
     *   never lost when it is still inside the debounce window. Unmount also
     *   flushes (tab switch, Esc). The skip-first rule plus the create-flow poll
     *   guarantee a freshly created item never autosaves before its row exists.
     */
    function useAutosave(value, save, delay = 1200) {
      const latest = React.useRef(save);
      latest.current = save;
      const skipFirst = React.useRef(true);
      const timer = React.useRef(null);
      const dirty = React.useRef(false);
      const flush = React.useCallback(() => {
        if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
        if (dirty.current) { dirty.current = false; latest.current(); }
      }, []);
      React.useEffect(() => {
        if (skipFirst.current) { skipFirst.current = false; return undefined; }
        dirty.current = true;
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          dirty.current = false;
          latest.current();
        }, delay);
        return () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } };
      }, [value, delay]);
      // Leaving the view (drill/tab/Esc unmounts the form) must not drop an edit.
      React.useEffect(() => () => flush(), [flush]);
      return flush;
    }
    // #endregion FUNC_useAutosave

    // #region FUNC_runSave
    /**
     * @purpose Run one mutation; on 409 re-read the state and re-apply ONCE,
     *   then reload; any remaining failure becomes a notice via `notify`
     *   (the owner's useNotifier banner — Toast itself is component-only) and,
     *   when cheap, an inline error line through `onError`.
     */
    async function runSave(fn, reload, t, notify, onError) {
      const fail = (prefix, err) => {
        const text = `${prefix} ${errText(err)}`.trim();
        notify(text);
        if (onError) onError(text);
      };
      try {
        await fn();
        await reload();
        if (onError) onError("");
        return true;
      } catch (err) {
        if (err && err.status === 409) {
          try {
            await reload();
            await fn();
            await reload();
            if (onError) onError("");
            return true;
          } catch (retryErr) {
            fail(t("conflictError"), retryErr);
            return false;
          }
        }
        fail(t("saveError"), err);
        return false;
      }
    }
    // #endregion FUNC_runSave

    // #region FUNC_useFocusSelect
    /** @purpose Focus the ref'd input and select its text (post-create UX). */
    function useFocusSelect(ref, active) {
      React.useEffect(() => {
        if (active && ref.current && typeof ref.current.focus === "function") {
          ref.current.focus();
          if (typeof ref.current.select === "function") ref.current.select();
        }
      }, [active, ref]);
    }
    // #endregion FUNC_useFocusSelect

    const errorStyle = { color: "var(--dsh-alias-state-error-primary, red)", margin: "8px 0" };
    const inlineError = (text) => (text ? h("div", { role: "alert", style: errorStyle }, text) : null);

    // Icon-only row actions use the installed Button primitive (ghost + sm,
    // 16px icon slot) instead of a hand-sized native button.
    const iconButton = (label, Icon, onClick, extra) => h(Tooltip, { key: label + (extra?.keySuffix ?? "") , label },
      h(Button, {
        variant: "ghost", size: "sm",
        icon: h(Icon, { size: 14 }),
        "aria-label": label, title: label,
        disabled: extra?.disabled === true,
        onClick,
      }));

    /**
     * @purpose Icon-only back affordance for the drill-down views. It reuses the
     *   installed Button primitive in the same `outline`/`sm` shape as the
     *   "Add section" button (no hand-rolled pixel box: the previous 18×18
     *   hardcode made it tiny); the icon and the aria-label carry the meaning.
     */
    const backButton = (onBack, t) => h(Button, {
      key: "back", variant: "outline", size: "sm",
      icon: h(IconChevronLeftOutlineMedium, { size: 14 }),
      "aria-label": t("back"), title: t("back"),
      onClick: onBack,
    });

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
        sections.filter((s) => !alreadyIn.has(refIdOf(s))), query);
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
          candidates.map((s) => h("label", { key: refIdOf(s), style: { ...rowStyle, cursor: "pointer" } },
            h(Checkbox, { checked: selected.has(refIdOf(s)), onChange: () => toggle(refIdOf(s)), label: s.title }),
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
     * @purpose The profile composition form: editable title (whole-object
     *   autosave), outline of built-ins (read-only) and our rows with scope
     *   selector, ↑↓ reorder, numeric order field, add-section picker, and
     *   the complete-mode warning.
     */
    function ProfileOutline({ profile, state, api, reload, t, notify, onBack, onOpenSection, autoFocusTitle }) {
      const [title, setTitle] = React.useState(profile.title ?? "");
      const [refs, setRefs] = React.useState(normalizeSections(profile.sections));
      const [pickerOpen, setPickerOpen] = React.useState(false);
      const [scopeOpen, setScopeOpen] = React.useState(null);
      const [error, setError] = React.useState("");
      const titleRef = React.useRef(null);
      useFocusSelect(titleRef, autoFocusTitle === true);
      const sectionsById = new Map((state.sections ?? []).map((s) => [refIdOf(s), s]));
      const builtinOrders = state.builtinOrders ?? {};
      // Our rows in profile order (broken refs are not reorderable).
      const ours = refs.filter((ref) => sectionsById.has(ref.id));
      const saveProfile = () => runSave(
        () => api.profileUpdate(profile.patchId, { title, sections: normalizeSections(refs) }),
        reload, t, notify, setError);
      const flushTitle = useAutosave(title, () => { if (title !== (profile.title ?? "")) saveProfile(); });
      const flushRefs = useAutosave(refs, () => {
        if (JSON.stringify(refs) !== JSON.stringify(profile.sections ?? [])) saveProfile();
      });
      // Leaving the view (back / drill onto a section) must not drop a pending edit.
      const leave = () => { flushTitle(); flushRefs(); onBack(); };
      const writeRefs = (next) => setRefs(next);
      // #region BLOCK_dragReorder HTML5 drag & drop between INSERTION BOUNDARIES.
      // Every gap between the rendered rows is a target — including the gaps
      // above the first and below the last and the gaps around built-in rows
      // (built-ins are never dragged, only aimed at). The new order comes from
      // the neighbouring orders (built-in orders included): midpoint between
      // them, ±1 at the edges. Equal orders are normal; no +0.5.
      const [dragId, setDragId] = React.useState(null);
      const [dragOverIndex, setDragOverIndex] = React.useState(null);
      const dragStart = (refId) => (event) => {
        setDragId(refId);
        if (event?.dataTransfer) {
          try {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", refId);
          } catch (_) { /* dataTransfer can be absent/inert in tests */ }
        }
      };
      const dragEnd = () => { setDragId(null); setDragOverIndex(null); };
      const droppedId = (event) => {
        let from = dragId;
        if (!from && typeof event?.dataTransfer?.getData === "function") {
          try { from = event.dataTransfer.getData("text/plain"); } catch (_) { from = null; }
        }
        return from;
      };
      // #endregion BLOCK_dragReorder
      const changeScope = (refId, scope) =>
        writeRefs(refs.map((ref) => (ref.id === refId ? { ...ref, scope } : ref)));
      const changeOrder = (refId, order) =>
        writeRefs(refs.map((ref) => (ref.id === refId ? { ...ref, order } : ref)));
      const removeRef = (refId) => writeRefs(refs.filter((ref) => ref.id !== refId));
      const addSections = (ids) => writeRefs(addSectionsToRefs(refs, ids));
      const completeModes = (state.modes ?? []).filter((m) => m.complete === true);
      const rows = outlineRows({ ...profile, sections: refs }, sectionsById, builtinOrders);
      const scopeMenu = (ref) => {
        const scopeKeyOf = (scope) => scope === "main-only" ? "scopeMainOnly" : scope === "subagents-only" ? "scopeSubagentsOnly" : "scopeInherit";
        const scopeLabel = `${t("scopeLabel")}: ${t(scopeKeyOf(ref.scope))}`;
        // Owner-controlled Menu: open + anchor (rendered in place) + data rows.
        // The anchor is the installed Button primitive, not a hand-styled button.
        return h(Menu, {
          open: scopeOpen === ref.id,
          onClose: () => setScopeOpen(null),
          anchor: h(Button, {
            variant: "ghost", size: "sm",
            "aria-label": scopeLabel,
            onClick: () => setScopeOpen((openId) => (openId === ref.id ? null : ref.id)),
          }, scopeLabel),
          items: ["inherit", "main-only", "subagents-only"].map((scope) => ({ id: scope, label: t(scopeKeyOf(scope)) })),
          selectedId: ref.scope ?? "inherit",
          onSelect: (scope) => { changeScope(ref.id, scope); setScopeOpen(null); },
        });
      };
      // Insertion boundaries: one per gap between/around the rendered rows. The
      // order attached to a boundary comes from its nearest ORDERED neighbours
      // (built-in orders included); broken refs carry no order.
      const boundaryOrders = insertionOrders(rows);
      const dropAt = (index, fromId) => {
        const order = boundaryOrders[index];
        if (!fromId || typeof order !== "number") return;
        // The two gaps that touch the dragged row itself are no-ops.
        const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.ref.id === fromId);
        if (ownIndex === index || ownIndex === index - 1) return;
        writeRefs(refs.map((ref) => (ref.id === fromId ? { ...ref, order } : ref)));
      };
      const dropZone = (index) => h("div", {
        key: `drop-${index}`,
        "data-drop-index": index,
        style: {
          height: dragOverIndex === index ? "18px" : "6px",
          margin: "2px 0", borderRadius: "4px",
          background: dragOverIndex === index ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
        },
        onDragOver: (event) => {
          if (event && typeof event.preventDefault === "function") event.preventDefault();
          if (dragId && dragOverIndex !== index) setDragOverIndex(index);
        },
        onDrop: (event) => {
          if (event && typeof event.preventDefault === "function") event.preventDefault();
          const from = droppedId(event);
          dragEnd();
          dropAt(index, from);
        },
      });
      const renderRow = (row) => {
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
        const { ref, section } = row;
        return h("div", { key: row.key, style: { ...rowStyle, opacity: dragId === ref.id ? 0.5 : 1 } },
          h("span", {
            draggable: true,
            title: t("dragHandle"),
            "aria-label": t("dragHandle"),
            onDragStart: dragStart(ref.id),
            onDragEnd: dragEnd,
            style: { ...mutedStyle, cursor: "grab", display: "inline-flex", alignItems: "center", flex: "0 0 auto" },
          }, h(IconChevronsUpDownOutlineRegular, { size: 14 })),
          h("input", {
            type: "number", value: ref.order, "aria-label": t("orderLabel"),
            onChange: (e) => changeOrder(ref.id, Number(e.target.value)),
            style: { ...fieldStyle, width: "76px" },
          }),
          h("span", { style: { flex: 1, minWidth: 0 } }, section.title,
            !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody"))),
          scopeMenu(ref),
          iconButton(t("openInSectionTab"), IconEditOutlineRegular, () => onOpenSection(ref.id)),
          iconButton(t("remove"), IconTrashOutlineRegular, () => removeRef(ref.id)));
      };
      const outlineRowsEls = [];
      rows.forEach((row, index) => {
        outlineRowsEls.push(dropZone(index));
        outlineRowsEls.push(renderRow(row));
      });
      outlineRowsEls.push(dropZone(rows.length));
      return h("div", null,
        h("div", { style: { ...rowStyle, borderBottom: "none" } },
          backButton(leave, t),
          h("strong", { style: { flex: 1 } }, title || idOf(profile)),
          h(Tag, null, `${refs.length} ${t("sectionsWord")}`)),
        h("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
        inlineError(error),
        h("label", { style: { display: "block", marginBottom: "8px" } },
          t("titleLabel"), h("input", {
            ref: titleRef, value: title,
            onChange: (e) => setTitle(e.target.value),
            style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" },
          })),
        h("p", { style: { ...mutedStyle, fontSize: "12px" } }, t("builtInNote")),
        h("div", null, outlineRowsEls),
        h("div", { style: { marginTop: "8px" } },
          // Icon via the Button `icon` slot — the label is "Add section" with NO
          // plus in the text (the leading + is the icon only).
          h(Button, {
            variant: "outline", icon: h(IconPlusOutlineRegular, { size: 14 }),
            onClick: () => setPickerOpen(true),
          }, t("addSection"))),
        completeModes.length > 0 && h("p", {
          style: { marginTop: "12px", color: "var(--dsw-alias-state-warning-primary, orange)" },
        }, `⚠ ${t("completeModeWarning")} ${completeModes.map((m) => m.title ?? m.id).join(", ")}`),
        pickerOpen && h(AddSectionPicker, {
          sections: state.sections ?? [],
          alreadyIn: new Set(refs.map((ref) => ref.id)),
          onAdd: addSections, onClose: () => setPickerOpen(false), t,
        }));
    }
    // #endregion COMPONENT_ProfileOutline

    // #region COMPONENT_ProfilesTab
    /**
     * @purpose Profile list, modal-free new-profile creation (POST a default
     *   title → poll → drill into the outline with the title focused and
     *   selected), default selector, drill-down.
     */
    function ProfilesTab({ state, api, reload, t, notify, drill, setDrill, onOpenSection, setState, createFlow }) {
      const [creating, setCreating] = React.useState(false);
      const [confirming, setConfirming] = React.useState(null);
      const [justCreated, setJustCreated] = React.useState(null);
      const [mutating, setMutating] = React.useState(false);
      const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
      const flow = createFlow ?? makeCreateFlow({
        api, t, notify, reload,
        getState: () => state,
        onState: setState,
        onPending: setCreating,
        onDrill: (id) => { setJustCreated(id); setDrill(id); },
      });
      // Duplicate/delete create/remove rows: they only become visible after the
      // host recomposes and mounts them (HMR), so both go through the
      // optimistic-update-and-poll mutation flow.
      const mutation = makeMutationFlow({
        api, t, notify, reload,
        getState: () => state,
        onState: setState,
        onPending: setMutating,
      });
      if (drill) {
        const profile = profiles.find((p) => idOf(p) === drill);
        if (profile) {
          return h(ProfileOutline, {
            profile, state, api, reload, t, notify,
            autoFocusTitle: justCreated === drill,
            onBack: () => { setJustCreated(null); setDrill(null); },
            onOpenSection,
          });
        }
        setDrill(null);
      }
      const duplicateProfile = (profile) => mutation.run({
        mutate: () => api.profileCreate({
          title: `${profile.title} (copy)`,
          sections: normalizeSections(profile.sections),
        }),
        optimistic: (prior, created) => ({
          ...prior,
          profiles: [...(prior?.profiles ?? []), optimisticEntry("profile", created)],
        }),
        agree: (polled, created) => Boolean(findEntry(polled, created?.patchId ?? created?.rowId ?? created?.configId)),
      });
      const deleteProfile = (profile) => mutation.run({
        mutate: () => api.profileDelete(profile.patchId),
        optimistic: (prior) => ({
          ...prior,
          profiles: (prior?.profiles ?? []).filter((p) => p.patchId !== profile.patchId),
        }),
        agree: (polled) => !findEntry(polled, profile.patchId),
      });
      const setDefault = (value) => runSave(() => api.setDefault(value), reload, t, notify);
      return h("div", null,
        profiles.length === 0 && h("p", { style: mutedStyle }, t("noProfiles")),
        profiles.map((profile) => h("div", {
          key: idOf(profile), style: { ...rowStyle, cursor: "pointer" },
          onClick: () => setDrill(idOf(profile)),
        },
          h("span", { flex: 1 }, profile.title, state.default === idOf(profile) && h(Tag, null, "★")),
          h("span", { style: mutedStyle }, `${(profile.sections ?? []).length} ${t("sectionsWord")}`),
          iconButton("edit", IconEditOutlineRegular, () => setDrill(idOf(profile))),
          iconButton(t("duplicate"), IconCopyOutlineRegular, (e) => { e.stopPropagation(); duplicateProfile(profile); }, { disabled: mutating }),
          iconButton(t("deleteLabel"), IconTrashOutlineRegular, (e) => { e.stopPropagation(); setConfirming(profile); }, { disabled: mutating }))),
        h("div", { style: { marginTop: "8px" } },
          h(Button, {
            variant: "outline", disabled: creating || mutating,
            onClick: () => flow.create("profile", { title: t("defaultProfileTitle"), sections: [] }),
          }, creating ? t("creating") : t("newProfile"))),
        h("div", { style: { marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" } },
          h("span", { style: mutedStyle }, t("defaultForNewSessions")),
          h(DefaultMenu, { state, t, onPick: setDefault })),
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
      const selected = profiles.find((p) => idOf(p) === state.default);
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
          ...profiles.map((p) => ({ id: idOf(p), label: p.title })),
        ],
        selectedId: selected ? idOf(selected) : (state.default || "none"),
        onSelect: (id) => { setOpen(false); onPick(id === "none" ? "" : id); },
      });
    }
    // #endregion COMPONENT_DefaultMenu
    // #endregion COMPONENT_ProfilesTab
    // #endregion SETTINGS_ProfilesTab

    // #region SETTINGS_SectionsTab

    // #region COMPONENT_SectionForm
    /**
     * @purpose Section editor: title + body (whole-object autosaved), an
     *   inline error line next to the fields, read-only used-in with scopes,
     *   source, duplicate/delete/rename-id actions. No scope control
     *   (SPEC decision 26). After creation the title is focused + selected.
     */
    function SectionForm({ section, state, api, reload, t, notify, onBack, onRenamed, onDrill, setState, autoFocusTitle }) {
      const [title, setTitle] = React.useState(section.title);
      const [body, setBody] = React.useState(section.body ?? "");
      const [confirmDelete, setConfirmDelete] = React.useState(false);
      const [renameValue, setRenameValue] = React.useState(refIdOf(section));
      const [confirmRename, setConfirmRename] = React.useState(false);
      const [error, setError] = React.useState("");
      const [mutating, setMutating] = React.useState(false);
      const titleRef = React.useRef(null);
      useFocusSelect(titleRef, autoFocusTitle === true);
      // Duplicate/delete/rename change which rows exist (and rename rewrites
      // references everywhere): all three go through the optimistic + poll
      // mutation flow, never a bare runSave-reload.
      const mutation = makeMutationFlow({
        api, t, notify, reload,
        getState: () => state,
        onState: setState,
        onPending: setMutating,
      });
      // The row is confirmed when /state already carries it — the create flow
      // only drills AFTER the poll, so this holds in every real mount; the gate
      // below is the belt-and-suspenders against any pre-poll write.
      const confirmed = Boolean(section?.patchId)
        && (state?.sections ?? []).some((s) => s.patchId === section.patchId || idOf(s) === idOf(section));
      const titleOk = String(title ?? "").trim() !== "";
      const saveSection = () => {
        // NEVER write an empty title (server 400 `value.title must be a
        // non-empty string`) and never write before the poll confirmed the row.
        if (!canSaveSection(title, confirmed)) return Promise.resolve(false);
        return runSave(
          () => api.sectionUpdate(section.patchId, { title, body }),
          reload, t, notify, setError);
      };
      const flushTitle = useAutosave(title, () => { if (title !== section.title) saveSection(); });
      const flushBody = useAutosave(body, () => { if (body !== (section.body ?? "")) saveSection(); });
      // Leaving the view must not drop an edit still inside the debounce window.
      const leave = () => { flushTitle(); flushBody(); onBack(); };
      const duplicate = () => mutation.run({
        mutate: () => api.sectionCreate({
          title: `${section.title} (copy)`, body: section.body ?? "",
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
      const remove = () => mutation.run({
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
        setConfirmRename(false);
        const oldId = refIdOf(section);
        if (!typed || typed === oldId) return;
        // The host canonicalizes the NEW id to the full `prompt-<kind>-<token>`
        // form, so the polled row carries THAT id: agree and drill on the stored
        // configId (the raw token never equals a configId, so comparing it to
        // refIdOf() would poll until timeout and drop the drill).
        const prefix = /^prompt-(?:section|profile)-/.exec(oldId ?? "")?.[0] ?? "";
        const newId = prefix && !typed.startsWith(prefix) ? `${prefix}${typed}` : typed;
        return mutation.run({
          mutate: () => api.sectionRename(section.patchId, typed),
          // Renaming rewrites references in every profile — only a full /state
          // reload (the poll below) can reconcile the outlines.
          agree: (polled) => (polled?.sections ?? []).some((s) => refIdOf(s) === newId),
          onDone: (polled) => {
            const live = (polled?.sections ?? []).find((s) => refIdOf(s) === newId);
            if (onRenamed) onRenamed(live ? refIdOf(live) : newId);
          },
        });
      };
      const usedIn = section.usedIn ?? [];
      const sourceKind = sourceKindOf(section.source);
      const emptyBody = !String(body ?? "").trim();
      return h("div", null,
        h("div", { style: { ...rowStyle, borderBottom: "none" } },
          backButton(leave, t),
          h("strong", { style: { flex: 1 } }, idOf(section)),
          iconButton(t("duplicate"), IconCopyOutlineRegular, duplicate, { disabled: mutating }),
          iconButton(t("deleteLabel"), IconTrashOutlineRegular, () => setConfirmDelete(true), { disabled: mutating })),
        h("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
        inlineError(error),
        h("label", { style: { display: "block", marginBottom: "8px" } },
          t("titleLabel"), h("input", {
            ref: titleRef, value: title,
            onChange: (e) => setTitle(e.target.value), onBlur: flushTitle,
            style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" },
          }),
          !titleOk && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("titleRequired"))),
        h("label", { style: { display: "block", marginBottom: "8px" } },
          t("bodyLabel"),
          h("textarea", {
            value: body, rows: 8, onChange: (e) => setBody(e.target.value), onBlur: flushBody,
            style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px", resize: "vertical" },
          }),
          emptyBody && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("emptyBody"))),
        h("div", { style: mutedStyle, marginBottom: "4px" },
          `${t("usedIn")}: `,
          usedIn.length === 0 ? t("notUsed")
            : usedIn.map((u) => h("span", { key: u.profileId, style: { marginRight: "8px" } },
              `${usedInProfileName(state, u.profileId)} — ${t("scopeLabel")}: ${u.scope}`))),
        sourceKind && h("div", { style: mutedStyle, marginBottom: "8px" },
          `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}`),
        h("div", { style: { display: "flex", gap: "8px" } },
          h(Button, { variant: "outline", disabled: mutating, onClick: () => { setRenameValue(refIdOf(section)); setConfirmRename(true); } }, t("renameId"))),
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
    /**
     * @purpose Section list with search, used-in, source, drill-down, and a
     *   modal-free create action (POST default title → poll /state → drill
     *   into the editor with the title focused and selected). The create
     *   button is disabled while a create is in flight.
     */
    function SectionsTab({ state, api, reload, t, notify, drill, setDrill, setState, createFlow }) {
      const [query, setQuery] = React.useState("");
      const [creating, setCreating] = React.useState(false);
      const [justCreated, setJustCreated] = React.useState(null);
      const sections = filterSections(state.sections ?? [], query);
      const flow = createFlow ?? makeCreateFlow({
        api, t, notify, reload,
        getState: () => state,
        onState: setState,
        onPending: setCreating,
        onDrill: (id) => { setJustCreated(id); setDrill(id); },
      });
      if (drill) {
        const live = (state.sections ?? []).find((s) => idOf(s) === drill);
        if (live) return h(SectionForm, {
          // Key on the row id: after DUPLICATE the drill moves to the copy and
          // React must remount the form with the copy's state, not reuse the
          // original's useState values.
          key: idOf(live),
          section: live, state, api, reload, t, notify,
          autoFocusTitle: justCreated === drill,
          onBack: () => { setJustCreated(null); setDrill(null); },
          // After a rename the drill must follow the NEW id or the form drops
          // back to the list (the old id no longer resolves).
          onRenamed: (id) => { setJustCreated(null); setDrill(id); },
          // Duplicate opens the copy (creation-style drill).
          onDrill: (id) => { setJustCreated(null); setDrill(id); },
          setState,
        });
        setDrill(null);
      }
      return h("div", null,
        h("div", { style: { display: "flex", gap: "8px", marginBottom: "8px" } },
          h(Input, {
            icon: h(IconSearchOutlineRegular, { size: 14 }),
            placeholder: t("searchPlaceholder"), value: query,
            onChange: (e) => setQuery(e.target.value), style: { flex: 1 },
          }),
          h(Button, {
            variant: "outline", disabled: creating,
            onClick: () => flow.create("section", { title: t("defaultSectionTitle"), body: "" }),
          }, creating ? t("creating") : t("newSection"))),
        sections.length === 0 && h("p", { style: mutedStyle }, t("noSections")),
        sections.map((section) => {
          const sourceKind = sourceKindOf(section.source);
          return h("div", {
            key: idOf(section), style: { ...rowStyle, cursor: "pointer" },
            onClick: () => setDrill(idOf(section)),
          },
            h("span", { flex: 1 }, section.title,
              !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody"))),
            h("span", { style: mutedStyle },
              `${t("usedIn")}: `,
              (section.usedIn ?? []).length === 0 ? t("notUsed")
                : (section.usedIn ?? []).map((u) => usedInProfileName(state, u.profileId)).join(", ")),
            // Source badge only for `bundle`/`unknown`; `user` rows stay calm.
            sourceKind && h(Tag, null, `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}`));
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
      const [profileId, setProfileId] = React.useState(state.default || (idOf((state.profiles ?? [])[0]) ?? ""));
      const [data, setData] = React.useState(null);
      React.useEffect(() => {
        let live = true;
        setData(null);
        if (!profileId) return undefined;
        api.preview(profileId)
          .then((value) => { if (live) setData(previewPlan(value)); })
          .catch((err) => { if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError")); });
        return () => { live = false; };
      }, [profileId, api, t, notify]);
      const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
      const selected = profiles.find((p) => idOf(p) === profileId);
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
     *   back via the back icon, Esc, or a repeated click on the active tab. No
     *   URL or deep-link state.
     */
    // The host mounts this section as the ONLY child of its own scroll panel
    // (`dsh-client-ui-settings-general` `.options`: flex:1; min-height:0;
    // overflow-y:auto) which does NOT reserve a scrollbar gutter. Making OUR
    // root the scroller with a stable gutter keeps the profiles list ↔ outline
    // height change from toggling that panel's scrollbar (the "profile → back"
    // jolt) without touching the host package. height:100% resolves because the
    // shell's options panel is a flex item with a definite height.
    const pageStyle = {
      height: "100%", minHeight: 0, boxSizing: "border-box",
      overflowY: "auto", scrollbarGutter: "stable",
    };

    function PromptProfilesSection(props) {
      const { t, api } = props;
      const { notify, banner } = useNotifier();
      const { state, setState, reload } = useProfilesState(api ?? clientApi, t, notify);
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
      if (!state) return h("div", { style: pageStyle }, h("p", { style: mutedStyle }, "…"), banner);
      return h("div", { style: pageStyle },
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
            drill: drill.profiles, setDrill, onOpenSection, setState,
          }),
          tab === "sections" && h(SectionsTab, {
            state, api: api ?? clientApi, reload, t, notify,
            drill: drill.sections, setDrill, setState,
          }),
          tab === "preview" && h(PreviewTab, { state, api: api ?? clientApi, t, notify })),
        banner);
    }
    // #endregion COMPONENT_PromptProfilesSection

    return {
      // apply() touches exactly these two services at registration time:
      // ctx.locale.register/bind and ctx.slots.inject/register. In Cordis a
      // service is reachable on ctx only when declared here — with an empty
      // list apply() threw (undefined ctx.slots/ctx.locale) and web boot
      // reported "1 entry did not activate".
      inject: ["slots", "locale"],
      helpers,
      // Test seams (also reusable building blocks): the API facade factory,
      // the modal-free create flow, the optimistic+poll mutation flow, the
      // whole-object save runner, and the tab components for shim-level
      // render assertions.
      makeApi, makeCreateFlow, makeMutationFlow, runSave, findEntry, optimisticEntry,
      components: { ProfilesTab, SectionsTab, SectionForm, ProfileOutline },
      apply(ctx) {
        ctx.locale.register(NS, { en: messages });
        ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
          name: "conversation.input.left",
          id: "prompt-profile",
          order: 10,
          locale: NS,
          inject: (sessionId) => ({
            // `choice` is {profileId, workspaceId?, cwd?}: the host keys `last`
            // by workspace id when known, else by the Session cwd. JSON.stringify
            // drops the absent fields.
            pick: (choice) => request("last", {
              method: "POST", body: JSON.stringify({
                workspaceId: choice?.workspaceId, cwd: choice?.cwd, profileId: choice?.profileId,
              }),
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
