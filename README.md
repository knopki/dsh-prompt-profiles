# @knopki/dsh-prompt-profiles

A DSH bundle that adds an independent prompt-profile axis: named sets of extra system-prompt
sections ("profiles") that can be chosen per session without touching agent presets. A profile's
sections carry their own order and scope, are sealed into the system prompt when a session starts,
and never change for that session. When no profile is chosen the system prompt is not modified at
all.

## Requirements

- DSH `0.1.7-rc.2`.
- The installed profile's own plugins: on the host `settings`, `configEditor`, `workspaceRegistry`,
  `storageDomain`, `typert` and `agentPresets` (a missing optional service degrades a specific
  feature, it does not block the mount); on the web client
  `@deepseek-ai/dsh-client-ui-settings`, `@deepseek-ai/dsh-client-ui-conversation` and
  `@deepseek-ai/dsh-client-ui-primitives`.

## Install

```bash
dsh plugin --profile <name> add <path-or-git>
```

`lib/` is committed, so installing needs no build. Update by re-running `add` with the same target
(or remove first) — replacing an installed copy requires a DSH restart, while a first install can
come up through HMR. Remove:

```bash
dsh plugin --profile <name> remove @knopki/dsh-prompt-profiles
```

## Where data lives

| Data | Location |
|---|---|
| Section and profile rows, per-row overrides | the profile's patch rows in `cordis.patch.yml` (written by this bundle's writer) |
| `default` and `lastByWorkspace` | volatile settings of the `prompt-profiles` main row |
| Sealed per-session snapshots | `$DSH_HOME/storages/prompt_profiles.json` |

## Use it

The composer shows a `Profile:` chip on a blank session next to `permission` and `plan`. Pick `None`
to opt out explicitly, or a profile to apply it to the new session; the choice is remembered for the
workspace. In a complete mode (e.g. `minimal`, whose preset sets `config.complete: true`) the engine
discards every section, so the chip marks the trigger with a warning and the profile has no effect.

**Settings → Prompt profiles** is the editor: *Profiles* (list, default for new sessions, section
outline with drag&drop or arrow keys, scope per reference), *Sections* (search, used-in, source,
title and body with debounced autosave) and *Preview* (illustrative: only `{{cwd}}` is substituted,
everything else is reported as a variable). Section ids of bundle-provided rows cannot be changed;
renaming a section never rewrites profile references, and the response names the profiles that still
hold the old id so you can fix them by hand.

## Develop

```bash
pnpm install --store-dir ./.pnpm-store
pnpm run build        # esbuild bundles + tsc declarations into lib/
pnpm test             # host unit and differential tests (node --test)
pnpm run test:client  # client UI on React + jsdom (vitest project client)
pnpm run test:remote  # Remote path over the real gateway client (vitest project remote)
pnpm run lint         # biome
pnpm run typecheck    # tsc for src and test
pnpm run check        # typecheck + lint + test + test:client + test:remote + build
```

`lib/` is build output and is committed on purpose: profile installs must not require a build.

## Known limitations

- **One DSH process.** Writes are serialized in-process (module mutex plus the optional `dsh-hmr`
  gate); there is no cross-process lock on the profile patch, so a second DSH process editing the
  same `cordis.patch.yml` can overwrite rows or choices.
- **Strict sealing.** A session's decision is made once and never revised — an empty decision
  included. A session that started before the snapshot record existed keeps its result; to get a
  profile in such a session, start a new one.
- **Bundle size.** `lib/client.js` is ~854 KB because zod 4 is bundled into the client artifact (the
  browser module table has no bare `zod`).

See [SPEC.md](SPEC.md) for the full contract and [PLAN.md](PLAN.md) for status.
