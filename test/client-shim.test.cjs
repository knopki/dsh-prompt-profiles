// #region MODULE_CONTRACT
// PURPOSE: Verify the hand-authored client loader wrapper: chip visibility
//   gates, settings-section registration, the pure helpers, the frozen
//   write contract (patchId in rowId, whole-object `value`, no path ops),
//   the modal-free create flow (default title, poll until the patchId
//   appears, busy-guard, drill-down), error surfacing (server message in
//   the notify text + inline error line), and — since the astra review —
//   that every primitive is used with its REAL installed contract (Menu
//   open/anchor/onClose, Toast as a render-only component).
// SCOPE: Shim-only registration/component/flow test; NOT browser integration.
// INVARIANTS: Array/object comparisons use assert.deepStrictEqual on values
//   normalized out of the vm realm (JSON round-trip) — the assertion stays
//   strict while remaining cross-realm safe. Fake primitives THROW at element
//   creation when the real prop contract is violated, so any regression in
//   lib/client.js fails this file, not the browser. Async flow tests use a
//   1 ms poll interval and a try cap so the file can never hang.
// #endregion MODULE_CONTRACT
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// #region FUNC_plain
/** Normalize a vm-realm value into the test realm so deepStrictEqual works. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
// #endregion FUNC_plain

// #region FUNC_walk
/** Depth-first walk of the fake element tree (fake createElement output). */
function walk(el, visit) {
  if (!el || typeof el !== 'object') return;
  // A `.map()` inside JSX arrives as an ARRAY child: descend into it without
  // visiting the array itself, otherwise rows rendered by map() are invisible.
  if (Array.isArray(el)) { for (const child of el) walk(child, visit); return; }
  visit(el);
  for (const child of el.children ?? []) walk(child, visit);
  // Elements also live in element-valued props (Modal `footer`, Menu `anchor`,
  // an explicit `children` prop): the fake createElement keeps those in props,
  // never in `children`, so descend into object props that are elements/arrays.
  for (const value of Object.values(el.props ?? {})) {
    if (value && typeof value === 'object' && (value.type !== undefined || Array.isArray(value))) {
      walk(value, visit);
    }
  }
}
const elementText = (el) => JSON.stringify(el);
function hasElement(el, predicate) {
  let found = false;
  walk(el, (node) => { if (predicate(node)) found = true; });
  return found;
}
// #endregion FUNC_walk

// #region SECTION_fakes Fake primitives that ENFORCE the installed contracts
// (signatures verified against @deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.1
// lib/types/{Menu,Toast,Tooltip,SegmentedTabs,Checkbox,Modal}.d.ts). Each fake
// is a non-component object with a validate(props) called by the fake
// React.createElement at element-creation time — a wrong call site in the
// client throws here instead of silently rendering nothing in the browser.
const Menu = {
  name: 'Menu',
  validate(props) {
    if (typeof props?.open !== 'boolean') throw new TypeError('Menu requires a boolean `open` (owner-controlled)');
    if (props.anchor === undefined || props.anchor === null) throw new TypeError('Menu requires `anchor` (the trigger element, rendered in place)');
    if (typeof props.onClose !== 'function') throw new TypeError('Menu requires an `onClose` callback');
    if (props.onSelect !== undefined && typeof props.onSelect !== 'function') throw new TypeError('Menu.onSelect must be a function');
    for (const entry of props.items ?? []) {
      if (typeof entry?.id !== 'string') throw new TypeError('every Menu items entries need a string id');
      if (!('label' in entry) && !('type' in entry)) throw new TypeError('Menu items entries are data rows: {id,label} or {type:\'separator\'|\'label\'}');
    }
  },
};
const MenuItemButton = {
  name: 'MenuItemButton',
  validate(props) {
    if ('onClick' in (props ?? {})) throw new TypeError('MenuItemButton has NO onClick — activation arrives on onSelect');
    if (typeof props?.onSelect !== 'function') throw new TypeError('MenuItemButton requires onSelect');
  },
};
// Toast uses hooks internally: it must never be called as a plain function.
// The fake is deliberately NOT callable, so `Toast({...})` in client code
// would throw a TypeError here (and an invalid-hook-call in the browser).
const Toast = {
  name: 'Toast',
  validate(props) {
    if (typeof props?.text !== 'string') throw new TypeError('Toast requires a string `text` (not `message`)');
    if (typeof props.onDone !== 'function') throw new TypeError('Toast requires `onDone` — the owner unmounts the banner there');
  },
};
const Tooltip = {
  name: 'Tooltip',
  validate(props) {
    if (typeof props?.label !== 'string' && typeof props?.label !== 'function') throw new TypeError('Tooltip requires `label` (not `content`)');
    if (!props.children) throw new TypeError('Tooltip requires a single anchor child element');
  },
};
const SegmentedTabs = {
  name: 'SegmentedTabs',
  validate(props) {
    if (!Array.isArray(props?.items) || props.items.length < 1) throw new TypeError('SegmentedTabs requires a non-empty items array');
    for (const tab of props.items) {
      for (const key of ['value', 'label', 'id', 'panelId']) {
        if (!(key in tab)) throw new TypeError(`SegmentedTabs items entries require ${key}`);
      }
    }
    if (!props.items.some((tab) => tab.value === props.value)) throw new TypeError('SegmentedTabs value must belong to items');
    if (typeof props.onChange !== 'function') throw new TypeError('SegmentedTabs requires onChange');
    if (typeof props.label !== 'string') throw new TypeError('SegmentedTabs requires an accessible label');
  },
};
const Checkbox = {
  name: 'Checkbox',
  validate(props) {
    if (typeof props?.checked !== 'boolean') throw new TypeError('Checkbox requires boolean `checked`');
    if (typeof props.onChange !== 'function') throw new TypeError('Checkbox requires onChange');
    if (typeof props.label !== 'string') throw new TypeError('Checkbox requires a localized `label`');
  },
};
const Modal = {
  name: 'Modal',
  validate(props) {
    if (typeof props?.open !== 'boolean') throw new TypeError('Modal requires boolean `open`');
    if (typeof props.onClose !== 'function') throw new TypeError('Modal requires onClose');
    if (typeof props.title !== 'string') throw new TypeError('Modal requires a string title');
    if (!props.headless && typeof props.closeLabel !== 'string') throw new TypeError('Modal requires closeLabel unless headless');
  },
};
const passthrough = (name) => ({ name, validate() {} });
const primitives = Object.fromEntries([
  Menu, MenuItemButton, Toast, Tooltip, SegmentedTabs, Checkbox, Modal,
  passthrough('Tag'), passthrough('Input'), passthrough('Button'),
  ...['IconChevronUpOutlineMedium', 'IconChevronDownOutlineMedium', 'IconChevronsUpDownOutlineRegular',
    'IconChevronDownOutlineRegular',
    'IconChevronLeftOutlineMedium', 'IconEditOutlineRegular', 'IconCopyOutlineRegular',
    'IconTrashOutlineRegular', 'IconPlusOutlineRegular', 'IconSearchOutlineRegular',
    'IconWarningOutlineRegular'].map((name) => [name, passthrough(name)]),
].map((entry) => [entry.name ?? entry[0], entry.name ? entry : entry[1]]));

// The fakes must reject the OLD broken call shapes (self-test of the enforcement).
assert.throws(() => Menu.validate({ onClose() {} }), /open/, 'fake Menu rejects a missing open');
assert.throws(() => Menu.validate({ open: true, onClose() {} }), /anchor/, 'fake Menu rejects a missing anchor');
assert.throws(() => MenuItemButton.validate({ onClick() {} }), /onSelect/, 'fake MenuItemButton rejects onClick');
assert.throws(() => Toast.validate({ message: 'x' }), /text/, 'fake Toast rejects the old message prop');
assert.throws(() => Tooltip.validate({ content: 'x', children: {} }), /label/, 'fake Tooltip rejects content');
assert.throws(() => SegmentedTabs.validate({ items: [{ value: 'a', label: 'A' }], value: 'a', onChange() {}, label: 'l' }), /id|panelId/, 'fake SegmentedTabs rejects items without id/panelId');
// Toast itself must be impossible to call as a function.
assert.throws(() => Toast({ text: 'x' }), /not a function/, 'fake Toast is not callable — component only');
// #endregion SECTION_fakes

let loaded;
let stateQueue = [];
let lastSetState;
// Every committed state value, in order — needed where a handler sets several
// pieces of state (the chip sets the optimistic choice, then closes the menu).
let setStateLog = [];
// Record the same-origin fetches the client issues (e.g. POST /last) so the
// exact request body can be asserted; every call resolves an empty JSON doc.
const fetchCalls = [];
const fetchStub = (url, options) => {
  fetchCalls.push([url, options?.body ? JSON.parse(options.body) : null]);
  return Promise.resolve({ ok: true, json: async () => ({}) });
};
const React = {
  createElement: (type, props, ...children) => {
    if (type && typeof type.validate === 'function') type.validate({ ...props, children: children[0] });
    return { type, props: props || {}, children };
  },
  Fragment: Symbol('Fragment'),
  // The setter records the value it WOULD commit (this shim never re-renders),
  // so state-driven handlers — DnD reorder, gated autosave — can be asserted on
  // their real output instead of only on their wiring.
  useState: (value) => {
    const initial = stateQueue.length ? stateQueue.shift() : (typeof value === 'function' ? value() : value);
    return [initial, (next) => {
      lastSetState = typeof next === 'function' ? next(initial) : next;
      setStateLog.push(lastSetState);
    }];
  },
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
};
const code = fs.readFileSync(require('node:path').join(__dirname, '../lib/client.js'), 'utf8');
new vm.Script(code, { filename: 'lib/client.js' });
vm.runInNewContext(code, {
  window: { __ModuleLoader__: { load: (module) => { loaded = module.factory((name) => name === 'react' ? React : primitives); } } },
  // The create-flow poll needs real timers inside the vm realm.
  setTimeout, clearTimeout,
  fetch: fetchStub,
});
// The client must never invoke Toast/Menu as plain functions (invalid hook call).
assert.doesNotMatch(code, /(?<![a-zA-Z])Toast\s*\(/, 'client never calls Toast() as a function');
assert.doesNotMatch(code, /(?<![a-zA-Z])Menu\s*\(/, 'client never calls Menu() as a function');
// The client must never build path-op payloads again (frozen whole-object contract).
assert.doesNotMatch(code, /op:\s*["']set["']/, 'client never builds path-op update payloads');
const dict = { en: { nav: 'Prompt profiles' } };
// #region SECTION_strictCtx
// ACTIVATION GUARD: the plugin object must declare exactly the services its
// apply() touches. The fake ctx is built FROM the declared inject list — a
// Proxy answers only those names and throws on anything else, so an
// undeclared ctx.<service> access (the class of bug that made web boot fail
// with "1 entry did not activate") fails this file, not the browser.
assert.ok(loaded.inject && Array.isArray(loaded.inject), 'plugin declares an inject array');
assert.deepStrictEqual(plain(loaded.inject), ['slots', 'locale'],
  'inject must declare exactly the services apply() uses: slots + locale');
function makeStrictCtx(services) {
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (Object.prototype.hasOwnProperty.call(services, prop)) return services[prop];
      throw new Error(
        `ctx.${String(prop)} accessed but not declared in plugin inject [${loaded.inject.join(', ')}]`
        + ' — add it to inject or stop using it (Cordis leaves undeclared services unreachable on ctx)');
    },
  });
}
const ctx = makeStrictCtx({
  locale: {
    // Capture EVERY registered locale so the ru/zh dictionaries can be checked
    // against `en` (a key drifting out of sync would silently fall back).
    register: (ns, d) => {
      assert.equal(ns, 'promptProfiles');
      for (const [id, entries] of Object.entries(d)) dict[id] = { ...(dict[id] ?? {}), ...entries };
    },
    bind: (ns) => (key) => dict.en[key] ?? key,
  },
  slots: {
    inject: (name, callback) => { callback(); },
    register: (options, component) => registrations.push({ name: options.name, options, component }),
  },
});
const registrations = [];
loaded.apply(ctx);
// The strict ctx must reject an undeclared service with a clear error (self-test).
assert.throws(() => makeStrictCtx({}).remote, /not declared in plugin inject/,
  'strict ctx names the missing declaration');
// #endregion SECTION_strictCtx
assert.equal(registrations.length, 2, 'chip + settings.section registrations');

// #region SECTION_chip Chip registration, null gates, and REAL menu contract.
const chip = registrations.find((r) => r.name === 'conversation.input.left');
assert.ok(chip, 'chip registration exists');
assert.equal(chip.options.id, 'prompt-profile');
assert.equal(chip.options.order, 10);
assert.equal(chip.options.inject('sid').sessionId, 'sid');
assert.equal(typeof chip.options.inject('sid').pick, 'function');
const base = { sessionId: 'sid', useSession: (select) => select({ blank: false }), useWorkspaces: (select) => select({ items: [] }), t: (key) => key };
assert.equal(chip.component(base), null, 'non-blank session returns null');
assert.equal(chip.component({ ...base, useSession: (select) => select({ blank: true }) }), null, 'empty profile state returns null');
// With loaded state on a blank session the chip renders — and its Menu element
// must satisfy the installed contract (open/anchor/onClose/items) at creation.
// Entries now carry the frozen /state id triple (rowId/patchId/configId).
const chipStyle = {
  sessionId: 'sid',
  useSession: (select) => select({ blank: true }),
  useWorkspaces: (select) => select({ items: [] }),
  useSessions: (select) => select({ byId: { sid: { cwd: '/work/repo' } } }),
  t: (key) => key,
  pick: () => Promise.resolve({}),
};
stateQueue = [{
  profiles: [{ rowId: 'prompt-profile-light', patchId: 'profile-light', configId: 'light', title: 'Light', sections: [] }],
  sections: [], builtinOrders: {}, default: 'light', lastByWorkspace: {},
}];
const chipEl = chip.component({ ...chipStyle });
stateQueue = [];
assert.ok(chipEl, 'blank session with profiles renders the chip');
const chipMenu = chipEl.children.find((child) => child.type === Menu);
assert.ok(chipMenu, 'chip renders a Menu element');
assert.equal(chipMenu.props.open, false, 'chip Menu is owner-controlled via open');
assert.ok(chipMenu.props.anchor, 'chip Menu carries the anchor trigger');
// Menu = `none` + the profiles ONLY: the "Manage profiles…" entry is deleted
// (a third-party plugin has no Settings-navigation API in this version).
assert.deepStrictEqual(plain(chipMenu.props.items), [
  { id: 'none', label: 'none' },
  { id: 'light', label: 'Light' },
], 'menu items are exactly `none` + the profiles — no separator, no manage row');
assert.ok(!chipMenu.props.items.some((entry) => entry.id === 'manage' || entry.type === 'separator'),
  'no manage/separator data entries remain');
assert.equal(chipMenu.props.selectedId, 'light');
assert.equal(dict.en.manage, undefined, 'the `manage` locale string is gone');
assert.equal(dict.en.manageUnavailable, undefined, 'the `manageUnavailable` locale string is gone');
assert.equal(dict.en.profile, undefined, 'the `profile:` prefix locale string is gone');

// The chip is built on PRIMITIVES: a Button anchor (with its own hover/focus/
// active states) inside the Menu — not a div/native button with a hand-written
// style sheet (which is why the hover background had gone missing).
assert.equal(chipEl.type, React.Fragment, 'chip returns a Fragment (Menu + toast banner) — no wrapper div with inline layout');
const chipButton = chipMenu.props.anchor;
assert.equal(chipButton.type, primitives.Button, 'the Menu anchor is the installed Button primitive');
assert.equal(chipButton.props.variant, 'ghost', 'ghost carries the primitive hover/focus background');
assert.equal(chipButton.props.size, 'sm', 'compact composer size');
assert.equal(chipButton.props.icon, undefined, 'the chevron no longer rides the LEADING icon slot');
assert.equal(chipButton.children.length, 2, 'the button content is label + trailing chevron');
assert.equal(chipButton.children[1].type, 'span',
  'the chevron is a TRAILING child, after the label (Button has no trailing-icon slot)');
assert.equal(chipButton.children[1].children[0].type, primitives.IconChevronDownOutlineRegular,
  'the trailing span wraps the chevron icon, like the neighbouring triggers');
assert.equal(chipButton.children[0].type, 'span', 'the label stays first');
assert.equal(chipMenu.props.side, 'top', 'the dropdown opens UPWARD like conversation.input.permission');
assert.equal(chipMenu.props.portal, true, 'and is portaled out of the composer clipping, like the neighbours');
assert.equal(chipButton.props['aria-label'], 'menuLabel');
assert.equal(chipButton.props.title, 'menuLabel');
// The ONLY inline style left is the composer control's max width: the Button
// primitive exposes neither a max width nor a truncation slot.
assert.deepStrictEqual(Object.keys(chipButton.props.style), ['maxWidth'], 'no hand-written geometry remains on the button');
assert.equal(chipButton.props.style.maxWidth, '220px');
const chipLabel = chipButton.children[0];
assert.equal(chipLabel.type, 'span', 'long names still get an ellipsis span (no truncation slot on the primitive)');
assert.equal(chipLabel.props.style.textOverflow, 'ellipsis');
// Trigger colors reproduce the neighbouring composer triggers token-for-token:
// the Button base is label-primary, the triggers override it (permission
// `.trigger`/`.chevron`, model selector `._trigger`/`._chevron`).
assert.equal(chipLabel.props.style.color, 'var(--dsw-alias-label-secondary)',
  'the chip label uses the neighbours` secondary token, not the Button base label-primary');
assert.equal(chipButton.children[1].props.style.color, 'var(--dsw-alias-label-caption)',
  'the chip chevron uses the caption token the neighbouring triggers use');
assert.ok(chipButton.children[1].props['aria-hidden'], 'the decorative chevron stays hidden from AT');
// The MENU is untouched: our items carry no color override, so the primitive
// renders them with its own label-primary.
assert.ok(chipMenu.props.items.every((entry) => entry.style === undefined && entry.color === undefined),
  'menu items keep the primitive label-primary (no trigger color leaks into the dropdown)');
const chipText = elementText(chipButton);
assert.ok(chipText.includes('Light'), 'the button shows the profile NAME');
assert.ok(!chipText.includes('profile:'), 'the "profile:" prefix is gone');
assert.ok(!chipText.includes('▾'), 'the text glyph is gone (the chevron is an icon)');

// The choice must ALWAYS be delivered: workspaceId when known, else the cwd.
// (`request`/`choose` call fetch/pick synchronously before their first await,
// so these assertions need no await and cannot interleave with the harness.)
fetchCalls.length = 0;
chip.options.inject('sid').pick({ profileId: 'light', cwd: '/work/repo' });
assert.deepStrictEqual(plain(fetchCalls.at(-1)),
  ['/__dsh-prompt-profiles/last', { cwd: '/work/repo', profileId: 'light' }],
  'POST /last carries profileId + cwd when no workspaceId is known');
const picks = [];
stateQueue = [{
  profiles: [{ rowId: 'prompt-profile-light', patchId: 'profile-light', configId: 'light', title: 'Light', sections: [] }],
  sections: [], builtinOrders: {}, default: 'light', lastByWorkspace: {},
}];
const chipWithPick = chip.component({ ...chipStyle, pick: (choice) => { picks.push(choice); return Promise.resolve({}); } });
stateQueue = [];
chipWithPick.children.find((child) => child.type === Menu).props.onSelect('light');
assert.deepStrictEqual(plain(picks), [{ profileId: 'light', cwd: '/work/repo' }],
  'choose ALWAYS delivers {profileId, cwd} even when workspaceId is unknown');
// With a Workspace accounted to the Session, the choice is keyed by workspaceId
// alone (cwd is not sent alongside it).
const picksWs = [];
stateQueue = [{
  profiles: [{ rowId: 'prompt-profile-light', patchId: 'profile-light', configId: 'light', title: 'Light', sections: [] }],
  sections: [], builtinOrders: {}, default: 'light', lastByWorkspace: {},
}];
const chipWithWs = chip.component({
  ...chipStyle,
  useWorkspaces: (select) => select({ items: [{ workspaceId: 'ws1', path: '/work/repo', sessionIds: ['sid'] }] }),
  pick: (choice) => { picksWs.push(choice); return Promise.resolve({}); },
});
stateQueue = [];
chipWithWs.children.find((child) => child.type === Menu).props.onSelect('light');
assert.deepStrictEqual(plain(picksWs), [{ profileId: 'light', workspaceId: 'ws1' }],
  'with a known workspaceId the choice is {workspaceId, profileId} — one key only');

// With NEITHER workspaceId NOR cwd there is no key to store the choice under:
// the chip blocks the selection and explains — it must not POST.
const picksNoKey = [];
stateQueue = [{
  profiles: [{ rowId: 'prompt-profile-light', patchId: 'profile-light', configId: 'light', title: 'Light', sections: [] }],
  sections: [], builtinOrders: {}, default: 'light', lastByWorkspace: {},
}];
const chipNoKeys = chip.component({
  ...chipStyle,
  useSessions: (select) => select({ byId: {} }),
  pick: (choice) => { picksNoKey.push(choice); return Promise.resolve({}); },
});
stateQueue = [];
const noKeyMenu = chipNoKeys.children.find((child) => child.type === Menu);
assert.equal(noKeyMenu.props.anchor.props.title, 'chooseNeedsWorkspace',
  'the blocked chip explains itself (hover title) instead of silently failing');
fetchCalls.length = 0;
lastSetState = undefined;
noKeyMenu.props.onSelect('light');
assert.deepStrictEqual(plain(picksNoKey), [], 'with no workspaceId AND no cwd the choice is BLOCKED — no pick');
assert.equal(fetchCalls.length, 0, 'the blocked choice issues NO request');
assert.deepStrictEqual(plain(lastSetState), { seq: 1, text: 'chooseNeedsWorkspace' },
  'the blocked chip shows the localized "choose a workspace first" hint');
console.log('PASS loader syntax; slot conversation.input.left / prompt-profile / order 10');
console.log('PASS inject(sessionId) provides sessionId and pick callback');
console.log('PASS component returns null for non-blank session and empty profile state');
console.log('PASS chip Menu element satisfies the installed open/anchor/onClose/items contract');
// #endregion SECTION_chip

// #region SECTION_settings Settings-section registration (PLAN step 6).
const settings = registrations.find((r) => r.name === 'settings.section');
assert.ok(settings, 'settings.section registration exists');
assert.equal(settings.options.id, 'prompt-profiles');
assert.equal(settings.options.order, 25);
assert.equal(settings.options.label(), 'Prompt profiles', 'label resolves from the locale namespace');
assert.equal(settings.options.locale, 'promptProfiles');
const injected = settings.options.inject();
assert.equal(typeof injected.api.loadState, 'function');
assert.equal(typeof injected.api.profileUpdate, 'function');
assert.equal(typeof injected.api.sectionRename, 'function');
assert.equal(typeof injected.api.preview, 'function');
const sectionEl = settings.component({ t: (key) => key, api: injected });
assert.equal(sectionEl.type, 'div', 'settings page renders a loading placeholder (with the toast banner slot) before state arrives');
assert.ok(sectionEl.children.some((child) => child && child.type === 'p'), 'loading placeholder is the paragraph');
// The host mounts this section as the only child of client-ui-settings-general's
// own `.options` scroll panel, which has no scrollbar gutter. OUR root must be
// the scroller with a stable gutter so list ↔ drill height changes do not toggle
// the panel scrollbar (the "profile → back" jolt).
assert.equal(sectionEl.props.style.scrollbarGutter, 'stable', 'page reserves the scrollbar gutter (scrollbar-gutter: stable)');
assert.equal(sectionEl.props.style.overflowY, 'auto', 'our page root is the scroller (not the host panel)');
assert.equal(sectionEl.props.style.height, '100%', 'page fills the host options panel so the host never overflows');
assert.equal(sectionEl.props.style.boxSizing, 'border-box');
console.log('PASS settings.section / prompt-profiles / order 25 / label + api inject + loading render');
// #endregion SECTION_settings

// #region SECTION_i18n ru/zh register alongside en with IDENTICAL key sets.
const enKeys = Object.keys(dict.en).sort();
assert.ok(dict.ru && Object.keys(dict.ru).length > 0, 'the ru dictionary was registered');
assert.ok(dict.zh && Object.keys(dict.zh).length > 0, 'the zh dictionary was registered');
assert.deepStrictEqual(Object.keys(dict.ru).sort(), enKeys,
  'ru carries exactly the same keys as en — no drift, so no key silently falls back');
assert.deepStrictEqual(Object.keys(dict.zh).sort(), enKeys, 'zh carries exactly the same keys as en');
for (const id of ['en', 'ru', 'zh']) {
  for (const [key, value] of Object.entries(dict[id])) {
    assert.equal(typeof value, 'string', `${id}.${key} is a string`);
    assert.ok(value.trim() !== '', `${id}.${key} is non-empty (blank would render instead of falling back)`);
  }
}
// Keys with no remaining call site are deleted from ALL three dictionaries.
// (`previewEmpty` is back as a LIVE key: the no-output preview state.)
for (const dead of ['selected', 'sourceUser', 'newIdLabel']) {
  for (const id of ['en', 'ru', 'zh']) {
    assert.equal(dict[id][dead], undefined, `dead key "${dead}" is gone from ${id}`);
  }
}
console.log(`PASS i18n: ru + zh registered; ${enKeys.length} keys identical across en/ru/zh`);
// #endregion SECTION_i18n

// #region SECTION_previewWords Preview labels/markers go through the dictionary.
stateQueue = ['main', {
  plan: [
    { kind: 'builtins', names: ['persona-prefix', 'plan:policy'] },
    { kind: 'ours', id: 's1', title: 'S1', order: 10, text: 'text' },
  ],
  skipped: [{ id: 's2', title: 'S2', reason: 'scope' }],
}];
const previewEl = loaded.components.PreviewTab({
  state: {
    profiles: [{ rowId: 'prompt-profile-main', patchId: 'profile-main', configId: 'main', title: 'Main', sections: [] }],
    sections: [], builtinOrders: {}, default: 'main', modes: [],
  },
  api: {}, t: (k) => k, notify: () => {},
});
stateQueue = [];
const previewText = elementText(previewEl);
assert.ok(previewText.includes('profileWord'), 'the preview selector label comes from the dictionary');
assert.ok(previewText.includes('builtinMarker'), 'the built-in group marker comes from the dictionary');
assert.ok(previewText.includes('skippedMarker'), 'the skipped marker comes from the dictionary');
assert.ok(!previewText.includes('"Profile"'), 'no hardcoded "Profile" literal remains');
assert.ok(!previewText.includes('⟨built-in⟩') && !previewText.includes('⟨skipped⟩'),
  'no hardcoded English markers remain');
console.log('PASS preview words: profile label + built-in/skipped markers are dictionary-driven');
// #endregion SECTION_previewWords

// #region SECTION_apiShapes Frozen write contract: patchId in `rowId`, whole-object `value`, no ops.
const sent = [];
const recorderReq = (path, options) => {
  sent.push([path, options ? JSON.parse(options.body) : null]);
  return Promise.resolve({});
};
const recApi = loaded.makeApi(recorderReq);
(async () => {
  recApi.sectionUpdate('section-x', { title: 'T', body: 'B' });
  recApi.profileUpdate('profile-y', { title: 'P', sections: [{ id: 'x', order: 10, scope: 'inherit' }] });
  recApi.sectionCreate({ title: 'New section', body: '' });
  recApi.profileCreate({ title: 'New profile', sections: [] });
  recApi.sectionDelete('section-x');
  recApi.profileDelete('profile-y');
  recApi.sectionRename('section-x', 'renamed');
  const byPath = Object.fromEntries(sent);
  assert.ok(byPath['section/update'], 'section/update was issued');
  assert.deepStrictEqual(byPath['section/update'], { rowId: 'section-x', value: { title: 'T', body: 'B' } },
    'update sends {rowId: patchId, value: WHOLE object}');
  assert.ok(!('ops' in byPath['section/update']), 'no ops key in section/update');
  assert.deepStrictEqual(byPath['profile/update'], { rowId: 'profile-y', value: { title: 'P', sections: [{ id: 'x', order: 10, scope: 'inherit' }] } },
    'profile/update sends the whole object too');
  assert.ok(!('ops' in byPath['profile/update']), 'no ops key in profile/update');
  assert.deepStrictEqual(byPath['section/create'], { title: 'New section', body: '' },
    'create sends {title, body} — no client-generated id');
  assert.deepStrictEqual(byPath['profile/create'], { title: 'New profile', sections: [] });
  assert.deepStrictEqual(byPath['section/delete'], { rowId: 'section-x' }, 'delete sends the unqualified patchId');
  assert.deepStrictEqual(byPath['section/rename'], { rowId: 'section-x', id: 'renamed' });
  assert.ok(loaded.findEntry({ sections: [{ patchId: 'section-x' }], profiles: [] }, 'section-x'), 'findEntry locates by patchId');
  assert.equal(loaded.findEntry({ sections: [], profiles: [] }, 'nope'), null, 'findEntry misses cleanly');
  console.log('PASS api facade: whole-object {rowId: patchId, value} payloads, create without ids, no path ops');
})();
// #endregion SECTION_apiShapes

// #region SECTION_createFlow Modal-free create flow: default title, poll retry, busy guard, drill.
(async () => {
  // -- success with HMR-race polling: the new row appears only on the 3rd read.
  let reads = 0;
  const emptyState = { profiles: [], sections: [], builtinOrders: {} };
  const fullState = {
    profiles: [], builtinOrders: {},
    sections: [{ rowId: 'prompt-section-new-1', patchId: 'section-new-1', configId: 'new-1', title: 'New section', body: '', usedIn: [], source: 'user' }],
  };
  const creates = [];
  const events = [];
  const flow = loaded.makeCreateFlow({
    api: {
      sectionCreate: async (v) => { creates.push(v); return { rowId: 'prompt-section-new-1', patchId: 'section-new-1', configId: 'new-1', ...v }; },
      loadState: async () => { reads += 1; return reads < 3 ? emptyState : fullState; },
    },
    t: (k) => k, notify: (m) => events.push(['notify', m]),
    reload: async () => { events.push(['reload']); },
    getState: () => emptyState,
    onState: (s) => events.push(['state', s]),
    onDrill: (id) => events.push(['drill', id]),
    onPending: (b) => events.push(['pending', b]),
    pollInterval: 1, pollDeadline: 5,
  });
  const first = flow.create('section', { title: 'New section', body: '' });
  const second = flow.create('section', { title: 'New section', body: '' }); // in flight — must be a busy no-op
  const r2 = await second;
  assert.equal(r2.ok, false, 'concurrent create reports not-ok');
  assert.equal(r2.busy, true, 'concurrent create reports busy (the disabled-button guard)');
  const r1 = await first;
  assert.equal(r1.ok, true, 'create succeeds once the row appears');
  assert.equal(creates.length, 1, 'exactly ONE create POST — the double submit never reaches the server');
  assert.equal(reads, 3, 'polled /state until the patchId appeared (2 misses, 1 hit)');
  assert.deepEqual(events.filter((e) => e[0] === 'drill').at(-1), ['drill', 'new-1'], 'drills into the created item by its unqualified id');
  const states = events.filter((e) => e[0] === 'state').map((e) => e[1]);
  assert.equal(states.length, 2, 'state pushed twice: optimistic insert, then the polled document');
  assert.equal(states[0].sections.length, 1, 'optimistic state already renders the new row from the create response');
  assert.equal(states[0].sections[0].configId, 'new-1', 'optimistic row carries the unqualified id from the create response');
  assert.equal(states[0].sections[0].source, 'user', 'optimistic row assumes user source until the row mounts');
  assert.equal(states[1], fullState, 'the polled state (source/usedIn from the mounted row) replaces the optimistic one');
  const pendings = events.filter((e) => e[0] === 'pending').map((e) => e[1]);
  assert.deepEqual(pendings, [true, false], 'pending flag brackets the flight (create button disabled while in flight)');

  // -- timeout: the row never appears — bounded retries, no hang.
  const slowApi = { sectionCreate: async (v) => ({ patchId: 'ghost', configId: 'ghost', ...v }), loadState: async () => emptyState };
  const notes = [];
  const timeoutFlow = loaded.makeCreateFlow({
    api: slowApi, t: (k) => k, notify: (m) => notes.push(m), reload: async () => {},
    getState: () => emptyState,
    pollInterval: 1, pollDeadline: 3,
  });
  const rt = await timeoutFlow.create('section', { title: 'x', body: '' });
  assert.equal(rt.ok, false, 'timeout path resolves not-ok');
  assert.ok(notes[0].includes('createTimeout'), 'timeout notify carries the createTimeout message');

  // -- server error: the {error:{message}} text reaches the notify (Toast).
  const failApi = {
    sectionCreate: async () => { const e = new Error('writer: row id "prompt-section-1" already exists'); e.status = 400; throw e; },
    loadState: async () => emptyState,
  };
  const errs = [];
  const errFlow = loaded.makeCreateFlow({
    api: failApi, t: (k) => k, notify: (m) => errs.push(m), reload: async () => {},
    getState: () => emptyState,
    pollInterval: 1, pollDeadline: 5,
  });
  const re = await errFlow.create('section', { title: 'New section', body: '' });
  assert.equal(re.ok, false, 'failed create resolves not-ok');
  assert.ok(errs[0].includes('already exists'), `server message surfaced: ${errs[0]}`);
  assert.ok(errs[0].startsWith('createError'), 'notify prefixes with the localized createError');
  console.log('PASS create flow: single POST under double submit, poll retry, busy guard, drill, timeout, server error toast');
})();
// #endregion SECTION_createFlow

// #region SECTION_runSave Whole-object save runner: 409 re-apply once, error surfacing.
(async () => {
  const notes = [];
  let attempts = 0;
  const reloads = [];
  const ok = await loaded.runSave(
    async () => { attempts += 1; if (attempts === 1) { const e = new Error('stale revision'); e.status = 409; throw e; } },
    async () => { reloads.push(1); },
    (k) => k, (m) => notes.push(m));
  assert.equal(ok, true, '409 re-read + re-apply succeeds');
  assert.equal(attempts, 2, 'mutation applied exactly twice (first 409, then once more)');
  assert.equal(reloads.length, 2, '409 path: reload before the retry, reload after the success');
  assert.equal(notes.length, 0, 'no toast on the recovered 409');

  let failures = 0;
  const inline = [];
  const bad = await loaded.runSave(
    async () => { failures += 1; const e = new Error('internal error'); e.status = 500; throw e; },
    async () => {},
    (k) => k, (m) => notes.push(m), (text) => inline.push(text));
  assert.equal(bad, false, 'non-409 failure reports false');
  assert.equal(failures, 1, 'non-409 failure is NOT retried');
  assert.ok(notes.at(-1).includes('internal error'), 'server message reaches the toast notify');
  assert.equal(inline[0], 'saveError internal error', 'inline error line receives the same visible text');
  console.log('PASS runSave: 409 re-apply once, 500 surfaces server message in toast + inline error');
})();
// #endregion SECTION_runSave

// #region SECTION_tabsNoCreateModal Tabs render: create is a plain button, no create modal; default title payload.
const sectionEntry = {
  rowId: 'prompt-section-sec-1', patchId: 'section-sec-1', configId: 'sec-1',
  title: 'Greeting', body: 'Be kind.', usedIn: [], source: 'user', emits: true,
};
const profileEntry = {
  rowId: 'prompt-profile-main', patchId: 'profile-main', configId: 'main',
  title: 'Main', sections: [], usedIn: [], source: 'user',
};
const tabState = { profiles: [profileEntry], sections: [sectionEntry], builtinOrders: {}, default: null, modes: [] };
const noop = () => {};
const flowCalls = [];
const fakeFlow = { create: (kind, value) => { flowCalls.push([kind, value]); return Promise.resolve({ ok: true }); } };

// SectionsTab useState order: query, creating, justCreated.
stateQueue = ['', false, null];
const secTab = loaded.components.SectionsTab({
  state: tabState, api: {}, reload: noop, t: (k) => k, notify: noop,
  drill: null, setDrill: noop, setState: noop, createFlow: fakeFlow,
});
stateQueue = [];
assert.ok(!hasElement(secTab, (n) => n.type === Modal), 'SectionsTab renders NO modal — creation is modal-free');
const secButtons = [];
walk(secTab, (n) => { if (n.type === primitives.Button || n.type?.name === 'Button') secButtons.push(n); });
const createSectionBtn = secButtons.find((b) => elementText(b).includes('newSection'));
assert.ok(createSectionBtn, '+ New section button rendered');
assert.equal(createSectionBtn.props.disabled, false, 'create button enabled when idle');
createSectionBtn.props.onClick();
assert.deepEqual(plain(flowCalls.at(-1)), ['section', { title: 'defaultSectionTitle', body: '' }],
  'create click POSTs the default title payload (locale key resolved at click time)');

// ProfilesTab useState order: creating, confirming, justCreated, mutating.
stateQueue = [false, null, null, false];
const profTab = loaded.components.ProfilesTab({
  state: tabState, api: {}, reload: noop, t: (k) => k, notify: noop,
  drill: null, setDrill: noop, onOpenSection: noop, setState: noop, createFlow: fakeFlow,
});
stateQueue = [];
assert.ok(!hasElement(profTab, (n) => n.type === Modal), 'ProfilesTab renders NO modal while not confirming a delete');
const profButtons = [];
walk(profTab, (n) => { if (n.type === primitives.Button || n.type?.name === 'Button') profButtons.push(n); });
const createProfileBtn = profButtons.find((b) => elementText(b).includes('newProfile'));
assert.ok(createProfileBtn, '+ New profile button rendered');
assert.equal(createProfileBtn.props.disabled, false, 'profile create button enabled when idle');
createProfileBtn.props.onClick();
assert.deepEqual(plain(flowCalls.at(-1)), ['profile', { title: 'defaultProfileTitle', sections: [] }],
  'profile create click POSTs the default title payload');
// The default profile carries NO ★ marker in the list — the «Default for new
// sessions» selector below already states it.
stateQueue = [false, null, null, false];
const profTabDefault = loaded.components.ProfilesTab({
  state: { ...tabState, default: 'main' }, api: {}, reload: noop, t: (k) => k, notify: noop,
  drill: null, setDrill: noop, onOpenSection: noop, setState: noop, createFlow: fakeFlow,
});
stateQueue = [];
assert.ok(!elementText(profTabDefault).includes('★'), 'the default profile shows NO ★ marker in the list');
let defaultMenuEl = null;
walk(profTabDefault, (n) => { if (n.type?.name === 'DefaultMenu') defaultMenuEl = n; });
assert.ok(defaultMenuEl, 'the «Default for new sessions» selector renders');
const defaultMenuRendered = defaultMenuEl.type(defaultMenuEl.props);
assert.equal(defaultMenuRendered.type, Menu, 'the default selector is a Menu primitive');
assert.equal(defaultMenuRendered.props.anchor.type, primitives.Button, 'the default selector anchor is also the installed Button primitive');
assert.equal(defaultMenuRendered.props.anchor.children[1].type, 'span',
  'the default selector also puts the chevron in the TAIL (label first)');
assert.equal(defaultMenuRendered.props.anchor.children[1].children[0].type, primitives.IconChevronDownOutlineRegular,
  'and wraps the chevron icon like the chip');
assert.equal(defaultMenuRendered.props.anchor.children[0].props.style.color, 'var(--dsw-alias-label-secondary)',
  'the default selector shares the trigger label token');
assert.equal(defaultMenuRendered.props.anchor.children[1].props.style.color, 'var(--dsw-alias-label-caption)',
  'and the trigger chevron token');
console.log('PASS tabs: modal-free create buttons wired to the flow with default titles');
// #endregion SECTION_tabsNoCreateModal

// #region SECTION_sectionFormErrors SectionForm renders the inline error line.
// SectionForm useState order: title, body, confirmDelete, renameValue, confirmRename, error, mutating.
stateQueue = ['Greeting', 'Be kind.', false, 'sec-1', false, 'saveError internal error', false];
const formEl = loaded.components.SectionForm({
  section: sectionEntry, state: tabState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, autoFocusTitle: false,
});
stateQueue = [];
assert.ok(hasElement(formEl, (n) => n.props && n.props.role === 'alert' && elementText(n).includes('internal error')),
  'SectionForm shows an inline error line with the server message next to the fields');
console.log('PASS SectionForm: inline error line renders the server message');
// #endregion SECTION_sectionFormErrors

// #region SECTION_helpers Pure helpers (strict, realm-normalized comparisons).
const H = loaded.helpers;
assert.ok(H, 'helpers are exported on the module object');
assert.equal(H.idOf(profileEntry), 'main', 'idOf prefers the unqualified configId');
assert.equal(H.idOf({ patchId: 'p' }), 'p', 'idOf falls back to patchId');

// slugify/uniqueSlug were dead (no production call site) and are deleted.
assert.equal(H.slugify, undefined, 'the dead slugify helper is gone');
assert.equal(H.uniqueSlug, undefined, 'the dead uniqueSlug helper is gone');

// profileLabel — a chosen profile with an empty bundle title never reads "None".
assert.equal(H.profileLabel({ configId: 'light', title: 'Light tone' }, (k) => k), 'Light tone');
assert.equal(H.profileLabel({ configId: 'light', title: '' }, (k) => k), 'light', 'empty title falls back to the id');
assert.equal(H.profileLabel({ patchId: 'p1' }, (k) => k), 'p1');
assert.equal(H.profileLabel(null, (k) => k), 'none', 'no selection reads as None');
assert.equal(H.profileLabel({ title: '' }, (k) => k), 'untitled', 'no title AND no id falls back to the dictionary');

// escapesDrillDown — Esc closes the drill only outside editable fields and
// open dialogs/menus (Esc while typing used to discard the user's place).
const escEvent = (key, closest) => ({ key, target: { closest: closest ?? (() => null) } });
assert.equal(H.escapesDrillDown(escEvent('Escape')), true, 'a plain Esc closes the drill');
assert.equal(H.escapesDrillDown(escEvent('Enter')), false, 'other keys never close it');
assert.equal(H.escapesDrillDown(escEvent('Escape', () => ({}))), false, 'Esc inside an editable field is ignored');
assert.equal(H.escapesDrillDown(undefined), false, 'a missing event is tolerated');
assert.equal(H.escapesDrillDown(escEvent('Escape'), { document: { querySelector: () => ({}) } }), false,
  'an open dialog/menu blocks the drill reset');
assert.equal(H.escapesDrillDown(escEvent('Escape'), { document: { querySelector: () => null } }), true,
  'no overlay → Esc still closes');

// insertionOrders — the DnD insertion boundaries. INTEGER orders only: the order
// of the row that ends up directly above the drop, +1 (built-in orders included);
// broken refs carry no order.
const irows = [
  { kind: 'builtin', order: 100 },
  { kind: 'ours', order: 100 },
  { kind: 'ours', order: 200 },
];
assert.deepStrictEqual(plain(H.insertionOrders(irows)), [99, 101, 101, 201],
  'top = first−1; a middle drop = the row above + 1; bottom = last + 1');
assert.deepStrictEqual(plain(H.insertionOrders([{ kind: 'ours', order: 500 }])), [499, 501],
  'a lone row still has a boundary above (−1) and below (+1)');
assert.deepStrictEqual(plain(H.insertionOrders([{ kind: 'broken', order: 7 }, { kind: 'ours', order: 100 }])), [99, 99, 101],
  'a broken ref carries no order, so both its gaps resolve against the next ordered row (before it)');
assert.deepStrictEqual(plain(H.insertionOrders([])), [100], 'an empty outline has one boundary');
// No halves anywhere: dropping between 499 and 500 gives 500, not 499.5.
const gap = H.insertionOrders([{ kind: 'ours', order: 499 }, { kind: 'ours', order: 500 }]);
assert.deepStrictEqual(plain(gap), [498, 500, 501], 'between 499 and 500 the boundary is 500 (never 499.5)');
assert.ok(plain(gap).every(Number.isInteger), 'and every boundary is an integer');
assert.ok([...H.insertionOrders(irows), ...gap].every(Number.isInteger),
  'no insertion order is ever fractional');
// Dropping just BELOW a built-in that shares the order must land AFTER it: the
// host inserts our section BEFORE a built-in at an equal order, so copying 100
// would hoist it above — the +1 is what keeps the visual position.
const belowBuiltin = H.insertionOrders([{ kind: 'builtin', order: 100 }, { kind: 'ours', order: 100 }]);
assert.equal(belowBuiltin[1], 101, 'a drop below the built-in gets its order + 1');
assert.deepStrictEqual(plain(H.outlineRows(
  { sections: [{ id: 'a', order: belowBuiltin[1], scope: 'inherit' }] },
  { a: { id: 'a', title: 'A' } },
  { 'plan:policy': 100 },
)).map((r) => r.kind), ['builtin', 'ours'], 'and the resulting visual position is BELOW the built-in');
assert.equal(typeof H.planReorder, 'undefined', 'the row-to-row helper is GONE with the row-target model');
assert.equal(typeof H.effectiveOrder, 'undefined', 'the client +0.5 helper is GONE (equal orders are normal)');
assert.equal(typeof H.planMove, 'undefined', 'the arrow-move helper is GONE with the ↑↓ buttons');

// outlineRows — raw persisted orders, no half-step and no collision flag
const outline = H.outlineRows(
  { sections: [{ id: 'x', order: 500, scope: 'inherit' }, { id: 'gone', order: 10, scope: 'inherit' }] },
  { x: { id: 'x', title: 'X', body: 'hi' } },
  { 'persona-prefix': 0, 'plan:policy': 500 });
assert.deepStrictEqual(plain(outline).map((r) => r.kind), ['builtin', 'ours', 'builtin', 'broken'],
  'at an EQUAL order our section stands BEFORE the built-in, as the runtime assembles it');
assert.equal(outline[1].order, 500, 'ours row keeps its persisted order — equal to the built-in plan:policy 500');
assert.equal(outline[2].order, 500, 'the built-in shares that order and follows us');
assert.equal(outline[1].displayOrder, undefined, 'no +0.5 display order on the row');
assert.equal(outline[1].collides, undefined, 'no collision flag on the row');
assert.equal(outline[3].ref.id, 'gone', 'missing section becomes a broken row');
assert.deepStrictEqual(plain(outline[1].ref), { id: 'x', order: 500, scope: 'inherit' }, 'ours ref round-trips through the vm realm');

// canSaveSection — the section autosave gate (an empty/unconfirmed row never writes)
assert.equal(H.canSaveSection('Greeting', true), true, 'confirmed row with a title may save');
assert.equal(H.canSaveSection('   ', true), false, 'whitespace-only title is NOT saved');
assert.equal(H.canSaveSection('', true), false, 'empty title is NOT saved (server 400 value.title must be non-empty)');
assert.equal(H.canSaveSection(undefined, true), false, 'missing title is NOT saved');
assert.equal(H.canSaveSection('Greeting', false), false, 'a row not confirmed by the /state poll is NOT saved');

// sourceKindOf / usedInProfileName
assert.equal(H.sourceKindOf('bundle'), 'bundle');
assert.equal(H.sourceKindOf('unknown'), 'unknown');
assert.equal(H.sourceKindOf('user'), null, 'user rows carry no source badge');
assert.equal(H.sourceKindOf(undefined), null, 'an unrecognised source is not shown as user');
assert.equal(H.usedInProfileName({ profiles: [{ configId: 'light', title: 'Light tone' }] }, 'light'), 'Light tone', 'used-in shows the profile TITLE');
assert.equal(H.usedInProfileName({ profiles: [] }, 'ghost'), 'ghost', 'a missing profile falls back to the raw id');
assert.equal(H.usedInProfileName({ profiles: [{ configId: 'x', title: '' }] }, 'x'), 'x', 'a blank title falls back to the id');
// scopeKeyOf — one mapping so no view ever renders the raw enum value.
assert.equal(H.scopeKeyOf('main-only'), 'scopeMainOnly');
assert.equal(H.scopeKeyOf('subagents-only'), 'scopeSubagentsOnly');
assert.equal(H.scopeKeyOf('inherit'), 'scopeInherit');
assert.equal(H.scopeKeyOf(undefined), 'scopeInherit', 'an absent scope reads as inherit');

// renameNotice — the post-rename report. The host no longer rewrites refs, so a
// rename must surface the profiles still holding the old id (and never throw on
// the older payload without `affectedProfiles`). An empty/absent list means there
// is nothing to flag: no notice at all.
assert.equal(H.renameNotice({ affectedProfiles: [] }, (k) => k), null,
  'an EMPTY affectedProfiles list produces NO notice');
assert.equal(H.renameNotice(undefined, (k) => k), null,
  'a MISSING affectedProfiles (older host) produces no notice and does not throw');
assert.equal(H.renameNotice({}, (k) => k), null, 'a response without the field is tolerated');
assert.equal(H.renameNotice({ affectedProfiles: 'nope' }, (k) => k), null, 'a non-array field is ignored');
assert.equal(H.renameNotice({ affectedProfiles: [{ profileId: 'p1', title: 'Main' }, { profileId: 'p2', title: 'Review' }] }, (k) => k),
  'renameAffected Main, Review',
  'a NON-EMPTY list names the titles under the localized prefix');
assert.equal(H.renameNotice({ affectedProfiles: [{ profileId: 'p9' }] }, (k) => k),
  'renameAffected p9', 'a profile without a title falls back to its id');
assert.equal(H.renameNotice({ affectedProfiles: [{}] }, (k) => k),
  'renameAffected 1', 'a nameless entry still yields a countable report');

// filterSections
const sections = [
  { id: 'light-tone', configId: 'light-tone', title: 'Light tone' },
  { id: 'no-preamble', configId: 'no-preamble', title: 'No preamble' },
];
assert.equal(H.filterSections(sections, 'light').length, 1);
assert.equal(H.filterSections(sections, '').length, 2);
assert.equal(H.filterSections(sections, 'NO PREAM').length, 1, 'case-insensitive');

// previewPlan
const plan = H.previewPlan({
  sections: [
    { builtin: true, title: 'persona-prefix' },
    { builtin: true, title: 'plan:policy' },
    { id: 'x', title: 'X', order: 1050, text: 'Be brief.' },
    { builtin: true, title: 'tool:bash' },
  ],
  skipped: [{ id: 'y', title: 'Y', reason: 'scope subagents-only' }],
});
assert.deepStrictEqual(plain(plan).plan.map((e) => e.kind), ['builtins', 'ours', 'builtins'], 'consecutive builtins collapse');
assert.deepStrictEqual(plain(plan).plan[0].names, ['persona-prefix', 'plan:policy']);
assert.equal(plan.plan[1].text, 'Be brief.');
assert.equal(plan.skipped[0].reason, 'scope subagents-only');
assert.deepStrictEqual(plain(H.previewPlan({}).plan), [], 'tolerant to an empty response');
console.log('PASS helpers: idOf, insertionOrders, outlineRows, filterSections, previewPlan, save gate, used-in/source, rename notice, profileLabel, escapesDrillDown');
// #endregion SECTION_helpers

// #region SECTION_refs Section refs carry configId VERBATIM — never a doubled prefix.
// Contract (host, live): configId IS the full row-id string, prefix included.
// The client must not prepend or strip anything; the only mangling bug was the
// client doubling the prefix, so the guards collapse ONLY a doubled prefix.
assert.equal(H.refIdOf({ rowId: 'prompt-section-x', patchId: 'prompt-section-x', configId: 'prompt-section-x' }), 'prompt-section-x',
  'refIdOf returns configId verbatim (prefix included)');
assert.equal(H.refIdOf({ patchId: 'bare-token' }), 'bare-token', 'refIdOf never adds a prefix');
assert.equal(H.dedupeRowPrefix('prompt-section-prompt-section-first-one'), 'prompt-section-first-one',
  'doubled section prefix collapses to one');
assert.equal(H.dedupeRowPrefix('prompt-profile-prompt-profile-a1'), 'prompt-profile-a1',
  'doubled profile prefix collapses to one');
assert.equal(H.dedupeRowPrefix('prompt-section-x'), 'prompt-section-x', 'single prefix untouched');
assert.equal(H.dedupeRowPrefix('123123'), '123123', 'bare id untouched');
const normalizedRefs = H.normalizeSections([
  { id: 'prompt-section-prompt-section-first-one', order: 100, scope: 'inherit' },
  { id: 'prompt-section-01a0d494', order: 200, scope: 'inherit' },
]);
assert.ok(!JSON.stringify(normalizedRefs).includes('prompt-section-prompt-section-'),
  'no profile payload can contain a doubled prompt-section- ref');
assert.deepStrictEqual(plain(normalizedRefs), [
  { id: 'prompt-section-first-one', order: 100, scope: 'inherit' },
  { id: 'prompt-section-01a0d494', order: 200, scope: 'inherit' },
], 'refs keep the configId string exactly as received');
const appended = H.addSectionsToRefs([{ id: 'prompt-section-a', order: 100 }], ['prompt-section-b', 'prompt-section-prompt-section-c']);
assert.deepStrictEqual(plain(appended).map((r) => r.id), ['prompt-section-a', 'prompt-section-b', 'prompt-section-c'],
  'picker ids are appended verbatim (configId), doubled prefix guarded');
assert.deepStrictEqual(plain(appended).map((r) => r.order), [100, 200, 300], 'appended refs step +100');
// outlineRows resolves a prefixed ref against a configId-keyed map.
const prefixedOutline = H.outlineRows(
  { sections: [{ id: 'prompt-section-x', order: 10 }] },
  new Map([['prompt-section-x', { configId: 'prompt-section-x', title: 'X', body: 'hi' }]]),
  {});
assert.equal(prefixedOutline[0].kind, 'ours', 'prefixed (configId) ref resolves — not a broken row');
console.log('PASS refs: configId verbatim, doubled-prefix guard, picker/outline keyed by configId');
// #endregion SECTION_refs

// #region SECTION_mutationFlow Duplicate/delete optimistic + poll + reconcile + restore.
(async () => {
  const prior = {
    profiles: [{ rowId: 'prompt-profile-p1', patchId: 'prompt-profile-p1', configId: 'prompt-profile-p1', title: 'P1', sections: [] }],
    sections: [], builtinOrders: {},
  };
  const makeRecorder = () => {
    const events = [];
    return {
      events,
      state: (s) => events.push(['state', s]),
      notify: (m) => events.push(['notify', m]),
      pending: (b) => events.push(['pending', b]),
    };
  };

  // DELETE: /state still lists the row for the first reads (the HMR
  // recomposition race), then agrees.
  let reads = 0;
  const delLog = makeRecorder();
  const delResult = await loaded.makeMutationFlow({
    api: {
      profileDelete: async () => {},
      loadState: async () => { reads += 1; return reads < 3 ? prior : { ...prior, profiles: [] }; },
    },
    t: (k) => k, notify: delLog.notify,
    reload: async () => {},
    getState: () => prior,
    onState: delLog.state,
    onPending: delLog.pending,
    pollInterval: 1, pollDeadline: 20,
  }).run({
    mutate: async () => {},
    optimistic: (p) => ({ ...p, profiles: [] }),
    agree: (polled) => polled.profiles.length === 0,
  });
  assert.equal(delResult.ok, true, 'delete resolves ok once /state agrees');
  assert.ok(reads >= 3, 'polled /state until the row disappeared');
  const delStates = delLog.events.filter((e) => e[0] === 'state').map((e) => e[1]);
  assert.equal(delStates[0].profiles.length, 0, 'optimistic state already hides the deleted row');
  assert.equal(delStates.at(-1).profiles.length, 0, 'polled reconciled state also hides it');
  assert.equal(delLog.events.filter((e) => e[0] === 'pending').map((e) => e[1]).join(''), 'truefalse',
    'pending flag brackets the flight (controls disabled while in flight)');

  // DUPLICATE: create response inserted optimistically, poll until mounted.
  const withCopy = {
    ...prior,
    profiles: [...prior.profiles, { rowId: 'prompt-profile-p1-copy', patchId: 'prompt-profile-p1-copy', configId: 'prompt-profile-p1-copy', title: 'P1 (copy)', sections: [] }],
  };
  let dupReads = 0;
  const dupLog = makeRecorder();
  const dupResult = await loaded.makeMutationFlow({
    api: {
      profileCreate: async (v) => ({ rowId: 'prompt-profile-p1-copy', patchId: 'prompt-profile-p1-copy', configId: 'prompt-profile-p1-copy', ...v }),
      loadState: async () => { dupReads += 1; return dupReads < 2 ? prior : withCopy; },
    },
    t: (k) => k, notify: dupLog.notify,
    reload: async () => {},
    getState: () => prior,
    onState: dupLog.state,
    pollInterval: 1, pollDeadline: 20,
  }).run({
    mutate: async () => ({ rowId: 'prompt-profile-p1-copy', patchId: 'prompt-profile-p1-copy', configId: 'prompt-profile-p1-copy', title: 'P1 (copy)', sections: [] }),
    optimistic: (p, created) => ({ ...p, profiles: [...p.profiles, loaded.optimisticEntry('profile', created)] }),
    agree: (polled, created) => (polled.profiles ?? []).some((x) => x.configId === created.configId),
  });
  assert.equal(dupResult.ok, true, 'duplicate resolves ok');
  assert.ok(dupReads >= 2, 'polled /state until the copy appeared');
  const dupStates = dupLog.events.filter((e) => e[0] === 'state').map((e) => e[1]);
  assert.equal(dupStates[0].profiles.length, 2, 'optimistic state already renders the copy');
  assert.equal(dupStates[0].profiles[1].title, 'P1 (copy)', 'optimistic row carries the create response');

  // FAILURE: server error restores the prior state and surfaces the message.
  const failLog = makeRecorder();
  const serverError = () => { const e = new Error('profile/delete: row "x" is registered elsewhere'); e.status = 400; throw e; };
  const failResult = await loaded.makeMutationFlow({
    api: { profileDelete: serverError, loadState: async () => prior },
    t: (k) => k, notify: failLog.notify,
    reload: async () => {},
    getState: () => prior,
    onState: failLog.state,
    pollInterval: 1, pollDeadline: 5,
  }).run({
    mutate: serverError,
    optimistic: (p) => ({ ...p, profiles: [] }),
    agree: (polled) => polled.profiles.length === 0,
  });
  assert.equal(failResult.ok, false, 'failed delete resolves not-ok');
  const failStates = failLog.events.filter((e) => e[0] === 'state').map((e) => e[1]);
  assert.equal(failStates[0].profiles.length, 1, 'prior local state restored on failure');
  assert.ok(failLog.events.find((e) => e[0] === 'notify')[1].includes('registered elsewhere'),
    'server error text reaches the notify');

  // BUSY guard: a second run while in flight is a no-op.
  let release;
  const gate = new Promise((r) => { release = r; });
  const busyFlow = loaded.makeMutationFlow({
    api: { loadState: async () => prior },
    t: (k) => k, notify: () => {}, reload: async () => {},
    getState: () => prior, pollInterval: 1, pollDeadline: 5,
  });
  const firstRun = busyFlow.run({ mutate: () => gate, agree: () => true });
  const secondRun = busyFlow.run({ mutate: async () => {}, agree: () => true });
  assert.equal((await secondRun).busy, true, 'concurrent run reports busy (control stays disabled)');
  release();
  assert.equal((await firstRun).ok, true);
  console.log('PASS mutation flow: optimistic insert/remove, poll until /state agrees, restore+server message on failure, busy guard');
})();
// #endregion SECTION_mutationFlow

// #region SECTION_rename Rename id: pre-filled with configId, sent VERBATIM, drill follows the new id.
(async () => {
  const renameCalls = [];
  const renamedState = {
    profiles: [],
    sections: [{ rowId: 'prompt-section-123123', patchId: 'prompt-section-123123', configId: 'prompt-section-123123', title: 'Greeting', body: '', usedIn: [], source: 'user' }],
    builtinOrders: {},
  };
  const renameApi = {
    sectionRename: async (rowId, id) => { renameCalls.push([rowId, id]); },
    loadState: async () => renamedState,
  };
  const statePushes = [];
  const renamed = [];
  const renameNotes = [];
  // User typed the BARE token: sent as-is — the host owns prefixing.
  // SectionForm useState order: title, body, confirmDelete, renameValue, confirmRename, error, mutating.
  stateQueue = ['Greeting', 'Be kind.', false, '123123', true, '', false];
  const formEl = loaded.components.SectionForm({
    section: { rowId: 'prompt-section-f01aa4a5', patchId: 'prompt-section-f01aa4a5', configId: 'prompt-section-f01aa4a5', title: 'Greeting', body: 'Be kind.', usedIn: [], source: 'user' },
    state: renamedState, api: renameApi, reload: async () => {}, t: (k) => k, notify: (m) => renameNotes.push(m),
    onBack: () => {}, onRenamed: (id) => renamed.push(id), setState: (s) => statePushes.push(s),
    autoFocusTitle: false,
  });
  stateQueue = [];
  let dialog = null;
  walk(formEl, (n) => { if (n.type && n.type.name === 'ConfirmDialog') dialog = n; });
  assert.ok(dialog, 'rename ConfirmDialog rendered');
  assert.equal(dialog.props.body, 'renameNote', 'the confirmation body is the localized warning string');
  assert.match(dict.en.renameNote, /NOT updated/,
    'the confirmation warns that profile references are NOT updated automatically');
  assert.doesNotMatch(dict.en.renameNote, /will be updated\./,
    'the old "references will be updated" promise is gone');
  const extra = dialog.props.extraChildren;
  const input = extra.children.find((child) => child && child.type === 'input');
  assert.equal(input.props.value, '123123', 'rename input is pre-filled with the current configId');
  const modal = dialog.type(dialog.props);
  let confirmBtn = null;
  walk(modal, (n) => { if ((n.type?.name === 'Button' || n.type === primitives.Button) && elementText(n).includes('confirm') && n.props.onClick) confirmBtn = n; });
  assert.ok(confirmBtn, 'confirm button found');
  await confirmBtn.props.onClick();
  assert.deepStrictEqual(plain(renameCalls), [['prompt-section-f01aa4a5', '123123']],
    'rename sends the typed id VERBATIM (no client-side prefix, no slugify)');
  assert.equal(renamed[0], 'prompt-section-123123',
    'drill follows the STORED new configId (the host canonicalizes the bare token to prompt-section-123123)');
  assert.deepStrictEqual(plain(renameNotes), [],
    'a response without affectedProfiles (older host) shows NO extra notice and does not crash');
  // User pasted a DOUBLED prefix: collapsed, not stripped.
  renameCalls.length = 0;
  // The host stores the canonical single-prefix id, so the polled state must
  // carry THAT configId or the flow would poll to its deadline.
  const renamedState2 = {
    profiles: [],
    sections: [{ rowId: 'prompt-section-abc', patchId: 'prompt-section-abc', configId: 'prompt-section-abc', title: 'G', body: '', usedIn: [], source: 'user' }],
    builtinOrders: {},
  };
  const renameApi2 = {
    sectionRename: async (rowId, id) => { renameCalls.push([rowId, id]); },
    loadState: async () => renamedState2,
  };
  stateQueue = ['Greeting', 'Be kind.', false, 'prompt-section-prompt-section-abc', true, '', false];
  const form2 = loaded.components.SectionForm({
    section: { rowId: 'prompt-section-s2', patchId: 'prompt-section-s2', configId: 'prompt-section-s2', title: 'G', body: '', usedIn: [], source: 'user' },
    state: renamedState2, api: renameApi2, reload: async () => {}, t: (k) => k, notify: () => {},
    onBack: () => {}, onRenamed: () => {}, setState: () => {},
    autoFocusTitle: false,
  });
  stateQueue = [];
  let dialog2 = null;
  walk(form2, (n) => { if (n.type && n.type.name === 'ConfirmDialog') dialog2 = n; });
  const modal2 = dialog2.type(dialog2.props);
  let confirm2 = null;
  walk(modal2, (n) => { if ((n.type?.name === 'Button' || n.type === primitives.Button) && elementText(n).includes('confirm') && n.props.onClick) confirm2 = n; });
  await confirm2.props.onClick();
  assert.deepStrictEqual(plain(renameCalls), [['prompt-section-s2', 'prompt-section-abc']],
    'a doubled prefix typed by the user collapses to a single one');
  console.log('PASS rename id: pre-filled configId, verbatim bare id sent, doubled-prefix guard, drill follows new id');
})();
// #endregion SECTION_rename

// #region SECTION_renameAffected A successful rename surfaces the profiles still
// holding the old id (the host no longer rewrites references): non-empty list,
// empty list, and a missing field (older host payload).
(async () => {
  const cases = [
    [[{ profileId: 'p1', title: 'Main' }, { profileId: 'p2', title: 'Review' }],
      ['renameAffected Main, Review']],
    [[], []],
    [undefined, []],
  ];
  for (const [affected, expected] of cases) {
    const notes = [];
    const nextState = {
      profiles: [],
      sections: [{ rowId: 'prompt-section-f1', patchId: 'prompt-section-f1', configId: 'prompt-section-new', title: 'Greeting', body: '' }],
      builtinOrders: {},
    };
    // SectionForm useState order: title, body, confirmDelete, renameValue, confirmRename, error, mutating.
    stateQueue = ['Greeting', 'Be kind.', false, 'new', true, '', false];
    const form = loaded.components.SectionForm({
      section: { rowId: 'prompt-section-f1', patchId: 'prompt-section-f1', configId: 'prompt-section-f1', title: 'Greeting', body: 'Be kind.', usedIn: [], source: 'user' },
      state: nextState,
      api: {
        sectionRename: async () => ({
          rowId: 'prompt-section-f1', patchId: 'prompt-section-f1', configId: 'prompt-section-new',
          ...(affected === undefined ? {} : { affectedProfiles: affected }),
        }),
        loadState: async () => nextState,
      },
      reload: async () => {}, t: (k) => k, notify: (m) => notes.push(m),
      onBack: noop, onRenamed: () => {}, setState: () => {}, autoFocusTitle: false,
    });
    stateQueue = [];
    let dlg = null;
    walk(form, (n) => { if (n.type && n.type.name === 'ConfirmDialog') dlg = n; });
    const modal = dlg.type(dlg.props);
    let confirm = null;
    walk(modal, (n) => { if ((n.type?.name === 'Button' || n.type === primitives.Button) && elementText(n).includes('confirm') && n.props.onClick) confirm = n; });
    await confirm.props.onClick();
    assert.deepStrictEqual(plain(notes), expected,
      `affectedProfiles=${affected === undefined ? 'ABSENT' : JSON.stringify(affected)} → ${JSON.stringify(expected)}`);
  }
  console.log('PASS rename affected: non-empty list, empty list, and missing field all surface correctly');
})();
// #endregion SECTION_renameAffected

// #region SECTION_renameNoop An unchanged id is a client-side no-op (the host now
// answers 400) — the dialog just closes; an empty/whitespace id is blocked with
// an inline hint. Neither ever sends a request or a toast.
for (const [value, expectHint] of [['prompt-section-f01aa4a5', null], ['   ', 'renameEmpty'], ['', 'renameEmpty']]) {
  const calls = [];
  const notes = [];
  // SectionForm useState order: title, body, confirmDelete, renameValue, confirmRename, error, mutating, renameHint.
  stateQueue = ['Greeting', 'Be kind.', false, value, true, '', false];
  const form = loaded.components.SectionForm({
    section: { rowId: 'prompt-section-f01aa4a5', patchId: 'prompt-section-f01aa4a5', configId: 'prompt-section-f01aa4a5', title: 'Greeting', body: 'Be kind.', usedIn: [], source: 'user' },
    state: { profiles: [], sections: [{ patchId: 'prompt-section-f01aa4a5', configId: 'prompt-section-f01aa4a5' }], builtinOrders: {} },
    api: { sectionRename: async (rowId, id) => { calls.push([rowId, id]); return {}; }, loadState: async () => ({}) },
    reload: async () => {}, t: (k) => k, notify: (m) => notes.push(m),
    onBack: noop, onRenamed: noop, setState: noop, autoFocusTitle: false,
  });
  stateQueue = [];
  let dlg = null;
  walk(form, (n) => { if (n.type && n.type.name === 'ConfirmDialog') dlg = n; });
  assert.ok(dlg, `renameValue="${value}": the dialog is open`);
  const modal = dlg.type(dlg.props);
  let confirm = null;
  walk(modal, (n) => { if ((n.type?.name === 'Button' || n.type === primitives.Button) && elementText(n).includes('confirm') && n.props.onClick) confirm = n; });
  lastSetState = 'sentinel';
  confirm.props.onClick();
  assert.deepStrictEqual(calls, [], `renameValue="${value}": NO section/rename request is sent`);
  assert.deepStrictEqual(notes, [], `renameValue="${value}": no toast`);
  if (expectHint) {
    assert.equal(lastSetState, expectHint, `renameValue="${value}": the empty-id hint state is set`);
  } else {
    assert.equal(lastSetState, false, `renameValue="${value}": unchanged id just closes the dialog`);
  }
}
// The hint renders inside the dialog when present (8th stateQueue entry).
stateQueue = ['Greeting', 'Be kind.', false, '', true, '', false, 'renameEmpty'];
const hintForm = loaded.components.SectionForm({
  section: { rowId: 'prompt-section-f01aa4a5', patchId: 'prompt-section-f01aa4a5', configId: 'prompt-section-f01aa4a5', title: 'Greeting', body: 'Be kind.', usedIn: [], source: 'user' },
  state: { profiles: [], sections: [{ patchId: 'prompt-section-f01aa4a5', configId: 'prompt-section-f01aa4a5' }], builtinOrders: {} },
  api: {}, reload: noop, t: (k) => k, notify: noop, onBack: noop, setState: noop, autoFocusTitle: false,
});
stateQueue = [];
let hintDlg = null;
walk(hintForm, (n) => { if (n.type && n.type.name === 'ConfirmDialog') hintDlg = n; });
assert.ok(elementText(hintDlg.type(hintDlg.props)).includes('renameEmpty'),
  'the empty-id hint renders inside the Change-id dialog');
console.log('PASS rename no-op: unchanged id closes silently; empty id is blocked with a hint (no request, no toast)');
// #endregion SECTION_renameNoop

// #region SECTION_disabledControls Every row-lifecycle mutation disables its control while in flight.
// ProfilesTab with mutating=true: duplicate/delete icon buttons + create disabled.
stateQueue = [false, null, null, true];
const busyProfTab = loaded.components.ProfilesTab({
  state: tabState, api: {}, reload: noop, t: (k) => k, notify: noop,
  drill: null, setDrill: noop, onOpenSection: noop, setState: noop, createFlow: fakeFlow,
});
stateQueue = [];
const isButton = (n) => n.type === primitives.Button || n.type?.name === 'Button';
const profIconButtons = [];
walk(busyProfTab, (n) => {
  if (isButton(n) && typeof n.props['aria-label'] === 'string'
    && ['duplicate', 'deleteLabel'].includes(n.props['aria-label'])) profIconButtons.push(n);
});
assert.ok(profIconButtons.length >= 2, 'profile row duplicate/delete icon buttons rendered');
assert.ok(profIconButtons.every((b) => b.props.disabled === true),
  'duplicate + delete disabled while a mutation is in flight');
const busyCreate = profButtonsUnused(busyProfTab);
assert.equal(busyCreate, true, 'profile create button disabled while mutating');
function profButtonsUnused(el) {
  let btn = null;
  walk(el, (n) => { if ((n.type?.name === 'Button' || n.type === primitives.Button) && elementText(n).includes('newProfile')) btn = n; });
  return btn?.props.disabled === true;
}
// SectionForm with mutating=true: duplicate/delete/rename disabled.
stateQueue = ['Greeting', 'Be kind.', false, 'sec-1', false, '', true];
const busyForm = loaded.components.SectionForm({
  section: sectionEntry, state: tabState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, setState: noop, autoFocusTitle: false,
});
stateQueue = [];
const formIcons = [];
walk(busyForm, (n) => {
  if (isButton(n) && typeof n.props['aria-label'] === 'string'
    && ['duplicate', 'deleteLabel'].includes(n.props['aria-label'])) formIcons.push(n);
});
assert.ok(formIcons.length >= 2 && formIcons.every((b) => b.props.disabled === true),
  'section duplicate + delete disabled while a mutation is in flight');
let renameBtn = null;
walk(busyForm, (n) => { if ((n.type?.name === 'Button' || n.type === primitives.Button) && elementText(n).includes('renameId')) renameBtn = n; });
assert.equal(renameBtn.props.disabled, true, 'rename-id button disabled while a mutation is in flight');
console.log('PASS disabled controls: duplicate/delete/rename/create disabled while their flow is in flight');
// #endregion SECTION_disabledControls

// #region SECTION_uiRound2 Back icon, autosave gate/hint, used-in titles, source badge, DnD outline.
// Back affordance is icon-only (aria-label + Tooltip, no "← back" text), and the
// 14×14 icon is centred in its box instead of sticking to the top.
const emptySection = {
  rowId: 'prompt-section-empty', patchId: 'prompt-section-empty', configId: 'prompt-section-empty',
  title: '', body: '', usedIn: [], source: 'user',
};
const emptyState = { profiles: [], sections: [{ ...emptySection }], builtinOrders: {} };
// SectionForm useState order: title, body, confirmDelete, renameValue, confirmRename, error, mutating.
stateQueue = ['', '', false, 'prompt-section-empty', false, '', false];
const emptyForm = loaded.components.SectionForm({
  section: emptySection, state: emptyState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, setState: noop, autoFocusTitle: false,
});
stateQueue = [];
assert.ok(hasElement(emptyForm, (n) => elementText(n).includes('titleRequired')),
  'an empty title shows the soft in-form hint (no server round-trip)');
let backBtn = null;
walk(emptyForm, (n) => { if (isButton(n) && n.props?.['aria-label'] === 'back') backBtn = n; });
assert.ok(backBtn, 'back is the installed Button primitive with an accessible label');
assert.equal(backBtn.props.variant, 'outline', 'back reuses the Add-section outline shape (no hand-rolled 18×18 box)');
assert.equal(backBtn.props.size, 'sm', 'back uses the compact standard size');
assert.ok(backBtn.props.icon, 'back keeps its icon via the Button `icon` slot');
assert.equal(backBtn.props.title, 'back', 'back keeps its accessible title/aria-label');
assert.ok(!elementText(emptyForm).includes('← back'), 'the old "← back" label is gone from the tree');
let titleInput = null;
walk(emptyForm, (n) => {
  if (!titleInput && n.type === 'input' && n.props && 'onBlur' in n.props && n.props.value === '') titleInput = n;
});
assert.equal(typeof titleInput?.props?.onBlur, 'function', 'title input flushes its pending autosave on blur');
assert.ok(!elementText(emptyForm).includes('sourceLabel'), 'user source renders NO badge in the form');

// used-in shows profile TITLES (fallback to the id), source badge visibility.
const usedSection = { ...sectionEntry, usedIn: [{ profileId: 'light', scope: 'main-only' }, { profileId: 'ghost', scope: 'inherit' }] };
stateQueue = ['Greeting', 'Be kind.', false, 'sec-1', false, '', false];
const usedForm = loaded.components.SectionForm({
  section: usedSection, state: { ...tabState, profiles: [{ configId: 'light', title: 'Light tone' }] },
  api: {}, reload: noop, t: (k) => k, notify: noop, onBack: noop, setState: noop, autoFocusTitle: false,
});
stateQueue = [];
assert.ok(elementText(usedForm).includes('Light tone'), 'used-in renders the profile TITLE, not its id');
assert.ok(elementText(usedForm).includes('ghost'), 'a profile missing from /state falls back to the raw id');
assert.ok(elementText(usedForm).includes('scopeLabel: scopeMainOnly'),
  'the used-in scope is localized through the dictionary, never the raw enum');
let usedInVisible = '';
walk(usedForm, (n) => {
  if (n.type === 'span' && Array.isArray(n.children)) {
    usedInVisible += n.children.filter((child) => typeof child === 'string').join('|');
  }
});
assert.ok(!usedInVisible.includes('main-only'),
  'the raw scope enum never appears in VISIBLE text (it only rides the unique key)');
// Two refs of the same profile must not collide on the React key.
const twoRefs = loaded.components.SectionForm({
  section: { ...sectionEntry, usedIn: [{ profileId: 'light', scope: 'inherit' }, { profileId: 'light', scope: 'main-only' }] },
  state: { ...tabState, profiles: [{ configId: 'light', title: 'Light tone' }] },
  api: {}, reload: noop, t: (k) => k, notify: noop, onBack: noop, setState: noop, autoFocusTitle: false,
});
stateQueue = [];
const refKeys = [];
walk(twoRefs, (n) => { if (n.type === 'span' && n.props && typeof n.props.key === 'string' && n.props.key.startsWith('light:')) refKeys.push(n.props.key); });
assert.equal(refKeys.length, 2, 'both used-in rows render');
assert.equal(new Set(refKeys).size, 2, 'the React keys are unique for two refs of the same profile');
for (const [source, expected] of [['bundle', 'sourceBundle'], ['unknown', 'sourceUnknown']]) {
  stateQueue = ['Greeting', 'Be kind.', false, 'sec-1', false, '', false];
  const badgeForm = loaded.components.SectionForm({
    section: { ...sectionEntry, source }, state: tabState, api: {}, reload: noop, t: (k) => k, notify: noop,
    onBack: noop, setState: noop, autoFocusTitle: false,
  });
  stateQueue = [];
  assert.ok(elementText(badgeForm).includes(`sourceLabel: ${expected}`), `source "${source}" shows the badge`);
}
stateQueue = ['', false, null];
const listTab = loaded.components.SectionsTab({
  state: {
    profiles: [{ configId: 'light', title: 'Light tone' }],
    sections: [
      { configId: 'sec-1', patchId: 'prompt-section-sec-1', title: 'Greeting', body: 'x', usedIn: [{ profileId: 'light', scope: 'inherit' }], source: 'user' },
      { configId: 'sec-2', patchId: 'prompt-section-sec-2', title: 'Bundled', body: 'y', usedIn: [], source: 'bundle' },
    ],
    builtinOrders: {},
  },
  api: {}, reload: noop, t: (k) => k, notify: noop, drill: null, setDrill: noop, setState: noop,
});
stateQueue = [];
const listText = elementText(listTab);
assert.ok(listText.includes('Light tone'), 'SectionsTab list shows the profile title in used-in');
assert.equal((listText.match(/sourceLabel/g) || []).length, 1, 'only the bundle row carries a source badge (user row hidden)');

// ProfileOutline: no ↑↓ arrows, no +0.5, order input only, scope pinned right,
// HTML5 drag & drop with the same midpoint/±1 order recalc.
const outlineProfile = {
  rowId: 'prompt-profile-p9', patchId: 'prompt-profile-p9', configId: 'prompt-profile-p9',
  title: 'P9',
  sections: [{ id: 'sec-a', order: 100, scope: 'inherit' }, { id: 'sec-b', order: 200, scope: 'main-only' }],
};
const outlineState = {
  profiles: [outlineProfile],
  sections: [
    { rowId: 'prompt-section-sec-a', patchId: 'prompt-section-sec-a', configId: 'sec-a', title: 'A', body: 'aaa', source: 'user' },
    { rowId: 'prompt-section-sec-b', patchId: 'prompt-section-sec-b', configId: 'sec-b', title: 'B', body: '', source: 'user' },
  ],
  builtinOrders: { 'plan:policy': 100 },
  modes: [],
};
stateQueue = ['P9', outlineProfile.sections.slice(), false, null, '', null, null];
const outlineEl = loaded.components.ProfileOutline({
  profile: outlineProfile, state: outlineState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, onOpenSection: noop, autoFocusTitle: false,
});
stateQueue = [];
assert.ok(!hasElement(outlineEl, (n) => n.props?.['aria-label'] === '↑' || n.props?.['aria-label'] === '↓'),
  'the ↑↓ move buttons are gone');
assert.ok(!elementText(outlineEl).includes('+ 0.5') && !elementText(outlineEl).includes('collision'),
  'no +0.5 half-step is displayed (an order equal to a built-in is normal)');
// The drop targets are the INSERTION BOUNDARIES (one per gap), so the built-in
// row's own gaps are valid targets too — built-ins are never dragged.
const dropZones = [];
walk(outlineEl, (n) => { if (typeof n.props?.['data-drop-index'] === 'number') dropZones.push(n); });
assert.deepStrictEqual(plain(dropZones.map((z) => z.props['data-drop-index'])), [0, 1, 2, 3],
  'one insertion boundary per gap: above the first, between the three rows, below the last');
assert.ok(dropZones.every((z) => typeof z.props.onDrop === 'function' && typeof z.props.onDragOver === 'function'),
  'every boundary — including the gaps around the built-in row — is a drop target');
const ourRows = [];
walk(outlineEl, (n) => {
  if (Array.isArray(n.children) && n.children.some((child) => child?.type === 'input' && child.props?.type === 'number')) ourRows.push(n);
});
const rowA = ourRows.find((r) => hasElement(r, (n) => n.type === 'input' && n.props?.value === 100));
const rowB = ourRows.find((r) => hasElement(r, (n) => n.type === 'input' && n.props?.value === 200));
assert.ok(rowA && rowB, 'each row keeps its numeric order INPUT');
assert.ok(!hasElement(rowA, (n) => n.type === 'span' && Array.isArray(n.children) && n.children.includes('100')),
  'the order is NOT also rendered as duplicate text — the input replaces it');
const gripOf = (refSeq) => {
  let found = null;
  walk(outlineEl, (n) => {
    if (!found && isButton(n) && n.props?.['aria-label'] === 'dragHandle' && n.props?.['data-drag-handle'] === refSeq) found = n;
  });
  return found;
};
const handle = gripOf(0);
const handleB = gripOf(1);
assert.ok(handle && handleB, 'each OUR row has a draggable grip');
assert.equal(handle.type, primitives.Button, 'the grip is the installed Button primitive — focusable and semantic, not a bare span');
assert.equal(typeof handle.props.onDragStart, 'function', 'the grip starts the drag');
assert.equal(typeof handle.props.onDragEnd, 'function', 'the grip ends the drag');
assert.equal(typeof handle.props.onKeyDown, 'function', 'the grip accepts keyboard reordering');
// The built-in row has no draggable grip anywhere in its subtree.
let builtinRow = null;
walk(outlineEl, (n) => {
  if (!builtinRow && Array.isArray(n.children)
    && n.children.some((c) => c && c.type === 'span' && c.props?.flex === 1 && Array.isArray(c.children) && c.children.includes('plan:policy'))) {
    builtinRow = n;
  }
});
assert.ok(builtinRow, 'the built-in row renders');
assert.ok(!hasElement(builtinRow, (n) => n.props?.draggable === true),
  'built-in rows are NOT draggable — they are only drop neighbours');
const idxInput = rowA.children.findIndex((child) => child?.type === 'input');
const idxTitle = rowA.children.findIndex((child) => child?.type === 'span' && child.props?.style?.flex === 1);
const idxScope = rowA.children.findIndex((child) => child?.type === Menu);
const idxEdit = rowA.children.findIndex((child) => child?.type === Tooltip && child.props?.label === 'openInSectionTab');
assert.ok(idxInput > -1 && idxTitle > idxInput, 'order input sits where the old text was, left of the title');
assert.ok(idxScope > idxTitle && idxEdit > idxScope, 'scope is pinned right, immediately before the edit button');
// No hand-sized buttons remain in the row: the icon actions are the Button
// primitive and the scope selector's Menu anchor is the Button primitive too.
const rowEditBtn = [];
walk(outlineEl, (n) => { if (isButton(n) && n.props?.['aria-label'] === 'openInSectionTab') rowEditBtn.push(n); });
assert.ok(rowEditBtn.length >= 2 && rowEditBtn.every((b) => b.props.variant === 'ghost' && b.props.size === 'sm'),
  'row icon actions use the installed Button primitive (ghost/sm), not a hand-styled button');
assert.equal(rowA.children[idxScope].props.anchor.type, primitives.Button,
  'the scope selector anchor is the installed Button primitive');
// The drop result is judged by the VISUAL position (outlineRows over the new
// refs), not just by the number, and every produced order must be an integer.
const outlineSectionsById = new Map(outlineState.sections.map((s) => [s.configId, s]));
const visualOurs = (nextRefs) => plain(H.outlineRows(
  { ...outlineProfile, sections: nextRefs }, outlineSectionsById, outlineState.builtinOrders,
)).filter((r) => r.kind === 'ours').map((r) => r.ref.id);
// Functional drop: below the LAST row (neighbour above is our sec-b, order 200).
const dataTransfer = { effectAllowed: '', payload: '', setData(_k, v) { this.payload = v; }, getData() { return this.payload; } };
handle.props.onDragStart({ dataTransfer });
lastSetState = undefined;
dropZones[3].props.onDrop({ preventDefault() {}, dataTransfer });
assert.equal(plain(lastSetState).find((r) => r.id === 'sec-a').order, 201,
  'drop below the last row takes the last order + 1 (integer, no +0.5)');
assert.deepStrictEqual(visualOurs(plain(lastSetState)), ['sec-b', 'sec-a'],
  'and lands visually BELOW the row it was dropped under');
// Functional drop: above the FIRST row. With our sec-a now sorting BEFORE the
// equal-order built-in, the first row is sec-a (order 100); the drop still lands
// above the built-in too.
handleB.props.onDragStart({ dataTransfer });
lastSetState = undefined;
dropZones[0].props.onDrop({ preventDefault() {}, dataTransfer });
assert.equal(plain(lastSetState).find((r) => r.id === 'sec-b').order, 99,
  'drop at the very top takes the first order − 1');
assert.deepStrictEqual(visualOurs(plain(lastSetState)), ['sec-b', 'sec-a'],
  'and lands visually ABOVE both the first row and the built-in');
// Functional drop between 499 and 500: the answer is the integer 500 (never
// 499.5) and the row still lands visually between the two.
const gapProfile = {
  rowId: 'prompt-profile-gap', patchId: 'prompt-profile-gap', configId: 'prompt-profile-gap', title: 'Gap',
  sections: [
    { id: 'sec-a', order: 499, scope: 'inherit' },
    { id: 'sec-b', order: 500, scope: 'inherit' },
    { id: 'sec-c', order: 700, scope: 'inherit' },
  ],
};
const gapState = {
  profiles: [gapProfile],
  sections: [
    { configId: 'sec-a', patchId: 'prompt-section-sec-a', title: 'A', body: 'a' },
    { configId: 'sec-b', patchId: 'prompt-section-sec-b', title: 'B', body: 'b' },
    { configId: 'sec-c', patchId: 'prompt-section-sec-c', title: 'C', body: 'c' },
  ],
  builtinOrders: {}, modes: [],
};
stateQueue = ['Gap', gapProfile.sections.slice(), false, null, '', null, null, null];
const gapEl = loaded.components.ProfileOutline({
  profile: gapProfile, state: gapState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, onOpenSection: noop, autoFocusTitle: false,
});
stateQueue = [];
const gapZones = [];
walk(gapEl, (n) => { if (n.props && typeof n.props['data-drop-index'] === 'number') gapZones.push(n); });
let gapHandleC = null;
walk(gapEl, (n) => { if (!gapHandleC && isButton(n) && n.props?.['data-drag-handle'] === 2) gapHandleC = n; });
gapHandleC.props.onDragStart({ dataTransfer });
lastSetState = undefined;
gapZones[1].props.onDrop({ preventDefault() {}, dataTransfer });
const gapRefs = plain(lastSetState);
assert.equal(gapRefs.find((r) => r.id === 'sec-c').order, 500, 'a drop between 499 and 500 yields the integer 500');
assert.ok(gapRefs.every((r) => Number.isInteger(r.order)), 'no fractional order is ever produced');
const gapSectionsById = new Map(gapState.sections.map((s) => [s.configId, s]));
assert.deepStrictEqual(plain(H.outlineRows({ ...gapProfile, sections: gapRefs }, gapSectionsById, {}))
  .map((r) => r.ref.id), ['sec-a', 'sec-c', 'sec-b'],
  'and the tied 500 still renders between 499 and 500 (profile position resolves the tie)');
// Dropping into the dragged row's own two gaps is a no-op.
handle.props.onDragStart({ dataTransfer });
lastSetState = undefined;
dropZones[1].props.onDrop({ preventDefault() {}, dataTransfer });
assert.equal(lastSetState, null, 'dropping into the dragged row\u2019s own gap is a no-op');
// Keyboard reordering on the grip. A dedicated built-in-free outline so each
// move lands strictly between neighbours and the visible order really changes.
const kbProfile = {
  rowId: 'prompt-profile-kb', patchId: 'prompt-profile-kb', configId: 'prompt-profile-kb',
  title: 'KB',
  sections: [{ id: 'sec-a', order: 100, scope: 'inherit' }, { id: 'sec-b', order: 300, scope: 'inherit' }],
};
const kbState = {
  profiles: [kbProfile],
  sections: [
    { configId: 'sec-a', patchId: 'prompt-section-sec-a', title: 'A', body: 'a', source: 'user' },
    { configId: 'sec-b', patchId: 'prompt-section-sec-b', title: 'B', body: 'b', source: 'user' },
  ],
  builtinOrders: {}, modes: [],
};
stateQueue = ['KB', kbProfile.sections.slice(), false, null, '', null, null, null];
const kbEl = loaded.components.ProfileOutline({
  profile: kbProfile, state: kbState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, onOpenSection: noop, autoFocusTitle: false,
});
stateQueue = [];
const kbGrip = (refSeq) => {
  let found = null;
  walk(kbEl, (n) => { if (!found && isButton(n) && n.props?.['aria-label'] === 'dragHandle' && n.props?.['data-drag-handle'] === refSeq) found = n; });
  return found;
};
assert.ok(kbGrip(0) && kbGrip(1), 'both grips are focusable Buttons with the dragHandle label');
const kbSectionsById = new Map(kbState.sections.map((s) => [s.configId, s]));
const kbVisual = (nextRefs) => plain(H.outlineRows({ ...kbProfile, sections: nextRefs }, kbSectionsById, {}))
  .map((r) => r.ref.id);
lastSetState = 'sentinel';
kbGrip(0).props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
assert.deepStrictEqual(kbVisual(plain(lastSetState)), ['sec-b', 'sec-a'],
  'ArrowDown on the grip moves the row one rendered position down');
assert.ok(plain(lastSetState).every((r) => Number.isInteger(r.order)), 'the keyboard path also yields integers only');
lastSetState = 'sentinel';
kbGrip(1).props.onKeyDown({ key: 'ArrowUp', preventDefault() {} });
assert.deepStrictEqual(kbVisual(plain(lastSetState)), ['sec-b', 'sec-a'],
  'ArrowUp on the grip moves it one position up');
assert.equal(plain(lastSetState).find((r) => r.id === 'sec-b').order, 99, 'the top boundary is the first order − 1');
lastSetState = 'sentinel';
kbGrip(0).props.onKeyDown({ key: 'ArrowUp', preventDefault() {} });
assert.equal(lastSetState, 'sentinel', 'the first row cannot move up (no state churn)');
lastSetState = 'sentinel';
kbGrip(0).props.onKeyDown({ key: 'Enter', preventDefault() {} });
assert.equal(lastSetState, 'sentinel', 'non-arrow keys are ignored');
// "+ Add section": the icon is kept, the plus is removed from the TEXT.
let addBtn = null;
walk(outlineEl, (n) => { if (isButton(n) && Array.isArray(n.children) && n.children.includes('addSection')) addBtn = n; });
assert.ok(addBtn, 'Add-section button rendered');
assert.equal(addBtn.props.variant, 'outline');
assert.ok(addBtn.props.icon, 'the + icon is kept via the Button `icon` slot');
assert.ok(!addBtn.children.some((child) => typeof child === 'string' && child.includes('+')),
  'the label is "Add section" with NO plus in the text');
assert.ok(!elementText(outlineEl).includes('+ Add section'), 'the old "+ Add section" string is gone');
console.log('PASS ui round 2: back icon, autosave gate/hint, used-in titles, source badge, DnD outline (no arrows, no +0.5)');
// #endregion SECTION_uiRound2

// #region SECTION_auditDE Deterministic ties, honest counter, preview empty state,
// confirmed ref removal, and untitled profiles (gap-audit D).
// outlineRows: equal orders now tie-break by built-in first, then the ref's
// position in the profile — transitive, so the visible order cannot flap.
const tieRows = H.outlineRows(
  { sections: [{ id: 'b', order: 100, scope: 'inherit' }, { id: 'a', order: 100, scope: 'inherit' }] },
  { a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' } },
  {});
assert.deepStrictEqual(plain(tieRows).map((r) => r.ref.id), ['b', 'a'],
  'equal orders follow the ref position in the profile (not comparator luck)');
const tieRows2 = H.outlineRows(
  { sections: [{ id: 'a', order: 100, scope: 'inherit' }, { id: 'b', order: 100, scope: 'inherit' }] },
  { a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' } },
  {});
assert.deepStrictEqual(plain(tieRows2).map((r) => r.ref.id), ['a', 'b'], 'and it is symmetric for the reversed input');
assert.deepStrictEqual(
  plain(H.outlineRows({ sections: [{ id: 'a', order: 100, scope: 'inherit' }] }, { a: { id: 'a', title: 'A' } }, { 'plan:policy': 100 }))
    .map((r) => r.kind),
  ['ours', 'builtin'], 'OUR section sorts BEFORE the built-in at an equal order (the runtime insertion rule)');
assert.deepStrictEqual(
  plain(H.outlineRows({ sections: [{ id: 'a', order: 101, scope: 'inherit' }] }, { a: { id: 'a', title: 'A' } }, { 'plan:policy': 100 }))
    .map((r) => r.kind),
  ['builtin', 'ours'], 'and below it once the order is strictly greater');

// Header counter: resolvable sections only, broken refs called out.
const brokenProfile = {
  rowId: 'prompt-profile-b', patchId: 'prompt-profile-b', configId: 'prompt-profile-b', title: 'B',
  sections: [{ id: 'sec-a', order: 100, scope: 'inherit' }, { id: 'ghost', order: 200, scope: 'inherit' }],
};
const brokenState = {
  profiles: [brokenProfile],
  sections: [{ configId: 'sec-a', patchId: 'prompt-section-sec-a', title: 'A', body: 'a', source: 'user' }],
  builtinOrders: {}, modes: [],
};
stateQueue = ['B', brokenProfile.sections.slice(), false, null, '', null, null, null];
const brokenEl = loaded.components.ProfileOutline({
  profile: brokenProfile, state: brokenState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, onOpenSection: noop, autoFocusTitle: false,
});
stateQueue = [];
let counterText = null;
walk(brokenEl, (n) => {
  if (n.type === primitives.Tag && Array.isArray(n.children)) {
    const text = n.children.filter((child) => typeof child === 'string').join('');
    if (text.includes('broken')) counterText = text;
  }
});
assert.ok(counterText && counterText.includes('1 sections') && counterText.includes('1 broken'),
  `the header counts resolvable sections and calls out the broken ones (got: ${counterText})`);
assert.ok(!elementText(brokenEl).includes('2 sections'), 'the header never counts broken refs as sections');

// Preview: an empty plan (only broken/skipped refs) gets an explicit state.
stateQueue = ['main', { plan: [], skipped: [{ id: 'ghost', title: 'Ghost', reason: 'missing' }] }];
const emptyPreview = loaded.components.PreviewTab({
  state: { profiles: [{ configId: 'main', title: 'Main' }], sections: [], builtinOrders: {}, default: 'main', modes: [] },
  api: {}, t: (k) => k, notify: () => {},
});
stateQueue = [];
assert.ok(elementText(emptyPreview).includes('previewEmpty'), 'a profile that emits nothing shows the explicit empty state');
assert.ok(elementText(emptyPreview).includes('skippedMarker'), 'the skipped refs are still listed underneath');

// Removing a ref asks for confirmation (same as the other destructive actions).
stateQueue = ['P9', outlineProfile.sections.slice(), false, null, '', null, null, null];
const removeEl = loaded.components.ProfileOutline({
  profile: outlineProfile, state: outlineState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, onOpenSection: noop, autoFocusTitle: false,
});
stateQueue = [];
let trashBtn = null;
walk(removeEl, (n) => { if (!trashBtn && isButton(n) && n.props?.['aria-label'] === 'remove') trashBtn = n; });
assert.ok(trashBtn, 'the per-row remove icon renders');
lastSetState = 'sentinel';
trashBtn.props.onClick();
assert.equal(lastSetState, 0, 'remove opens a confirmation (the ref OCCURRENCE is staged) instead of deleting at once');
stateQueue = ['P9', outlineProfile.sections.slice(), false, null, '', null, null, 0];
const confirmEl = loaded.components.ProfileOutline({
  profile: outlineProfile, state: outlineState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, onOpenSection: noop, autoFocusTitle: false,
});
stateQueue = [];
let removeDialog = null;
walk(confirmEl, (n) => { if (n.type?.name === 'ConfirmDialog') removeDialog = n; });
assert.ok(removeDialog, 'the remove confirmation renders');
assert.equal(removeDialog.props.title, 'confirmRemoveRef', 'the confirmation names the action');
const removeModal = removeDialog.type(removeDialog.props);
let removeConfirm = null;
walk(removeModal, (n) => { if (!removeConfirm && (n.type?.name === 'Button' || n.type === primitives.Button) && Array.isArray(n.children) && n.children.includes('remove')) removeConfirm = n; });
assert.ok(removeConfirm, 'the confirmation has the Remove action');
lastSetState = 'sentinel';
removeConfirm.props.onClick();
assert.deepStrictEqual(plain(lastSetState).map((r) => r.id), ['sec-b'], 'confirming actually removes the ref');

// A chosen profile with an empty bundle title shows its id, never "None".
stateQueue = [{
  profiles: [{ rowId: 'prompt-profile-light', patchId: 'profile-light', configId: 'light', title: '', sections: [] }],
  sections: [], builtinOrders: {}, default: 'light', lastByWorkspace: {},
}];
const chipUntitled = chip.component({ ...chipStyle });
stateQueue = [];
const untitledMenu = chipUntitled.children.find((child) => child.type === Menu);
const untitledLabel = untitledMenu.props.anchor.children[0].children[0];
assert.equal(untitledLabel, 'light', 'an empty-title selection shows its id instead of "None"');
assert.notEqual(untitledLabel, 'none', 'the made choice is never reported as no selection');

// The numeric order field stays free-form but only FINITE numbers are written.
let orderInput = null;
walk(removeEl, (n) => { if (!orderInput && n.type === 'input' && n.props?.type === 'number') orderInput = n; });
assert.ok(orderInput, 'the order field renders as a number input');
lastSetState = 'sentinel';
orderInput.props.onChange({ target: { value: '42' } });
assert.deepStrictEqual(plain(lastSetState).map((r) => [r.id, r.order]), [['sec-a', 42], ['sec-b', 200]],
  'a finite typed order is written through');
lastSetState = 'sentinel';
orderInput.props.onChange({ target: { value: 'not-a-number' } });
assert.equal(lastSetState, 'sentinel', 'a non-numeric entry is ignored (no NaN persisted)');
lastSetState = 'sentinel';
orderInput.props.onChange({ target: { value: 'Infinity' } });
assert.equal(lastSetState, 'sentinel', 'a non-finite entry is ignored too');
console.log('PASS audit D/E: deterministic ties, sections·broken counter, preview empty state, confirmed ref removal, untitled chip, grip keyboard, integer orders');
// #endregion SECTION_auditDE

// #region SECTION_clientReview4 Four review findings: explicit-none chip,
// equal-order vs built-in, duplicate refs, honest preview variables.
// (1) Chip: absent key → default; present '' → explicit None; present id → that.
const lightProfile = { rowId: 'prompt-profile-light', patchId: 'profile-light', configId: 'light', title: 'Light', sections: [] };
const chipLabelFor = (lastByWorkspace) => {
  stateQueue = [{ profiles: [lightProfile], sections: [], builtinOrders: {}, default: 'light', lastByWorkspace }];
  const el = chip.component({ ...chipStyle });
  stateQueue = [];
  const menu = el.children.find((child) => child.type === Menu);
  return menu.props.anchor.children[0].children[0];
};
assert.equal(chipLabelFor({}), 'Light', 'no stored key at all → the default profile applies');
assert.equal(chipLabelFor({ '/work/repo': '' }), 'none',
  'a stored EMPTY string is an explicit None — the default must NOT be shown');
assert.equal(chipLabelFor({ '/work/repo': 'light' }), 'Light', 'a stored profile id shows that profile');
assert.equal(chipLabelFor({ '/work/repo': 'ghost' }), 'Light',
  'a stored but stale id falls back to the default (mirrors host resolveProfileId)');
// The optimistic update keeps the explicit-none marker as '', not undefined.
stateQueue = [{ profiles: [lightProfile], sections: [], builtinOrders: {}, default: 'light', lastByWorkspace: {} }];
const noneChip = chip.component({ ...chipStyle, pick: () => Promise.resolve({}) });
stateQueue = [];
setStateLog = [];
noneChip.children.find((child) => child.type === Menu).props.onSelect('none');
const noneCommit = setStateLog.find((entry) => entry && typeof entry === 'object' && entry.lastByWorkspace);
assert.ok(noneCommit, 'choosing None commits an optimistic state');
assert.equal(plain(noneCommit).lastByWorkspace['/work/repo'], '',
  'choosing None stores the host\'s explicit-empty marker, so the next paint stays None');
// A real choice stores the id.
stateQueue = [{ profiles: [lightProfile], sections: [], builtinOrders: {}, default: 'light', lastByWorkspace: {} }];
const pickChip = chip.component({ ...chipStyle, pick: () => Promise.resolve({}) });
stateQueue = [];
setStateLog = [];
pickChip.children.find((child) => child.type === Menu).props.onSelect('light');
const pickCommit = setStateLog.find((entry) => entry && typeof entry === 'object' && entry.lastByWorkspace);
assert.equal(plain(pickCommit).lastByWorkspace['/work/repo'], 'light', 'a real choice stores the profile id');

// (2) Rendered outline: our order-100 section is painted ABOVE the built-in with
// the same order (the host splices OUR sections before built-ins).
stateQueue = ['P9', outlineProfile.sections.slice(), false, null, '', null, null, null];
const equalEl = loaded.components.ProfileOutline({
  profile: outlineProfile, state: outlineState, api: {}, reload: noop, t: (k) => k, notify: noop,
  onBack: noop, onOpenSection: noop, autoFocusTitle: false,
});
stateQueue = [];
const painted = [];
walk(equalEl, (n) => {
  if (!Array.isArray(n.children)) return;
  if (n.props && typeof n.props['data-drop-index'] === 'number') return;
  if (n.children.some((c) => c?.type === 'input' && c.props?.type === 'number')) painted.push('ours');
  else if (n.children.some((c) => c?.type === 'span' && c.props?.flex === 1 && Array.isArray(c.children) && c.children.includes('plan:policy'))) painted.push('builtin');
});
assert.deepStrictEqual(painted, ['ours', 'builtin', 'ours'],
  'at an equal order the rendered outline puts our section BEFORE the built-in, matching the runtime');

// (3) Two refs to ONE section are independent occurrences.
const dupProfile = {
  rowId: 'prompt-profile-dup', patchId: 'prompt-profile-dup', configId: 'prompt-profile-dup', title: 'Dup',
  sections: [{ id: 'sec-a', order: 100, scope: 'inherit' }, { id: 'sec-a', order: 200, scope: 'main-only' }],
};
const dupState = {
  profiles: [dupProfile],
  sections: [{ configId: 'sec-a', patchId: 'prompt-section-sec-a', title: 'A', body: 'aaa' }],
  builtinOrders: {}, modes: [],
};
const renderDup = (confirmSeq) => {
  stateQueue = ['D', dupProfile.sections.slice(), false, null, '', null, null, confirmSeq ?? null];
  const el = loaded.components.ProfileOutline({
    profile: dupProfile, state: dupState, api: {}, reload: noop, t: (k) => k, notify: noop,
    onBack: noop, onOpenSection: noop, autoFocusTitle: false,
  });
  stateQueue = [];
  return el;
};
const dupEl = renderDup();
const dupRowKeys = [];
walk(dupEl, (n) => {
  if (n.props && typeof n.props.key === 'string' && n.props.key.startsWith('ours:')) dupRowKeys.push(n.props.key);
});
assert.equal(dupRowKeys.length, 2, 'both duplicate refs render as separate rows');
assert.equal(new Set(dupRowKeys).size, 2, 'and their React keys are unique');
const dupInputs = [];
walk(dupEl, (n) => { if (n.type === 'input' && n.props?.type === 'number') dupInputs.push(n); });
assert.deepStrictEqual(dupInputs.map((i) => i.props.value), [100, 200], 'each ref keeps its own order');
lastSetState = 'sentinel';
dupInputs[0].props.onChange({ target: { value: '7' } });
assert.deepStrictEqual(plain(lastSetState), [
  { id: 'sec-a', order: 7, scope: 'inherit' },
  { id: 'sec-a', order: 200, scope: 'main-only' },
], 'changing the first ref order leaves the second ref untouched');
const dupMenus = [];
walk(dupEl, (n) => { if (n.type === Menu && n.props?.anchor) dupMenus.push(n); });
assert.equal(dupMenus.length, 2, 'each duplicate ref has its own scope menu');
assert.notEqual(dupMenus[0].props.selectedId, dupMenus[1].props.selectedId, 'with independent scopes');
lastSetState = 'sentinel';
setStateLog = [];
dupMenus[1].props.onSelect('subagents-only');
const scopeCommit = setStateLog.find((entry) => Array.isArray(entry));
assert.deepStrictEqual(plain(scopeCommit), [
  { id: 'sec-a', order: 100, scope: 'inherit' },
  { id: 'sec-a', order: 200, scope: 'subagents-only' },
], 'changing the second ref scope leaves the first ref untouched');
// Removing one occurrence keeps the other.
const dupTrash = [];
walk(dupEl, (n) => { if (isButton(n) && n.props?.['aria-label'] === 'remove') dupTrash.push(n); });
assert.equal(dupTrash.length, 2, 'each duplicate ref has its own remove action');
lastSetState = 'sentinel';
dupTrash[0].props.onClick();
assert.equal(lastSetState, 0, 'remove stages THAT occurrence (index 0)');
const dupConfirmEl = renderDup(0);
let dupDialog = null;
walk(dupConfirmEl, (n) => { if (n.type?.name === 'ConfirmDialog') dupDialog = n; });
const dupModal = dupDialog.type(dupDialog.props);
let dupConfirm = null;
walk(dupModal, (n) => { if (!dupConfirm && (n.type?.name === 'Button' || n.type === primitives.Button) && Array.isArray(n.children) && n.children.includes('remove')) dupConfirm = n; });
lastSetState = 'sentinel';
dupConfirm.props.onClick();
assert.deepStrictEqual(plain(lastSetState), [{ id: 'sec-a', order: 200, scope: 'main-only' }],
  'removing one duplicate ref keeps the other (with its own scope)');
// Reordering one duplicate occurrence moves only THAT ref.
const dupGrips = [];
walk(dupEl, (n) => { if (isButton(n) && n.props?.['aria-label'] === 'dragHandle') dupGrips.push(n); });
assert.deepStrictEqual(dupGrips.map((g) => g.props['data-drag-handle']), [0, 1],
  'each duplicate ref has its own occurrence-keyed grip');
lastSetState = 'sentinel';
dupGrips[0].props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
assert.deepStrictEqual(plain(lastSetState), [
  { id: 'sec-a', order: 200, scope: 'main-only' },
  { id: 'sec-a', order: 201, scope: 'inherit' },
], 'moving the first duplicate down carries only that ref (order + scope intact)');

// (4) Preview flags interpolation variables instead of pretending to be exact.
assert.deepStrictEqual(plain(H.previewVariableNotice('{{cwd}} here', '{{cwd}} here', { cwd: '/host', model: null })),
  ['cwd'], 'a variable the host substituted with its own cwd cannot be proven equal → flagged');
assert.deepStrictEqual(plain(H.previewVariableNotice('a {{model}} b', 'a {{model}} b', { cwd: '/host', model: null })),
  ['model'], 'an unknown (null) variable is flagged');
assert.equal(H.previewVariableNotice('no variables', 'no variables', { cwd: '/host' }), null,
  'a section that uses no variables is not flagged');
assert.equal(H.previewVariableNotice('{{cwd}}', '{{cwd}}', { cwd: '/same' }, { cwd: '/same' }), null,
  'a value provably equal to the session context is NOT flagged');
stateQueue = ['main', {
  plan: [{ kind: 'ours', id: 'sec-a', title: 'A', order: 10, text: '/repo text' }],
  skipped: [], variables: { cwd: '/repo', model: null },
}];
const varPreview = loaded.components.PreviewTab({
  state: { profiles: [{ configId: 'main', title: 'Main' }], sections: [{ configId: 'sec-a', title: 'A', body: '{{cwd}} text' }], builtinOrders: {}, default: 'main', modes: [] },
  api: {}, t: (k) => k, notify: () => {},
});
stateQueue = [];
assert.ok(elementText(varPreview).includes('previewVariables'),
  'a section using {{cwd}} is marked in the preview');
assert.ok(elementText(varPreview).includes('{{cwd}}'), 'and the marker names the variable');
stateQueue = ['main', { plan: [{ kind: 'ours', id: 'sec-a', title: 'A', order: 10, text: 'plain' }], skipped: [], variables: { cwd: '/repo' } }];
const plainPreview = loaded.components.PreviewTab({
  state: { profiles: [{ configId: 'main', title: 'Main' }], sections: [{ configId: 'sec-a', title: 'A', body: 'plain' }], builtinOrders: {}, default: 'main', modes: [] },
  api: {}, t: (k) => k, notify: () => {},
});
stateQueue = [];
assert.ok(!elementText(plainPreview).includes('previewVariables'), 'a variable-free section stays unmarked');
console.log('PASS review H1/H2/H3/H6: explicit-none chip, equal-order=ours-first, duplicate refs independent, honest preview variables');
// #endregion SECTION_clientReview4

// #region SECTION_bundleRenameLock We own only our layer: a bundle-owned section's
// id cannot be changed (the control is disabled with a plain-language reason);
// `user` stays renameable and `unknown` behaves like `user`.
for (const [source, locked] of [['bundle', true], ['user', false], ['unknown', false]]) {
  const lockEntry = { ...sectionEntry, source };
  // SectionForm useState order: title, body, confirmDelete, renameValue, confirmRename, error, mutating.
  stateQueue = ['Greeting', 'Be kind.', false, 'sec-1', false, '', false];
  const lockForm = loaded.components.SectionForm({
    section: lockEntry, state: { ...tabState, sections: [lockEntry] },
    api: {}, reload: noop, t: (k) => k, notify: noop, onBack: noop, setState: noop, autoFocusTitle: false,
  });
  stateQueue = [];
  let lockBtn = null;
  walk(lockForm, (n) => { if (isButton(n) && Array.isArray(n.children) && n.children.includes('renameId')) lockBtn = n; });
  assert.ok(lockBtn, `source "${source}": the rename-id control still renders`);
  assert.equal(lockBtn.props.disabled, locked, `source "${source}": rename ${locked ? 'is DISABLED' : 'stays enabled'}`);
  assert.equal(typeof lockBtn.props.onClick, 'function');
  if (locked) {
    assert.equal(lockBtn.props.title, 'renameIdLocked', 'the locked control explains itself on hover');
    assert.ok(elementText(lockForm).includes('renameIdLocked'), 'bundle rows show the "cannot change id" reason inline');
  } else {
    assert.ok(!elementText(lockForm).includes('renameIdLocked'), `source "${source}" shows no lock note`);
  }
}
console.log('PASS bundle rename lock: bundle-owned ids are read-only (disabled + reason); user/unknown stay renameable');
// #endregion SECTION_bundleRenameLock

// #region SECTION_duplicateOpensCopy Duplicate drills into the COPY, like create does.
(async () => {
  const copyState = {
    profiles: [], builtinOrders: {},
    sections: [{ rowId: 'prompt-section-copy', patchId: 'prompt-section-copy', configId: 'prompt-section-copy', title: 'Greeting (copy)', body: 'Be kind.', usedIn: [], source: 'user' }],
  };
  let reads = 0;
  const drills = [];
  const api = {
    sectionCreate: async (v) => ({ rowId: 'prompt-section-copy', patchId: 'prompt-section-copy', configId: 'prompt-section-copy', ...v }),
    // The copy is already in /state on the first read: this section is about the
    // navigation, not the poll (the poll itself is covered above).
    loadState: async () => { reads += 1; return copyState; },
  };
  stateQueue = ['Greeting', 'Be kind.', false, 'sec-1', false, '', false];
  const form = loaded.components.SectionForm({
    section: sectionEntry, state: tabState, api, reload: async () => {}, t: (k) => k, notify: () => {},
    onBack: noop, setState: () => {}, onDrill: (id) => drills.push(id), autoFocusTitle: false,
  });
  stateQueue = [];
  let dupBtn = null;
  walk(form, (n) => { if (isButton(n) && n.props?.['aria-label'] === 'duplicate') dupBtn = n; });
  assert.ok(dupBtn, 'duplicate button rendered');
  await dupBtn.props.onClick();
  assert.deepStrictEqual(plain(drills), ['prompt-section-copy'],
    'duplicate navigates to the COPY id (creation-style), not the source row');
  console.log('PASS duplicate: opens the copy in the editor after the poll agrees');
})();
// #endregion SECTION_duplicateOpensCopy

// #region SECTION_tokens Theme tokens: every --dsw-alias-* used must be a real shipped token.
const usedTokens = [...new Set([...code.matchAll(/--dsw-alias-[a-z0-9-]+/g)].map((m) => m[0]))];
const realTokens = new Set([
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
  '--dsw-alias-label-caption', '--dsw-alias-label-dimmed', '--dsw-alias-label-error',
  '--dsw-alias-bg-l1', '--dsw-alias-bg-l2', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3',
  '--dsw-alias-separator-primary',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-state-warning-primary', '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-success-primary',
]);
for (const token of usedTokens) {
  assert.ok(realTokens.has(token), `unknown theme token: ${token} (grep the shipped CSS before use)`);
}
console.log(`PASS theme tokens: ${usedTokens.length} distinct --dsw-alias-* names all exist in the shipped token set`);
// #endregion SECTION_tokens
// Final line LAST: the async flow sections above settle within a few ms (1 ms
// poll intervals, capped tries), so a short timer keeps the output ordered
// without ever being able to hang the file.
setTimeout(() => console.log('ALL OK'), 50);
