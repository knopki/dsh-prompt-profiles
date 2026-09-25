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
      none: "None", untitled: "(no title)",
      loadError: "Could not load prompt profiles.", saveError: "Could not save prompt profile.",
      requestFailed: "Prompt profiles request failed",
      menuLabel: "Choose a prompt profile",
      chooseNeedsWorkspace: "Choose a workspace first — the profile choice is remembered per workspace.",
      // settings page
      nav: "Prompt profiles",
      tabProfiles: "Profiles", tabSections: "Sections", tabPreview: "Preview",
      profileWord: "Profile",
      back: "Back",
      searchPlaceholder: "Search…",
      newProfile: "+ New profile", newSection: "+ New section", addSection: "Add section",
      creating: "creating…",
      defaultSectionTitle: "New section", defaultProfileTitle: "New profile",
      createError: "Could not create:", createTimeout: "the new item did not appear in time — retry or reload the page.",
      defaultForNewSessions: "Default for new sessions",
      builtIn: "built-in", builtInNote: "Some built-in sections may be absent in a given mode.",
      scopeLabel: "Scope", scopeInherit: "inherit", scopeMainOnly: "main-only", scopeSubagentsOnly: "subagents-only",
      sourceLabel: "source", sourceBundle: "bundle", sourceUnknown: "unknown",
      usedIn: "Used in", notUsed: "not used",
      openInSectionTab: "Open in Sections", remove: "Remove from profile",
      duplicate: "Duplicate", deleteLabel: "Delete", renameId: "Change id", copySuffix: "(copy)",
      renameIdLocked: "Bundle-owned section — its id cannot be changed, only disabled.",
      titleLabel: "Title", bodyLabel: "Body", orderLabel: "Order",
      cancel: "Cancel", confirm: "Confirm",
      confirmDeleteProfile: "Delete this profile?", confirmDeleteSection: "Delete this section?",
      confirmRemoveRef: "Remove this section from the profile?",
      confirmRename: "Change section id?",
      // The host no longer rewrites profile references on rename.
      renameNote: "Change the id? References in profiles are NOT updated — fix them manually.",
      renameAffected: "These profiles still reference the old id — fix them manually:",
      renameEmpty: "Enter a new id — it cannot be empty.",
      titleRequired: "Enter a name — a section needs a non-empty title before it can be saved.",
      dragHandle: "Drag to reorder",
      missingSection: "section not found", emptyBody: "empty body — not emitted",
      completeModeWarning: "Profile sections are discarded in complete modes:",
      conflictError: "Concurrent edit — state reloaded.",
      pickerTitle: "Add sections", pickerAdd: "Add", pickerEmpty: "No sections to add",
      builtinMarker: "⟨built-in⟩", skippedMarker: "⟨skipped⟩", brokenWord: "broken",
      noProfiles: "No profiles yet.", noSections: "No sections yet.",
      previewEmpty: "This profile emits no sections.",
      previewVariables: "Substituted at session start — may differ from this preview:",
      sectionsWord: "sections",
    };

    // #region LOCALES_registered
    /**
     * @purpose ru/zh dictionaries, key-for-key identical to `en`. Registered
     *   together so the standard locale service can resolve the active
     *   preference and fall back to `en` for any key a dictionary lacks (the
     *   service owns the fallback; the client adds no lookup of its own). DSH
     *   ships `LOCALE_IDS = ["zh", "en"]` in its switcher, but the preference
     *   schema accepts any id, so `preference: ru` selects Russian.
     */
    const ru = {
      // chip
      none: "Нет", untitled: "(без названия)",
      loadError: "Не удалось загрузить профили промпта.",
      saveError: "Не удалось сохранить профиль промпта.",
      requestFailed: "Ошибка запроса профилей промпта",
      menuLabel: "Выберите профиль промпта",
      chooseNeedsWorkspace: "Сначала выберите воркспейс — выбор профиля запоминается для воркспейса.",
      // settings page
      nav: "Профили промпта",
      tabProfiles: "Профили", tabSections: "Секции", tabPreview: "Предпросмотр",
      profileWord: "Профиль",
      back: "Назад",
      searchPlaceholder: "Поиск…",
      newProfile: "+ Новый профиль", newSection: "+ Новая секция", addSection: "Добавить секцию",
      creating: "создание…",
      defaultSectionTitle: "Новая секция", defaultProfileTitle: "Новый профиль",
      createError: "Не удалось создать:", createTimeout: "новый элемент не появился вовремя — повторите или перезагрузите страницу.",
      defaultForNewSessions: "По умолчанию для новых сессий",
      builtIn: "встроенная", builtInNote: "Часть встроенных секций может отсутствовать в конкретном режиме.",
      scopeLabel: "Область", scopeInherit: "наследуется", scopeMainOnly: "только основной агент", scopeSubagentsOnly: "только субагенты",
      sourceLabel: "источник", sourceBundle: "из бандла", sourceUnknown: "неизвестно",
      usedIn: "Используется в", notUsed: "не используется",
      openInSectionTab: "Открыть в «Секциях»", remove: "Убрать из профиля",
      duplicate: "Дублировать", deleteLabel: "Удалить", renameId: "Изменить id", copySuffix: "(копия)",
      renameIdLocked: "Секция из бандла — id изменить нельзя, можно только отключить.",
      titleLabel: "Название", bodyLabel: "Текст", orderLabel: "Порядок",
      cancel: "Отмена", confirm: "Подтвердить",
      confirmDeleteProfile: "Удалить этот профиль?", confirmDeleteSection: "Удалить эту секцию?",
      confirmRemoveRef: "Убрать эту секцию из профиля?",
      confirmRename: "Изменить id секции?",
      renameNote: "Ссылки в профилях при этом НЕ обновятся — их придётся поправить вручную.",
      renameAffected: "В этих профилях осталась старая ссылка — поправьте вручную:",
      renameEmpty: "Введите новый id — пустым он быть не может.",
      titleRequired: "Введите название — секцию нельзя сохранить с пустым названием.",
      dragHandle: "Перетащите, чтобы изменить порядок",
      missingSection: "секция не найдена", emptyBody: "пустой текст — не вставляется",
      completeModeWarning: "В режимах с полной заменой промпта секции профиля отбрасываются:",
      conflictError: "Параллельная правка — состояние перезагружено.",
      pickerTitle: "Добавить секции", pickerAdd: "Добавить", pickerEmpty: "Нет секций для добавления",
      builtinMarker: "⟨встроенная⟩", skippedMarker: "⟨пропущено⟩", brokenWord: "битых",
      noProfiles: "Профилей пока нет.", noSections: "Секций пока нет.",
      previewEmpty: "Этот профиль не выдаёт ни одной секции.",
      previewVariables: "Подстановка произойдёт при старте сессии — может отличаться от предпросмотра:",
      sectionsWord: "секций",
    };

    const zh = {
      // chip
      none: "无", untitled: "（无标题）",
      loadError: "无法加载提示配置。",
      saveError: "无法保存提示配置。",
      requestFailed: "提示配置请求失败",
      menuLabel: "选择提示配置",
      chooseNeedsWorkspace: "请先选择工作区——提示配置的选择按工作区保存。",
      // settings page
      nav: "提示配置",
      tabProfiles: "配置", tabSections: "片段", tabPreview: "预览",
      profileWord: "配置",
      back: "返回",
      searchPlaceholder: "搜索…",
      newProfile: "+ 新建配置", newSection: "+ 新建片段", addSection: "添加片段",
      creating: "创建中…",
      defaultSectionTitle: "新片段", defaultProfileTitle: "新配置",
      createError: "创建失败：", createTimeout: "新条目未能及时出现——请重试或刷新页面。",
      defaultForNewSessions: "新会话默认",
      builtIn: "内置", builtInNote: "部分内置片段在特定模式下可能不存在。",
      scopeLabel: "作用范围", scopeInherit: "继承", scopeMainOnly: "仅主代理", scopeSubagentsOnly: "仅子代理",
      sourceLabel: "来源", sourceBundle: "来自插件包", sourceUnknown: "未知",
      usedIn: "用于", notUsed: "未使用",
      openInSectionTab: "在「片段」中打开", remove: "从配置中移除",
      duplicate: "复制", deleteLabel: "删除", renameId: "修改 id", copySuffix: "（副本）",
      renameIdLocked: "插件包提供的片段——无法修改其 id，只能停用。",
      titleLabel: "标题", bodyLabel: "内容", orderLabel: "顺序",
      cancel: "取消", confirm: "确认",
      confirmDeleteProfile: "删除此配置？", confirmDeleteSection: "删除此片段？",
      confirmRemoveRef: "从配置中移除此片段？",
      confirmRename: "修改片段 id？",
      renameNote: "配置中的引用不会随之更新——请手动修改。",
      renameAffected: "以下配置仍引用旧 id——请手动修改：",
      renameEmpty: "请输入新的 id——不能为空。",
      titleRequired: "请输入名称——片段标题不能为空才能保存。",
      dragHandle: "拖动以调整顺序",
      missingSection: "未找到片段", emptyBody: "内容为空——不会注入",
      completeModeWarning: "在完全替换提示词的模式下，配置片段会被丢弃：",
      conflictError: "并发编辑——状态已重新加载。",
      pickerTitle: "添加片段", pickerAdd: "添加", pickerEmpty: "没有可添加的片段",
      builtinMarker: "⟨内置⟩", skippedMarker: "⟨已跳过⟩", brokenWord: "损坏",
      noProfiles: "还没有配置。", noSections: "还没有片段。",
      previewEmpty: "此配置不会注入任何片段。",
      previewVariables: "将在会话启动时替换——可能与预览不同：",
      sectionsWord: "个片段",
    };
    // #endregion LOCALES_registered

    // Non-component strings (the low-level request fallback) still go through
    // the registered dictionaries. `apply` swaps this to the service's own
    // binder; until then English is the only content that exists.
    let boundT = (key) => messages.en[key] ?? key;

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

    // #region FUNC_profileLabel
    /**
     * @purpose Human label for a profile: its title, else its id (bundle rows can
     *   carry an empty title), else the "(no title)" dictionary string — so a made
     *   choice never reads as "None".
     */
    function profileLabel(profile, t) {
      if (!profile) return t("none");
      return profile.title || idOf(profile) || t("untitled");
    }
    // #endregion FUNC_profileLabel

    // #region FUNC_escapesDrillDown
    /**
     * @purpose Whether an Escape keydown should close the current drill-down.
     *   It must NOT fire while the user is typing (input/textarea/select or a
     *   contenteditable node) and must not fight an open dialog/menu — otherwise
     *   Esc during typing discarded the user's place.
     * @param {KeyboardEvent} event
     * @param {{document?: {querySelector?: Function}}} [root] - window-like root.
     */
    function escapesDrillDown(event, root) {
      if (!event || event.key !== "Escape") return false;
      const target = event.target;
      if (target && typeof target.closest === "function"
        && target.closest("input, textarea, select, [contenteditable]")) return false;
      const doc = (root && root.document) || (typeof document !== "undefined" ? document : null);
      if (doc && typeof doc.querySelector === "function"
        && doc.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]')) return false;
      return true;
    }
    // #endregion FUNC_escapesDrillDown

    // #region FUNC_insertionOrders
    /**
     * @purpose Orders for the drag-and-drop INSERTION BOUNDARIES of an outline:
     *   entry i is the gap before `rows[i]`, and the last entry is the gap after
     *   the final row — so built-in rows are valid neighbours/targets too.
     * @param {Array<{kind: string, order?: number}>} rows - the rendered outline.
     * @returns {number[]} one INTEGER order per boundary, always the order of the
     *   row that ends up directly ABOVE the drop plus 1: the top boundary is
     *   (first order − 1) and the bottom one is (last order + 1).
     * @invariants Integers only — never a midpoint/`.5`. Copying a built-in's
     *   order would let the host's "our section before the built-in at equal
     *   order" rule hoist it above that built-in, so dropping BELOW a built-in
     *   yields its order + 1. A result equal to the NEXT row's order is fine:
     *   equal orders are legal and `dropAt` also moves the ref in the profile,
     *   so the tie-break resolves to the dropped position.
     */
    function insertionOrders(rows) {
      const orderOf = (row) => (row && row.kind !== "broken" && typeof row.order === "number" ? row.order : null);
      const list = rows ?? [];
      const orders = [];
      for (const row of list) {
        const order = orderOf(row);
        if (order !== null) orders.push(order);
      }
      const out = [];
      for (let i = 0; i <= list.length; i++) {
        let above = null;
        for (let j = i - 1; j >= 0; j--) { above = orderOf(list[j]); if (above !== null) break; }
        let below = null;
        for (let j = i; j < list.length; j++) { below = orderOf(list[j]); if (below !== null) break; }
        out[i] = orders.length === 0 ? 100
          : above === null ? orders[0] - 1
            : below === null ? orders[orders.length - 1] + 1
              : above + 1;
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

    // #region FUNC_scopeKeyOf
    /** @purpose Locale key for a section-ref scope value (single mapping shared
     *   by the scope menu and the used-in line, so none render the raw enum). */
    function scopeKeyOf(scope) {
      return scope === "main-only" ? "scopeMainOnly"
        : scope === "subagents-only" ? "scopeSubagentsOnly"
          : "scopeInherit";
    }
    // #endregion FUNC_scopeKeyOf

    // #region FUNC_renameNotice
    /**
     * @purpose Build the post-rename notice. The host no longer rewrites profile
     *   references, so a successful rename reports any profile that still points
     *   at the old id (title, id fallback). An empty, non-array or ABSENT
     *   `affectedProfiles` (older host response) means there is nothing to flag:
     *   the rename itself is the confirmation and no notice is shown.
     * @returns {string|null}
     */
    function renameNotice(result, t) {
      const affected = Array.isArray(result?.affectedProfiles) ? result.affectedProfiles : [];
      if (affected.length === 0) return null;
      const names = affected.map((p) => p?.title || p?.profileId).filter(Boolean);
      const list = names.length ? names.join(", ") : String(affected.length);
      return `${t("renameAffected")} ${list}`;
    }
    // #endregion FUNC_renameNotice

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
      for (const [seq, rawRef] of (profile?.sections ?? []).entries()) {
        const ref = rawRef ? { ...rawRef, id: dedupeRowPrefix(rawRef.id) } : rawRef;
        const section = byId.get(ref.id);
        if (!section) {
          rows.push({ kind: "broken", ref, order: ref.order, seq, key: `broken:${seq}:${ref.id}` });
          continue;
        }
        rows.push({ kind: "ours", ref, section, order: ref.order, seq, key: `ours:${seq}:${ref.id}` });
      }
      // Deterministic and TRANSITIVE: order, then OUR sections before built-ins
      // at an equal order (the host assembler's own insertion rule — the UI must
      // show the sequence that actually reaches the prompt), then the ref's
      // position in the profile, then the id.
      rows.sort((a, b) => {
        // Broken refs take no part in the composition order — keep them after
        // the resolvable rows (they are actionable only via Remove).
        if (a.kind === "broken" || b.kind === "broken") {
          if (a.kind === b.kind) return (a.seq ?? 0) - (b.seq ?? 0);
          return a.kind === "broken" ? 1 : -1;
        }
        const oa = a.order ?? 0;
        const ob = b.order ?? 0;
        if (oa !== ob) return oa - ob;
        if (a.kind !== b.kind) return a.kind === "builtin" ? 1 : -1;
        if (a.kind === "builtin") return String(a.name).localeCompare(String(b.name));
        if ((a.seq ?? 0) !== (b.seq ?? 0)) return (a.seq ?? 0) - (b.seq ?? 0);
        return String(a.ref?.id ?? "").localeCompare(String(b.ref?.id ?? ""));
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
      // `variables` is the host's own report of what it substituted (cwd from the
      // host process, model unknown/null) — carried through so the pane can be
      // honest about it instead of presenting the preview as the exact prompt.
      return { plan, skipped, variables: r.variables ?? null };
    }
    // #endregion FUNC_previewPlan

    // #region FUNC_previewVariableNotice
    /** @purpose The `{{name}}` variables a piece of text references (unique, ordered). */
    function previewVariableNames(text) {
      const names = [];
      const src = String(text ?? "");
      const re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
      let match;
      while ((match = re.exec(src)) !== null) {
        if (!names.includes(match[1])) names.push(match[1]);
      }
      return names;
    }
    /**
     * @purpose Which interpolation variables make this preview item
     *   ILLUSTRATIVE rather than exact. A preview is assembled without the
     *   session, so the host substitutes its OWN cwd and leaves `{{model}}`
     *   literal: the value it used cannot be proven equal to the session's (and
     *   `null`/absent means unknown). Returns the names to flag, or `null` when
     *   the item uses no variables — never a made-up value.
     * @param {string} text - the interpolated preview text.
     * @param {string} body - the ORIGINAL section body (shows `{{cwd}}`, which the
     *   preview already replaced, so it has to be checked here).
     * @param {{[name: string]: string|null}} [variables] - the host's reported values.
     * @param {{[name: string]: string}} [sessionValues] - the real session values,
     *   when known; a preview has none, so a used variable stays flagged.
     * @returns {string[]|null}
     */
    function previewVariableNotice(text, body, variables, sessionValues) {
      const used = [...new Set([...previewVariableNames(body), ...previewVariableNames(text)])];
      if (used.length === 0) return null;
      const flagged = used.filter((name) => {
        const preview = variables ? variables[name] : undefined;
        if (preview === null || preview === undefined) return true; // unknown host-side
        const real = sessionValues ? sessionValues[name] : undefined;
        return real === undefined || real !== preview; // cannot prove a match
      });
      return flagged.length ? flagged : null;
    }
    // #endregion FUNC_previewVariableNotice

    const helpers = {
      insertionOrders, outlineRows, filterSections, previewPlan, idOf,
      refIdOf, dedupeRowPrefix, normalizeSections, addSectionsToRefs,
      canSaveSection, sourceKindOf, usedInProfileName, renameNotice, scopeKeyOf,
      profileLabel, escapesDrillDown, previewVariableNotice,
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
        let message = `${boundT("requestFailed")} (${response.status})`;
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
     * @purpose Chooses a prompt profile for the next new session. The control is
     *   built from the installed primitives — `Button` (ghost/sm, the compact
     *   capsule the neighbouring composer controls use, carrying its own hover/
     *   focus/active states) and `Menu` — instead of hand-written inline
     *   geometry, which had lost the hover background.
     */
    // The Button primitive offers no truncation slot and no max width, so these
    // remain the only hand-written bits: long profile titles need the ellipsis,
    // and the chip must not outgrow the composer control it mirrors.
    // The trigger colors are copied token-for-token from the composer's own
    // triggers, whose `Button`-equivalent CSS overrides the primitive's
    // label-primary base: the LABEL is `--dsw-alias-label-secondary` and the
    // CHEVRON `--dsw-alias-label-caption` (conversation.input.permission
    // `.trigger`/`.chevron`; the model selector `._trigger`/`._chevron`).
    const triggerLabelStyle = {
      textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0,
      color: "var(--dsw-alias-label-secondary)",
    };
    const triggerChevronStyle = {
      color: "var(--dsw-alias-label-caption)", flex: "none", display: "inline-flex",
    };
    const chipMaxWidth = { maxWidth: "220px" };

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
      // Three distinct states, mirroring the host's `resolveProfileId`:
      //  · the key is ABSENT            → the default profile applies;
      //  · the key is present and `''`  → the user explicitly chose "None";
      //  · the key is present and valid → that profile.
      // (A present but stale non-empty id falls back to the default, as on the
      // host; `hasOwnProperty` is what separates "absent" from "explicit none".)
      const lastChoice = state.lastByWorkspace ?? {};
      const hasChoice = Boolean(lastKey) && Object.prototype.hasOwnProperty.call(lastChoice, lastKey);
      const chosen = hasChoice ? lastChoice[lastKey] : undefined;
      const chosenProfile = chosen ? state.profiles.find((p) => idOf(p) === chosen) : undefined;
      const selected = hasChoice && chosen === "" ? undefined
        : chosenProfile || state.profiles.find((p) => idOf(p) === state.default);
      const profiles = [...state.profiles].sort((a, b) => a.title.localeCompare(b.title));
      const choose = async (profileId) => {
        // No key at all (neither workspaceId nor cwd): the choice cannot be
        // stored, so BLOCK it and explain — never send a doomed request.
        if (!lastKey) {
          setOpen(false);
          notify(t("chooseNeedsWorkspace"));
          return;
        }
        const previous = state;
        // Optimistically keep the explicit "none" as `''` (the host's own
        // explicit-none marker) — storing `undefined` would lose the decision.
        setState({ ...state, lastByWorkspace: { ...state.lastByWorkspace, [lastKey]: profileId || "" } });
        setOpen(false);
        // ALWAYS deliver the choice, keyed by exactly ONE value: the Workspace
        // when the Session is accounted to one, otherwise the Session cwd (the
        // agreed host contract).
        const choice = { profileId };
        if (workspaceId) choice.workspaceId = workspaceId;
        else if (cwd) choice.cwd = cwd;
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
      return h(React.Fragment, null,
        h(Menu, {
          open,
          onClose: () => setOpen(false),
          // Match the composer's own dropdowns (see conversation.input.permission):
          // they open UPWARD, portaled out of the composer's clipping.
          side: "top",
          portal: true,
          // Button owns radius/padding/typography/colour and the hover, focus
          // and active states; the chevron is a TRAILING child (the primitive has
          // no trailing-icon slot), after the label, as on the neighbouring
          // composer controls.
          anchor: h(Button, {
            variant: "ghost", size: "sm",
            "aria-label": t("menuLabel"),
            // The blocked state explains itself on hover; the accessible name
            // stays the control's own label.
            title: lastKey ? t("menuLabel") : t("chooseNeedsWorkspace"),
            onClick: () => setOpen(!open),
            style: chipMaxWidth,
          },
            h("span", { style: triggerLabelStyle }, profileLabel(selected, t)),
            h("span", { "aria-hidden": true, style: triggerChevronStyle }, h(IconChevronDownOutlineRegular, { size: 14 }))),
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

    /**
     * @purpose The single icon-only control wrapper, used by the row actions, the
     *   drag grip and the back affordance. The installed Button primitive owns
     *   geometry, typography and the hover/focus/active states; `extra` carries
     *   pass-through button props (disabled, drag/keyboard handlers) plus the
     *   variant and whether a Tooltip wrapper is wanted (the back button relies on
     *   the Button's own native `title`).
     */
    const iconControl = (label, Icon, onClick, extra = {}) => {
      const button = h(Button, {
        variant: extra.variant ?? "ghost",
        size: "sm",
        icon: h(Icon, { size: 14 }),
        "aria-label": label,
        title: extra.title ?? label,
        disabled: extra.disabled === true,
        onClick,
        ...(extra.props ?? {}),
      });
      return extra.tooltip === false ? button : h(Tooltip, { key: extra.key ?? label, label }, button);
    };
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
      // (built-ins are never dragged, only aimed at). The new order is the
      // integer rule in `insertionOrders`. A ref is identified by its OCCURRENCE
      // (its index in `refs`, carried as `row.seq`), never by its section id:
      // one profile may legitimately reference the same section twice, and those
      // two refs must move/scope/remove independently.
      const [dragId, setDragId] = React.useState(null);
      const [dragOverIndex, setDragOverIndex] = React.useState(null);
      // Remove-from-profile confirmation (kept LAST so positional test queues hold).
      const [confirmRemove, setConfirmRemove] = React.useState(null);
      const dragStart = (refSeq) => (event) => {
        setDragId(refSeq);
        if (event?.dataTransfer) {
          try {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(refSeq));
          } catch (_) { /* dataTransfer can be absent/inert in tests */ }
        }
      };
      const dragEnd = () => { setDragId(null); setDragOverIndex(null); };
      const droppedSeq = (event) => {
        let from = dragId;
        if (from === null || from === undefined || from === "") {
          if (typeof event?.dataTransfer?.getData === "function") {
            try { from = event.dataTransfer.getData("text/plain"); } catch (_) { from = null; }
          }
        }
        if (from === null || from === undefined || from === "") return null;
        const seq = Number(from);
        return Number.isInteger(seq) && seq >= 0 ? seq : null;
      };
      // #endregion BLOCK_dragReorder
      // Every ref mutation addresses an OCCURRENCE index, so duplicate refs to
      // one section stay independent (own scope, order, removal, position).
      const patchRef = (refSeq, patch) =>
        writeRefs(refs.map((ref, index) => (index === refSeq ? { ...ref, ...patch } : ref)));
      const changeScope = (refSeq, scope) => patchRef(refSeq, { scope });
      // The numeric field stays free-form: any FINITE number is accepted (drag
      // and the keyboard always produce integers, but a typed value is the
      // user's own); NaN/Infinity are ignored rather than persisted.
      const changeOrder = (refSeq, order) => {
        if (!Number.isFinite(order)) return;
        patchRef(refSeq, { order });
      };
      const removeRef = (refSeq) => writeRefs(refs.filter((_, index) => index !== refSeq));
      const addSections = (ids) => writeRefs(addSectionsToRefs(refs, ids));
      const completeModes = (state.modes ?? []).filter((m) => m.complete === true);
      const rows = outlineRows({ ...profile, sections: refs }, sectionsById, builtinOrders);
      const brokenRows = rows.filter((row) => row.kind === "broken");
      const scopeMenu = (row) => {
        const { ref, seq } = row;
        const scopeLabel = `${t("scopeLabel")}: ${t(scopeKeyOf(ref.scope))}`;
        // Owner-controlled Menu: open + anchor (rendered in place) + data rows.
        // The anchor is the installed Button primitive, not a hand-styled button.
        // Open state is keyed by OCCURRENCE, so two refs to one section do not
        // share (or fight over) a single menu.
        return h(Menu, {
          open: scopeOpen === seq,
          onClose: () => setScopeOpen(null),
          anchor: h(Button, {
            variant: "ghost", size: "sm",
            "aria-label": scopeLabel,
            onClick: () => setScopeOpen((openSeq) => (openSeq === seq ? null : seq)),
          }, scopeLabel),
          items: ["inherit", "main-only", "subagents-only"].map((scope) => ({ id: scope, label: t(scopeKeyOf(scope)) })),
          selectedId: ref.scope ?? "inherit",
          onSelect: (scope) => { changeScope(seq, scope); setScopeOpen(null); },
        });
      };
      // Insertion boundaries: one per gap between/around the rendered rows. The
      // integer order attached to a boundary is the order of the row that ends up
      // directly above the drop, +1 (built-in orders included); broken refs carry
      // no order.
      const boundaryOrders = insertionOrders(rows);
      const dropAt = (index, fromSeq) => {
        const order = boundaryOrders[index];
        if (fromSeq === null || typeof order !== "number") return;
        // The two gaps that touch the dragged row itself are no-ops.
        const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === fromSeq);
        if (ownIndex < 0 || ownIndex === index || ownIndex === index - 1) return;
        const withOrder = refs.map((ref, i) => (i === fromSeq ? { ...ref, order } : ref));
        // Also MOVE the ref in the profile array to the drop position. The order
        // may tie with the next row (legal), and the ties are broken by the ref's
        // position in the profile — so that position has to match the drop.
        const movedSeqs = rows.filter((row) => row.kind === "ours").map((row) => row.seq).filter((seq) => seq !== fromSeq);
        const aboveCount = rows.slice(0, index).filter((row) => row.kind === "ours" && row.seq !== fromSeq).length;
        movedSeqs.splice(aboveCount, 0, fromSeq);
        const rest = withOrder.map((_, i) => i).filter((i) => !movedSeqs.includes(i));
        writeRefs([...movedSeqs, ...rest].map((i) => withOrder[i]));
      };
      // Keyboard path for the drag grip: ↑/↓ move the row one rendered position,
      // reusing the same boundary/order math as a drop (gap above the previous
      // row / below the next one). The numeric input stays the direct-order path.
      const moveRefBy = (refSeq, direction) => {
        const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === refSeq);
        if (ownIndex < 0) return;
        const boundary = direction === "up" ? ownIndex - 1 : ownIndex + 2;
        if (boundary < 0 || boundary > rows.length) return;
        dropAt(boundary, refSeq);
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
          if (dragId !== null && dragOverIndex !== index) setDragOverIndex(index);
        },
        onDrop: (event) => {
          if (event && typeof event.preventDefault === "function") event.preventDefault();
          const from = droppedSeq(event);
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
            iconControl(t("remove"), IconTrashOutlineRegular, () => setConfirmRemove(row.seq)));
        }
        const { ref, section, seq } = row;
        return h("div", { key: row.key, style: { ...rowStyle, opacity: dragId === seq ? 0.5 : 1 } },
          // Focusable grip: a real Button (keyboard + semantics), carrying the
          // drag handlers and ↑/↓ reordering.
          iconControl(t("dragHandle"), IconChevronsUpDownOutlineRegular, null, {
            props: {
              draggable: true,
              onDragStart: dragStart(seq),
              onDragEnd: dragEnd,
              onKeyDown: (event) => {
                if (event?.key === "ArrowUp") { event.preventDefault?.(); moveRefBy(seq, "up"); }
                else if (event?.key === "ArrowDown") { event.preventDefault?.(); moveRefBy(seq, "down"); }
              },
              "data-drag-handle": seq,
            },
          }),
          h("input", {
            type: "number", value: ref.order, "aria-label": t("orderLabel"),
            onChange: (e) => changeOrder(seq, Number(e.target.value)),
            style: { ...fieldStyle, width: "76px" },
          }),
          h("span", { style: { flex: 1, minWidth: 0 } }, section.title,
            !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody"))),
          scopeMenu(row),
          iconControl(t("openInSectionTab"), IconEditOutlineRegular, () => onOpenSection(ref.id)),
          iconControl(t("remove"), IconTrashOutlineRegular, () => setConfirmRemove(seq)));
      };
      const outlineRowsEls = [];
      rows.forEach((row, index) => {
        outlineRowsEls.push(dropZone(index));
        outlineRowsEls.push(renderRow(row));
      });
      outlineRowsEls.push(dropZone(rows.length));
      return h("div", null,
        h("div", { style: { ...rowStyle, borderBottom: "none" } },
          iconControl(t("back"), IconChevronLeftOutlineMedium, leave, { variant: "outline", tooltip: false, key: "back" }),
          h("strong", { style: { flex: 1 } }, title || idOf(profile)),
          // Count only the resolvable sections; broken refs are called out.
          h(Tag, null, brokenRows.length
            ? `${ours.length} ${t("sectionsWord")} · ${brokenRows.length} ${t("brokenWord")}`
            : `${ours.length} ${t("sectionsWord")}`)),
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
        // Removing a ref is destructive too — same confirmation as the other
        // destructive actions (no silent one-click removal).
        // Removing a ref is destructive too — same confirmation as the other
        // destructive actions (no silent one-click removal). `confirmRemove` is
        // the ref OCCURRENCE, so removing one of two duplicate refs keeps the other.
        confirmRemove !== null && h(ConfirmDialog, {
          open: true, title: t("confirmRemoveRef"), actionLabel: t("remove"),
          body: sectionsById.get(refs[confirmRemove]?.id)?.title || refs[confirmRemove]?.id || "", t,
          onCancel: () => setConfirmRemove(null),
          onConfirm: () => { const seq = confirmRemove; setConfirmRemove(null); removeRef(seq); },
        }),
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
          title: `${profile.title} ${t("copySuffix")}`,
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
          h("span", { flex: 1 }, profile.title),
          h("span", { style: mutedStyle }, `${(profile.sections ?? []).length} ${t("sectionsWord")}`),
          iconControl("edit", IconEditOutlineRegular, () => setDrill(idOf(profile))),
          iconControl(t("duplicate"), IconCopyOutlineRegular, (e) => { e.stopPropagation(); duplicateProfile(profile); }, { disabled: mutating }),
          iconControl(t("deleteLabel"), IconTrashOutlineRegular, (e) => { e.stopPropagation(); setConfirming(profile); }, { disabled: mutating }))),
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
      // The anchor is the Button primitive (ghost/sm) like the composer chip.
      return h(Menu, {
        open,
        onClose: () => setOpen(false),
        anchor: h(Button, {
          variant: "ghost", size: "sm",
          "aria-label": t("defaultForNewSessions"), title: t("defaultForNewSessions"),
          onClick: () => setOpen(!open),
          style: chipMaxWidth,
        },
          h("span", { style: triggerLabelStyle }, profileLabel(selected, t)),
          h("span", { "aria-hidden": true, style: triggerChevronStyle }, h(IconChevronDownOutlineRegular, { size: 14 }))),
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
      // Inline hint inside the Change-id dialog (empty value). Kept LAST so the
      // shim's stateQueue sequences stay positional.
      const [renameHint, setRenameHint] = React.useState("");
      const titleRef = React.useRef(null);
      useFocusSelect(titleRef, autoFocusTitle === true);
      // Duplicate/delete/rename change which rows exist — and a rename does NOT
      // rewrite profile references (the profiles keep naming the old id): all
      // three go through the optimistic + poll mutation flow, never a bare
      // runSave-reload.
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
          title: `${section.title} ${t("copySuffix")}`, body: section.body ?? "",
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
        const oldId = refIdOf(section);
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
        const prefix = /^prompt-(?:section|profile)-/.exec(oldId ?? "")?.[0] ?? "";
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
            if (onRenamed) onRenamed(live ? refIdOf(live) : newId);
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
      return h("div", null,
        h("div", { style: { ...rowStyle, borderBottom: "none" } },
          iconControl(t("back"), IconChevronLeftOutlineMedium, leave, { variant: "outline", tooltip: false, key: "back" }),
          h("strong", { style: { flex: 1 } }, idOf(section)),
          iconControl(t("duplicate"), IconCopyOutlineRegular, duplicate, { disabled: mutating }),
          iconControl(t("deleteLabel"), IconTrashOutlineRegular, () => setConfirmDelete(true), { disabled: mutating })),
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
            : usedIn.map((u, index) => h("span", {
              // profileId alone repeats when one profile references the section
              // with two scopes — the index keeps every React key unique.
              key: `${u.profileId}:${u.scope}:${index}`,
              style: { marginRight: "8px" },
            },
              `${usedInProfileName(state, u.profileId)} — ${t("scopeLabel")}: ${t(scopeKeyOf(u.scope))}`))),
        sourceKind && h("div", { style: mutedStyle, marginBottom: "8px" },
          `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}`),
        h("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
          h(Button, {
            variant: "outline",
            disabled: mutating || bundleOwned,
            // Both the button's own label and the confirmation carry the honest
            // warning that profile references are NOT rewritten any more.
            title: bundleOwned ? t("renameIdLocked") : t("renameNote"),
            onClick: () => { setRenameValue(refIdOf(section)); setRenameHint(""); setConfirmRename(true); },
          }, t("renameId")),
          // Blocked with a plain-language reason instead of a silent dead button.
          bundleOwned && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("renameIdLocked"))),
        confirmDelete && h(ConfirmDialog, {
          open: true, title: t("confirmDeleteSection"), actionLabel: t("deleteLabel"),
          body: section.title, t, onCancel: () => setConfirmDelete(false), onConfirm: () => { setConfirmDelete(false); remove(); },
        }),
        confirmRename && h(ConfirmDialog, {
          open: true, title: t("confirmRename"), actionLabel: t("confirm"),
          body: t("renameNote"), t,
          onCancel: () => { setConfirmRename(false); setRenameHint(""); },
          onConfirm: rename,
          extraChildren: h(React.Fragment, null,
            h("input", {
              value: renameValue, autoFocus: true,
              onChange: (e) => setRenameValue(e.target.value), style: { ...fieldStyle, width: "100%", boxSizing: "border-box" } }),
            // Soft hint: the id may not be blank (the dialog stays open).
            renameHint && h("p", { style: { ...mutedStyle, marginTop: "8px", marginBottom: 0 } }, renameHint)),
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
          h("span", { style: mutedStyle }, t("profileWord")),
          h(DefaultMenu, { state: { ...state, default: profileId }, t, onPick: setProfileId })),
        !profileId && h("p", { style: mutedStyle }, t("noProfiles")),
        profileId && !data && h("p", { style: mutedStyle }, "…"),
        data && data.plan.map((entry, i) => {
          if (entry.kind === "builtins") {
            return h("div", {
              key: `b${i}`,
              style: { ...mutedStyle, padding: "8px", margin: "8px 0", borderRadius: "8px", background: "var(--dsw-alias-bg-l2)" },
            }, `${t("builtinMarker")}  ${entry.names.join(", ")}`);
          }
          // The preview is assembled without the session, so any interpolation
          // variable is flagged here rather than shown as if it were exact.
          const body = (state.sections ?? []).find((s) => refIdOf(s) === entry.id)?.body;
          const flagged = previewVariableNotice(entry.text, body, data.variables, null);
          return h("div", {
            key: `${i}:${entry.id}`,
            style: { padding: "8px 0", borderTop: "1px solid var(--dsw-alias-border-l2)" },
          },
            h("div", null,
              h("span", { style: { ...mutedStyle, width: "72px", display: "inline-block", fontVariantNumeric: "tabular-nums" } },
                entry.order !== undefined ? String(entry.order) : ""),
              h("strong", null, ` ${entry.title}`),
              flagged && h("span", { style: { ...mutedStyle, marginLeft: "8px" } },
                h(Tag, null, `⚠ ${t("previewVariables")}`),
                ` ${flagged.map((name) => `{{${name}}}`).join(", ")}`)),
            h("pre", {
              style: { margin: "4px 0 0 72px", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px" },
            }, entry.text));
        }),
        data && data.skipped.length > 0 && h("div", { style: { marginTop: "12px" } },
          data.skipped.map((s) => h("div", {
            key: s.id ?? s.title,
            style: { ...mutedStyle, fontStyle: "italic" },
          }, `${t("skippedMarker")} ${s.title} — ${s.reason}`))),
        // A profile made only of broken/skipped refs still emits nothing: say so
        // explicitly instead of leaving the pane looking unfinished.
        data && data.plan.length === 0 && h("p", { style: mutedStyle }, t("previewEmpty")));
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
          // Esc must not throw the user out of the drill-down while they are
          // typing, nor fight an open dialog/menu (see escapesDrillDown).
          if (escapesDrillDown(event, typeof window !== "undefined" ? window : undefined)) {
            setDrillState((prev) => ({ ...prev, [tab]: null }));
          }
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
      components: { ProfilesTab, SectionsTab, SectionForm, ProfileOutline, PreviewTab },
      apply(ctx) {
        ctx.locale.register(NS, { en: messages, ru, zh });
        // The service owns per-key English fallback; the low-level request
        // fallback uses its binder so that string is localizable too.
        if (typeof ctx.locale.bind === "function") boundT = ctx.locale.bind(NS);
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
