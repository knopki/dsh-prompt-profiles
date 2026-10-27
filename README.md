# 📦 @knopki/dsh-prompt-profiles

<div align="center">

<h3>Per-session prompt profiles for DeepSeek Harness: reusable system-prompt sections, grouped into named profiles, sealed into the session prompt</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@knopki/dsh-prompt-profiles"><img src="https://img.shields.io/npm/v/@knopki/dsh-prompt-profiles.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="#requirements"><img src="https://img.shields.io/badge/DSH-0.2.1--alpha.2-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="DSH version"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文</b></a>
</p>

<table align="center">
  <tr>
    <td align="center">
      🗄️ <strong>Archived.</strong> Issues and pull requests are closed along with the repository. Fork it if you still need it: MIT, and <code>lib/</code> is committed, so a fork installs without a build.
      <br><br>
      ➡️ <strong>Want another agent voice?</strong> Use an agent preset with <code>@deepseek-ai/dsh-persona</code>. The migration section below is the whole recipe.
    </td>
  </tr>
</table>

</div>

---

> **This repository is archived.** Read-only: no further releases, no issue triage. The plugin still works on the DSH release it targets, but the problem it solves is now covered by the platform itself. Read [why](#why-it-is-archived) and [how to get the same result without it](#migrating-from-prompt-profiles-to-an-agent-preset). The reference documentation below stays for anyone still running an installed copy.

## Why it is archived

**The platform grew the same axis.** This bundle added a "how the agent is told to work" dimension next to agent presets. Agent presets have since become the first-party home for exactly that: `@deepseek-ai/dsh-agent-preset` declares an agent's child rows as ordinary YAML, and `@deepseek-ai/dsh-persona` owns the persona prefix and suffix slots inside a preset. One preset per voice does what one profile did, and it does it through the platform's own loader, prompt registry, and documentation instead of a second implementation of each.

**What that buys over this plugin.** The bundle has to shadow the assembled prompt, keep sealed per-session snapshots under `$DSH_HOME/storages/prompt_profiles/`, and write its own definition rows into `cordis.patch.yml`. It also pins a peer window (`>=0.1.7-rc.2 <0.2.2-0`) and needs `dsh plugin allow-version` outside it, and it injects two client packages to draw the composer chip and the editor. A preset composition declares the package it mounts and nothing else: no version exemption, no storage to reap, no client injection, and the persona text sits in the same YAML block as the tools and permissions it goes with, so "what the agent is" and "how it is told to work" are read and reviewed in one place.

**It found no users.** The npm registry reports zero downloads for the package, and the only installation I know of is mine. A bundle nobody installs costs a re-verification pass on every DSH release window and returns nothing. Archiving is the honest outcome; a fork is one `git clone` away if you disagree.

## Migrating from prompt profiles to an agent preset

The mapping is nearly mechanical: one profile becomes one preset, its sections become that preset's persona `prefix` (or its `suffix`, for text that belonged after the first-party guidance rather than before it), and the preset is picked when a session starts instead of in the composer chip.

### 1. Inventory what you actually have

Profiles and sections live as rows in your profile composition (`cordis.patch.yml` for a web profile, `~/.dsh/cordis.patch.yml` for a shared install), under the `prompt-profiles` insert row. Read them out before deleting anything, or open **Settings → Prompt profiles → Preview**, which shows each profile in position among the built-in sections — that ordering is what the preset has to reproduce.

### 2. Declare one preset per profile

Start from your baseline preset (usually `standard`) and add a persona row. The `persona` row must be mounted inside a preset: mounted globally it collides with the prompt registry's own persona registration and fails loud. The collision is the design, not an accident — the row exists to shadow the deployment persona for one agent.

```yaml
- insert:
    - id: preset-reviewer
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: reviewer
        description: Terse reviewer. Reports findings, not opinions.
        order: 10
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: |
                You review code by reading the diff first and saying what breaks.
```

`prefix` is required and `suffix` defaults to empty, so an omitted suffix does not inherit the global one. Both are templates: `{{…}}` groups resolve strictly against registered prompt variables at render time, the same strictness the sealer applied here. Two further fields matter. `complete: true` keeps only the prefix as the system prompt, which is how a `minimal`-style preset already works. `includeRuntimeContext: false` drops optional runtime context for that agent.

### 3. Reproduce what `scope` was doing

This is the one place the mapping is not mechanical. A prompt-profiles section could be `inherit`, `main-only`, or `subagents-only`; a preset has no per-section scope, it has one composition. Text that only ever addressed subagents belongs in a preset those subagents are created with, not in the parent's persona — whether that is convenient depends on how you spawn them. If neither split suits you, folding the text into the parent persona is the pragmatic answer, and a subagent simply reads guidance it does not act on.

### 4. Choose the preset instead of the profile

Presets are selected per session in the platform UI before the session starts, and the registry's `default` and `selectedDefault` decide what a new session gets without a choice. The equivalent of picking `None` is the `standard` preset: both mean "the session runs with the platform's own prompt". Sessions already running keep the composition they were created with, exactly as they kept the profile they were sealed with.

### 5. Remove the plugin and its leftovers

```bash
dsh plugin --profile web remove @knopki/dsh-prompt-profiles
```

Then restart DSH, delete the `prompt-profiles` insert row from the composition (the definitions the writer stored there go with it), and delete `$DSH_HOME/storages/prompt_profiles/` so the sealed snapshots do not linger.

### What the migration loses

- The editor: profile and section lists, drag-and-drop ordering, in-place preview among built-in sections, search, debounced autosave, three UI languages.
- Reuse: a section referenced by five profiles was one string with five placements. A preset inlines its own text; share it with a YAML anchor or duplicate it.
- The composer chip and its per-workspace memory, including the explicit `None` decision.
- Per-section scope.

Not lost: sealing. A preset fixes an agent's composition when the agent is created and is not retrofitted into a live one, so the "start a new session to apply it" behavior carries over unchanged.

---

![The profile chip in the composer](docs/screenshots/composer-chip.png)

## Overview

`@knopki/dsh-prompt-profiles` adds a second axis to a DeepSeek Harness profile. Agent presets decide what an agent is: which tools and behaviors are available. Prompt profiles decide how that agent is told to work. The same agent with the same tools can run as a terse reviewer or as a specialist that follows a house style, and the only thing that changes is the profile you pick at session start.

A profile is an ordered list of references to reusable sections. Every reference carries its own position and scope, so a single section can appear in several profiles in a different place each time. The profile is chosen when a session starts, sealed into that session's prompt, and never revised afterwards. Choose no profile and the system prompt is not modified at all.

The editor and the composer chip live in the web GUI, so you build profiles without hand-editing a single prompt string.

## Features

- Reusable sections: write a fragment once, reference it from any number of profiles, each reference with its own order and scope.
- Per-reference scope (`inherit`, `main-only`, `subagents-only`): a subagent can receive guidance its parent session never sees, and the same section can be narrowed to one context in one profile while staying broad in another.
- Deterministic ordering: sections emit in profile order and take a stable position among the platform's built-in prompt material.
- Sealed sessions: the profile is resolved while the session prompt is assembled and fixed from then on, so resuming a session reproduces exactly what it started with.
- Explicit opt-out: picking None is a recorded decision rather than a missing value, and it seals the same way a profile does.
- Zero footprint by default: with no profile selected, prompt assembly is untouched.
- Composer chip: choose the profile for the next session next to the permission and plan chips, and the choice is remembered per workspace.
- Graceful skips: an unknown, out-of-scope, disabled, empty, or unresolvable section is left out of the prompt instead of breaking the session.
- Editor with drag and drop and keyboard reordering, search, used-in and source details, a per-profile preview, and debounced autosave. A concurrent edit is detected and reloaded instead of silently overwriting your work.
- Profiles live as patch rows in your `cordis.patch.yml`, so they diff and review like the rest of your configuration.
- No second transport to secure: the web client reaches the host through the platform's Remote channel.
- UI in English, Russian, and Chinese.

## Install

```bash
dsh plugin --profile web add @knopki/dsh-prompt-profiles
```

From a local checkout or a git URL:

```bash
dsh plugin --profile web add /path/to/dsh-prompt-profiles
```

`lib/` ships prebuilt, so installing never runs a build. A first install can come up through hot module replacement, while replacing an installed copy needs a DSH restart.

Remove it with:

```bash
dsh plugin --profile web remove @knopki/dsh-prompt-profiles
```

## Quick start

1. Open **Settings → Prompt profiles → Sections** and create a section: an id, a title, and the body text you want in the prompt.
2. Switch to **Profiles**, create a profile, and add sections to it. Drag the handles or use the arrow keys to set the order, and pick a scope on each row.
3. Open a blank session. The chip next to `permission` and `plan` selects the profile for that new session, and the choice is remembered for the workspace.

Sessions already running keep the prompt they were sealed with, so a profile applies to sessions you start from now on.

## The composer chip

- It renders only on a blank session and only when at least one profile exists.
- `None` opts a session out explicitly and seals that decision.
- The choice is remembered per workspace, so the next session in the same workspace starts with the same profile.
- In a complete mode (for example `minimal`, whose preset sets `config.complete: true`) the engine discards every prompt section. The chip marks the trigger with a warning and the profile has no effect there.

## The editor

**Settings → Prompt profiles** has three tabs: Profiles, Sections, and Preview.

The `Profiles` tab lists every profile with its section count and sets the default for new sessions.

![The profile list](docs/screenshots/settings-profiles-list.png)

Opening a profile shows its sections in prompt order with the platform's built-in sections displayed in place among them, so you can see where your text lands in the assembled prompt. Drag the handle or type an order number to move a row, pick a scope on each row, and use the row icons to edit or remove a section. Duplicate and delete sit next to each profile in the list.

![One profile and its sections](docs/screenshots/settings-profile.png)

The `Sections` tab lists every section with the profiles that use it, and filters by id and title.

![The section list](docs/screenshots/settings-sections-list.png)

A section carries a title and a body, and edits save automatically after a short pause. A section owned by another bundle keeps its id locked and can only be disabled. Renaming an id never rewrites profile references; the response names the profiles that still hold the old id so you can fix them by hand.

![One section](docs/screenshots/settings-section.png)

The `Preview` tab shows the selected profile in position among the built-in prompt sections and lists everything it skipped, with the reason for each skip.

## Prompt variables

Section bodies may contain `{{name}}` references, for example `{{cwd}}`. The runtime substitutes them strictly when the session prompt is sealed: an unknown or malformed reference makes the sealer drop that section rather than emit a broken prompt. The editor preview is deliberately lenient, and it reports such a section as skipped with the reason, so you see what the runtime would discard instead of text it would never produce.

## Where data lives

| Data | Location |
|---|---|
| Section and profile definitions, per-row overrides | the profile's patch rows in `cordis.patch.yml`, written by this bundle's writer |
| `default` and `lastByWorkspace` | volatile settings of the `prompt-profiles` main row |
| Sealed per-session snapshots | `$DSH_HOME/storages/prompt_profiles/sessions/<sessionId>.json`, one record per session |

## Requirements

- DSH in `>=0.1.7-rc.2 <0.2.2-0` — the peer window this bundle declares; `0.2.1-alpha.2` is the release it is verified on.
- Outside that window DSH disables the plugin until you grant it the exact-version exemption (`dsh plugin allow-version`).
- The installed profile's own plugins: on the host `settings`, `configEditor`, `workspaceRegistry`, `storageDomain`, `typert` and `agentPresets`; on the web client `@deepseek-ai/dsh-client-ui-settings`, `@deepseek-ai/dsh-client-ui-conversation` and `@deepseek-ai/dsh-client-ui-primitives`.
- A missing optional service degrades one feature. It does not block the mount.

## Develop

```bash
mise install          # Node, pnpm and the DSH release the bundle targets
pnpm install --store-dir ./.pnpm-store
pnpm run build        # esbuild bundles + tsc declarations into lib/
pnpm test             # host unit and differential tests (node --test)
pnpm run test:client  # client UI on React + jsdom (vitest project client)
pnpm run test:remote  # Remote path over the real gateway client (vitest project remote)
pnpm run lint         # biome
pnpm run typecheck    # tsc for src and test
pnpm run check        # typecheck + lint + test + test:client + test:remote + build
```

`lib/` is build output and is committed on purpose: profile installs must not require a build. See [SPEC.md](SPEC.md) for the product contract and the module contracts under [src/](src/) for implementation responsibilities.

## Known limitations

- One DSH process. Writes from a single DSH process are coordinated; a second DSH process editing the same profile patch can overwrite rows or choices.
- Strict sealing. A session's decision is made once and never revised, an empty decision included. A session that started before its snapshot record existed keeps its result, so start a new session to get a profile into it.

## License

MIT
