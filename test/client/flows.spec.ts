/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the two write flows and the save runner: modal-free create,
 *   optimistic-update-and-poll mutation with restore on failure, and runSave's
 *   single 409 re-apply with the server message on the toast and inline error.
 * #endregion moduleContract
 */
import { expect, test } from "vitest";
import { makeCreateFlow, makeMutationFlow, optimisticEntry, PollTimeoutError } from "../../src/client/flows.ts";
import type { StateDocument } from "../../src/client/model.ts";
import { runSave } from "../../src/client/settings-shared.ts";
import { keyT } from "./harness.ts";

const emptyState: StateDocument = { profiles: [], sections: [], builtinOrders: {} };

test("create: one POST under a double submit, poll retry, optimistic insert, drill, pending bracket", async () => {
  let reads = 0;
  const fullState: StateDocument = {
    profiles: [],
    builtinOrders: {},
    sections: [
      {
        rowId: "prompt-section-new-1",
        patchId: "section-new-1",
        configId: "new-1",
        title: "New section",
        body: "",
        usedIn: [],
        source: "user",
      },
    ],
  };
  const creates: unknown[] = [];
  const events: Array<[string, unknown]> = [];
  const flow = makeCreateFlow({
    api: {
      sectionCreate: async (value) => {
        creates.push(value);
        return { rowId: "prompt-section-new-1", patchId: "section-new-1", configId: "new-1", ...value };
      },
      loadState: async () => {
        reads += 1;
        return reads < 3 ? emptyState : fullState;
      },
      profileCreate: async () => ({}),
    },
    t: keyT,
    notify: (message) => events.push(["notify", message]),
    reload: async () => {
      events.push(["reload", null]);
    },
    getState: () => emptyState,
    onState: (state) => events.push(["state", state]),
    onDrill: (id) => events.push(["drill", id]),
    onPending: (pending) => events.push(["pending", pending]),
    pollInterval: 1,
    pollDeadline: 5,
  });

  const first = flow.create("section", { title: "New section", body: "" });
  const second = await flow.create("section", { title: "New section", body: "" });
  expect(second).toMatchObject({ ok: false, busy: true });
  const firstResult = await first;
  expect(firstResult.ok).toBe(true);
  expect(creates).toHaveLength(1);
  expect(reads).toBe(3);
  expect(events.filter((event) => event[0] === "drill").at(-1)).toEqual(["drill", "new-1"]);

  const states = events.filter((event) => event[0] === "state").map((event) => event[1] as StateDocument);
  expect(states).toHaveLength(2);
  expect(states[0].sections).toHaveLength(1);
  expect(states[0].sections?.[0]).toMatchObject({ configId: "new-1", source: "user" });
  expect(states[1]).toBe(fullState);
  expect(events.filter((event) => event[0] === "pending").map((event) => event[1])).toEqual([true, false]);
});

test("create: a row that never mounts times out without hanging", async () => {
  const notes: string[] = [];
  const flow = makeCreateFlow({
    api: {
      sectionCreate: async (value) => ({ patchId: "ghost", configId: "ghost", ...value }),
      loadState: async () => emptyState,
      profileCreate: async () => ({}),
    },
    t: keyT,
    notify: (message) => notes.push(message),
    reload: async () => {},
    getState: () => emptyState,
    pollInterval: 1,
    pollDeadline: 3,
  });
  const result = await flow.create("section", { title: "x", body: "" });
  expect(result.ok).toBe(false);
  expect(result.error).toBeInstanceOf(PollTimeoutError);
  expect(notes[0]).toContain("createTimeout");
});

test("create: a server failure surfaces its message under the localized prefix", async () => {
  const notes: string[] = [];
  const flow = makeCreateFlow({
    api: {
      sectionCreate: async () => {
        throw new Error('writer: row id "prompt-section-1" already exists');
      },
      loadState: async () => emptyState,
      profileCreate: async () => ({}),
    },
    t: keyT,
    notify: (message) => notes.push(message),
    reload: async () => {},
    getState: () => emptyState,
    pollInterval: 1,
    pollDeadline: 5,
  });
  const result = await flow.create("section", { title: "New section", body: "" });
  expect(result.ok).toBe(false);
  expect(notes[0]).toContain("already exists");
  expect(notes[0].startsWith("createError")).toBe(true);
});

test("mutation: delete applies optimistically and polls until /state agrees", async () => {
  const prior: StateDocument = {
    profiles: [{ rowId: "p1", patchId: "p1", configId: "p1", title: "P1", sections: [] }],
    sections: [],
    builtinOrders: {},
  };
  let reads = 0;
  const states: StateDocument[] = [];
  const pendings: boolean[] = [];
  const flow = makeMutationFlow({
    api: {
      loadState: async () => {
        reads += 1;
        return reads < 3 ? prior : { ...prior, profiles: [] };
      },
    },
    t: keyT,
    notify: () => {},
    reload: async () => {},
    getState: () => prior,
    onState: (state) => states.push(state),
    onPending: (pending) => pendings.push(pending),
    pollInterval: 1,
    pollDeadline: 20,
  });
  const result = await flow.run({
    mutate: async () => {},
    optimistic: (state) => ({ ...state, profiles: [] }),
    agree: (polled) => (polled.profiles ?? []).length === 0,
  });
  expect(result.ok).toBe(true);
  expect(reads).toBeGreaterThanOrEqual(3);
  expect(states[0].profiles).toHaveLength(0);
  expect(states.at(-1)?.profiles).toHaveLength(0);
  expect(pendings).toEqual([true, false]);
});

test("mutation: duplicate inserts the copy optimistically and polls for it", async () => {
  const prior: StateDocument = {
    profiles: [{ rowId: "p1", patchId: "p1", configId: "p1", title: "P1", sections: [] }],
    sections: [],
    builtinOrders: {},
  };
  const copy = {
    rowId: "p1-copy",
    patchId: "p1-copy",
    configId: "p1-copy",
    title: "P1 (copy)",
    sections: [],
  };
  const withCopy: StateDocument = { ...prior, profiles: [...(prior.profiles ?? []), copy] };
  let reads = 0;
  const states: StateDocument[] = [];
  const flow = makeMutationFlow({
    api: {
      loadState: async () => {
        reads += 1;
        return reads < 2 ? prior : withCopy;
      },
    },
    t: keyT,
    notify: () => {},
    reload: async () => {},
    getState: () => prior,
    onState: (state) => states.push(state),
    pollInterval: 1,
    pollDeadline: 20,
  });
  const result = await flow.run({
    mutate: async () => copy,
    optimistic: (state, created) => ({
      ...state,
      profiles: [...(state.profiles ?? []), optimisticEntry("profile", created)],
    }),
    agree: (polled, created) => (polled.profiles ?? []).some((row) => row.configId === created.configId),
  });
  expect(result.ok).toBe(true);
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(states[0].profiles).toHaveLength(2);
  expect(states[0].profiles?.[1].title).toBe("P1 (copy)");
});

test("mutation: a failure restores the prior state and reports the server message", async () => {
  const prior: StateDocument = {
    profiles: [{ rowId: "p1", patchId: "p1", configId: "p1", title: "P1", sections: [] }],
    sections: [],
    builtinOrders: {},
  };
  const states: StateDocument[] = [];
  const notes: string[] = [];
  const serverError = () => {
    throw new Error('profile/delete: row "x" is registered elsewhere');
  };
  const flow = makeMutationFlow({
    api: { loadState: async () => prior },
    t: keyT,
    notify: (message) => notes.push(message),
    reload: async () => {},
    getState: () => prior,
    onState: (state) => states.push(state),
    pollInterval: 1,
    pollDeadline: 5,
  });
  const result = await flow.run({
    mutate: async () => serverError(),
    optimistic: (state) => ({ ...state, profiles: [] }),
    agree: (polled) => (polled.profiles ?? []).length === 0,
  });
  expect(result.ok).toBe(false);
  expect(states[0].profiles).toHaveLength(1);
  expect(notes[0]).toContain("registered elsewhere");
});

test("mutation: a second run while in flight is a busy no-op", async () => {
  const prior: StateDocument = { profiles: [], sections: [], builtinOrders: {} };
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const flow = makeMutationFlow({
    api: { loadState: async () => prior },
    t: keyT,
    notify: () => {},
    reload: async () => {},
    getState: () => prior,
    pollInterval: 1,
    pollDeadline: 5,
  });
  const first = flow.run({ mutate: () => gate, agree: () => true });
  const second = await flow.run({ mutate: async () => {}, agree: () => true });
  expect(second.busy).toBe(true);
  release();
  expect((await first).ok).toBe(true);
});

test("runSave re-applies once on a stale revision and reports nothing", async () => {
  const notes: string[] = [];
  let attempts = 0;
  const reloads: number[] = [];
  const ok = await runSave(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("configuration changed since read (expected revision 1)");
    },
    async () => {
      reloads.push(1);
    },
    keyT,
    (message) => notes.push(message),
  );
  expect(ok).toBe(true);
  expect(attempts).toBe(2);
  expect(reloads).toHaveLength(2);
  expect(notes).toHaveLength(0);
});

test("runSave surfaces a non-conflict failure in the toast and the inline error line", async () => {
  const notes: string[] = [];
  const inline: string[] = [];
  let failures = 0;
  const ok = await runSave(
    async () => {
      failures += 1;
      throw new Error("internal error");
    },
    async () => {},
    keyT,
    (message) => notes.push(message),
    (text) => inline.push(text),
  );
  expect(ok).toBe(false);
  expect(failures).toBe(1);
  expect(notes.at(-1)).toContain("internal error");
  expect(inline[0]).toBe("saveError internal error");
});

test("runSave reports a conflict that keeps failing under the conflict prefix", async () => {
  const notes: string[] = [];
  const ok = await runSave(
    async () => {
      throw new Error("configuration kept changing");
    },
    async () => {},
    keyT,
    (message) => notes.push(message),
  );
  expect(ok).toBe(false);
  expect(notes.at(-1)).toContain("conflictError");
  expect(notes.at(-1)).toContain("configuration kept changing");
});
