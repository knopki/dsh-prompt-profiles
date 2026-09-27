/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the Remote facade's write contract: patchId in `rowId`,
 *   whole-object `value` on updates, no client-generated ids, explicit none,
 *   single-key `last` — with envelopes unwrapped and conflicts classified.
 * #endregion moduleContract
 */
import { expect, test } from "vitest";
import { findEntry, optimisticEntry } from "../../src/client/flows.ts";
import { isRemoteConflict, makeRemoteApi, type RemoteScope } from "../../src/client/remote.ts";
import { unavailableApi } from "../../src/client/transport.ts";

/** A namespace recorder: keeps [method, args] and answers an ok envelope. */
function recorder() {
  const sent: Array<[string, Record<string, unknown>]> = [];
  const namespace = new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== "string") return undefined;
        return (args: Record<string, unknown>) => {
          sent.push([method, args]);
          return Promise.resolve({ ok: true, value: {} });
        };
      },
    },
  );
  return { sent, api: makeRemoteApi({ remote: { promptProfiles: namespace } } as RemoteScope) };
}

test("writes address the unqualified patchId and carry whole objects", async () => {
  const { sent, api } = recorder();
  await api.sectionUpdate("section-x", { title: "T", body: "B" });
  await api.profileUpdate("profile-y", { title: "P", sections: [{ id: "x", order: 10, scope: "inherit" }] });
  await api.sectionCreate({ title: "New section", body: "" });
  await api.profileCreate({ title: "New profile", sections: [] });
  await api.sectionDelete("section-x");
  await api.profileDelete("profile-y");
  await api.sectionRename("section-x", "renamed");
  await api.setDefault("light");
  await api.loadState();
  const byMethod = Object.fromEntries(sent);

  expect(byMethod.sectionUpdate).toEqual({ rowId: "section-x", value: { title: "T", body: "B" } });
  expect(byMethod.sectionUpdate).not.toHaveProperty("ops");
  expect(byMethod.profileUpdate).toEqual({
    rowId: "profile-y",
    value: { title: "P", sections: [{ id: "x", order: 10, scope: "inherit" }] },
  });
  expect(byMethod.profileUpdate).not.toHaveProperty("ops");
  expect(byMethod.sectionCreate).toEqual({ title: "New section", body: "" });
  expect(byMethod.profileCreate).toEqual({ title: "New profile", sections: [] });
  expect(byMethod.sectionDelete).toEqual({ rowId: "section-x" });
  expect(byMethod.profileDelete).toEqual({ rowId: "profile-y" });
  expect(byMethod.sectionRename).toEqual({ rowId: "section-x", id: "renamed" });
  expect(byMethod.defaultSet).toEqual({ profileId: "light" });
  expect(byMethod.state).toEqual({});
});

test("last is keyed by exactly one workspace key", async () => {
  const { sent, api } = recorder();
  await api.last({ profileId: "light", cwd: "/work/repo" });
  await api.last({ profileId: "light", workspaceId: "ws1" });
  expect(sent[0][1]).toEqual({ workspaceId: undefined, cwd: "/work/repo", profileId: "light" });
  expect(sent[1][1]).toEqual({ workspaceId: "ws1", cwd: undefined, profileId: "light" });
});

test("an ok envelope resolves to its value; an error envelope rejects with the host message", async () => {
  const scope = {
    remote: {
      promptProfiles: {
        state: () => Promise.resolve({ ok: true, value: { profiles: [] } }),
        preview: () =>
          Promise.resolve({ ok: false, error: { code: "gateway/internal", message: 'profile "ghost" is unknown' } }),
      },
    },
  } as unknown as RemoteScope;
  const api = makeRemoteApi(scope);
  await expect(api.loadState()).resolves.toEqual({ profiles: [] });
  const failure = await api.preview("ghost").then(
    () => null,
    (err: Error & { code?: string }) => err,
  );
  expect(failure?.message).toBe('profile "ghost" is unknown');
  expect(failure?.code).toBe("gateway/internal");
});

test("the conflict classifier recognises the two stale-revision messages (and a 409)", () => {
  expect(isRemoteConflict(new Error("configuration changed since read (expected revision 7)"))).toBe(true);
  expect(isRemoteConflict(new Error("configuration kept changing"))).toBe(true);
  expect(isRemoteConflict({ status: 409, message: "whatever" })).toBe(true);
  expect(isRemoteConflict(new Error("boom"))).toBe(false);
  expect(isRemoteConflict(undefined)).toBe(false);
});

test("findEntry locates a row by patchId, configId or rowId and misses cleanly", () => {
  expect(findEntry({ sections: [{ patchId: "section-x", title: "X" }], profiles: [] }, "section-x")).toBeTruthy();
  expect(
    findEntry({ sections: [], profiles: [{ configId: "main", patchId: "main", title: "Main" }] }, "main"),
  ).toBeTruthy();
  expect(findEntry({ sections: [], profiles: [] }, "nope")).toBeNull();
});

test("optimisticEntry shapes a create response like a state row", () => {
  const section = optimisticEntry("section", { patchId: "s1", configId: "s1", title: "S", body: "B" });
  expect(section).toMatchObject({ patchId: "s1", configId: "s1", title: "S", body: "B", source: "user", emits: true });
  expect(optimisticEntry("section", { patchId: "s2", configId: "s2", title: "S", body: "  " }).emits).toBe(false);
  expect(optimisticEntry("profile", { patchId: "p1", configId: "p1", title: "P", sections: [] })).toMatchObject({
    patchId: "p1",
    source: "user",
    sections: [],
  });
});

test("before the mount settles every api method refuses with the dictionary message", async () => {
  for (const method of [
    "loadState",
    "preview",
    "sectionUpdate",
    "last",
    "profileDelete",
    "setDefault",
    "sectionRename",
  ] as const) {
    const refused = await (unavailableApi[method] as (...args: unknown[]) => Promise<unknown>)("a", "b").then(
      () => null,
      (err: Error) => err,
    );
    expect(refused?.message, method).toBe(
      "Prompt profiles are unavailable: the Remote connection is not mounted. Reload the page.",
    );
  }
});
