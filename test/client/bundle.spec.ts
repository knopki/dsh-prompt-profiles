/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the SHIPPED `lib/client.js` loads as one ModuleLoader module
 *   with the exact service declaration, slot rows, and built-file-only
 *   transport guarantees (Remote-only, no HTTP route base, no primitives
 *   called as plain functions).
 * #endregion moduleContract
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
const BUNDLE_PATH = resolve(process.cwd(), "lib/client.js");
const MODULE_ID = "@knopki/dsh-prompt-profiles";

interface SlotRegistration {
  name: string;
  id: string;
  order: number;
  locale: string;
  label?: () => string;
  inject?: (sessionId: string) => Record<string, unknown>;
}

interface LoadedPlugin {
  id: string;
  exports: {
    inject: string[];
    apply: (ctx: unknown) => void;
    components: Record<string, unknown>;
    remote: { makeRemoteApi: (scope: unknown) => unknown };
  };
}

// #region FUNC_loadBundle
/**
 * @purpose Evaluate the built bundle exactly as the browser does
 *   (`window.__ModuleLoader__.load({ id, factory })`), answering the factory's
 *   `require` from the bundle's externals table.
 */
function loadBundle(): LoadedPlugin {
  const BUNDLE_PATH = resolve(process.cwd(), "lib/client.js");
  const source = readFileSync(BUNDLE_PATH, "utf8");
  let loaded: LoadedPlugin | null = null;
  const loader = {
    load: (module: { id: string; factory: (require: (id: string) => unknown) => unknown }) => {
      loaded = {
        id: module.id,
        exports: module.factory((id) => {
          if (id === "react" || id === "react/jsx-runtime") return require(id);
          // The primitives are never rendered here; a stub per destructured name
          // keeps the import honest without the browser-graph package in Node.
          if (id === "@deepseek-ai/dsh-client-ui-primitives") {
            return new Proxy(
              {},
              { get: (_target, prop) => (prop === "__esModule" ? true : function PrimitiveStub() {}) },
            );
          }
          return require(id);
        }) as LoadedPlugin["exports"],
      };
    },
  };
  const windowWithLoader = globalThis as unknown as { __ModuleLoader__?: typeof loader };
  const previous = windowWithLoader.__ModuleLoader__;
  windowWithLoader.__ModuleLoader__ = loader;
  try {
    // biome-ignore lint/security/noGlobalEval: the bench must evaluate the built browser bundle exactly as the ModuleLoader does; only local build output is ever passed in.
    globalThis.eval(source);
  } finally {
    if (previous === undefined) delete windowWithLoader.__ModuleLoader__;
    else windowWithLoader.__ModuleLoader__ = previous;
  }
  if (!loaded) throw new Error("the bundle never called window.__ModuleLoader__.load");
  return loaded;
}
// #endregion FUNC_loadBundle

interface StrictCtx {
  registrations: Array<{ name: string; options: SlotRegistration; component: unknown }>;
  injected: Array<Record<string, unknown>>;
}

// #region FUNC_makeStrictCtx
/**
 * @purpose The activation guard: the fake ctx is built FROM the declared
 *   `inject` list and throws on anything else, so an undeclared `ctx.<service>`
 *   access (the bug behind "1 entry did not activate") fails here, not in the
 *   browser.
 */
function makeStrictCtx(plugin: LoadedPlugin): { ctx: unknown; recorded: StrictCtx } {
  const recorded: StrictCtx = { registrations: [], injected: [] };
  const services: Record<string, unknown> = {
    locale: {
      register: (ns: string) => {
        expect(ns).toBe("promptProfiles");
      },
      bind: () => (key: string) => key,
    },
    slots: {
      inject: (_name: string, callback: () => unknown) => {
        callback();
      },
      register: (options: SlotRegistration, component: unknown) => {
        recorded.registrations.push({ name: options.name, options, component });
        return () => {};
      },
    },
    remote: { $mount: () => Promise.resolve(() => {}) },
    inject: (_keys: string[], callback: (scope: unknown) => unknown) => {
      callback({ remote: { promptProfiles: new Proxy({}, { get: () => () => Promise.resolve({ ok: true }) }) } });
      return () => {};
    },
    effect: (callback: () => unknown) => {
      callback();
    },
    logger: { error: () => {} },
  };
  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        if (Object.hasOwn(services, prop)) return services[prop];
        throw new Error(
          `ctx.${String(prop)} accessed but not declared in plugin inject [${plugin.exports.inject.join(", ")}]`,
        );
      },
    },
  );
  return { ctx, recorded };
}
// #endregion FUNC_makeStrictCtx

const bundle = loadBundle();
const source = readFileSync(BUNDLE_PATH, "utf8");

test("the bundle registers under the plugin id with the declared services", () => {
  expect(bundle.id).toBe(MODULE_ID);
  expect(bundle.exports.inject).toEqual(["slots", "locale", "remote"]);
  const { ctx, recorded } = makeStrictCtx(bundle);
  bundle.exports.apply(ctx);
  expect(recorded.registrations).toHaveLength(2);
});

test("the composer chip registers conversation.input.left with its injection shape", () => {
  const { ctx, recorded } = makeStrictCtx(bundle);
  bundle.exports.apply(ctx);
  const chip = recorded.registrations.find((registration) => registration.name === "conversation.input.left");
  expect(chip?.options.id).toBe("prompt-profile");
  expect(chip?.options.order).toBe(10);
  expect(chip?.options.locale).toBe("promptProfiles");
  const injected = chip?.options.inject?.("sid") ?? {};
  expect(injected.sessionId).toBe("sid");
  expect(typeof injected.pick).toBe("function");
});

test("the settings section registers settings.section with its label, locale and api injection", () => {
  const { ctx, recorded } = makeStrictCtx(bundle);
  bundle.exports.apply(ctx);
  const settings = recorded.registrations.find((registration) => registration.name === "settings.section");
  expect(settings?.options.id).toBe("prompt-profiles");
  expect(settings?.options.order).toBe(25);
  expect(settings?.options.locale).toBe("promptProfiles");
  expect(settings?.options.label?.()).toBe("nav");
  const injected = settings?.options.inject?.("sid") ?? {};
  const api = injected.api as Record<string, unknown>;
  for (const method of ["loadState", "profileUpdate", "sectionRename", "preview"]) {
    expect(typeof api[method], method).toBe("function");
  }
});

test("an undeclared ctx service fails loudly", () => {
  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        throw new Error(`ctx.${String(prop)} accessed but not declared in plugin inject`);
      },
    },
  );
  expect(() => (ctx as { remote: unknown }).remote).toThrow(/not declared/);
});

test("the shipped client speaks Remote only and never builds path ops", () => {
  expect(source).not.toMatch(/__dsh-prompt-profiles/);
  expect(source).not.toMatch(/\bfetch\s*\(/);
  expect(source).not.toMatch(/op:\s*["']set["']/);
});

test("the primitives are never invoked as plain functions (invalid hook call)", () => {
  expect(source).not.toMatch(/(?<![a-zA-Z])Toast\s*\(/);
  expect(source).not.toMatch(/(?<![a-zA-Z])Menu\s*\(/);
});
