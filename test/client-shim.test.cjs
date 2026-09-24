// #region MODULE_CONTRACT
// PURPOSE: Verify the hand-authored client loader wrapper: chip visibility
//   gates, settings-section registration, and the pure helpers.
// SCOPE: Shim-only registration/component smoke test; NOT browser integration.
// INVARIANTS: Array/object comparisons use assert.deepStrictEqual on values
//   normalized out of the vm realm (JSON round-trip) — the assertion stays
//   strict while remaining cross-realm safe.
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

let loaded;
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: Symbol('Fragment'),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
};
const primitives = Object.fromEntries([
  'Menu','MenuItemButton','Modal','Tag','Toast','Tooltip','Input','SegmentedTabs','Checkbox','Button',
  'IconChevronUpOutlineMedium','IconChevronDownOutlineMedium','IconChevronsUpDownOutlineRegular',
  'IconChevronLeftOutlineMedium','IconEditOutlineRegular','IconCopyOutlineRegular',
  'IconTrashOutlineRegular','IconPlusOutlineRegular','IconSearchOutlineRegular',
].map((name) => [name, name]));
const code = fs.readFileSync(require('node:path').join(__dirname, '../lib/client.js'), 'utf8');
new vm.Script(code, { filename: 'lib/client.js' });
vm.runInNewContext(code, { window: { __ModuleLoader__: { load: (module) => { loaded = module.factory((name) => name === 'react' ? React : primitives); } } } });
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

// #region SECTION_chip Chip registration and null gates (step 5 behavior kept).
const chip = registrations.find((r) => r.name === 'conversation.input.left');
assert.ok(chip, 'chip registration exists');
assert.equal(chip.options.id, 'prompt-profile');
assert.equal(chip.options.order, 10);
assert.equal(chip.options.inject('sid').sessionId, 'sid');
assert.equal(typeof chip.options.inject('sid').pick, 'function');
const base = { sessionId: 'sid', useSession: (select) => select({ blank: false }), useWorkspaces: (select) => select({ items: [] }), t: (key) => key };
assert.equal(chip.component(base), null, 'non-blank session returns null');
assert.equal(chip.component({ ...base, useSession: (select) => select({ blank: true }) }), null, 'empty profile state returns null');
// The disabled Manage item must carry a localized explanation (dictionary check:
// the menu element tree needs loaded state to render, so assert the string).
assert.ok(dict.en.manageUnavailable, 'manageUnavailable locale string registered');
console.log('PASS loader syntax; slot conversation.input.left / prompt-profile / order 10');
console.log('PASS inject(sessionId) provides sessionId and pick callback');
console.log('PASS component returns null for non-blank session and empty profile state');
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
assert.equal(sectionEl.type, 'p', 'settings page renders a loading placeholder before state arrives');
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
