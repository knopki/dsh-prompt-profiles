// #region MODULE_CONTRACT
// PURPOSE: Verify the hand-authored client loader wrapper: chip visibility
//   gates, settings-section registration, the pure helpers, and — since the
//   astra review — that every primitive is used with its REAL installed
//   contract (Menu open/anchor/onClose, MenuItemButton onSelect-only, Toast
//   as a render-only component).
// SCOPE: Shim-only registration/component smoke test; NOT browser integration.
// INVARIANTS: Array/object comparisons use assert.deepStrictEqual on values
//   normalized out of the vm realm (JSON round-trip) — the assertion stays
//   strict while remaining cross-realm safe. Fake primitives THROW at element
//   creation when the real prop contract is violated, so any regression in
//   lib/client.js fails this file, not the browser.
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
      if (typeof entry?.id !== 'string') throw new TypeError('every Menu items entry needs a string id');
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
vm.runInNewContext(code, { window: { __ModuleLoader__: { load: (module) => { loaded = module.factory((name) => name === 'react' ? React : primitives); } } } });
// The client must never invoke Toast/Menu as plain functions (invalid hook call).
assert.doesNotMatch(code, /(?<![a-zA-Z])Toast\s*\(/, 'client never calls Toast() as a function');
assert.doesNotMatch(code, /(?<![a-zA-Z])Menu\s*\(/, 'client never calls Menu() as a function');
const dict = { en: { nav: 'Prompt profiles' } };
const ctx = {
  locale: {
    register: (ns, d) => { assert.equal(ns, 'promptProfiles'); dict.en = { ...dict.en, ...d.en }; },
    bind: (ns) => (key) => dict.en[key] ?? key,
  },
  slots: {
    inject: (name, callback) => { callback(); },
    register: (options, component) => registrations.push({ name: options.name, options, component }),
  },
};
const registrations = [];
loaded.apply(ctx);
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
stateQueue = [{ profiles: [{ id: 'light', title: 'Light' }], sections: [], builtinOrders: {}, default: null, lastByWorkspace: {} }];
const chipEl = chip.component({ ...base, useSession: (select) => select({ blank: true }) });
stateQueue = [];
assert.ok(chipEl, 'blank session with profiles renders the chip');
const chipMenu = chipEl.children.find((child) => child.type === Menu);
assert.ok(chipMenu, 'chip renders a Menu element');
assert.equal(chipMenu.props.open, false, 'chip Menu is owner-controlled via open');
assert.ok(chipMenu.props.anchor, 'chip Menu carries the anchor trigger');
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

// #region SECTION_helpers Pure helpers (strict, realm-normalized comparisons).
const H = loaded.helpers;
assert.ok(H, 'helpers are exported on the module object');

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
  { id: 'light-tone', title: 'Light tone' },
  { id: 'no-preamble', title: 'No preamble' },
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
console.log('PASS helpers: slugify/uniqueSlug, effectiveOrder/planMove, outlineRows, filterSections, previewPlan');
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
console.log('ALL OK');
