import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

// The primitives barrel imports its markdown, syntax-highlight and icon assets
// at module scope (including one dynamic `import("@shikijs/langs/…")` per
// language). Those are web-app module-table entries, absent from our
// devDependencies and untouched by the atoms the client UI renders, so the
// client project resolves the whole families to one inert stub. The atoms the
// UI actually uses (Button, Menu, Tooltip, Modal, Toast, Input, Tag,
// SegmentedTabs, Checkbox, icons) are the REAL installed primitives; `clsx`,
// `@deepseek-ai/dsh-client-store` and `@deepseek-ai/dsh-util-workspace-path`
// are installed for real because those atoms call into them.
const UNRELATED_PRIMITIVE_DEPS = [
  /^anser$/,
  /^diff$/,
  /^katex($|\/)/,
  /^mdast-/,
  /^micromark-/,
  /^shiki($|\/)/,
  /^@shikijs\//,
  /^simple-icons($|\/)/,
  /^@deepseek-ai\/dsh-util-code-language$/,
];

const stubPath = fileURLToPath(new URL("./test/client/primitives-unrelated.stub.ts", import.meta.url));

// A bare-scope id (`shiki/core`) cannot be aliased by prefix — the replacement
// would keep the `/core` tail — so resolution is exact here.
const unrelatedPrimitivesStub: Plugin = {
  name: "unrelated-primitives-stub",
  enforce: "pre",
  resolveId(source) {
    return UNRELATED_PRIMITIVE_DEPS.some((pattern) => pattern.test(source)) ? stubPath : null;
  },
};

// Two tiers, each explicit so a script runs exactly one of them:
//  - `remote` keeps the node-environment Remote-path bench under test/remote/;
//  - `client` renders the client UI on real React + jsdom (test/client/).
export default defineConfig({
  plugins: [unrelatedPrimitivesStub],
  test: {
    projects: [
      {
        test: {
          name: "remote",
          include: ["test/remote/**/*.spec.mjs"],
          environment: "node",
        },
      },
      {
        plugins: [unrelatedPrimitivesStub],
        test: {
          name: "client",
          include: ["test/client/**/*.spec.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./test/client/setup.ts"],
          // The primitives barrel imports its CSS modules; inlining the package
          // lets Vite (not Node) resolve those imports.
          server: { deps: { inline: [/@deepseek-ai\/dsh-client-ui-primitives/] } },
        },
      },
    ],
  },
});
