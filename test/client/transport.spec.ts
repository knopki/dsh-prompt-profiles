/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the Remote mount lifecycle: effect-mounted contribution,
 *   namespace through `ctx.inject`, data paths waiting on the outcome, and a
 *   loud FAILED mount that leaves a refusing api with no fallback transport.
 * @invariants The active-api holder is module state, so every case re-imports
 *   the module on a fresh registry.
 * #endregion moduleContract
 */
import { expect, test, vi } from "vitest";

type Transport = typeof import("../../src/client/transport.ts");

interface Bench {
  logs: Array<{ message: string; details: Record<string, unknown> }>;
  disposers: number[];
  dispose: () => void;
  cleanup: (() => Promise<void>) | undefined;
}

async function freshTransport(): Promise<Transport> {
  vi.resetModules();
  return import("../../src/client/transport.ts");
}

function bench(transport: Transport, overrides: { mount?: () => Promise<unknown> } = {}): Bench {
  const logs: Array<{ message: string; details: Record<string, unknown> }> = [];
  const disposers: number[] = [];
  const recorded: Bench = { logs, disposers, dispose: () => {}, cleanup: undefined };
  const ctx = {
    locale: { register: () => {} },
    slots: { inject: () => {}, register: () => {} },
    remote: { $mount: overrides.mount ?? (() => Promise.resolve(() => disposers.push(1))) },
    effect: (callback: () => () => Promise<void>) => {
      recorded.cleanup = callback();
    },
    inject: (_keys: string[], callback: (scope: unknown) => unknown) => {
      callback({
        remote: { promptProfiles: new Proxy({}, { get: () => () => Promise.resolve({ ok: true, value: {} }) }) },
      });
      return () => disposers.push(2);
    },
    logger: { error: (message: string, details: Record<string, unknown>) => logs.push({ message, details }) },
  } as unknown as Parameters<Transport["mountRemote"]>[0];
  transport.mountRemote(ctx);
  recorded.dispose = () => void recorded.cleanup?.();
  return recorded;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a successful mount installs the Remote facade and awaits its settlement", async () => {
  const transport = await freshTransport();
  const b = bench(transport);
  expect(typeof transport.getActiveApi().loadState).toBe("function");
  await transport.readyApi();
  await expect(transport.getActiveApi().loadState()).resolves.toEqual({});
  expect(b.logs).toEqual([]);
});

test("a failed mount is logged with its stage and leaves a refusing api", async () => {
  const transport = await freshTransport();
  const b = bench(transport, { mount: () => Promise.reject(new Error("shim: no Remote service")) });
  await tick();
  expect(b.logs).toHaveLength(1);
  expect(b.logs[0].message).toMatch(/Remote mount failed/);
  expect(b.logs[0].details.stage).toBe("$mount");
  expect(b.logs[0].details.error).toBe("shim: no Remote service");
  const api = await transport.readyApi();
  for (const method of ["loadState", "preview", "sectionUpdate", "last", "profileDelete"] as const) {
    const refused = await (api[method] as (...args: unknown[]) => Promise<unknown>)("a", "b").then(
      () => null,
      (err: Error) => err,
    );
    expect(refused?.message, method).toBe(
      "Prompt profiles are unavailable: the Remote connection is not mounted. Reload the page.",
    );
  }
});

test("the effect disposer releases both the namespace inject and the mount", async () => {
  const transport = await freshTransport();
  const b = bench(transport);
  await tick();
  await b.cleanup?.();
  expect(b.disposers).toEqual([2, 1]);
});
