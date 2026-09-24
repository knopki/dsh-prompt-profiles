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
  visit(el);
  for (const child of el.children ?? []) walk(child, visit);
  const propsChildren = el.props && el.props.children;
  if (propsChildren && typeof propsChildren === 'object') walk(propsChildren, visit);
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
const React = {
  createElement: (type, props, ...children) => {
    if (type && typeof type.validate === 'function') type.validate({ ...props, children: children[0] });
    return { type, props: props || {}, children };
  },
  Fragment: Symbol('Fragment'),
  useState: (value) => [stateQueue.length ? stateQueue.shift() : (typeof value === 'function' ? value() : value), () => {}],
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
    register: (ns, d) => { assert.equal(ns, 'promptProfiles'); dict.en = { ...dict.en, ...d.en }; },
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
stateQueue = [{
  profiles: [{ rowId: 'prompt-profile-light', patchId: 'profile-light', configId: 'light', title: 'Light', sections: [] }],
  sections: [], builtinOrders: {}, default: null, lastByWorkspace: {},
}];
const chipEl = chip.component({ ...base, useSession: (select) => select({ blank: true }) });
stateQueue = [];
assert.ok(chipEl, 'blank session with profiles renders the chip');
const chipMenu = chipEl.children.find((child) => child.type === Menu);
assert.ok(chipMenu, 'chip renders a Menu element');
assert.equal(chipMenu.props.open, false, 'chip Menu is owner-controlled via open');
assert.ok(chipMenu.props.anchor, 'chip Menu carries the anchor trigger');
assert.equal(chipMenu.props.items[1].id, 'light', 'menu rows key on the unqualified configId');
assert.equal(chipMenu.props.items.at(-1).disabled, true, 'manage row is the disabled data entry');
assert.ok(chipMenu.props.items.some((entry) => entry.type === 'separator'), 'separator is a data entry, not an hr child');
// The disabled Manage item must carry a localized explanation (dictionary check:
// the disabled data row cannot carry a title, so the string lives in the locale).
assert.ok(dict.en.manageUnavailable, 'manageUnavailable locale string registered');
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
console.log('PASS settings.section / prompt-profiles / order 25 / label + api inject + loading render');
// #endregion SECTION_settings

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

// ProfilesTab useState order: creating, confirming, justCreated.
stateQueue = [false, null, null];
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
console.log('PASS tabs: modal-free create buttons wired to the flow with default titles');
// #endregion SECTION_tabsNoCreateModal

// #region SECTION_sectionFormErrors SectionForm renders the inline error line.
// SectionForm useState order: title, body, confirmDelete, renameValue, confirmRename, error.
stateQueue = ['Greeting', 'Be kind.', false, 'sec-1', false, 'saveError internal error'];
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

// slugify + uniqueSlug
assert.equal(H.slugify('Light tone!'), 'light-tone');
assert.equal(H.slugify(''), 'item', 'fallback slug for empty title');
assert.equal(H.slugify('', 'section'), 'section', 'explicit fallback');
assert.equal(H.slugify('Тон', 'section'), 'section', 'non-latin title falls back');
assert.equal(H.uniqueSlug('light', { light: 1 }), 'light-2');
assert.equal(H.uniqueSlug('light', new Set(['light', 'light-2'])), 'light-3');
assert.match(H.uniqueSlug('Light tone!', new Set()), /^[a-z0-9][a-z0-9-]*$/);

// effectiveOrder + planMove
assert.equal(H.effectiveOrder(500, { plan: 500 }), 500.5, 'builtin collision lands +0.5');
assert.equal(H.effectiveOrder(501, { plan: 500 }), 501);
assert.deepStrictEqual(plain(H.planMove([100, 200, 300], 2, 'up')), [100, 150, 200], 'midpoint between new neighbours, new arrangement');
assert.deepStrictEqual(plain(H.planMove([100, 200, 300], 0, 'down')), [200, 250, 300]);
assert.equal(H.planMove([100, 200], 0, 'up'), null, 'cannot move first row up');
assert.equal(H.planMove([100, 200], 1, 'down'), null, 'cannot move last row down');
assert.deepStrictEqual(plain(H.planMove([100, 200], 1, 'up')), [99, 100], 'becoming first: -1');
assert.deepStrictEqual(plain(H.planMove([100, 200], 0, 'down')), [200, 201], 'becoming last: +1');
assert.deepStrictEqual(plain(H.planMove([100, 300], 1, 'up', { b: 99 })), [99.5, 100], 'end move colliding with a builtin gets +0.5 (renormalisation)');
assert.deepStrictEqual(plain(H.planMove([100, 300], 0, 'down', { b: 301 })), [300, 301.5], 'down-end collision also renormalises +0.5');

// outlineRows
const outline = H.outlineRows(
  { sections: [{ id: 'x', order: 500, scope: 'inherit' }, { id: 'gone', order: 10, scope: 'inherit' }] },
  { x: { id: 'x', title: 'X', body: 'hi' } },
  { 'persona-prefix': 0, 'plan:policy': 500 });
assert.deepStrictEqual(plain(outline).map((r) => r.kind), ['builtin', 'builtin', 'ours', 'broken']);
assert.equal(outline[2].displayOrder, 500.5, 'ours row after its colliding builtin');
assert.equal(outline[2].collides, true);
assert.equal(outline[3].ref.id, 'gone', 'missing section becomes a broken row');
assert.deepStrictEqual(plain(outline[2].ref), { id: 'x', order: 500, scope: 'inherit' }, 'ours ref round-trips through the vm realm');

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
console.log('PASS helpers: idOf, slugify/uniqueSlug, effectiveOrder/planMove, outlineRows, filterSections, previewPlan');
// #endregion SECTION_helpers

// #region SECTION_tokens Theme tokens: every --dsw-alias-* used must be a real shipped token.
const usedTokens = [...new Set([...code.matchAll(/--dsw-alias-[a-z0-9-]+/g)].map((m) => m[0]))];
const realTokens = new Set([
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
  '--dsw-alias-label-caption', '--dsw-alias-label-dimmed', '--dsw-alias-label-error',
  '--dsw-alias-bg-l1', '--dsw-alias-bg-l2', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3',
  '--dsw-alias-separator-primary',
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
