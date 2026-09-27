/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the Preview tab on real React + jsdom: selector, ordered
 *   sections with collapsed built-in groups, skip reasons, the empty state,
 *   and the honesty flags where interpolation stays illustrative.
 * #endregion moduleContract
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { RemoteApi } from "../../src/client/remote.ts";
import { PreviewTab } from "../../src/client/settings-preview.tsx";
import { keyT, stateOf } from "./harness.ts";

const noop = () => {};

afterEach(cleanup);

test("the pane names the profile selector and shows our sections in final order", async () => {
  const api = {
    preview: () =>
      Promise.resolve({
        profileId: "main",
        sections: [
          { builtin: true, title: "persona-prefix" },
          { builtin: true, title: "plan:policy" },
          { id: "prompt-section-greeting", title: "Greeting", order: 10, text: "Be kind." },
        ],
        skipped: [{ id: "ghost", title: "Ghost", reason: "missing" }],
      }),
  } as unknown as RemoteApi;
  render(<PreviewTab state={stateOf()} api={api} t={keyT} notify={noop} />);
  expect(screen.getByText("profileWord")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("Be kind.")).toBeTruthy());
  expect(screen.getByText("10")).toBeTruthy();
  expect(screen.getByText(/Greeting/)).toBeTruthy();
  expect(screen.getByText(/builtinMarker\s+persona-prefix, plan:policy/)).toBeTruthy();
  expect(screen.getByText(/skippedMarker Ghost — missing/)).toBeTruthy();
});

test("a profile that emits nothing gets an explicit empty state with the skipped refs", async () => {
  const api = {
    preview: () =>
      Promise.resolve({
        profileId: "main",
        sections: [],
        skipped: [{ id: "ghost", title: "Ghost", reason: "missing" }],
      }),
  } as unknown as RemoteApi;
  render(<PreviewTab state={stateOf()} api={api} t={keyT} notify={noop} />);
  await waitFor(() => expect(screen.getByText("previewEmpty")).toBeTruthy());
  expect(screen.getByText(/skippedMarker Ghost — missing/)).toBeTruthy();
});

test("a section using an interpolation variable is flagged with the variable name", async () => {
  const api = {
    preview: () =>
      Promise.resolve({
        profileId: "main",
        sections: [{ id: "prompt-section-greeting", title: "Greeting", order: 10, text: "Hello {{cwd}}" }],
        skipped: [],
        variables: { cwd: "/repo", model: null },
      }),
  } as unknown as RemoteApi;
  render(<PreviewTab state={stateOf()} api={api} t={keyT} notify={noop} />);
  await waitFor(() => expect(screen.getByText(/previewVariables/)).toBeTruthy());
  expect(screen.getByText(/previewVariables/).textContent).toBe("⚠ previewVariables");
  expect(screen.getAllByText(/\{\{cwd\}\}/).length).toBeGreaterThan(0);
});

test("a variable-free section carries no marker", async () => {
  const api = {
    preview: () =>
      Promise.resolve({
        profileId: "main",
        sections: [{ id: "prompt-section-greeting", title: "Greeting", order: 10, text: "plain" }],
        skipped: [],
        variables: { cwd: "/repo" },
      }),
  } as unknown as RemoteApi;
  render(<PreviewTab state={stateOf()} api={api} t={keyT} notify={noop} />);
  await waitFor(() => expect(screen.getByText("plain")).toBeTruthy());
  expect(screen.queryByText(/previewVariables/)).toBeNull();
});

test("no profile means no preview request and an explicit empty state", () => {
  const calls: string[] = [];
  const api = {
    preview: (profileId: string) => {
      calls.push(profileId);
      return Promise.resolve({});
    },
  } as unknown as RemoteApi;
  render(<PreviewTab state={stateOf({ profiles: [], default: undefined })} api={api} t={keyT} notify={noop} />);
  expect(screen.getByText("noProfiles")).toBeTruthy();
  expect(calls).toEqual([]);
});

test("picking another profile re-reads the preview for it", async () => {
  const requested: string[] = [];
  const api = {
    preview: (profileId: string) => {
      requested.push(profileId);
      return Promise.resolve({ profileId, sections: [], skipped: [] });
    },
  } as unknown as RemoteApi;
  const other = { rowId: "prompt-profile-light", patchId: "light", configId: "light", title: "Light", sections: [] };
  render(
    <PreviewTab
      state={stateOf({ profiles: [...(stateOf().profiles ?? []), other], default: "main" })}
      api={api}
      t={keyT}
      notify={noop}
    />,
  );
  await waitFor(() => expect(requested).toEqual(["main"]));
  fireEvent.click(screen.getByRole("button", { name: "previewProfile" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Light" }));
  await waitFor(() => expect(requested).toEqual(["main", "light"]));
});

test("a failed preview read reports through the notify path", async () => {
  const notes: string[] = [];
  const api = {
    preview: () => Promise.reject(new Error("profile is not registered")),
  } as unknown as RemoteApi;
  render(<PreviewTab state={stateOf()} api={api} t={keyT} notify={(message) => notes.push(message)} />);
  await waitFor(() => expect(notes).toEqual(["loadError profile is not registered"]));
});
