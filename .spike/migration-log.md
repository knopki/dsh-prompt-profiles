# Migration log — @knopki/dsh-prompt-profiles

## Phase 0 — toolchain and layout (no behaviour change)

Date: 2026-09-25. Commit: see `git log -1` (message starts with `build(phase0)`).

Toolchain in play: pnpm 11.26.0, node v26.8.2, esbuild 0.28.2, typescript 6.0.3,
vitest 4.1.11 (installed, not wired yet), @deepseek-ai/dsh-client-test-runtime 0.1.7-rc.2.

### Moves (git mv, history preserved)

| from | to |
|---|---|
| `lib/index.js` | `src/host/index.ts` |
| `lib/api.js` | `src/host/api.ts` |
| `lib/registry.js` | `src/host/registry.ts` |
| `lib/mirror.js` | `src/host/mirror.ts` |
| `lib/builtin-orders.js` | `src/host/builtin-orders.ts` |
| `lib/resolve.js` | `src/host/resolve.ts` |
| `lib/writer.js` | `src/host/writer.ts` |
| `lib/section.js` | `src/host/section.ts` |
| `lib/profile.js` | `src/host/profile.ts` |
| `lib/client.js` | `src/client/index.ts` |

Every moved file got `// @ts-nocheck` + `// TODO(phase 1): remove after typing` as
lines 1–2; `#region`/`#endregion` markup untouched. Host imports use explicit
`./name.ts` specifiers. The client file lost its hand-written
`window.__ModuleLoader__.load({ id: '@knopki/dsh-prompt-profiles', ... })` wrapper
(now emitted by `build.mjs`) and its factory `return {...}` became
`module.exports = {...}`.

Pure-move proof (`git show HEAD:lib/<name>.js` + header + `.js`→`.ts` specifiers
must equal the new file):

```
index: IDENTICAL (modulo header+specifiers)
api: IDENTICAL (modulo header+specifiers)
registry: IDENTICAL (modulo header+specifiers)
mirror: IDENTICAL (modulo header+specifiers)
builtin-orders: IDENTICAL (modulo header+specifiers)
resolve: IDENTICAL (modulo header+specifiers)
writer: IDENTICAL (modulo header+specifiers)
section: IDENTICAL (modulo header+specifiers)
profile: IDENTICAL (modulo header+specifiers)
```

Client body: `client body identical modulo dedent+module.exports: True` (one
intentional `@rationale` line pair in the module contract updated, since the
wrapper no longer lives in the file).

### Install

```bash
pnpm install --store-dir ./.pnpm-store
# +155 packages, exit 0; [ERR_PNPM_IGNORED_BUILDS] esbuild@0.28.2 (ignore-scripts=true in ~/.npmrc; the platform binary is installed anyway)
```

`pnpm-workspace.yaml` gained `storeDir: ./.pnpm-store`, because plain `pnpm run`
runs an implicit `pnpm install` whose default store (`~/.local/share/pnpm/store`)
cannot open its SQLite file from this sandbox — without it `pnpm run build` dies
with `[ERR_SQLITE_ERROR] unable to open database file`.

### Build

```bash
pnpm run build   # node build.mjs
```

esbuild host entries (`src/host/*.ts` → `lib/*.js`, ESM, node22, `splitting: true`,
external `@deepseek-ai/cordis`, `@deepseek-ai/dsh-*`, `@deepseek-ai/schemastery`)
+ client entry (`src/client/index.ts` → `lib/client.js`, CJS, browser, es2022,
external dsh-* + react family) + `tsc -p tsconfig.json` → `lib/types/**`.
Exit 0.

```
lib/index.js       770748 bytes
lib/client.js       77087 bytes
lib/section.js       1000 bytes
lib/profile.js       1230 bytes
lib/                3.5 MB total (12 entry bundles + 14 files in lib/chunks/ + 10 declaration files)
```

### Tests (all green, unchanged test sources)

```
$ pnpm run typecheck
$ tsc --noEmit
EXIT=0

$ pnpm test   # node --test test/*.mjs
ℹ tests 128  ℹ pass 128  ℹ fail 0   EXIT=0

$ node test/client-shim.test.cjs
ALL OK   EXIT=0

$ node --test test/smoke-cordis.test.mjs
6 pass / 0 fail (incl. "with connection and every service the full API works over Fetch routes")
```

`dsh --profile web --dump-config` diffed against a pre-change capture:
`DUMP-CONFIG IDENTICAL (modulo hashes)` — every prompt-profiles row unchanged.

### Deviations from a pure move (and why)

1. **Host build is code-split, and emits 9 host entries, not 3.** The existing
   suite imports `../lib/<name>.js` by path, and `mirror.test.mjs` asserts object
   identity (`assert.equal(result.orders, BUILTIN_ORDERS)`). Per-entry bundles gave
   each entry its own copy of `builtin-orders`, so that assertion failed. esbuild
   `splitting: true` puts shared modules in `lib/chunks/*.js`, restoring one
   instance per module, exactly like the old module graph. Phase 1 (vitest imports
   from `src/`) lets this shrink to the three packaged entries.
2. **A `createRequire` banner on host bundles.** Bundled `yaml` is CJS and calls
   `require('process')` at runtime; esbuild's ESM output throws
   `Error: Dynamic require of "process" is not supported` without a real `require`.
   yaml and zod therefore stay bundled (as planned) and the banner supplies
   `require`.
3. **`stripInternal: true` + `/** @internal */` on the two `Config` schemas**
   (`src/host/index.ts`, `src/host/profile.ts`). `tsc` declaration emit fails with
   TS2883: schemastery's inferred type references `Dict` from a pnpm-nested
   `@deepseek-ai/cosmokit`, which is not declaration-portable. Adding cosmokit as a
   direct devDependency and a `paths` mapping did not help; `@ts-ignore` does not
   suppress emit-time errors. `@internal` keeps the emitted `.d.ts` clean and the
   runtime byte-identical. Phase 1 deletes both markers once the schemas are typed.
4. `package.json` now carries `main`, `exports` (object form with `types`,
   `.`/`./client`/`./section`/`./profile`/`./package.json`), `files`, scripts and
   the dsh-at-any peer/dependency split; `dsh.client` is unchanged.
5. `lib/types/client/index.d.ts` is `export {};` — the client's runtime export is
   the ModuleLoader factory object, which is Phase 3's typing job.

---

## Phase 2b — Typert Remote surface alongside HTTP (host half)

Commit: `feat(phase2b): typert remote surface alongside http`.

### What was extracted

- **`src/host/operations.ts`** (new): the pure operation layer moved out of
  `api.ts` verbatim — `ApiError`, `errorText`, `findRow`,
  `normalizeNewRowId`, `tokenSource`, `generateTokenId`, `validate`,
  `modeViews`, `stateResponse`, `previewResponse`, `deleteRow`,
  `renameSection`, and `createOperations(deps)` (all the createRoutes helpers:
  `sectionTargets`, `pendingSectionIds`, `profileSelectable`, `takenIds`,
  `patchIdOf`, `resolveRow`, `settingsWrite`, `mutateWithRetry`,
  `clearProfileReferences`, `staleWorkspaceKeys`). `createOperations` returns
  `{ ops, routes }`: `ops` is the transport-neutral method set (the Remote
  method names), `routes` the HTTP table whose handlers are thin adapters onto
  `ops` (only `/preview` maps query→input and `/default` passes its body
  contract straight through).
- **`src/host/api.ts`** now owns only the HTTP transport: auth/CSRF layers,
  method guard, body parsing + byte ceiling, statuses and the
  `{error:{message}}` envelope, `registerApi`. Re-exports `tokenSource` for
  the existing test import. Old routes behaviour-frozen (128 api/index tests
  untouched and green).
- **`src/host/remote.ts`** (new): the spike-proven Remote half (below).
- **`src/host/index.ts`**: `ctx.inject(['typert'])` effect mounting
  `registerRemote` + a 200 ms loud-degradation timer (error log
  `remote: mounted ZERO remote endpoints (typert service absent; HTTP routes
  unaffected)`), same pattern as the connection case. HTTP registration
  untouched. Sealing/assembler untouched.
- `package.json`: `./remote` export (`lib/remote.js`), optional peer
  `@deepseek-ai/dsh-typert-protocol`; devDeps `dsh-typert-protocol`,
  `dsh-typert-registry`, `dsh-api-gateway` (the latter two test-only).
  `build.mjs` gained `operations.ts` + `remote.ts` entries.

### Descriptor list (all registered under namespace `promptProfiles`)

One parameter each: `{ name: 'input', wire: 'input', source: 'json' }`;
`invocation: { kind: 'direct' }`; strict zod 4 (`z.strictObject`) codecs on
input AND result, memoized `create` factories; `id`/typeSymbols keyed by
`@knopki/dsh-prompt-profiles#…`; `sourceLocation` = the real line of each
method entry in `src/host/remote.ts`.

| Method | Input (required fields) | Result |
|---|---|---|
| `state` | (optional ignored `sessionId`/`cwd`/`workspaceId`) | profiles, sections, builtinOrders, modes, default, lastByWorkspace, revision |
| `preview` | `profileId`, `cwd?` | profileId, title, sections, skipped, variables |
| `sectionCreate` | `title?`, `body?`, `id?` | rowId, patchId, configId, title, body, emits |
| `sectionUpdate` | `rowId`, `value{title,body}`, `revision?` | rowId, patchId, emits |
| `sectionDelete` | `rowId` | disabled |
| `sectionRename` | `rowId`, `id` | rowId, patchId, id, affectedProfiles |
| `profileCreate` | `title?`, `sections?`, `id?` | rowId, patchId, configId, title, sections |
| `profileUpdate` | `rowId`, `value{title,sections?}`, `revision?` | rowId, patchId |
| `profileDelete` | `rowId`, `revision?` | disabled |
| `last` | `profileId`, `workspaceId?`, `cwd?`, `revision?` | `{ok:true}` |
| `defaultSet` | `profileId` (`""`=none), `revision?` | `{ok:true}` |

Hosting service: `PromptProfilesRemote extends TypertRemoteService`
(`@deepseek-ai/dsh-typert-protocol`), Cordis key `promptProfilesRemote`, bound
`super(ctx, key, { namespace: 'promptProfiles' })` → the exact 3-field frozen
`typertRemote` identity (`{service, serviceKey, namespace}`) the gateway's
`validateBinding` requires. Methods are constructor-closure arrows: the
gateway dispatches through a context proxy receiver, and class-private
fields/prototype `this` brand checks fail with «Receiver must be an instance
of class» (found by the real-gateway test). Every result passes a recursive
plain-JSON guard + its strict result schema (`ApiError 500` on violation);
business failures propagate as the same `ApiError`s the HTTP path throws.

### Deviations from the plan

1. **Service key.** MIGRATION sketched the Remote service "bound to our key";
  the `promptProfiles` Cordis key is already taken by the registry service, so
  the Remote service is `promptProfilesRemote` with namespace `promptProfiles`
  (gateway validates `serviceKey === descriptor.service` and the namespace
  separately — verified against the real gateway source and by the test).
2. **Gateway integration test** uses `@deepseek-ai/dsh-api-gateway`'s real
  `TypertGatewayService.invokeRpc` rather than
  `dsh-client-test-runtime`/`dsh-remote-mock`: those two are CLIENT-side
  harnesses (jsdom slot bench / endpoint-named Remote mock for the client
  contribution, i.e. phase 2 client half and phase 3). The host-side dispatch
  path (strict decode → binding validation → service method → result encode →
  Remote failure envelope) is fully exercised by the real gateway service; the
  only layer not covered is the HTTP/WebSocket carrier, which is phase 4 live
  acceptance (as in the spike).
3. `state` ignores the reserved session hints (behaviour preserved: GET /state
  is global today); the input codec accepts them for the client half.

### Test evidence (exact)

`pnpm test` (node --test, includes the 3 new smoke tests):

```text
ℹ tests 131
ℹ suites 0
ℹ pass 131
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

`node test/client-shim.test.cjs` → `PASS` ×2, `ALL OK`.
`node --test test/smoke-cordis.test.mjs` → `tests 9 / pass 9 / fail 0`, new:

- real typert registry: contribution registers, 11 strict endpoints visible, dispose withdraws
- real Cordis: no typert service degrades loudly (error log), HTTP routes unaffected
- real gateway: strict rejection leaves the patch untouched; a valid Remote call matches the HTTP path byte-for-byte
  (missing/extra/wrong-type inputs rejected with the patch byte-identical;
  unknown row → Remote failure `/is not registered/`; valid create via HTTP on
  fixture A vs via the real gateway on fixture B: identical result objects and
  byte-identical patch files; state results equal on both paths).

`pnpm run typecheck` clean. `pnpm run build` artifacts committed.

### Bundle sizes (built `lib/`)

`lib/index.js` 15.1 kb, `lib/remote.js` 636 b, `lib/operations.js` 541 b,
`lib/api.js` 491 b (+ shared chunks, unchanged zod/yaml chunk 750.7 kb);
client bundle unchanged 77 087 b (no client changes in this half).

## Phase 2b — client half (Typert Remote preferred over fetch)

### What changed

- **`src/shared/remote-contract.ts` (new)** — the ONE source of truth for the
  contract: identity constants (`TYPERT_PACKAGE`, `REMOTE_NAMESPACE`,
  `REMOTE_SERVICE_KEY`), `METHOD_SPECS` (per method: name, `line`, strict zod
  args factory, strict zod result factory), `memoCreate`, and
  `buildRemoteDescriptors(face)` producing the descriptor array in the exact
  spiked field shape (`id, service, namespace, method, invocation:{kind:
  'direct'}, parameters:[{name:'input',wire:'input',source:'json',codec:{mode:
  'strict',typeSymbol,create}}], result:{mode:'strict',typeSymbol,create},
  sourceLocation:{file,line,column}`). `face` selects only the reported
  sourceLocation file (`src/host/remote.ts` vs `src/client/remote.ts`); the
  `line` numbers are DATA copied verbatim so the host descriptors are
  byte-identical to commit 8a27a2f (verified: same 11 ids/service/lines/
  typeSymbols; the real-registry smoke test still registers all 11).
- **`src/host/remote.ts`** — now imports the shared contract and keeps only
  the host-specific half: `HOST_RUNNERS` (the per-method `run` adapters that
  delegate to `lib/operations.ts`, incl. the `defaultSet` `{default}` adapter),
  `remoteInvocations() = buildRemoteDescriptors('host')`, the service and
  `registerRemote` unchanged. Public exports re-exported unchanged.
- **`src/client/remote.ts` (new)** — `clientContribution`
  (`{ package, descriptors: buildRemoteDescriptors('client') }`), the per-method
  helper `remoteCall(scope, method, args)` (always an object arg, unwraps the
  RemoteResult envelope: `{ok:true,value}` → value, `{ok:false,error}` →
  `RemoteCallError` with the envelope's message+code), `isRemoteConflict`
  (err.status===409 OR the two deterministic stale-revision messages), and
  `makeRemoteApi(scope)` — the endpoint facade with the SAME method names and
  payload semantics as the fetch facade (plus `last(choice)`).
- **`src/client/index.ts`** — `inject: ['slots','locale','remote']`
  (package-level `dsh.client.inject` untouched, per instruction);
  `REMOTE_mount`: `mountRemote(ctx)` runs inside a Cordis effect —
  `await ctx.remote.$mount(contribution)`, then
  `ctx.inject(['remote','remote.promptProfiles'], scope => activeApi =
  makeRemoteApi(scope))` — both disposers run when the plugin fiber dies.
  Data paths (chip load, pick/`last`, post-pick refresh) go through
  `readyApi()` which AWAITS `remoteSettled`, so a pre-mount call never races
  to fetch. The fetch facade stays ONLY as the temporary fallback for a FAILED
  mount, and the failure is logged at error level (logger.error/console.error
  with the stage) — loud, never silent. `runSave` classifies conflicts via
  `isRemoteConflict` (409 status for fetch, message text for Remote — the
  gateway serializes a thrown host ApiError as
  `{code:'gateway/internal', message}`, no HTTP status crosses the envelope).
  Settings-section inject hands out `getActiveApi()` (Remote once mounted).

### Mount code (essence)

```js
inject: ["slots", "locale", "remote"],
apply(ctx) {
  ctx.locale.register(...); ...
  if (typeof ctx.effect === "function") mountRemote(ctx);   // Remote first
  ctx.slots.inject("conversation.input.left", ...); ctx.slots.inject("settings.section", ...);
}
// mountRemote: ctx.effect(() => {
//   disposeMount = await ctx.remote.$mount(remoteClient.clientContribution);
//   disposeInject = ctx.inject(["remote", "remote.promptProfiles"], (scope) => {
//     activeApi = remoteClient.makeRemoteApi(scope); settle(true);
//   });
//   return async () => { disposeInject(); await disposeMount(); };
// })
```

### Test evidence (exact)

- `pnpm test` (node --test): `ℹ tests 131 / ℹ pass 131 / ℹ fail 0`.
- `node --test test/smoke-cordis.test.mjs`: `ℹ tests 9 / ℹ pass 9 / ℹ fail 0`
  (host descriptors byte-identical; the 11-endpoint + gateway-parity smokes
  pass on the shared contract).
- `node test/client-shim.test.cjs`: ends `ALL OK` (see deviations for what
  was updated).
- `pnpm run test:remote` (NEW, vitest via the platform harness):
  `Test Files 1 passed (1) / Tests 4 passed (4)` —
  `test/remote/client-remote.spec.mjs` proves, against the BUILT
  `lib/client.js`: (1) the contribution mounts and the namespace service is
  reachable via inject while a fiber without `remote` is refused
  ("cannot get property remote without inject"); (2) a call reaches the
  remote-mock with the exact wire args (`{ input: {} }`,
  `{ input: { rowId, id } }`, `{ input: { profileId } }`,
  `{ input: { cwd, profileId } }`) and the envelope unwraps; (3) a failure
  envelope surfaces as the UI error (`runSave` notify carries the message;
  the stale-revision message takes the 409 re-apply path: attempts 2,
  reloads 2, no toast); (4) disposing the plugin removes the namespace
  (`ctx.get('remote.promptProfiles')` → undefined) and
  `mock.assertNoUnmatched()` passes.
- `pnpm run typecheck` clean; `pnpm run build` green.

### Client bundle size

`lib/client.js` **911 260 bytes (889.9 kb)** — up from 77 087 b: zod 4 is now
bundled into the client (the browser module table has no bare `zod`), as the
spike predicted (~760 KB measured there; ours also carries the shared
descriptor table). `lib/client.js.map` 1 602 094 b.

### Deviations and reasons

1. **The bench is not the published whole-client tier.** The installed
   `@deepseek-ai/dsh-client-test-runtime@0.1.7-rc.2` publishes ONLY the slot
   tier in `lib/` — `createClientTest`/`webApp`/`ClientRoster` live in
   `src/assembly/`, which is NOT in the published package (`files: lib`,
   no `src` on disk), and `jsdom` is not installed as a dependency here.
   Its `TestRemote.$mount` rejects by design ("needs the real Client Remote
   service"). So the spec assembles the same seam itself: real `Context`
   + real `TypertRegistry` + the REAL api-gateway Client Remote service
   (loaded from its published `lib/client.js` ModuleLoader bundle) with only
   the Connection carrier replaced by `@deepseek-ai/dsh-remote-mock`
   (`{ rpc: mock.rpc }`, the exact binding the whole-client tier documents).
   Not covered as a result: real `bootClient` graph, HMR, and DOM rendering
   of the chip/settings page (Phase 3 slot-bench work).
2. **Conflict detection is message-based on the Remote path.** The gateway
   maps a thrown host `ApiError(409, …)` to `{code:'gateway/internal',
   message}` — no status crosses the envelope — so `isRemoteConflict`
   matches the two deterministic host messages
   (`configuration changed since read|configuration kept changing`) and keeps
   `err.status === 409` for the fetch fallback. Proper code-carrying
   RemoteErrors on the host belong to the deferred refactor.
3. **The fetch path is retained, not deleted** (2c deletes it): it is the
   explicit fallback ONLY after a FAILED/loud Remote mount; calls issued
   before the mount settles WAIT (`readyApi()`), so Remote is always
   preferred and nothing falls back silently.
4. **`client-shim.test.cjs` updates (no weakened assertions):**
   - inject-list assertion now `['slots','locale','remote']`;
   - the strict fake ctx gained `remote` (stub `$mount` that rejects) and
     `effect` (recorded into the existing effect queue); after `apply` the
     shim flushes the mount effect so the failed mount settles EXPLICITLY
     (one loud console.error) instead of leaving `readyApi` pending;
   - the pick assertion now AWAITS the pick (Remote adds microtask hops) and
     records requests on a LOCAL sink (vm-sandbox `fetch` swap) because the
     awaited microtask drain interleaves with later top-level sections that
     clear the shared `fetchCalls` list; it still asserts the exact
     `/api/__dsh-prompt-profiles/last` URL, exact body
     `{cwd, profileId}`, and the JSON content-type — plus exactly ONE /last.
5. **`service` in client descriptors is the host's service key**
   (`promptProfilesRemote`): both faces must be identical in shape and the
   client-side validation/namespace install ignores `service`.
6. **Access pattern refinement:** `scope.remote.promptProfiles` resolves only
   when the inject declares BOTH `'remote'` and `'remote.promptProfiles'`
   (probed on the real services; bare `'remote.promptProfiles'`-only inject
   from a root-level fiber throws "cannot get property remote without
   inject"). The product inject and the spec both use the two-key form.
7. `MIGRATION.md` carries an uncommitted in-workspace edit (a `zod/mini`
   note) that is NOT part of this commit — left in the tree for its author.

## Refactor step A — delete the HTTP transport, add tooling

Step A of the user-specified refactor (`MIGRATION.md` → "Refactor"): the
transport is now Remote-ONLY, the comment policy is applied to
`operations.ts`, and the project has a linter. No layering yet (that is
step B).

### Deleted

- `src/host/api.ts` (328 lines) — Fetch routes, CSRF/Origin checks,
  `connection.admit`, body byte-limit/parse, the `{error:{message}}`
  envelope, route registration/disposal and its loud zero-route logs.
- `createOperations` no longer builds or returns the `/state`…`/last` route
  table; it returns `{ ops }` only. The operation logic itself is untouched
  (`api.test.mjs` still pins all 11 operations).
- `src/host/index.ts`: the `connection` inject, `registerApi` call and the
  200 ms "mounted ZERO routes" timer. The `typert` inject, the sealing
  assembler, the registry wiring and the writer's HMR gate remain.
- Client: `request`/`post`/`ApiError`/`makeApi`/`clientApi`, the
  `/api/__dsh-prompt-profiles` base and the failed-mount fetch fallback. A
  failed mount now leaves `unavailableApi` in force: every method rejects
  with the new `remoteUnavailable` message (en/ru/zh), which the existing
  notify / inline-error / settings-placeholder paths render. Nothing falls
  back silently; `readyApi()` still makes pre-mount calls WAIT.
- `build.mjs`: dropped the `src/host/api.ts` entry. It now wipes `lib/`
  before building — esbuild content-hashes chunk names and tsc keeps
  declarations of deleted modules, so every earlier build had left orphan
  `lib/chunks/*` behind (8 stale chunk pairs of up to 20 k lines each were
  still committed; one of them was the only remaining
  `/api/__dsh-prompt-profiles` string in `lib/`).
- `lib/`: `api.js`, `api.js.map`, `lib/types/host/api.d.ts` and every stale
  chunk pair.

### Test deltas (node:test 131 → 124, vitest 4 → 4, shim assertion mass
396 → 404 assert lines)

- `test/api.test.mjs` 57 → 51. Removed 7 tests that asserted the deleted
  envelope only: CSRF content-type/Origin (415/403), `connection.admit`
  fencing (401/403/503-fallback), the four route-registration/RELOAD tests
  and the "route failures are logged with route/rowId/patchId" test.
  Added 1: `createOperations` returns exactly the 11 operations and no
  transport table. The harness now drives `createOperations` through a
  test-owned path→operation map and keeps the operation-level statuses
  (400/404/409/503/500) and messages under assertion. Envelope-only
  expectations that no longer exist: the `internal error:` prefix on 500s
  (the raw message now surfaces) and the per-request failure log lines.
- `test/index.test.mjs` 7 → 7: the reload test was re-pointed from the
  Connection Fetch registry to the Remote contribution (a stub `typert`
  that rejects duplicate endpoints, like the real registry): mount →
  dispose → remount is clean, all 11 endpoints come back.
- `test/smoke-cordis.test.mjs` 9 → 8: no more `driver`/routes/connection
  stub. "Every service present" now exercises the shared operations against
  the real Cordis services; a new "no optional service at all" test keeps
  the old headless mount guarantee; the gateway test compares a Remote call
  with `createOperations` on a second host (byte-identical patches) instead
  of HTTP-vs-Remote; the "connection alone still registers 10 routes" test
  is gone (its operation-level behaviour lives in `api.test.mjs`).
- `test/client-shim.test.cjs`: the fetch stub is replaced by a Remote
  namespace double (records `{method, args}`, answers envelopes, scripts
  `state`), the fake `$mount` now RESOLVES and the strict ctx gained
  `inject`. Re-pointed cases: pick → exactly one `last({cwd, profileId})`;
  the blocked no-key choice still issues no request; the frozen write
  contract is asserted on `makeRemoteApi` (`rowId`, whole-object `value`,
  `defaultSet({profileId})`, `state({})`); chip refresh counts Remote
  `state` calls (recorder is append-only now, so phases count from marks
  instead of `length = 0`). Added a second, isolated VM load whose mount
  REJECTS: it proves the dictionary message reaches the UI error path, that
  the failure is logged with `stage: '$mount'`, and that every facade
  method refuses instead of silently answering. Static guard added: the
  built client contains no `__dsh-prompt-profiles` and no `fetch(`.
- `test/remote/client-remote.spec.mjs`: unchanged behaviour; `(0, eval)`
  became `globalThis.eval` (indirect eval, same semantics) to satisfy
  Biome.

### Biome

- `@biomejs/biome@2.5.14` devDependency; `biome.json` with recommended
  rules, 2-space indent, line width 120, double quotes/semicolons/trailing
  commas (matching the existing style), organize-imports assist on, and
  `files.includes` excluding `lib`, `.spike`, `node_modules`, `.pnpm-store`
  and `.git`. Scripts: `lint` (`biome check .`), `format`
  (`biome format --write .`), and `check` now runs `lint` before the tests.
- Formatter applied to 24 files (mostly single→double quotes and line
  wrapping in the two hand-written test harnesses); no behaviour change —
  all suites were re-run after it.
- Disabled `suspicious/noImplicitAnyLet` is NOT used: the 12 `let x;`
  sites (all assigned inside the following `try`) carry a per-line
  `// biome-ignore lint/suspicious/noImplicitAnyLet: …` naming the reason,
  so the rule stays on for new code. `security/noGlobalEval` is likewise
  ignored at the single bench line that evaluates the built bundle.
- Two Biome 2.5.14 quirks found the hard way: (a) ANY comment in
  `biome.json` makes the linter silently ignore `files.includes` and walk
  `.spike` (637 bogus errors) — the config is therefore comment-free and
  the reasons live here and in `README.md`; (b) the `useBiomeIgnoreFolder`
  autofix (`!lib/**` → `!lib`) is what the scanner wants, so the shorthand
  is used.
- `useOptionalChain` / `noUnusedVariables` "unsafe" fixes were applied by
  hand where they are provably equivalent; one Biome false-positive-adjacent
  case is worth remembering: it considers a write-only local unused, and
  removing `let reads = 0;` left a bare `reads += 1;` that only then failed
  — the dead counter is gone.

### TypeScript 7

`pnpm add -D typescript@7` resolved to **7.0.2** (the highest available 7.x;
no need for `typescript@next`). `pnpm run typecheck` is clean and
`pnpm run build` (esbuild + `tsc -p tsconfig.json`) is green, so the project
stays on TS 7.0.2 — no revert was needed.

### Sizes and verification

- `lib/client.js` **911 218 B** (baseline 911 260 B, −42 B);
  `lib/index.js` **15 034 B** (baseline 15 509 B, −475 B). The client
  bundle is still zod-dominated.
- `pnpm run check` green (typecheck + lint + 124 node tests + 4 vitest
  specs + build); `node --test test/smoke-cordis.test.mjs` 8/8;
  `node test/client-shim.test.cjs` 28 PASS + ALL OK; `pnpm run test:remote`
  4/4.
- Two consecutive `pnpm run build` runs produce a byte-identical `lib/`
  (sha256 over the file set), and `lib/` contains no
  `/api/__dsh-prompt-profiles` reference.

## Refactor B1 — domain layer (pure rules, typed)

Goal: extract `src/host/domain/` — pure rules with no I/O — and make it the
single definition the rest of the host imports, without moving the
application use cases or the adapters (B2/B3) and without changing behaviour.

### What the domain owns now

- `domain/model.ts` (140) — row kinds and plugin names, `SCOPES`/`Scope`,
  `SectionRef`, `Section`/`Profile`, `SectionView`/`ProfileView`, the id forms
  (`RowId`/`PatchId`/`ConfigId`), the sealed `Snapshot` and `PlannedInsertion`.
- `domain/ids.ts` (180) — `toPatchId`, `idPrefix`, `ID_TOKEN_PATTERN`,
  `normalizeNewRowId`, `normalizeExplicitRowId`, `findRow`, `newRowId`,
  `tokenSource`, `takenIds`, `configIds`.
- `domain/errors.ts` (116) — `DomainError` + `InvalidInputError`,
  `NotFoundError`, `ConflictError`, `UnavailableError`, `InternalError`, with
  `errorMessage` (the old `errorText`). `ApiError` and its HTTP statuses are
  gone from the source; `code` is the domain discriminator and `status` stays
  as the numeric mirror callers/harnesses already branched on.
- `domain/ordering.ts` (149) — `sectionSkipReason` (+ the exact SKIP_REASONS
  strings), `interpolationSkipReason`, `sortByOrder`, `insertionIndex`,
  `planInsertion` (BASE indices).
- `domain/refs.ts` (128) — `sectionRefTargets`, `resolveSectionRefId`,
  `rowAliases`, `refNamesRow`, `usedIn`.
- `domain/validation.ts` (237) — the zod payload schemas per method. Each
  method has a strict wire `*Input` and a tolerant business `*Payload` built
  from the same field map, so the descriptor codecs and the operation checks
  cannot drift; `parsePayload` turns the first issue into an
  `InvalidInputError`. `src/shared/remote-contract.ts` now imports the
  `*Input` schemas instead of re-declaring them (one definition).
- `domain/index.ts` (20) — barrel. Shared/client code must import the exact
  module (validation.ts); the barrel pulls `node:crypto` through ids.ts.

### Re-pointed modules

- `operations.ts` 1267 → 1034: the hand-rolled `validate`, `ApiError`,
  `errorText`, `findRow`, `normalizeNewRowId`, `tokenSource`,
  `generateTokenId`, `takenConfigIds`/`takenIds` and the local id-pattern/
  scope constants are deleted; it now applies domain helpers and throws typed
  domain errors. `sectionTargets()`/`takenIds()`/rename aliases became
  one-liners over `refs.ts`/`ids.ts`.
- `resolve.ts` 390 → 351: `sectionSkipReason` and `planInsertion` moved to
  `domain/ordering.ts` and are re-exported; `insertionIndex` is no longer a
  registry-local.
- `registry.ts` 224 → 194: `insertionIndex` moved to the domain and is
  re-exported; `usedIn` delegates to `domain/refs.ts`.
- `writer.ts` 560 → 547: `toPatchId` moved to `domain/ids.ts` and is
  re-exported (the writer tests import it from `lib/writer.js`).
- `remote.ts`: throws `InternalError` instead of `ApiError`.

### `@ts-nocheck`

- REMOVED (fully typed): `src/host/registry.ts`, `src/host/resolve.ts`,
  `src/shared/remote-contract.ts`. The new `src/host/domain/*.ts` never had
  the header.
- LEFT, with the reason:
  - `operations.ts` — application layer; it moves to `src/host/application/`
    in B2, where the port types exist. Comment diet + domain extraction were
    applied here, but the `deps` port bag stays untyped for now.
  - `index.ts` — Cordis `Service` subclass with dynamic `ctx.inject`/`ctx.get`
    and the storage domain; needs the platform types (B3).
  - `remote.ts` — Cordis + `@deepseek-ai/dsh-typert-protocol` surface.
  - `writer.ts` — `node:fs` plus mutable `yaml` document nodes; typing the
    node accessors is infra work (B3).
  - `mirror.ts` / `builtin-orders.ts` / `section.ts` / `profile.ts` — untouched
    by B1 (fs/regex parsing, static table, schemastery subpath plugins).

### Behaviour

A differential bench (68 payload/operation cases) ran the pre-refactor build
from `git archive HEAD lib` against the new build with the same fake
services, patch files and settings stubs, comparing status, result JSON,
patch bytes and settings/replace calls: identical everywhere except two
intentional items.

1. Thrown errors are now domain classes (`InvalidInputError` etc.) instead of
   a single `ApiError` — same numeric `status` on every case.
2. `sectionRename` without `id` answers 400 (InvalidInputError); before it
   fell through to the writer's `TypeError` (no status). The committed wire
   descriptor already required `id`, so no Remote caller can reach the old
   path.

Validation MESSAGES changed (zod issue text instead of the hand-written
sentences); every status and result is unchanged, and the payload schemas
deliberately keep the pre-refactor tolerances (`value.body` extra key on
profile update is still ignored, blank `rowId` is still a 400, `last` with
both keys empty is still a 400).

### Sizes and verification

- Host sources: 11 files / 4061 lines before, 18 files / 4585 after
  (operations −233, resolve −39, registry −30, remote-contract −131,
  writer −13; domain +970).
- `lib/client.js` 911 218 → 914 628 B; `lib/index.js` 15 034 → 15 198 B.
- `pnpm run typecheck` clean, `pnpm run lint` clean, `pnpm test` 124/124,
  `node --test test/smoke-cordis.test.mjs` 8/8,
  `node test/client-shim.test.cjs` ALL OK, `pnpm run test:remote` 4/4.
- Two consecutive `pnpm run build` runs produce a byte-identical `lib/`
  (sha256 over the file set). `lib/domain/index.js` is now a built entry so
  the node suite can import the domain by path; `test/api.test.mjs` imports
  `errorMessage` from it.

## Refactor B2 — ports and infra

Goal: introduce `src/host/application/ports.ts` (the driven ports the operation
set needs) and `src/host/infra/` (the adapters implementing them) without moving
the use cases (B3) and without changing behaviour.

### The ports

- `application/ports.ts` (207) — interfaces only, no `node:fs` and no service:
  `LoaderRegistryPort` (rows + live default/last), `BuiltinOrdersPort`,
  `PatchPort` (+ `PatchRowRecord`/`PatchRowInput`/`RowOwnership`/
  `SectionRenameRequest`), `SettingsPort` (+ `SettingsOp`),
  `WorkspaceRegistryPort`/`WorkspaceKeysPort`, `SessionSnapshotsPort`
  (+ `SnapshotTable`), `AgentPresetsPort`, `LogPort`, `WriteLockPort` and the
  `HostPorts` bag. Optional services are reached through per-CALL resolvers
  (`settings()`, `patch()`, `presets()`, `workspaces()`), so a late-appearing
  service is picked up and a missing one degrades per operation exactly as
  before. A types-only module gets no runtime entry in `lib/`.

### What infra owns now

- `infra/patch-writer.ts` (613, was writer.ts 547) — the patch file adapter:
  fs + yaml, comments/`!!js` preserved, atomic write, module mutex, hmr gate,
  provenance/read queries — plus `writeLock` (the `WriteLockPort`, same instance
  as the patch writes) and `createPatchPort` binding it to configEditor.
- `infra/loader-registry.ts` (194, was registry.ts 194) — moved unchanged; only
  the domain import paths changed.
- `infra/builtin-orders.ts` (344; mirror.ts 205 + builtin-orders.ts 165 merged)
  — frozen table, name mapping and runtime parse with warn-and-fallback.
- `infra/session-snapshots.ts` (164) — the `prompt_profiles` storage adapter:
  `retryingCache` + `sealSnapshot` moved out of resolve.ts, and
  `createSessionSnapshots` owning open/seal/memo/close per fiber.
- `infra/settings-adapter.ts` (40) — `createSettingsPort`: revision read plus
  replace/mutate, both resolved at call time.
- `infra/workspace-adapter.ts` (105) — `resolveWorkspaceKeys` moved out of
  resolve.ts plus `createWorkspaceKeys` (key candidates + registry membership).
- `infra/index.ts` (135) — adapter barrel and `createHostPorts`, the one place
  raw Cordis services become the `HostPorts` bag.

### Re-pointed modules

- `operations.ts` 1034 → 990: no direct writer/fs/service access; patch rows,
  settings replace/mutate, the write lock, workspace keys, builtin orders and
  registry views all arrive as ports. Domain rules stay in domain/. The
  `deps.resolve` hook remains internal for the rename path (B3 removes it).
- `index.ts` 485 → 474: ports built once in the constructor; the assembler seals
  through `createSessionSnapshots`, resolves keys through `createWorkspaceKeys`
  and proves provenance through the patch port.
- `remote.ts` 319 → 322: composes `createHostPorts` from ctx.get and hands it to
  `createOperations`.
- `resolve.ts` 351 → 195: workspace key resolution and the storage/sealing
  helpers moved to infra; selection, interpolation and the snapshot builder
  stay.
- `section.ts`/`profile.ts` untouched (B3 moves them to entrypoints/).

### Deviations kept deliberately

- `settings-adapter.ts` and `workspace-adapter.ts` ARE separate files (the task
  allowed saying otherwise); the mutex stayed inside patch-writer and is exposed
  as the `WriteLockPort` rather than a new module, because it must be the SAME
  module-level instance as the patch writes.
- The `promptProfilesDomain` zod spec stays in index.ts; the storage adapter
  takes an `openDomain` seam instead of importing zod/dsh-storage-domain.

### `@ts-nocheck`

- REMOVED (moved and typed): `writer.ts` (→ infra/patch-writer.ts),
  `mirror.ts` and `builtin-orders.ts` (→ infra/builtin-orders.ts). That is all
  three headers that B1 had left on moved code.
- LEFT, with the reason: `operations.ts` (B3 moves it to application/),
  `index.ts`, `remote.ts`, `section.ts`, `profile.ts` (B3).

### Behaviour gate (now permanent)

The B1 differential bench lived outside the repo; it is recreated inside as
`test/differential.test.mjs` (667 lines, runs under `pnpm test`). It extracts the
pre-B2 `lib/` with `git archive 4ce8c7c lib`, replays 68 operation cases against
both builds over the same fake host, and compares status, result JSON, patch
bytes, settings replace/mutate calls and diagnostics: identical everywhere,
zero diffs. The gate self-checks so a green run cannot be vacuous — the two
sides are distinct module graphs, a control spec difference must be detected,
and coverage is pinned (>=35 clean, >=25 failing, >=12 patch-writing, >=8
settings-writing cases; actual 38/30/18/13).

### Sizes and verification

- Host sources: 17 files / 4434 lines → 21 files / 4917 (domain 970 unchanged;
  application +207; infra 1595 for seven adapters; host root files 2145).
- `lib/`: 68 files / 5 876 707 B → 86 files / 5 905 191 B; `lib/client.js`
  byte-identical (914 628 B); `lib/index.js` 15 198 → 14 640 B.
- `pnpm run typecheck` clean, `pnpm run lint` clean, `pnpm test` 125/125
  (124 behavioural + the bench), `node --test test/smoke-cordis.test.mjs` 8/8,
  `node test/client-shim.test.cjs` ALL OK, `pnpm run test:remote` 4/4.
- Two consecutive `pnpm run build` runs produce a byte-identical `lib/`
  (sha256 34efeadd6878284b50d76ddc389a8cb421ec724a654fb96db89797284a28db73 over
  the sorted file set).

## Refactor B3 — application and entrypoints

Goal: finish the host layering — the use cases into `src/host/application/`,
the drivers into `src/host/entrypoints/`, `operations.ts` deleted, and every
`@ts-nocheck` header removed from the host — with behaviour frozen.

### Final host tree (26 files / 5291 lines)

- `domain/` (7 files / 970) — unchanged: model 140, ids 180, errors 116,
  ordering 149, refs 128, validation 237, barrel 20.
- `application/` (8 files / 1816):
  - `ports.ts` 207 — unchanged interfaces.
  - `env.ts` 379 — NEW: the shared use-case environment (payload helpers
    `titleOrDefault`/`explicitRowId`, `patchIdOf`, `sectionTargets`,
    `pendingSectionIds`, `idsInUse`, `registeredConfigIds`, `resolveSection`/
    `resolveProfile`, `profileSelectable`, settings replace and
    `mutateWithRetry` on the one write lock, `deleteRow`, `mapDuplicate`,
    `mapSettingsError`).
  - `state.ts` 147 — the read model + the agent-preset mode scan.
  - `preview.ts` 172 — the illustrative preview.
  - `sections.ts` 197 — section create/update/delete/rename.
  - `profiles.ts` 281 — profile create/update/delete, `defaultSet`, `last`,
    reference cleanup and stale-key pruning.
  - `assembler.ts` 353 — the sealing/assembly use case: `resolveProfileId`,
    `isSubagent`/`isFork`, `interpolateSealedText`, `buildSnapshot` (all moved
    from the deleted `resolve.ts`) plus `createPromptAssembler(ports)`, which
    owns workspace keys, the once-per-session seal and the ordered splice.
  - `index.ts` 80 — the `OperationSet` shape and `createOperations(ports)`.
- `infra/` (7 files / 1596) — unchanged adapters (patch-writer 613,
  builtin-orders 344, loader-registry 194, session-snapshots 165, index 135,
  workspace-adapter 105, settings-adapter 40).
- `entrypoints/` (4 files / 909):
  - `plugin.ts` 401 — the Cordis plugin (config, `promptProfiles` service,
    mirror, assembly listener, Remote mount, `prompt_profiles` domain).
  - `remote.ts` 300 — the Typert Remote surface (thin mapping from
    `METHOD_SPECS` to the use cases).
  - `section.ts` 96 / `profile.ts` 112 — the loader rows.

### Deleted

- `src/host/operations.ts` (990) — its two halves now live in
  `application/env.ts` + the four use-case modules; `createOperations` is
  `application/index.ts`.
- `src/host/resolve.ts` (195) — selection, interpolation and the snapshot
  builder move to `application/assembler.ts`.
- `src/host/index.ts` (474) → `entrypoints/plugin.ts`;
  `src/host/remote.ts` (322) → `entrypoints/remote.ts`;
  `src/host/section.ts` / `src/host/profile.ts` → `entrypoints/`.
- The `deps.resolve` mutation is gone: `renameSection` receives the
  environment and calls `env.resolveSection`.

### Deviations (kept deliberately)

- The task listed `state/preview/sections/profiles/assembler/index` as an
  "e.g."; the shared use-case environment is a real eighth module
  (`application/env.ts`), so `sections.ts` and `profiles.ts` can share
  validation, row addressing and the settings/mutate path without a value
  cycle through the factory.
- `assembler.ts` takes its own small `AssemblerPorts` (registry, orders,
  workspaces, snapshots, log) instead of the whole `HostPorts`: sealing needs
  the per-fiber snapshot adapter the plugin builds inside the injection, not
  the operation ports.
- `src/shared/remote-contract.ts` still owns the method table and was NOT
  retyped; `FACE_FILES.host` stays the committed string `src/host/remote.ts`
  because the descriptor `sourceLocation.file` is published DATA, not a live
  path.
- Built entry names are stable (`lib/index.js`, `lib/section.js`,
  `lib/profile.js`, `lib/remote.js`); `build.mjs` now names entries explicitly
  and adds `lib/application/{index,assembler}.js` for the node suite, so the
  package exports' `default` paths are unchanged (only the `types` paths moved
  to `lib/types/host/entrypoints/*`).
- Narrow casts used where the platform type genuinely is not expressible here
  (each carries a one-line reason in the source): the hand-written Typert
  contribution registers without the generated `model`
  (`as unknown as TypertContribution`); the opened storage domain is cast to
  the adapter's `StorageDomainHandle` (its table is generic per spec);
  `system-prompt/assemble` is read through a local listener view because its
  event type lives in a package this bundle does not depend on (the runtime
  call stays `ctx.on`); `settings`, `workspaceRegistry`, `profileContext` and
  `promptProfiles` are read through narrow local service views.
- The two schemastery row/plugin `Config` schemas are marked `@internal`
  (stripped from `lib/types`) because the volatile output type is not
  declaration-portable (TS2883 without it). Their declaration surface is
  unchanged: the pre-B3 `index.d.ts`/`profile.d.ts` did not declare `Config`
  either (`section.d.ts` still does).

### `@ts-nocheck`

- REMOVED in this step: `operations.ts` (deleted), `index.ts`, `remote.ts`,
  `section.ts`, `profile.ts`. Host `@ts-nocheck` count is now **zero**.
- LEFT: `src/client/index.ts` and `src/client/remote.ts` — the client half is
  Phase 3 (TSX rewrite), untouched by B3.

### Behaviour gate (the differential bench)

`test/differential.test.mjs` still replays its 68 cases against the pre-B2
build (`git archive 4ce8c7c lib`) over the same fake host: status, result
JSON, patch bytes, settings replace/mutate calls and diagnostics identical
everywhere, zero diffs; the coverage pins hold (38/30/18/13). The bench now
loads the current side from `lib/application/index.js`.

### Sizes and verification

- Host sources: 21 files / 4917 lines → 26 files / 5291 (application +1609,
  entrypoints +909, operations −990, resolve −195; domain and infra
  unchanged).
- `lib/`: 86 files / 5 905 191 B → 91 files / 5 925 496 B; `lib/client.js`
  byte-identical (914 628 B); `lib/index.js` 14 640 → 10 313 B.
- `pnpm run typecheck` clean, `pnpm run lint` clean, `pnpm test` 125/125
  (124 behavioural + the bench), `node --test test/smoke-cordis.test.mjs` 8/8,
  `node test/client-shim.test.cjs` ALL OK, `pnpm run test:remote` 4/4.
- Two consecutive `pnpm run build` runs produce a byte-identical `lib/`
  (sha256 aba78a55dc98a4e9e18c5788c41179619bd46b1f3873697919c3da65861b5585 over
  the sorted file set).

## Refactor 3a — schema split and client modules

Goal: (1) get zod out of `src/host/domain/` without ending up with two
definitions of a field, and (2) split the 2675-line `@ts-nocheck`
`src/client/index.ts` into typed modules — behaviour frozen, still `h(...)`,
no JSX (that is 3b).

### Task 1 — where each schema piece went and why

- `src/shared/wire-schemas.ts` (NEW, 168) — the **strict wire codecs**:
  `sectionRefFields`, the per-method field maps, all `<method>Input` and
  `<method>Result` schemas. Shared, because the client contribution must mount
  codecs byte-identical to the host's and a transport contract is not a layer.
  It imports `SCOPES` from `src/host/domain/model.ts` — an inward dependency on
  a dependency-free domain constant, the direction hexagonal layering allows.
- `src/host/application/payloads.ts` (NEW, 113) — the **tolerant business
  parse**: the payload schemas, their types, `parsePayload` and the
  `nonBlank`/`nonEmpty` refinements, plus the one piece of the wire that has no
  counterpart (`defaultPayload`, the internal `default` op). It is a use-case
  concern and imports `InvalidInputError` from the domain.
- `src/host/domain/validation.ts` (237) — **deleted**; the domain barrel no
  longer exports it. No field is defined twice: `WIRE_FIELDS` carries one rule
  per field and the payloads compose the same entries with `z.object` instead
  of `z.strictObject` plus refinements (the nested `value` objects and the ref
  lists are the only places the strict/loose wrapper differs, and both wrap the
  same shared field records).
- Consumers moved with it: `src/shared/remote-contract.ts` imports
  `./wire-schemas.ts`; `application/sections.ts` and `application/profiles.ts`
  import `./payloads.ts` and take ONLY the non-schema names from the domain
  barrel.
- `src/host/domain/` now imports nothing but `node:crypto` (ids.ts) — 733 lines
  over 6 files (was 970 over 7).

### Task 2 — client module tree (15 files / 3806 lines)

- `index.ts` 97 — the plugin entry: `inject`, `apply`, and the `module.exports`
  seams the shim test loads (`lib/client.js` and its ModuleLoader id are
  unchanged; esbuild still emits one file).
- `i18n.ts` 264 — `NS`, the en/ru/zh dictionaries (`ru`/`zh` typed as
  `Record<MessageKey, string>`, so a missing key is a compile error) and the
  locale binder (`bindT`/`boundT`).
- `helpers.ts` 538 — the pure helpers plus the profile-changed signal, exported
  as the same `helpers` aggregate.
- `flows.ts` 285 — `makeCreateFlow` / `makeMutationFlow`, `findEntry`,
  `optimisticEntry`, `PollTimeoutError`.
- `remote.ts` 219 — the API facade (unchanged surface) now typed: request view
  types, `RemoteEnvelope`/`RemoteScope`, `RemoteApi`.
- `transport.ts` 153 — `mountRemote` and the active-api holder
  (`readyApi`/`getActiveApi`/`unavailableApi`) plus the narrow `PluginCtx`.
- `ui.ts` 268 — shared React building blocks: primitive imports, layout tokens,
  `inlineError`, `iconControl`, `useNotifier`, `ConfirmDialog`, `DefaultMenu`.
- `chip.ts` 239 — `PromptProfileChip` and its store/prop shapes.
- `settings-page.ts` 128 — the tab shell, drill-down and Esc handling.
- `settings-shared.ts` 160 — `useProfilesState`, `useAutosave`, `runSave`,
  `useFocusSelect`.
- `settings-profiles.ts` 681 — `ProfilesTab`, `ProfileOutline`,
  `AddSectionPicker`.
- `settings-sections.ts` 480 — `SectionsTab`, `SectionForm`.
- `settings-preview.ts` 145 — `PreviewTab`.
- `element.ts` 34 — the React binding and the `h` factory.
- `model.ts` 115 — the client's view of the `/state` and `preview` documents.

`model.ts` collapses section/profile rows into ONE duck-typed `RowEntry`
(the wire declares open-shaped record views anyway): `title` and `patchId` are
required because every host view carries them, and the rest stays optional.
`h` remains a deliberate permissive cast of `React.createElement` (call sites
pass `flex` and DOM pass-through props the React prop types do not declare);
types on our own components, hooks, api and documents are exact.

### `@ts-nocheck`

- REMOVED: `src/client/index.ts`, `src/client/remote.ts` — `src/` now has ZERO
  `@ts-nocheck` headers.
- The old `src/client/index.ts` is gone; its content is the 14 modules above.

### Sizes and verification

- `src/`: 28 files / 8277 lines → 43 files / 9294.
- `lib/`: 91 files / 5 925 496 B → 105 files / 5 931 578 B.
- `lib/client.js`: 914 628 B → 848 468 B (−66 160 B, −7.2%): the client bundle
  no longer drags in the tolerant parsers/refinements that lived in
  `domain/validation.ts`, only the strict codecs it actually publishes.
- Two consecutive `pnpm run build` runs produce a byte-identical `lib/`
  (sha256 `0a2bdd8a35d7734066f1b0a16dfa8af96b17b4ca0867e4429d77a12cac684e63`
  over the sorted file set).
- Green: `pnpm test` 125/125 (124 behavioural + the 68-case differential bench),
  `node --test test/smoke-cordis.test.mjs` 8/8, `node test/client-shim.test.cjs`
  ALL OK (the behaviour gate for the split), `pnpm run test:remote` 4/4,
  `pnpm run lint` and `pnpm run typecheck` clean.

### Decisions and surprises

- **`@types/react` was NOT available**, contrary to the task assumption: `react`
  18 ships no types, `node_modules/@types/` held only `node`, and a probe file
  failed with TS7016 (the DSH packages hide it behind `skipLibCheck`). Added
  `@types/react@^18.3.31` as a devDependency — the only way to type the client
  for real instead of hand-writing a React shim.
- The client split is mechanical: same components, same hook order, same props,
  no JSX. The only type-driven edits are narrow event/prop annotations, `?? ""`
  fallbacks where a row field is optional, and the `outlineRows` comparator
  rewritten for a discriminated row union — the shim's ordering assertions and
  the `Tabs`/`DnD`/`rename`/`complete-mode` cases all still pass unchanged.
- `lib/types/client/remote.d.ts` upgraded from `any`-shaped to real types; the
  `./client` types entry stays `export {}` (the plugin object is CommonJS).
- The client bundle got 7% smaller rather than "marginally" — see above: the
  strict-only split removed dead tolerant-parser code from the browser bundle.

## Refactor 3b — TSX and jsdom tests

Goal: the client UI renders JSX and is tested by RENDERING it on real React +
jsdom, not by walking a fake `createElement` tree. Behaviour frozen.

### Task 1 — the conversion

- Six components became `.tsx` (`ui`, `chip`, `settings-page`,
  `settings-profiles`, `settings-sections`, `settings-preview`): 13 modules /
  3745 lines, down from 15/3806.
- `element.ts` (34 lines) is DELETED: its only job was the permissive `h`
  factory that the no-JSX rule needed. Modules that still call hooks import
  `react` directly; `react/jsx-runtime` joins `react` in the bundle's
  externals (esbuild already had `jsx: automatic`).
- Two prop shapes were translated, not redesigned:
  - `flex: 1` was ALWAYS a pass-through attribute (`h("span", { flex: 1 })`),
    never a style — kept as `flexFill` in `ui.tsx`, because promoting it to a
    real style would change the layout.
  - the same for the editor's `marginBottom` pass-through on the source line.
- `iconControl` now types its click handler as `React.MouseEvent` (it passed a
  hand-rolled `{ stopPropagation }` shape only because the shim's fake Button
  had no event type) and forwards `extra.props` through one cast — the
  dynamic drag/keyboard handlers were the only reason `h` existed.
- Biome overrides for `src/client/**/*.tsx` (autofocus, labelled control,
  static-element interactions, key-with-click, array-index keys) and for
  `settings-shared.ts` (`useExhaustiveDependencies`). These rules only became
  reachable now that the files are `.tsx` with a real `react` import: the
  flagged interactions (clickable rows, drag boundaries, the rename autofocus,
  index-keyed preview groups) are the shipped design, and "fixing" them would
  change behaviour. Verified: the identical pre-conversion sources rendered the
  same DOM (see the parity harness below).

### The platform harness was NOT usable

The published `@deepseek-ai/dsh-client-test-runtime@0.1.7-rc.2` ships the jsdom
slot bench as `lib/index.js`, but that bundle imports
`@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts` and
`@deepseek-ai/dsh-api-session-controller/src/client/scope.ts` — and the `src/`
tree is not in any published tarball (`files` lists `lib/**` only). Importing
the package fails immediately with `ERR_MODULE_NOT_FOUND` on the first `src/`
path (proved by direct `import()`), and the whole-client tier has no `lib/`
entry at all (types only). So the task's fallback applied: a small local bench.

### Task 2 — the jsdom bench (NEW `test/client/`, 13 specs / 133 tests)

- `vitest.config.mts` becomes two projects: `remote` (node, `test/remote/`)
  and `client` (jsdom, `test/client/`), each with its own script
  (`test:remote` = `--project remote`, `test:client` = `--project client`).
- `harness.ts` mounts a recording Remote namespace through the REAL transport
  (`ctx.remote.$mount` + `ctx.inject`), so `readyApi()`/`getActiveApi()` and
  every error path under test are the production ones; `storeHook` builds the
  zustand-shaped hooks the chip receives from the slot.
- `primitives-contract.spec.tsx` is the only file that intercepts the platform:
  each primitive is wrapped in a `forwardRef` recorder that DELEGATES to the
  real component, so props are observable while the DOM stays production's.
  That is where the owner-controlled Menu, the render-only Toast, the Button
  geometry and the Tooltip anchor are pinned.
- The primitives barrel imports its markdown/highlighter/icon assets eagerly
  (`shiki`, `micromark`, `mdast`, `katex`, `diff`, `anser`, `simple-icons`).
  Those are web-app module-table entries and are absent from our
  devDependencies, so a resolve plugin maps those families to one inert stub.
  The atoms under test are the real ones; `clsx`, `@deepseek-ai/dsh-client-store`
  and `@deepseek-ai/dsh-util-workspace-path` were added as devDependencies
  because the real atoms call into them.
- devDependencies added: `jsdom`, `@testing-library/react`,
  `@testing-library/dom`, `clsx`, `zustand`, `immer`,
  `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-util-workspace-path`
  (all test-only).
- `typecheck` now also runs `tsc -p tsconfig.test.json` over `test/client`, so
  the specs are type-checked rather than only type-stripped.
- `test/client-shim.test.cjs` is DELETED (3432 lines). Nothing is left behind.

### Shim → test mapping (every PASS line of the shim)

| Shim assertion (`ALL OK` gate) | New test |
|---|---|
| loader syntax; `conversation.input.left` / `prompt-profile` / order 10 | `bundle.spec.ts` › the composer chip registers conversation.input.left with its injection shape |
| `inject(sessionId)` provides sessionId and pick | `bundle.spec.ts` › same test |
| component returns null (non-blank session, empty state) | `chip.spec.tsx` › refuses to render on a non-blank session or without any profile |
| chip Menu satisfies open/anchor/onClose/items | `primitives-contract.spec.tsx` › the chip drives the owner-controlled Menu; › the chip's trigger is the installed Button primitive |
| settings.section / prompt-profiles / order 25 / label + api inject + loading render | `bundle.spec.ts` › the settings section registers settings.section…; `settings-page.spec.tsx` › renders a loading placeholder; › the page root is the scroller with a stable gutter |
| i18n ru+zh key parity, non-empty values, dead keys | `i18n.spec.ts` (all five tests) |
| preview words are dictionary-driven | `preview.spec.tsx` › the pane names the profile selector…; `i18n.spec.ts` |
| remote facade payloads (whole object, rowId, no ops) | `remote.spec.ts` › writes address the unqualified patchId…; › last is keyed by exactly one workspace key |
| create flow: single POST, poll retry, busy guard, drill, timeout, server error | `flows.spec.ts` › create: one POST under a double submit…; › create: a row that never mounts times out…; › create: a server failure surfaces its message… |
| runSave 409 re-apply + 500 toast/inline error | `flows.spec.ts` › runSave re-applies once on a stale revision…; › runSave surfaces a non-conflict failure…; › runSave reports a conflict that keeps failing…; `sections.spec.tsx` › the editor shows the inline error line |
| tabs: modal-free create wired with default titles | `profiles.spec.tsx` › the modal-free create posts the default title payload; `sections.spec.tsx` › the modal-free create posts the default section payload |
| SectionForm inline error line | `sections.spec.tsx` › the editor shows the inline error line with the server message |
| helpers: idOf/insertionOrders/outlineRows/filterSections/previewPlan/save gate/used-in/source/rename notice/profileLabel/escapesDrillDown | `helpers.spec.ts` (twelve tests) |
| refs verbatim, doubled-prefix guard, picker/outline keyed by configId | `helpers.spec.ts` › refs carry the configId verbatim…; › addSectionsToRefs…; › the outline resolves a prefixed configId ref…; `profiles.spec.tsx` › the add-section picker appends the picked ids verbatim |
| mutation flow: optimistic insert/remove, poll, restore, busy guard | `flows.spec.ts` › mutation: delete…; › mutation: duplicate…; › mutation: a failure restores…; › mutation: a second run while in flight… |
| rename id sent verbatim + doubled-prefix guard + drill follows new id | `sections.spec.tsx` › rename sends the typed id verbatim and drills into the stored one; › a doubled prefix typed by the user collapses before the request |
| rename affectedProfiles (list / empty / absent) | `sections.spec.tsx` › a successful rename names the profiles that still hold the old id; › a rename response without affectedProfiles shows no extra notice; `helpers.spec.ts` › renameNotice… |
| rename no-op + empty-id hint | `sections.spec.tsx` › an unchanged id closes the dialog without a request or a toast; › an empty id is blocked with an inline hint and no request |
| disabled controls while a flow is in flight | `profiles.spec.tsx` › the create button is disabled while the real create flow is in flight; › duplicate … stays disabled while in flight; `sections.spec.tsx` › the create button is disabled…; › the lifecycle controls are disabled… |
| ui round 2: back icon, autosave gate/hint, used-in titles, source badge, DnD outline | `primitives-contract.spec.tsx` › iconControl wraps the Button in a Tooltip…; › the add-section action keeps the icon…; `sections.spec.tsx` › the editor never writes before the poll confirmed the row; › an empty title is called out and never written; › leaving the editor flushes a pending body edit…; › the editor renders used-in titles…; › a user-owned row shows no source badge; `sections.spec.tsx` › two refs of one profile both render under unique React keys; `profiles.spec.tsx` › drag & drop reorders the ref…; › the drag grip moves a row with the arrow keys |
| audit D/E: deterministic ties, counter, preview empty, confirmed removal, untitled chip, grip keyboard, integer orders | `helpers.spec.ts` › outlineRows keeps the persisted orders and ties resolve deterministically; › insertionOrders are the integer gaps…; `profiles.spec.tsx` › the outline renders built-in, own and broken rows with an honest counter; › removing a ref is confirmed and drops only that occurrence; › the drag grip moves a row with the arrow keys; `preview.spec.tsx` › a profile that emits nothing gets an explicit empty state…; `chip.spec.tsx` › an empty bundle title shows the id… |
| review H1/H2/H3/H6: explicit-none chip, ours-before-builtin, duplicate refs, honest preview variables | `chip.spec.tsx` › a stored empty string is an explicit None…; › a stored profile id shows that profile; a stale one falls back to the default; › choosing None keeps the host's explicit-empty marker after the refresh; `helpers.spec.ts` › outlineRows … (kindsAt(100) = ours,builtin); `profiles.spec.tsx` › the scope selector is per occurrence…; › removing a ref…; `preview.spec.tsx` › a section using an interpolation variable is flagged…; › a variable-free section carries no marker |
| bundle rename lock (disabled + reason; user/unknown renameable) | `sections.spec.tsx` › a bundle-owned id cannot be changed and the reason is stated inline; › a user-owned id stays renameable |
| duplicate opens the copy | `sections.spec.tsx` › duplicate opens the COPY, not the source row |
| theme tokens all shipped | `tokens.spec.ts` |
| complete mode marker + calm otherwise | `chip.spec.tsx` › a complete active mode marks the trigger and names the mode; `primitives-contract.spec.tsx` › the complete-mode marker sits between label and chevron…; › a non-complete or unknown active mode adds nothing…; `profiles.spec.tsx` › the complete-mode warning lists the modes that discard sections |
| chip refresh: debounced re-read, deleted profile leaves trigger+menu | `chip.spec.tsx` › a burst of settings mutations collapses into ONE debounced re-read; `helpers.spec.ts` › the profiles-changed signal reaches every live subscriber… |
| remote failure: no fallback transport, dictionary message reaches the UI | `transport.spec.ts` (three tests); `remote.spec.ts` › before the mount settles every api method refuses…; `settings-page.spec.tsx` › a failed state read surfaces the dictionary message in the toast banner |

Also carried over: the strict-ctx activation guard (`bundle.spec.ts` › an
undeclared ctx service fails loudly), the no-HTTP/no-fetch/no-path-op/
no-`Toast(`-as-a-function source guards (`bundle.spec.ts`), the default
profile showing no `★` marker (`profiles.spec.tsx`), the raw scope enum never
appearing in visible text (`sections.spec.tsx`), and the "no create modal in
either tab" assertions (`queryByRole("dialog")` in both tab specs).

### Deliberately NOT carried over (and why)

- The shim's fake-primitive SELF-tests (`Menu.validate` rejects a missing
  `open`, `Tooltip` rejects `content`, `Toast` is not callable, …). They tested
  the fake, not the client; the real primitives now throw/render their own way,
  and `bundle.spec.ts` keeps the source-level guard that neither `Toast(` nor
  `Menu(` is ever called as a function.
- Element-tree introspection that has no DOM equivalent is preserved through
  the recording wrappers in `primitives-contract.spec.tsx`, not dropped.
- `SectionForm`'s title `onBlur` flush is covered; `ProfileOutline` never had
  one (its title autosaves on debounce/leave) and the test asserts the leave
  flush instead — the shim's "title input flushes on blur" case was only ever
  true for SectionForm.
- The chip's own failed-`/state` notice: the chip renders `null` without state,
  so its Toast never reaches the DOM. The notify→banner wiring is covered where
  it IS observable (`settings-page.spec.tsx` › failed state read), and
  `chip.spec.tsx` asserts the read is issued and the chip stays unrendered.
- The non-finite order guard in `changeOrder`: jsdom's number-input value
  sanitization turns `"Infinity"`/`"abc"` into `""` before the handler runs, so
  the branch is unreachable from a DOM event (a real browser keeps
  `"Infinity"`). The finite path is covered by the drag/keyboard/leave tests.

### Verification

- Parity harness (temporary, deleted before the commit): the pre-conversion
  `h(...)` components from `git archive HEAD` and the new TSX components
  rendered side by side with identical props; `innerHTML` was byte-identical
  for 16/16 cases (chip states, complete mode, both tabs, outline, editor,
  picker, preview, settings page). It caught exactly one real drift — a
  `marginBottom` pass-through that had been promoted to a style — which was
  reverted to the attribute.
- Green: `pnpm test` 125/125, `node --test test/smoke-cordis.test.mjs` 8/8,
  `pnpm run test:client` 133/133 (13 files), `pnpm run test:remote` 4/4,
  `pnpm run typecheck` (src + test project), `pnpm run lint`.
- `lib/client.js`: 848 468 B → 853 799 B (+5 331 B, +0.63 %): the JSX runtime
  call sites (`(0, import_jsx_runtime.jsx)(…)`) are slightly more verbose than
  the local `h(…)` identifier. The single-file output and the ModuleLoader id
  are unchanged.
- Two consecutive `pnpm run build` runs produce a byte-identical `lib/`
  (sha256 `5486768cee1fc00966a88cd52e73c16d9fddf0b8bea5001fe2b276e0e10bf980`
  over the sorted file set; 104 files / 5 933 613 B).
