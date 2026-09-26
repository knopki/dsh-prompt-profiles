/**
 * Shared bench for the client specs: the fake slot props/services the plugin
 * would receive from the platform, and a recording Remote namespace mounted
 * through the REAL transport facade (`ctx.remote.$mount` + `ctx.inject`), so
 * the tests exercise the production error/refresh paths instead of a stub api.
 */
import type { PromptProfileChipProps, StoreHook } from "../../src/client/chip.tsx";
import type { Translate } from "../../src/client/i18n.ts";
import { en } from "../../src/client/i18n.ts";
import type { RowEntry, StateDocument } from "../../src/client/model.ts";
import type { RemoteEnvelope } from "../../src/client/remote.ts";
import { mountRemote } from "../../src/client/transport.ts";

/** The identity translator: assertions read the locale KEY, never English copy. */
export const keyT: Translate = (key) => key;
/** The real dictionary lookup, for the tests that assert the shipped English copy. */
export const dictT: Translate = (key) => en[key as keyof typeof en] ?? key;

/** A recording Remote namespace: every call is kept, answers are scripted by method. */
export interface RemoteBench {
  calls: Array<{ method: string; args: Record<string, unknown> }>;
  stateCalls(): Array<{ method: string; args: Record<string, unknown> }>;
  /** Script the next answers; a function receives the args and may throw. */
  answer(method: string, value: unknown | ((args: Record<string, unknown>) => unknown)): void;
  fail(method: string, error: { code?: string; message: string } | Error): void;
}

/**
 * Mount a recording namespace through the production transport (effect +
 * `$mount` + `inject`), exactly the fake service shape the platform hands the
 * plugin. `readyApi()` resolves to the facade over this namespace.
 */
export function installRemoteApi(): RemoteBench {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const answers = new Map<string, (args: Record<string, unknown>) => unknown>();
  const failures = new Map<string, { code?: string; message: string }>();
  const namespace = new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== "string") return undefined;
        return (args: Record<string, unknown>) => {
          calls.push({ method, args });
          const failure = failures.get(method);
          if (failure) return Promise.resolve({ ok: false, error: failure } satisfies RemoteEnvelope);
          const answer = answers.get(method);
          return Promise.resolve({ ok: true, value: answer ? answer(args ?? {}) : {} } satisfies RemoteEnvelope);
        };
      },
    },
  );
  mountRemote({
    effect: (callback) => {
      callback();
    },
    remote: { $mount: () => Promise.resolve(() => {}) },
    inject: (_keys, callback) => {
      callback({ remote: { promptProfiles: namespace } });
      return () => {};
    },
    locale: { register: () => {}, bind: () => keyT },
    slots: { inject: () => {}, register: () => {} },
  });
  return {
    calls,
    stateCalls: () => calls.filter((call) => call.method === "state"),
    answer(method, value) {
      answers.set(
        method,
        typeof value === "function" ? (value as (args: Record<string, unknown>) => unknown) : () => value,
      );
    },
    fail(method, error) {
      failures.set(method, error instanceof Error ? { message: error.message } : error);
    },
  };
}

/** A store hook over a fixed state value (the zustand-style selector shape). */
export const storeHook = <T>(state: T): StoreHook<T> =>
  ((selector: (value: T) => unknown) => selector(state)) as StoreHook<T>;

/** A promise that never settles — for the loading-placeholder states. */
export const never = <T>(): Promise<T> => new Promise<T>(() => {});

// #region fixtures
export const sectionGreeting: RowEntry = {
  rowId: "prompt-section-greeting",
  patchId: "prompt-section-greeting",
  configId: "prompt-section-greeting",
  title: "Greeting",
  body: "Be kind.",
  usedIn: [],
  source: "user",
  emits: true,
};

export const sectionBundle: RowEntry = {
  rowId: "prompt-section-bundle",
  patchId: "prompt-section-bundle",
  configId: "prompt-section-bundle",
  title: "Bundle section",
  body: "",
  usedIn: [],
  source: "bundle",
};

export const profileMain: RowEntry = {
  rowId: "prompt-profile-main",
  patchId: "prompt-profile-main",
  configId: "main",
  title: "Main",
  sections: [{ id: "prompt-section-greeting", order: 10, scope: "inherit" }],
  usedIn: [],
  source: "user",
};

export function stateOf(overrides: Partial<StateDocument> = {}): StateDocument {
  return {
    profiles: [profileMain],
    sections: [sectionGreeting, sectionBundle],
    builtinOrders: { "persona-prefix": 0, "plan:policy": 40 },
    modes: [],
    default: "main",
    lastByWorkspace: {},
    revision: 7,
    ...overrides,
  };
}

/** The chip props a slot would inject, over the state's session stores. */
export function chipProps(overrides: Partial<PromptProfileChipProps> = {}): PromptProfileChipProps {
  return {
    sessionId: "sid",
    useSession: storeHook({ blank: true }),
    useWorkspaces: storeHook({ items: [] }),
    useSessions: storeHook({ byId: { sid: { cwd: "/work/repo" } } }),
    t: keyT,
    pick: () => Promise.resolve({}),
    ...overrides,
  };
}
// #endregion fixtures
