/**
 * The Profiles tab and its outline editor on real React + jsdom: the list with
 * its section count and no default marker, the modal-free create wired to the
 * flow with the default title, duplicate/delete through the confirmation and
 * the optimistic mutation flow (disabled while in flight), the default-profile
 * selector, and the outline editor — built-in/broken rows, the honest counter,
 * title and refs autosave with flush on leave, drag & drop and keyboard
 * reordering, scope, ref removal and the add-section picker.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RemoteApi } from "../../src/client/remote.ts";
import type { ProfilesTabProps } from "../../src/client/settings-profiles.tsx";
import { ProfilesTab } from "../../src/client/settings-profiles.tsx";
import { keyT, profileMain, stateOf } from "./harness.ts";

const noop = () => {};
const never = <T,>() => new Promise<T>(() => {});
const resolved = () => Promise.resolve({} as never);

function apiOf(overrides: Partial<Record<keyof RemoteApi, unknown>> = {}): RemoteApi {
  return {
    loadState: () => Promise.resolve(stateOf()),
    profileCreate: resolved,
    profileUpdate: resolved,
    profileDelete: resolved,
    setDefault: resolved,
    sectionCreate: resolved,
    ...overrides,
  } as unknown as RemoteApi;
}

const tabProps = (overrides: Partial<ProfilesTabProps> = {}): ProfilesTabProps => ({
  state: stateOf(),
  api: apiOf(),
  reload: () => Promise.resolve(),
  t: keyT,
  notify: noop,
  drill: null,
  setDrill: noop,
  onOpenSection: noop,
  setState: noop,
  createFlow: { create: () => Promise.resolve({ ok: true }), isBusy: () => false },
  ...overrides,
});

afterEach(cleanup);

test("the list shows profiles with their section count and no default marker", () => {
  render(<ProfilesTab {...tabProps({ state: stateOf({ default: "main" }) })} />);
  expect(screen.getAllByText("Main").length).toBeGreaterThan(0);
  expect(screen.getByText("1 sectionsWord")).toBeTruthy();
  expect(screen.queryByText("★")).toBeNull();
  expect(screen.getByText("defaultForNewSessions")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("an empty profile list says so and still offers creation", () => {
  render(<ProfilesTab {...tabProps({ state: stateOf({ profiles: [] }) })} />);
  expect(screen.getByText("noProfiles")).toBeTruthy();
  expect(screen.getByRole("button", { name: "newProfile" })).toBeTruthy();
});

test("the modal-free create posts the default title payload", () => {
  const calls: Array<[string, unknown]> = [];
  render(
    <ProfilesTab
      {...tabProps({
        createFlow: {
          create: (kind: string, value: unknown) => {
            calls.push([kind, value]);
            return Promise.resolve({ ok: true });
          },
          isBusy: () => false,
        },
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "newProfile" }));
  expect(calls).toEqual([["profile", { title: "defaultProfileTitle", sections: [] }]]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the create button is disabled while the real create flow is in flight", async () => {
  const { createFlow: _omitted, ...props } = tabProps({ api: apiOf({ profileCreate: () => never() }) });
  render(<ProfilesTab {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "newProfile" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "creating" })).toHaveProperty("disabled", true));
  expect(screen.getByRole("button", { name: "creating" })).toBeTruthy();
});

test("delete asks for confirmation and then calls the flow with the patchId", async () => {
  const deleted: unknown[] = [];
  render(
    <ProfilesTab
      {...tabProps({
        api: apiOf({
          profileDelete: (patchId: string) => {
            deleted.push(patchId);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "deleteLabel" })[0]);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.getAttribute("aria-label")).toBe("confirmDeleteProfile");
  expect(dialog.textContent).toContain("Main");
  fireEvent.click(screen.getAllByRole("button", { name: "deleteLabel" }).at(-1) as HTMLElement);
  await waitFor(() => expect(deleted).toEqual(["prompt-profile-main"]));
});

test("cancelling the delete confirmation sends nothing", async () => {
  const deleted: unknown[] = [];
  render(
    <ProfilesTab
      {...tabProps({
        api: apiOf({
          profileDelete: (patchId: string) => {
            deleted.push(patchId);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "deleteLabel" })[0]);
  await screen.findByRole("dialog");
  fireEvent.click(screen.getAllByRole("button", { name: "cancel" }).at(-1) as HTMLElement);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(deleted).toEqual([]);
});

test("duplicate creates a copy under the localized suffix and stays disabled while in flight", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const created: unknown[] = [];
  render(
    <ProfilesTab
      {...tabProps({
        api: apiOf({
          profileCreate: (value: unknown) => {
            created.push(value);
            return gate.then(() => ({ patchId: "prompt-profile-copy", configId: "copy" }));
          },
          loadState: () =>
            Promise.resolve(
              stateOf({
                profiles: [
                  profileMain,
                  {
                    rowId: "c",
                    patchId: "prompt-profile-copy",
                    configId: "copy",
                    title: "Main (copySuffix)",
                    sections: [],
                  },
                ],
              }),
            ),
        }),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "duplicate" }));
  await waitFor(() =>
    expect(created).toEqual([
      { title: "Main copySuffix", sections: [{ id: "prompt-section-greeting", order: 10, scope: "inherit" }] },
    ]),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "duplicate" })).toHaveProperty("disabled", true));
  release();
});

test("the default selector picks a profile id and maps none to an empty string", async () => {
  const picked: string[] = [];
  render(
    <ProfilesTab
      {...tabProps({
        api: apiOf({
          setDefault: (value: string) => {
            picked.push(value);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "defaultForNewSessions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "none" }));
  await waitFor(() => expect(picked).toEqual([""]));

  fireEvent.click(screen.getByRole("button", { name: "defaultForNewSessions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Main" }));
  await waitFor(() => expect(picked).toEqual(["", "main"]));
});

test("the outline renders built-in, own and broken rows with an honest counter", () => {
  const profile = {
    ...profileMain,
    sections: [
      { id: "prompt-section-greeting", order: 10, scope: "inherit" },
      { id: "prompt-section-missing", order: 20, scope: "inherit" },
    ],
  };
  render(<ProfilesTab {...tabProps({ state: stateOf({ profiles: [profile] }), drill: "main" })} />);
  expect(screen.getByText("persona-prefix")).toBeTruthy();
  expect(screen.getByText("plan:policy")).toBeTruthy();
  expect(screen.getAllByText("builtIn")).toHaveLength(2);
  expect(screen.getByText("1 sectionsWord · 1 brokenWord")).toBeTruthy();
  expect(screen.getByText(/missingSection/)).toBeTruthy();
  // A broken ref carries no order input: it renders its order as text instead.
  const orders = screen.getAllByLabelText("orderLabel") as HTMLInputElement[];
  expect(orders.map((input) => input.value)).toEqual(["10"]);
  expect(screen.getByText("20")).toBeTruthy();
});

test("leaving the outline flushes a pending title edit as a whole-object update", async () => {
  const updates: Array<[string, unknown]> = [];
  render(
    <ProfilesTab
      {...tabProps({
        drill: "main",
        api: apiOf({
          profileUpdate: (patchId: string, value: unknown) => {
            updates.push([patchId, value]);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.change(screen.getByDisplayValue("Main"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  await waitFor(() => expect(updates).toHaveLength(1));
  expect(updates[0][0]).toBe("prompt-profile-main");
  expect(updates[0][1]).toEqual({
    title: "Renamed",
    sections: [{ id: "prompt-section-greeting", order: 10, scope: "inherit" }],
  });
});

test("leaving the outline flushes a pending refs edit", async () => {
  const updates: Array<[string, unknown]> = [];
  const back = vi.fn();
  render(
    <ProfilesTab
      {...tabProps({
        drill: "main",
        setDrill: back,
        api: apiOf({
          profileUpdate: (patchId: string, value: unknown) => {
            updates.push([patchId, value]);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.change(screen.getByLabelText("orderLabel"), { target: { value: "42" } });
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  await waitFor(() => expect(updates).toHaveLength(1));
  expect(updates[0][1]).toEqual({
    title: "Main",
    sections: [{ id: "prompt-section-greeting", order: 42, scope: "inherit" }],
  });
  expect(back).toHaveBeenCalledWith(null);
});

test("drag & drop reorders the ref to an integer order at the drop boundary", () => {
  const profile = {
    ...profileMain,
    sections: [
      { id: "prompt-section-greeting", order: 100, scope: "inherit" },
      { id: "prompt-section-bundle", order: 200, scope: "inherit" },
    ],
  };
  const view = render(
    <ProfilesTab {...tabProps({ state: stateOf({ profiles: [profile], builtinOrders: {} }), drill: "main" })} />,
  );
  const dataTransfer = {
    effectAllowed: "",
    payload: "",
    setData(_format: string, value: string) {
      this.payload = value;
    },
    getData() {
      return this.payload;
    },
  };
  const grip = view.container.querySelector('[data-drag-handle="0"]') as HTMLElement;
  expect(grip).toBeTruthy();
  fireEvent.dragStart(grip, { dataTransfer });
  const zones = view.container.querySelectorAll("[data-drop-index]");
  fireEvent.drop(zones[zones.length - 1], { dataTransfer });
  // The moved ref also MOVES in the array, so the inputs re-render in the new order.
  const orders = (screen.getAllByLabelText("orderLabel") as HTMLInputElement[]).map((input) => input.value);
  expect(orders).toEqual(["200", "201"]);
  expect(orders.every((value) => Number.isInteger(Number(value)))).toBe(true);
});

test("the drag grip moves a row with the arrow keys", () => {
  const profile = {
    ...profileMain,
    sections: [
      { id: "prompt-section-greeting", order: 100, scope: "inherit" },
      { id: "prompt-section-bundle", order: 300, scope: "inherit" },
    ],
  };
  const view = render(
    <ProfilesTab {...tabProps({ state: stateOf({ profiles: [profile], builtinOrders: {} }), drill: "main" })} />,
  );
  const orders = () => (screen.getAllByLabelText("orderLabel") as HTMLInputElement[]).map((input) => input.value);
  const gripFor = (seq: number) => view.container.querySelector(`[data-drag-handle="${seq}"]`) as HTMLElement;
  fireEvent.keyDown(gripFor(0), { key: "ArrowDown" });
  expect(orders()).toEqual(["300", "301"]);
  fireEvent.keyDown(gripFor(1), { key: "ArrowUp" });
  expect(orders()).toEqual(["299", "300"]);
  fireEvent.keyDown(gripFor(0), { key: "ArrowUp" });
  expect(orders()).toEqual(["299", "300"]);
  fireEvent.keyDown(gripFor(0), { key: "Enter" });
  expect(orders()).toEqual(["299", "300"]);
});

test("the scope selector is per occurrence and updates only its own ref", () => {
  const profile = {
    ...profileMain,
    sections: [
      { id: "prompt-section-greeting", order: 10, scope: "inherit" },
      { id: "prompt-section-greeting", order: 20, scope: "main-only" },
    ],
  };
  render(<ProfilesTab {...tabProps({ state: stateOf({ profiles: [profile] }), drill: "main" })} />);
  expect(screen.queryByText("scopeLabel: scopeInherit")).toBeTruthy();
  expect(screen.queryByText("scopeLabel: scopeMainOnly")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "scopeLabel: scopeMainOnly" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "scopeSubagentsOnly" }));
  expect(screen.getByRole("button", { name: "scopeLabel: scopeSubagentsOnly" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "scopeLabel: scopeInherit" })).toBeTruthy();
});

test("removing a ref is confirmed and drops only that occurrence", async () => {
  const profile = {
    ...profileMain,
    sections: [
      { id: "prompt-section-greeting", order: 10, scope: "inherit" },
      { id: "prompt-section-greeting", order: 20, scope: "main-only" },
    ],
  };
  render(<ProfilesTab {...tabProps({ state: stateOf({ profiles: [profile] }), drill: "main" })} />);
  expect(screen.getAllByLabelText("orderLabel")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "remove" })[0]);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.getAttribute("aria-label")).toBe("confirmRemoveRef");
  fireEvent.click(screen.getAllByRole("button", { name: "remove" }).at(-1) as HTMLElement);
  await waitFor(() => expect(screen.getAllByLabelText("orderLabel")).toHaveLength(1));
  expect((screen.getByLabelText("orderLabel") as HTMLInputElement).value).toBe("20");
});

test("the add-section picker appends the picked ids verbatim", async () => {
  render(<ProfilesTab {...tabProps({ drill: "main" })} />);
  fireEvent.click(screen.getByRole("button", { name: "addSection" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("pickerTitle");
  const option = screen.getByRole("checkbox");
  expect(option.closest("label")?.textContent).toBe("Bundle section");
  fireEvent.click(option);
  fireEvent.click(screen.getByRole("button", { name: "pickerAdd (1)" }));
  await waitFor(() => expect(screen.getAllByLabelText("orderLabel")).toHaveLength(2));
  const orders = (screen.getAllByLabelText("orderLabel") as HTMLInputElement[]).map((input) => input.value);
  expect(orders).toEqual(["10", "110"]);
});

test("the complete-mode warning lists the modes that discard sections", () => {
  render(
    <ProfilesTab
      {...tabProps({
        drill: "main",
        state: stateOf({ modes: [{ id: "minimal", title: "minimal", complete: true }] }),
      })}
    />,
  );
  expect(screen.getByText(/completeModeWarning/)).toBeTruthy();
  expect(screen.getByText(/minimal/)).toBeTruthy();
});

test("an empty body is called out in the outline", () => {
  const profile = {
    ...profileMain,
    sections: [{ id: "prompt-section-bundle", order: 10, scope: "inherit" }],
  };
  render(<ProfilesTab {...tabProps({ state: stateOf({ profiles: [profile] }), drill: "main" })} />);
  expect(screen.getByText("emptyBody")).toBeTruthy();
});

test("a missing drilled profile falls back to the list", () => {
  render(<ProfilesTab {...tabProps({ drill: "ghost" })} />);
  expect(screen.getByRole("button", { name: "newProfile" })).toBeTruthy();
});
