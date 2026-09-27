# Migration: TypeScript + build + Typert Remote + TSX UI (target DSH 0.1.7-rc.2)

Status: **proposed** — awaiting approval before Phase 0.

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| M1 | Target **0.1.7-rc.2 only** | One consumer, one runtime; no version branching |
| M2 | Migrate **in place, phase by phase**, tests green at every step | Preserves behaviour and 129 existing tests as a safety net |
| M3 | **Delete** the raw HTTP surface once Remote works live | One transport, no dual APIs to maintain |
| M4 | Toolchain copied from `dsh-at-any` (esbuild + `tsc`, committed `lib/`) | Proven recipe for an independently installable out-of-tree plugin |
| M5 | `lib/` is committed; profile installs must not require a build | Matches the community-verified install path (`dsh plugin add`) |

## Verified facts this plan relies on

Sources: `.spike/ctx-typert-rc2.md` (installed rc.2 inspection), `dsh-at-any` `package.json`/`build.mjs`/`tsconfig.json`, community reference `build-deepseek-harness-plugin/references/persistence-and-release.md`, official API Gateway docs.

- `@deepseek-ai/dsh-typert-protocol` exports `Remote`, `RemoteScope`, `TypertRemoteService`, `bindTypertRemote` (runtime), marker version 1 recorded on the service prototype.
- Host registration is a **runtime API**: `ctx.typert.register({ package, face: 'host', schemas, invocations })`, validated then committed atomically (registry `lib/index.js:398-417`). It is not Loader-only.
- Generated endpoint descriptor fields: `id, service, namespace, method, invocation, scope, parameters[], result, sourceLocation`; each parameter/result codec is `{ mode: 'strict', typeSymbol, create }` where `create` is a memoized zod schema factory (`dsh-goal/lib/typert.host.js:146-190`).
- Client contribution shape is `{ package, descriptors: [...] }`; `ctx.remote.$mount(contribution)` calls `callerCtx.typert.remotes.register(contribution)`, validates strict inputs, installs one child service per namespace (`dsh-api-gateway/lib/client.js:1636-1746`).
- Gateway host dispatch resolves `ctx.typert.local.get(endpoint)` (strict) and refuses SRC fallback for an endpoint whose strict definition was withdrawn.
- Zod 4 is the codec library in rc.2.

## Proven minimal recipe (spike, live rc.2)

All three spike questions came back **PROVEN** on a throwaway profile (report: `.spike/typert-spike-report.md`, code: `.spike/typert-spike/`). The exact contract, so nobody has to rediscover it:

- **Host registration** — no generator, no decorators:
  `ctx.typert.register({ package, face: 'host', schemas: [], invocations: [descriptor] })` returns a disposer and makes the strict endpoint locally visible.
- **Service binding** — a plain Cordis `Service` is not enough: the gateway rejects it with `Service "…" has no visible typertRemote binding`. The service must expose the 3-field identity `this.typertRemote = Object.freeze({ service: this, serviceKey: this.name, namespace: this.name })` (what `bindTypertRemote` returns). Identity metadata, not auth.
- **Descriptor per method** — `{ id, service, namespace, method, invocation: { kind: 'direct' }, parameters: [{ name, wire, source: 'json', codec: { mode: 'strict', typeSymbol, create } }], result: { mode: 'strict', typeSymbol, create }, sourceLocation }`, with real zod factories in `create`.
- **Client mount** — `await ctx.remote.$mount({ package, descriptors })` returns a disposer. `ctx.remote` IS available to a third-party bundle.
- **Client call** — the namespace service is not reachable bare: `ctx.inject(['remote.<namespace>'], scope => scope.remote.<namespace>.<method>(args))`. Accessing `ctx.<namespace>` or `ctx.remote.<namespace>` without that inject throws `cannot get property … without inject`.
- **Arguments and results** — always pass an object (`ping({})`); `undefined` fails with `args fields do not match the descriptor: missing "input"`. Results arrive as a `RemoteResult` envelope: `{ ok: true, value }` or `{ ok: false, error }` — unwrap it.
- **Transport and trust** — calls become `POST /api/<namespace>/<method>`; the Connection's fence/cookie applies (unauthenticated equivalent POST → **401**). The plugin implements no auth.
- **Zod must be bundled** into the client bundle (bare `require('zod')` misses the browser module table). Cost measured: **760 KB** client bundle versus 1.9 KB for the hand-written wrapper — acceptable for a local plugin, but it belongs in the size budget.
- **Browser verification** — CDP attached to an isolated headless Chromium; `--dump-dom --virtual-time-budget` proved unreliable (`chrome_crashpad_handler: --database is required` without a writable HOME).

## Test strategy (platform harness, not a hand-written shim)

`@deepseek-ai/dsh-client-test-runtime@0.1.7-rc.2` is published and exists precisely for this: its published description is *"Browser test runtimes: a jsdom slot bench with test-owned Session and Workspace doubles, and a whole-client tier that boots the web roster through the production bootClient over an endpoint-named Remote mock"*. It brings `vitest`, `jsdom`, `@testing-library/dom` and `@testing-library/react` as dependencies; its peers are the client packages at the target version plus `@deepseek-ai/dsh-remote-mock`.

Mapping to our needs:

| Tier | What it gives us | Where we use it |
|---|---|---|
| jsdom slot bench | Real slots + Session/Workspace doubles, no browser | Chip and settings-page tests (Phase 3) |
| whole client over `bootClient` + Remote mock | Real client assembly and Remote plumbing with an endpoint-named mock | Our contribution mount + descriptor/argument/result contracts (Phase 2) |
| Live rc.2 + CDP headless Chromium | The real host, real Connection, real trust path | Live acceptance only (Phase 4) |

The hand-written `client-shim.test.cjs` is retired once the slot bench covers the same behaviours: its blind spots (fake primitives, single-render `useState`, mocked `fetch`) are exactly what cost us a day.

## Phase 0 — toolchain and layout (no behaviour change)

Deliverables:
- `src/host/**`, `src/client/**`, `src/shared/**` (empty-ish skeletons + moved files as Phase 1 proceeds).
- `build.mjs`: esbuild host bundle `src/host/index.ts` → `lib/index.js` (ESM, node22, external `@deepseek-ai/cordis`, `@deepseek-ai/dsh-*`, `@deepseek-ai/schemastery`; zod bundled) + esbuild client bundle `src/client/index.ts` → `lib/client.js` (CJS, browser, `jsx: automatic`, external dsh-* + react/react-dom/jsx-runtime/scheduler, `window.__ModuleLoader__.load({ id, factory })` banner/footer) + `tsc -p tsconfig.json` for `lib/types/**`.
- `tsconfig.json`: strict, `NodeNext`, `jsx: react-jsx`, `rootDir: src`, `outDir: lib/types`, `emitDeclarationOnly`, `allowImportingTsExtensions`.
- `package.json`: `type: module`, `main: lib/index.js`, exports `.`, `./client`, `./section`, `./profile` (**must keep the subpaths the live profile patch already uses**), plus `./typert` and `./remote` once Phase 2 lands; `dsh.bundle.patch`, `dsh.client {platform: web, inject}`; all `@deepseek-ai/dsh-*` as optional peers; `zod` as a real dependency.
- Test runner: `vitest` plus `@deepseek-ai/dsh-client-test-runtime` (with `@deepseek-ai/dsh-remote-mock` and the client peers it needs) as devDependencies; the hand-written shim is retired as the harness takes over.

Acceptance: `pnpm build` produces the same 11 route names as today, existing tests pass against the built `lib/`, and a profile-installed copy still mounts.

## Phase 1 — port host logic to TypeScript (behaviour frozen)

- Move `lib/*.js` → `src/host/*.ts` one module at a time: domain/storage, registry, mirror + builtin orders, section/profile subpath rows, writer, resolve/sealing, api. Types first, no logic changes; every step keeps the suite green.
- Port all host tests to vitest; keep the real-Cordis smoke test — it is now a first-class gate.
- Keep `ctx.get(...)`-style optional service reads and the loud mount diagnostics.

Acceptance: byte-for-byte behavioural parity on the existing 129 tests; `--dump-config` unchanged; smoke test mounts 11 routes.

## Phase 2 — Typert Remote

### 2a. Spike (prove before porting)

Minimal end-to-end proof on rc.2: one host service with one hand-written invocation (`state()` returning a constant) registered via `ctx.typert.register(...)`, one client contribution `{package, descriptors}` mounted via `ctx.remote.$mount(...)`, and a real call from the browser. Verify: strict codec validation is enforced, the call arrives, errors surface, unload removes the namespace.

If the spike fails, stop and re-plan — the fallback is the current fetch routes, not a hack around the registry.

### 2b. Full Remote surface

Host: `PromptProfilesRemote extends TypertRemoteService` bound to our key, delegating to the business service. Methods (typed args/results, zod codecs on both sides):

| Method | Args | Result |
|---|---|---|
| `state` | `{ sessionId?, cwd?, workspaceId? }` | profiles, sections, builtinOrders, modes, default, lastByWorkspace, revision |
| `preview` | `{ profileId, cwd? }` | plan, skipped, variables |
| `sectionCreate` / `sectionUpdate` / `sectionDelete` / `sectionRename` | payload + `expectedRevision?` | row/patch/config ids, affectedProfiles |
| `profileCreate` / `profileUpdate` / `profileDelete` | payload + `expectedRevision?` | ids |
| `last` | `{ workspaceId?, cwd?, profileId }` | ok |
| `defaultSet` | `{ profileId }` | ok |

Client: `src/client/remote.ts` exports the mirrored contribution; the plugin mounts it in an effect with `inject: ['remote']` and calls `ctx.remote.<namespace>.<method>(...)`. Typed errors replace `{error:{message}}` envelopes.

### 2c. Delete the old transport

Remove `connection.fetch` registration, body parsing, CSRF and `admit` layers, the `/api/__dsh-prompt-profiles` base and its tests. The Connection now owns trust, transport, cancellation and envelopes.

Acceptance: live in rc.2 — chip → profile → sections in the system prompt; sealing, resume, complete-mode marker; no fetch routes left in the bundle.

## Phase 3 — UI to TSX

- Port the chip and the settings page to TSX: platform primitives (`Button`, `Menu`, `Tooltip`, `Input`), real slots, the existing i18n dictionaries (en/ru/zh) and the current UX (three chip states, complete-mode marker, drag&drop with keyboard, debounced autosave, preview honesty).
- Replace the hand-written client shim with the platform's jsdom slot bench (`@deepseek-ai/dsh-client-test-runtime`), which is where the shim's blindness hurt us.

Acceptance: every UI behaviour currently covered by shim assertions is covered by a slot-bench test; live parity confirmed through CDP on a real browser.

## Phase 4 — live acceptance and release

- Install into the rc.2 web profile, restart, hard-refresh; walk the acceptance list (chip, sealing, resume, complete mode, i18n, drag&drop, error paths).
- Update SPEC/PLAN to the new architecture; delete stale sections about fetch routes.
- Tag a version; `lib/` committed; README with install/update/remove, data locations and known limits.

## Risks

| Risk | Mitigation |
|---|---|
| Hand-written invocations rejected by registry validation | Copy the exact generated field shape from `dsh-goal`; prove in the 2a spike with the real registry before porting |
| The app's client assembly may not expose `ctx.remote` to third-party bundles | Phase 2a spike answers it on day one; if it fails, re-plan rather than fake it |
| esbuild may not compile standard decorators | Decorators are optional for us: `ctx.typert.register(...)` plus `bindTypertRemote` needs no decorator; decide in the spike |
| Subpath rows in the user's live patch break | Keep `./section` and `./profile` exports stable through every phase |
| Rewrite loses hard-won behaviour (sealing, provenance, key candidates) | Behaviour frozen in Phase 1, tests ported first, no logic edits while moving files |
| Client bundle regression while `dev:web` tooling is absent | `lib/` is built by our own `build.mjs`; verify the served bundle by URL after each build |

## Refactor (user-specified: layered host, less commentary, tooling)

Phase 2b moved the operation logic out of `api.ts` into `operations.ts` **without changing its shape**, so the result is the same tangle in a new file (~1270 lines: hand-rolled validation, id juggling, read models and side effects interleaved). That was deliberate sequencing — reach a working Remote path first — not a design. The refactor now follows the user's explicit requirements:

- **Hexagonal / clean layering of the host**: `src/host/domain/` (pure rules — ids, row shapes, reference resolution, ordering, skip reasons; no I/O), `src/host/application/` (use cases — state, preview, section and profile operations, last/default), `src/host/infra/` (driven adapters — patch writer, loader registry, builtin-orders mirror, prompt_profiles storage, settings, workspace registry), `src/host/entrypoints/` (drivers — the Cordis plugin, the Typert Remote surface, the `./section` and `./profile` rows). Use cases depend on ports, never on adapters.
- **Comment diet**: grace-lite contracts belong on a module's PUBLIC surface; internal helpers get block markup and `@purpose` only where intent is not obvious from code and types. No banal descriptions, no `@param`/`@returns` restating types, doc length proportional to the complexity documented, and no commentary that narrates history.
- **One declarative method table** as the single source of truth (name + zod args/result + handler) from which Remote descriptors, argument validation and any future surface are derived.
- **Biome** as the project linter/formatter, wired into `check`.
- **Try TypeScript 7**; if it cannot build this project, stay on 6 and record exactly why.
- Remove the `@ts-nocheck` headers from the surviving modules as they get typed.
- **Try `zod/mini` (tree-shakable) for the client bundle size** (~760 KB of bundled zod today). The check is not only size: verify that the gateway/registry rely solely on the standard schema surface (`parse`/`safeParse`, `~standard`) and that a `zod/mini` schema satisfies it — then measure again. Not urgent. — Проверено (коммит `0674915`): рантайм rc.2 действительно использует только `codec.create().parse(...)` (gateway `index.js:1501-1516`) и `typeof codec.create === "function"` (registry `index.js:1354-1358`), строгие кодеки переведены на `zod/mini`, `lib/client.js` 853 799 → 139 010 B; контракт strict-кодеков без изменений (125 сравнений classic/mini — 0 расхождений).
- Подумать, допустимо ли использовать zod в domain layer


## Later

- Подумать, нельзя ли как-то в сессию пропечатывать профиль, чтоыб можно было обойтись без .dsh/storages/prompt_profiles.json

## Out of scope

- Out-of-tree Typert **generator** pipeline (pinned monorepo staging): hand-written invocations are enough and keep the plugin independently installable.
- rc.1 compatibility.
- Publishing to npm (GitHub install with committed `lib/` is the target).
