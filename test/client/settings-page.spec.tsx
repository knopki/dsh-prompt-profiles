/**
 * The settings page shell on real React + jsdom: the placeholder until the
 * first state read, the scroll container contract (our root is the scroller with
 * a stable gutter), the three tabs, the per-tab drill-down with back/Esc/
 * repeated-tab dismissal, and the failed-load notice.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { RemoteApi } from "../../src/client/remote.ts";
import { PromptProfilesSection } from "../../src/client/settings-page.tsx";
import { keyT, never, stateOf } from "./harness.ts";

const noopApi = (): RemoteApi => ({ loadState: never }) as unknown as RemoteApi;
const loadedApi = (): RemoteApi =>
  ({
    loadState: () => Promise.resolve(stateOf()),
    preview: () => Promise.resolve({ profileId: "main", sections: [], skipped: [] }),
    sectionUpdate: () => Promise.resolve({}),
    profileUpdate: () => Promise.resolve({}),
  }) as unknown as RemoteApi;

afterEach(cleanup);

test("renders a loading placeholder — never a tab against a missing document", () => {
  const view = render(<PromptProfilesSection t={keyT} api={noopApi()} />);
  expect(view.container.textContent).toContain("…");
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("the page root is the scroller with a stable gutter", () => {
  const view = render(<PromptProfilesSection t={keyT} api={noopApi()} />);
  const root = view.container.firstElementChild as HTMLElement;
  expect(root.style.scrollbarGutter).toBe("stable");
  expect(root.style.overflowY).toBe("auto");
  expect(root.style.height).toBe("100%");
  expect(root.style.boxSizing).toBe("border-box");
});

test("the three tabs are labeled, addressable and selectable", async () => {
  render(<PromptProfilesSection t={keyT} api={loadedApi()} />);
  await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("nav");
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((tab) => tab.id)).toEqual(["pp-tab-profiles", "pp-tab-sections", "pp-tab-preview"]);
  expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
    "pp-tab-profiles-panel",
    "pp-tab-sections-panel",
    "pp-tab-preview-panel",
  ]);
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");

  fireEvent.click(screen.getByRole("tab", { name: "tabSections" }));
  await waitFor(() => expect(screen.getByText("Greeting")).toBeTruthy());

  fireEvent.click(screen.getByRole("tab", { name: "tabPreview" }));
  await waitFor(() => expect(screen.getByText("profileWord")).toBeTruthy());
});

test("a repeated click on the active tab dismisses its drill-down", async () => {
  render(<PromptProfilesSection t={keyT} api={loadedApi()} />);
  await waitFor(() => expect(screen.getAllByText("Main").length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByText("Main")[0]);
  await waitFor(() => expect(screen.getByText("builtInNote")).toBeTruthy());
  fireEvent.click(screen.getByRole("tab", { name: "tabProfiles" }));
  await waitFor(() => expect(screen.queryByText("builtInNote")).toBeNull());
});

test("Esc closes the drill-down but never while the user is typing in a field", async () => {
  render(<PromptProfilesSection t={keyT} api={loadedApi()} />);
  await waitFor(() => expect(screen.getAllByText("Main").length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByText("Main")[0]);
  await waitFor(() => expect(screen.getByText("builtInNote")).toBeTruthy());

  const titleField = screen.getByDisplayValue("Main");
  fireEvent.keyDown(titleField, { key: "Escape" });
  expect(screen.getByText("builtInNote")).toBeTruthy();

  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByText("builtInNote")).toBeNull());
});

test("drilling into a section from the outline switches tabs and Esc returns to the list", async () => {
  render(<PromptProfilesSection t={keyT} api={loadedApi()} />);
  await waitFor(() => expect(screen.getAllByText("Main").length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByText("Main")[0]);
  await waitFor(() => expect(screen.getByText("builtInNote")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "openInSectionTab" }));
  await waitFor(() => expect(screen.getByDisplayValue("Be kind.")).toBeTruthy());
  expect(screen.getByRole("tab", { name: "tabSections" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.getByPlaceholderText("searchPlaceholder")).toBeTruthy());
});

test("a failed state read surfaces the dictionary message in the toast banner", async () => {
  render(
    <PromptProfilesSection
      t={keyT}
      api={
        {
          loadState: () => Promise.reject(new Error("gateway is down")),
        } as unknown as RemoteApi
      }
    />,
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByRole("alert").textContent).toBe("loadError gateway is down");
});
