# @knopki/dsh-prompt-profiles

Give a DeepSeek Harness profile an independent **prompt profile** axis: named
sets of extra system-prompt sections that can be chosen per session and edited
from the web GUI — without touching agent presets.

## Install

```bash
dsh plugin add @knopki/dsh-prompt-profiles
```

`lib/` is committed; installing needs no build.

## Layout

| Path | What it is |
|---|---|
| `src/host/**` | Host half: the `ctx.promptProfiles` service, storage domain, patch writer and the Typert Remote surface. |
| `src/client/**` | Web half: the conversation chip and the settings page. |
| `lib/**` | Build output (esbuild bundles + `lib/types/**` declarations), committed on purpose. |
| `cordis.patch.yml` | Bundle patch row. |

## Develop

```bash
pnpm install
pnpm run build      # esbuild bundles + tsc declarations
pnpm run typecheck
pnpm run lint       # biome
pnpm run format     # biome, writes
pnpm run test
pnpm run check      # typecheck + lint + test + build
```

See `MIGRATION.md` for the TypeScript/build/Remote migration plan.
