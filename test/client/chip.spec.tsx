/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the composer chip on real React + jsdom: visibility gates,
 *   host-resolved states, the blocked keyless choice, the complete-mode
 *   marker, and the debounced re-read after a settings mutation.
 * #endregion moduleContract
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { PromptProfileChip } from "../../src/client/chip.tsx";
import { notifyProfilesChanged, PROFILES_REFRESH_DEBOUNCE_MS } from "../../src/client/helpers.ts";
import type { StateDocument } from "../../src/client/model.ts";
import { chipProps, installRemoteApi, stateOf, storeHook } from "./harness.ts";

const light = { rowId: "prompt-profile-light", patchId: "light", configId: "light", title: "Light", sections: [] };
const main = { rowId: "prompt-profile-main", patchId: "main", configId: "main", title: "Main", sections: [] };
const twoProfiles: StateDocument = stateOf({ profiles: [light, main], default: "main", lastByWorkspace: {} });

const trigger = () => screen.getByRole("button", { name: "menuLabel" });

afterEach(cleanup);

test("refuses to render on a non-blank session or without any profile", async () => {
  const remote = installRemoteApi();
  remote.answer("state", twoProfiles);
  const view = render(<PromptProfileChip {...chipProps({ useSession: storeHook({ blank: false }) })} />);
  await waitFor(() => expect(remote.stateCalls().length).toBeGreaterThan(0));
  expect(view.container.innerHTML).toBe("");
  view.unmount();

  const empty = installRemoteApi();
  empty.answer("state", stateOf({ profiles: [] }));
  const second = render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(empty.stateCalls().length).toBeGreaterThan(0));
  expect(second.container.innerHTML).toBe("");
});

test("an absent key shows the default profile and offers none + the sorted profiles", async () => {
  const remote = installRemoteApi();
  remote.answer("state", twoProfiles);
  render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(screen.getByText("Main")).toBeTruthy());
  fireEvent.click(trigger());
  expect(await screen.findByRole("menuitem", { name: "none" })).toBeTruthy();
  expect(await screen.findByRole("menuitem", { name: "Light" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Main" })).toBeTruthy();
});

test("a stored empty string is an explicit None and the default must not be shown", async () => {
  const remote = installRemoteApi();
  remote.answer("state", { ...twoProfiles, lastByWorkspace: { "/work/repo": "" } });
  render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(trigger().textContent).toContain("none"));
  expect(trigger().textContent).not.toContain("Main");
});

test("a stored profile id shows that profile; a stale one falls back to the default", async () => {
  const stored = installRemoteApi();
  stored.answer("state", { ...twoProfiles, lastByWorkspace: { "/work/repo": "light" } });
  const first = render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(trigger().textContent).toContain("Light"));
  first.unmount();

  const stale = installRemoteApi();
  stale.answer("state", { ...twoProfiles, lastByWorkspace: { "/work/repo": "ghost" } });
  render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
});

test("an empty bundle title shows the id, never the no-selection string", async () => {
  const remote = installRemoteApi();
  remote.answer(
    "state",
    stateOf({
      profiles: [{ rowId: "prompt-profile-light", patchId: "light", configId: "light", title: "", sections: [] }],
      default: "light",
      lastByWorkspace: {},
    }),
  );
  render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(trigger().textContent).toContain("light"));
  expect(trigger().textContent).not.toContain("none");
});

test("choosing a profile always delivers exactly one key: the cwd when no workspace owns the session", async () => {
  const remote = installRemoteApi();
  let lastCalled = false;
  remote.answer("state", () => (lastCalled ? twoProfiles : twoProfiles));
  const picks: Array<Record<string, unknown>> = [];
  remote.answer("last", () => {
    lastCalled = true;
    return {};
  });
  render(
    <PromptProfileChip
      {...chipProps({
        pick: (choice) => {
          picks.push(choice as unknown as Record<string, unknown>);
          return Promise.resolve({});
        },
      })}
    />,
  );
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
  fireEvent.click(trigger());
  fireEvent.click(await screen.findByRole("menuitem", { name: "Light" }));
  await waitFor(() => expect(picks).toHaveLength(1));
  expect(picks[0]).toEqual({ profileId: "light", cwd: "/work/repo" });
});

test("with a workspace accounted to the session the choice is keyed by workspaceId alone", async () => {
  const remote = installRemoteApi();
  remote.answer("state", twoProfiles);
  const picks: Array<Record<string, unknown>> = [];
  render(
    <PromptProfileChip
      {...chipProps({
        useWorkspaces: storeHook({ items: [{ workspaceId: "ws1", path: "/work/repo", sessionIds: ["sid"] }] }),
        pick: (choice) => {
          picks.push(choice as unknown as Record<string, unknown>);
          return Promise.resolve({});
        },
      })}
    />,
  );
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
  fireEvent.click(trigger());
  fireEvent.click(await screen.findByRole("menuitem", { name: "Light" }));
  await waitFor(() => expect(picks).toHaveLength(1));
  expect(picks[0]).toEqual({ profileId: "light", workspaceId: "ws1" });
});

test("choosing None keeps the host's explicit-empty marker after the refresh", async () => {
  const remote = installRemoteApi();
  let lastCalled = false;
  remote.answer("state", () => (lastCalled ? { ...twoProfiles, lastByWorkspace: { "/work/repo": "" } } : twoProfiles));
  render(
    <PromptProfileChip
      {...chipProps({
        pick: () => {
          lastCalled = true;
          return Promise.resolve({});
        },
      })}
    />,
  );
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
  fireEvent.click(trigger());
  fireEvent.click(await screen.findByRole("menuitem", { name: "none" }));
  await waitFor(() => expect(trigger().textContent).toContain("none"));
  expect(trigger().textContent).not.toContain("Main");
});

test("without a workspace key the choice is blocked with an explanation and no request", async () => {
  const remote = installRemoteApi();
  remote.answer("state", twoProfiles);
  const picks: unknown[] = [];
  render(
    <PromptProfileChip
      {...chipProps({
        useSessions: storeHook({ byId: {} }),
        pick: (choice) => {
          picks.push(choice);
          return Promise.resolve({});
        },
      })}
    />,
  );
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
  expect(trigger().getAttribute("title")).toBe("chooseNeedsWorkspace");
  fireEvent.click(trigger());
  fireEvent.click(await screen.findByRole("menuitem", { name: "Light" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByRole("alert").textContent).toBe("chooseNeedsWorkspace");
  expect(picks).toEqual([]);
  expect(remote.calls.some((call) => call.method === "last")).toBe(false);
});

test("a failed choice restores the previous state and notifies the server message", async () => {
  const remote = installRemoteApi();
  remote.answer("state", twoProfiles);
  render(
    <PromptProfileChip
      {...chipProps({
        pick: () => Promise.reject(new Error("writer: row is locked")),
      })}
    />,
  );
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
  fireEvent.click(trigger());
  fireEvent.click(await screen.findByRole("menuitem", { name: "Light" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByRole("alert").textContent).toBe("saveError writer: row is locked");
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
});

test("a complete active mode marks the trigger and names the mode", async () => {
  const remote = installRemoteApi();
  remote.answer(
    "state",
    stateOf({
      profiles: [light],
      default: "light",
      lastByWorkspace: {},
      modes: [{ id: "minimal", title: "minimal", complete: true }],
      sections: [],
    }),
  );
  const view = render(
    <PromptProfileChip
      {...chipProps({
        useSessions: storeHook({
          byId: { sid: { cwd: "/work/repo", projectionValues: { agentPreset: "minimal" } } },
        }),
      })}
    />,
  );
  await waitFor(() => expect(trainText(view)).toContain("completeModeWarning minimal"));
  const marker = view.container.querySelector("[data-complete-warning]");
  expect(marker?.getAttribute("data-complete-warning")).toBe("minimal");
  expect(trigger().getAttribute("title")).toBe("completeModeWarning minimal");
  expect(trigger().style.opacity).toBe("0.6");
});

test("a failed state read issues the read and leaves the chip unrendered", async () => {
  // The chip renders null while it has no state, so its own failed-load notice
  // never reaches the DOM; the notify → banner wiring is covered by the
  // settings page's loadError test (settings-page.spec.tsx).
  const remote = installRemoteApi();
  remote.fail("state", { message: "gateway is down" });
  const view = render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(remote.stateCalls().length).toBeGreaterThan(0));
  expect(view.container.innerHTML).toBe("");
});

test("a burst of settings mutations collapses into ONE debounced re-read", async () => {
  const remote = installRemoteApi();
  remote.answer("state", twoProfiles);
  render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
  const before = remote.stateCalls().length;

  remote.answer("state", { ...twoProfiles, profiles: [main], lastByWorkspace: { "/work/repo": "light" } });
  notifyProfilesChanged();
  notifyProfilesChanged();
  notifyProfilesChanged();
  expect(remote.stateCalls().length).toBe(before);
  await waitFor(() => expect(remote.stateCalls().length).toBe(before + 1), {
    timeout: PROFILES_REFRESH_DEBOUNCE_MS + 1000,
  });
  await waitFor(() => expect(trigger().textContent).toContain("Main"));
  fireEvent.click(trigger());
  expect(await screen.findByRole("menuitem", { name: "Main" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Light" })).toBeNull();
});

function trainText(view: { container: HTMLElement }): string {
  const marker = view.container.querySelector("[data-complete-warning]");
  return `${view.container.textContent ?? ""} ${marker ? trigger().getAttribute("title") : ""}`;
}
