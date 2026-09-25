/**
 * Host ESM bundles + single-file client bundle for @knopki/dsh-prompt-profiles.
 *
 * Modelled on the proven dsh-at-any build: esbuild for the runnable artifacts,
 * `tsc -p tsconfig.json` for `lib/types/**` declarations. The web server serves
 * exactly one file per plugin (/plugins/<id>/client.js), so the client half is
 * one CJS bundle wrapped in the ModuleLoader factory handshake; @deepseek-ai/dsh-*
 * and react stay external (the profile's healed node_modules and the app's module
 * system provide them). The host half is plain ESM for Node, externalizing
 * @deepseek-ai/dsh-* plus cordis and schemastery while bundling everything else
 * (yaml, zod) — the browser module table has no `zod` entry, so a bare require
 * would fail at runtime.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

// Must match the id the hand-written wrapper used before Phase 0: the boot
// manifest and the client ModuleLoader key the contribution by this id.
const MODULE_ID = "@knopki/dsh-prompt-profiles";

const dshExternal = ["@deepseek-ai/cordis", "@deepseek-ai/dsh-*", "@deepseek-ai/schemastery"];

// yaml and zod are bundled on purpose, so the host bundles stay self-contained
// for a profile install. yaml's CJS build calls require() at runtime, which
// esbuild's ESM output cannot serve on its own — the banner below hands the
// bundle a real require. Without it every host entry dies on import with
// `Error: Dynamic require of "process" is not supported`.
const hostBanner = {
  js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
};

// Phase 0 keeps one ESM entry per host module because the node:test suite
// imports them by path (`../lib/<name>.js`). Only index/section/profile are
// package exports.
//
// `splitting` is required, not cosmetic: without it each entry inlines its own
// copy of builtin-orders/registry/writer/resolve, and the suite's identity
// assertions (`assert.equal(result.orders, BUILTIN_ORDERS)`) fail because two
// bundles hand out two distinct objects. Shared modules go to lib/chunk-*.js,
// so every entry sees one instance — exactly like the pre-Phase-0 module graph.
const hostEntries = [
  "src/host/index.ts",
  "src/host/domain/index.ts",
  "src/host/infra/index.ts",
  "src/host/infra/patch-writer.ts",
  "src/host/infra/loader-registry.ts",
  "src/host/infra/builtin-orders.ts",
  "src/host/infra/session-snapshots.ts",
  "src/host/infra/settings-adapter.ts",
  "src/host/infra/workspace-adapter.ts",
  "src/host/section.ts",
  "src/host/profile.ts",
  "src/host/operations.ts",
  "src/host/remote.ts",
  "src/host/resolve.ts",
];

// Start from a clean lib/: esbuild names chunks by content hash, so a changed
// source leaves the previous chunk-*.js files behind as unreferenced orphans
// (and tsc leaves declarations of deleted modules). Wiping first keeps the
// committed artifacts exactly equal to the build of the current tree.
rmSync("lib", { recursive: true, force: true });
mkdirSync("lib", { recursive: true });

await build({
  entryPoints: hostEntries,
  outdir: "lib",
  bundle: true,
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  format: "esm",
  platform: "node",
  target: ["node22"],
  sourcemap: true,
  external: dshExternal,
  banner: hostBanner,
  logLevel: "info",
});

await build({
  entryPoints: ["src/client/index.ts"],
  outfile: "lib/client.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2022"],
  sourcemap: true,
  jsx: "automatic",
  external: [...dshExternal, "react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "scheduler"],
  banner: {
    js: `window.__ModuleLoader__.load({ id: "${MODULE_ID}", factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: "return module.exports; } });",
  },
  // The client source assigns module.exports on purpose: the banner above is the
  // only place `module`/`exports` come from (the ModuleLoader factory handshake).
  // esbuild flags that pattern because package.json is type:module; the built
  // output is correct and the shim test loads it exactly like the browser does.
  logOverride: { "commonjs-variable-in-esm": "silent" },
  logLevel: "info",
});

// Windows-safe tsc invocation: `node_modules/.bin/tsc` is an sh shim that
// spawnSync cannot resolve on win32; run the JS entry through node instead.
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], { stdio: "inherit" });
