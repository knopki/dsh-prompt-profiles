# AGENTS.md

Orientation for agents working in this repository.

## What this is

`@knopki/dsh-prompt-profiles` is a DSH bundle that adds an independent prompt-profile axis: named
sets of extra system-prompt sections, chosen per session, sealed into that session's prompt at start,
and edited from the web settings UI. Two halves ship together: a host plugin and one web client
bundle.

`lib/` is committed build output. The bundle is installed from it, so installing never builds, and
the committed artifacts must always be the build of the current `src/`.

## Commands

Node, pnpm and the DSH release are pinned in `mise.toml`; run `mise install` once per machine.

```
pnpm install --store-dir ./.pnpm-store
pnpm run build        # esbuild host entries + client bundle, then tsc declarations into lib/
pnpm run typecheck    # tsc for src, then for src + test/client
pnpm run lint         # biome
pnpm run format
pnpm test             # host suite: node --test test/*.mjs, imports lib/**
pnpm run test:client  # vitest jsdom over test/client/**, mostly src/**
pnpm run test:remote  # vitest over test/remote/**, loads the built client bundle
pnpm run check        # typecheck + lint + all three suites + build
```

Working rules:

- After any change under `src/`, run `pnpm run build` before `pnpm test` and before committing. The
  host suite and two client specs load `lib/`, so a run against a stale build proves nothing.
- Never edit `lib/` by hand; it is generated.
- `pnpm run check` ends with a rebuild, so a clean `git status` afterwards means the committed
  artifacts match the tree.
- The host suites do not typecheck the root `.mjs` files: `tsconfig.test.json` covers `src` and
  `test/client` only.

## Layout

- `src/host/domain`: pure rules and shapes. Imports only `node:crypto` and its own modules; no zod,
  no Cordis, no fs.
- `src/host/application`: use cases over the ports declared in `application/ports.ts`. Imports
  domain, ports, `src/shared`, zod for payload schemas and yaml for preset parsing.
- `src/host/infra`: adapters. Atomic patch writer, loader-backed registry, settings and workspace
  adapters, session snapshots, built-in order mirror.
- `src/host/entrypoints`: Cordis wiring. `plugin.ts` mounts everything, `section.ts` and `profile.ts`
  register the two row kinds, `remote.ts` publishes the Remote surface.
- `src/shared`: the wire schemas and the remote method table both halves share.
- `src/client`: the web half, shipped as a single bundle.
- `test/`: host suites over `lib/**`, client specs over `src/**`.

Keep the direction: entrypoints depend on application, application on domain and ports, infra
implements ports. Application code must not import infra or entrypoints.

## Markup

Load the `grace-lite` skill before editing and follow its templates.

- Exactly one `moduleContract` per source file, at the top, with a real `@purpose`. Omit fields that
  have nothing to say.
- Region types in use: `moduleContract`, `CLASS_`, `COMPONENT_`, `FUNC_`, `METHOD_`, `BLOCK_`. Do not
  invent others (`CONST_`, `TYPE_`, `TEST_`, ...). Constants, types and interfaces are not wrapped; a
  non-trivial exported type keeps a short JSDoc instead.
- Public API carries a contract with `@purpose`. Private code is not marked at all unless it is
  genuinely complex.
- One region wraps one entity and is named after it. `BLOCK_` marks a phase inside a body and
  describes what, not how.
- Markup stays proportional: commentary never exceeds the code it describes. A long file does not
  license a long contract.
- Comments explain why, or a mechanism a reader cannot see from the code. No history, no phase, step,
  spike or decision numbers, no `SPEC`/`PLAN` section references, no byte sizes, line counts or
  `file:line`.
- Tests carry one short module contract per file, plus a region only for genuinely complex
  scaffolding.

## Documentation

- `SPEC.md` holds the coarse product contract: concepts, cross-module invariants, deployment. If
  something can be stated in a module, state it in that module's contract instead.
- `README.md` is the operator view: the badge header, screenshots, requirements, install, data
  locations, use, develop commands, user-facing limits.
- `README.ru.md` and `README.zh.md` translate `README.md`. A change to the English file belongs in all
  three in the same commit, with section order, screenshots, code blocks and the language switcher
  kept identical.
- Wording in the translated files follows the dictionaries in `src/client/i18n.ts`, so the UI names
  quoted in the docs are the ones the interface shows.
- No byte sizes, millisecond values, counts, internal file paths, method tables or phase history.
- `PLAN.md` and `MIGRATION.md` were removed deliberately. Do not recreate a status log or a migration
  diary; durable facts belong in module contracts.

## YAGNI

- Delete dead code, unreachable branches, unused exports and dead references.
- Keep an export private unless another module or a test imports it.
- Extract a shared helper when a rule is duplicated; do not add abstraction, options or dependencies
  for a single call site.

## Invariants worth knowing

- Patch writes are atomic (temp file plus rename) inside one in-process mutex, optionally wrapped in
  the host write gate. HMR transactions cannot nest, so nothing that takes hmr exclusivity may run
  inside the gate. There is no cross-process lock.
- A session's profile decision is sealed once and persisted durable-first; an empty decision is
  final. Later configuration edits never rewrite a sealed session.
- Scope is evaluated before existence, so a scope-filtered reference reports the same reason the
  runtime would give.
- The runtime interpolates section text strictly and skips a section it cannot resolve. The editor
  preview is deliberately lenient and must report what it skipped instead of showing text the runtime
  would drop.
- The host owns the operations; the client reaches them only through the platform Remote surface.
- The `@deepseek-ai/dsh-*` peerDependencies stay a version window, never the exact build pin. DSH
  evaluates them against the running release and disables a plugin whose peers do not satisfy it, so
  an exact pin silently breaks every profile that is not on that one version.
- The built-in order table is a frozen fallback for the installed engine table. The mirror suite
  compares them, so a DSH upgrade that changes the table is a failure to address, not silent drift.

## Before you finish

- Run `pnpm run check`, or at least the suites your change can affect, plus `pnpm run build` when you
  touched `src/`.
- Reconcile the exact request against the diff: no unrelated refactors, no dropped assertions.
- End-to-end acceptance in a live profile (a real install, a browser session, the actual chip and
  settings pages) is manual; the suite does not cover it.

## Commits

Conventional commits with an optional scope, matching the existing history: `feat(scope): ...`,
`refactor: ...`, `docs: ...`, `chore: ...`.
