/**
 * The Sections tab and its editor on real React + jsdom: the searchable list
 * with used-in titles, source badges and the empty-body marker, the modal-free
 * create, and the editor — the autosave gate (no write before the poll confirms
 * the row, no empty title), the flush on blur and on leave, the rename dialog
 * (pre-filled configId, verbatim send, doubled-prefix guard, no-op on an
 * unchanged id, empty-id hint, affected-profile notice), duplicate opening the
 * copy, delete confirmation and the bundle-owned id lock.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RowEntry, StateDocument } from "../../src/client/model.ts";
import type { RemoteApi } from "../../src/client/remote.ts";
import type { SectionFormProps } from "../../src/client/settings-sections.tsx";
import { SectionForm, SectionsTab } from "../../src/client/settings-sections.tsx";
import { keyT, profileMain, sectionBundle, sectionGreeting, stateOf } from "./harness.ts";

const noop = () => {};
const resolved = () => Promise.resolve({} as never);
const never = <T,>() => new Promise<T>(() => {});

function apiOf(overrides: Partial<Record<keyof RemoteApi, unknown>> = {}): RemoteApi {
  return {
    loadState: () => Promise.resolve(stateOf()),
    sectionCreate: resolved,
    sectionUpdate: resolved,
    sectionDelete: resolved,
    sectionRename: resolved,
    ...overrides,
  } as unknown as RemoteApi;
}

const formProps = (overrides: Partial<SectionFormProps> = {}): SectionFormProps => ({
  section: { ...sectionGreeting } as RowEntry,
  state: stateOf() as StateDocument,
  api: apiOf(),
  reload: () => Promise.resolve(),
  t: keyT,
  notify: noop,
  onBack: noop,
  onRenamed: noop,
  onDrill: noop,
  setState: noop,
  autoFocusTitle: false,
  ...overrides,
});

afterEach(cleanup);

test("the list shows used-in profile titles, localized scopes and a badge only for non-user rows", () => {
  const state = stateOf({
    sections: [
      {
        ...sectionGreeting,
        usedIn: [
          { profileId: "main", scope: "main-only" },
          { profileId: "ghost", scope: "inherit" },
        ],
      },
      { ...sectionBundle, usedIn: [] },
    ],
  });
  render(
    <SectionsTab
      state={state}
      api={apiOf()}
      reload={() => Promise.resolve()}
      t={keyT}
      notify={noop}
      drill={null}
      setDrill={noop}
      setState={noop}
      createFlow={{ create: () => Promise.resolve({ ok: true }), isBusy: () => false }}
    />,
  );
  // The list line names the profiles; the per-scope detail lives in the editor.
  expect(screen.getByText(/usedIn: Main, ghost/)).toBeTruthy();
  expect(screen.getAllByText(/sourceLabel:/)).toHaveLength(1);
  expect(screen.queryByText("sourceLabel: sourceUnknown")).toBeNull();
});

test("an unknown source carries the badge too and an empty body is marked", () => {
  render(
    <SectionsTab
      state={stateOf({ sections: [{ ...sectionBundle, source: "unknown" }] })}
      api={apiOf()}
      reload={() => Promise.resolve()}
      t={keyT}
      notify={noop}
      drill={null}
      setDrill={noop}
      setState={noop}
      createFlow={{ create: () => Promise.resolve({ ok: true }), isBusy: () => false }}
    />,
  );
  expect(screen.getByText("sourceLabel: sourceUnknown")).toBeTruthy();
  expect(screen.getByText("emptyBody")).toBeTruthy();
});

test("the list is searchable and says when it is empty", () => {
  const view = render(
    <SectionsTab
      state={stateOf({ sections: [] })}
      api={apiOf()}
      reload={() => Promise.resolve()}
      t={keyT}
      notify={noop}
      drill={null}
      setDrill={noop}
      setState={noop}
      createFlow={{ create: () => Promise.resolve({ ok: true }), isBusy: () => false }}
    />,
  );
  expect(screen.getByText("noSections")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), { target: { value: "nope" } });
  expect(view.container.textContent).toContain("noSections");
});

test("the modal-free create posts the default section payload", () => {
  const calls: Array<[string, unknown]> = [];
  render(
    <SectionsTab
      state={stateOf()}
      api={apiOf()}
      reload={() => Promise.resolve()}
      t={keyT}
      notify={noop}
      drill={null}
      setDrill={noop}
      setState={noop}
      createFlow={{
        create: (kind: string, value: unknown) => {
          calls.push([kind, value]);
          return Promise.resolve({ ok: true });
        },
        isBusy: () => false,
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "newSection" }));
  expect(calls).toEqual([["section", { title: "defaultSectionTitle", body: "" }]]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the create button is disabled while the real create flow is in flight", async () => {
  render(
    <SectionsTab
      state={stateOf()}
      api={apiOf({ sectionCreate: () => never() })}
      reload={() => Promise.resolve()}
      t={keyT}
      notify={noop}
      drill={null}
      setDrill={noop}
      setState={noop}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "newSection" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "creating" })).toHaveProperty("disabled", true));
});

test("clicking a row drills into it", () => {
  const drilled: Array<string | null> = [];
  render(
    <SectionsTab
      state={stateOf()}
      api={apiOf()}
      reload={() => Promise.resolve()}
      t={keyT}
      notify={noop}
      drill={null}
      setDrill={(id) => drilled.push(id)}
      setState={noop}
      createFlow={{ create: () => Promise.resolve({ ok: true }), isBusy: () => false }}
    />,
  );
  fireEvent.click(screen.getByText("Greeting"));
  expect(drilled).toEqual(["prompt-section-greeting"]);
});

test("the editor shows the inline error line with the server message", async () => {
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionUpdate: () => Promise.reject(new Error("internal error")),
        }),
      })}
    />,
  );
  const title = screen.getByDisplayValue("Greeting");
  fireEvent.change(title, { target: { value: "Renamed" } });
  fireEvent.focusOut(title);
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByRole("alert").textContent).toBe("saveError internal error");
});

test("the editor never writes before the poll confirmed the row", async () => {
  const updates: unknown[] = [];
  render(
    <SectionForm
      {...formProps({
        state: stateOf({ sections: [] }),
        api: apiOf({
          sectionUpdate: (...args: unknown[]) => {
            updates.push(args);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  const title = screen.getByDisplayValue("Greeting");
  fireEvent.change(title, { target: { value: "Renamed" } });
  fireEvent.focusOut(title);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(updates).toEqual([]);
});

test("an empty title is called out and never written", async () => {
  const updates: unknown[] = [];
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionUpdate: (...args: unknown[]) => {
            updates.push(args);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  const title = screen.getByDisplayValue("Greeting");
  fireEvent.change(title, { target: { value: "   " } });
  fireEvent.focusOut(title);
  await waitFor(() => expect(screen.getByText("titleRequired")).toBeTruthy());
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(updates).toEqual([]);
});

test("leaving the editor flushes a pending body edit as a whole-object update", async () => {
  const updates: Array<[string, unknown]> = [];
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionUpdate: (patchId: string, value: unknown) => {
            updates.push([patchId, value]);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.change(screen.getByDisplayValue("Be kind."), { target: { value: "Be nicer." } });
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  await waitFor(() => expect(updates).toHaveLength(1));
  expect(updates[0]).toEqual(["prompt-section-greeting", { title: "Greeting", body: "Be nicer." }]);
});

test("the editor renders used-in titles with localized scopes and the source badge", () => {
  const state = stateOf({ profiles: [{ ...profileMain, configId: "light", title: "Light tone" }] });
  render(
    <SectionForm
      {...formProps({
        section: {
          ...sectionGreeting,
          source: "bundle",
          usedIn: [
            { profileId: "light", scope: "main-only" },
            { profileId: "ghost", scope: "inherit" },
          ],
        },
        state,
      })}
    />,
  );
  expect(screen.getByText(/Light tone — scopeLabel: scopeMainOnly/)).toBeTruthy();
  expect(screen.getByText(/ghost — scopeLabel: scopeInherit/)).toBeTruthy();
  expect(screen.getByText("sourceLabel: sourceBundle")).toBeTruthy();
  // The raw enum only ever rides a key/id, never the visible text.
  expect(document.body.textContent ?? "").not.toContain("main-only");
});

test("two refs of one profile both render under unique React keys", () => {
  const errors: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  try {
    render(
      <SectionForm
        {...formProps({
          section: {
            ...sectionGreeting,
            usedIn: [
              { profileId: "light", scope: "inherit" },
              { profileId: "light", scope: "main-only" },
            ],
          },
          state: stateOf({ profiles: [{ ...profileMain, configId: "light", title: "Light tone" }] }),
        })}
      />,
    );
  } finally {
    spy.mockRestore();
  }
  expect(screen.getAllByText(/Light tone — scopeLabel:/)).toHaveLength(2);
  expect(errors.filter((message) => /same key/i.test(message))).toEqual([]);
});

test("a user-owned row shows no source badge in the editor", () => {
  render(<SectionForm {...formProps()} />);
  expect(screen.queryByText(/sourceLabel:/)).toBeNull();
});

test("a bundle-owned id cannot be changed and the reason is stated inline", () => {
  render(<SectionForm {...formProps({ section: { ...sectionBundle } })} />);
  const rename = screen.getByRole("button", { name: "renameId" });
  expect(rename).toHaveProperty("disabled", true);
  expect(rename.getAttribute("title")).toBe("renameIdLocked");
  expect(screen.getAllByText("renameIdLocked")).toHaveLength(1);
});

test("a user-owned id stays renameable", () => {
  render(<SectionForm {...formProps()} />);
  const rename = screen.getByRole("button", { name: "renameId" });
  expect(rename).toHaveProperty("disabled", false);
  expect(rename.getAttribute("title")).toBe("renameNote");
  expect(screen.queryByText("renameIdLocked")).toBeNull();
});

test("rename sends the typed id verbatim and drills into the stored one", async () => {
  const renamed: Array<[string, string]> = [];
  const drilled: Array<string | null> = [];
  const next = stateOf({
    sections: [
      {
        rowId: "prompt-section-123123",
        patchId: "prompt-section-123123",
        configId: "prompt-section-123123",
        title: "Greeting",
        body: "Be kind.",
      },
    ],
  });
  render(
    <SectionForm
      {...formProps({
        section: {
          rowId: "prompt-section-f01aa4a5",
          patchId: "prompt-section-f01aa4a5",
          configId: "prompt-section-f01aa4a5",
          title: "Greeting",
          body: "Be kind.",
        },
        state: next,
        api: apiOf({
          loadState: () => Promise.resolve(next),
          sectionRename: (patchId: string, id: string) => {
            renamed.push([patchId, id]);
            return Promise.resolve({});
          },
        }),
        onRenamed: (id: string) => drilled.push(id),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "renameId" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.getAttribute("aria-label")).toBe("confirmRename");
  expect(dialog.textContent).toContain("renameNote");
  const field = within(dialog).getByRole("textbox") as HTMLInputElement;
  expect(field.value).toBe("prompt-section-f01aa4a5");
  fireEvent.change(field, { target: { value: "123123" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "confirm" }));
  await waitFor(() => expect(renamed).toEqual([["prompt-section-f01aa4a5", "123123"]]));
  await waitFor(() => expect(drilled).toEqual(["prompt-section-123123"]));
});

test("a doubled prefix typed by the user collapses before the request", async () => {
  const renamed: Array<[string, string]> = [];
  const next = stateOf({
    sections: [
      {
        rowId: "prompt-section-abc",
        patchId: "prompt-section-abc",
        configId: "prompt-section-abc",
        title: "G",
        body: "",
      },
    ],
  });
  render(
    <SectionForm
      {...formProps({
        section: { rowId: "s2", patchId: "s2", configId: "s2", title: "G", body: "" },
        state: next,
        api: apiOf({
          loadState: () => Promise.resolve(next),
          sectionRename: (patchId: string, id: string) => {
            renamed.push([patchId, id]);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "renameId" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox"), {
    target: { value: "prompt-section-prompt-section-abc" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "confirm" }));
  await waitFor(() => expect(renamed).toEqual([["s2", "prompt-section-abc"]]));
});

test("an unchanged id closes the dialog without a request or a toast", async () => {
  const renamed: unknown[] = [];
  const notes: string[] = [];
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionRename: (...args: unknown[]) => {
            renamed.push(args);
            return Promise.resolve({});
          },
        }),
        notify: (message: string) => notes.push(message),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "renameId" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(renamed).toEqual([]);
  expect(notes).toEqual([]);
});

test("an empty id is blocked with an inline hint and no request", async () => {
  const renamed: unknown[] = [];
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionRename: (...args: unknown[]) => {
            renamed.push(args);
            return Promise.resolve({});
          },
        }),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "renameId" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "   " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "confirm" }));
  await waitFor(() => expect(within(dialog).getByText("renameEmpty")).toBeTruthy());
  expect(renamed).toEqual([]);
});

test("a successful rename names the profiles that still hold the old id", async () => {
  const notes: string[] = [];
  const next = stateOf({
    sections: [{ rowId: "new", patchId: "new", configId: "new", title: "Greeting", body: "" }],
  });
  render(
    <SectionForm
      {...formProps({
        section: { rowId: "f1", patchId: "f1", configId: "f1", title: "Greeting", body: "" },
        state: next,
        api: apiOf({
          loadState: () => Promise.resolve(next),
          sectionRename: () =>
            Promise.resolve({
              affectedProfiles: [
                { profileId: "p1", title: "Main" },
                { profileId: "p2", title: "Review" },
              ],
            }),
        }),
        notify: (message: string) => notes.push(message),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "renameId" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "new" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "confirm" }));
  await waitFor(() => expect(notes).toEqual(["renameAffected Main, Review"]));
});

test("a rename response without affectedProfiles shows no extra notice", async () => {
  const notes: string[] = [];
  const next = stateOf({
    sections: [{ rowId: "n", patchId: "n", configId: "n", title: "G", body: "" }],
  });
  render(
    <SectionForm
      {...formProps({
        section: { rowId: "f1", patchId: "f1", configId: "f1", title: "G", body: "" },
        state: next,
        api: apiOf({
          loadState: () => Promise.resolve(next),
          sectionRename: () => Promise.resolve({}),
        }),
        notify: (message: string) => notes.push(message),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "renameId" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "n" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "confirm" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(notes).toEqual([]);
});

test("duplicate opens the COPY, not the source row", async () => {
  const drilled: Array<string | null> = [];
  const copy = {
    rowId: "prompt-section-copy",
    patchId: "prompt-section-copy",
    configId: "prompt-section-copy",
    title: "Greeting copySuffix",
    body: "Be kind.",
  };
  const next = stateOf({ sections: [copy] });
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionCreate: () => Promise.resolve(copy),
          loadState: () => Promise.resolve(next),
        }),
        onDrill: (id: string | null) => drilled.push(id),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "duplicate" }));
  await waitFor(() => expect(drilled).toEqual(["prompt-section-copy"]));
});

test("delete is confirmed and returns to the list", async () => {
  const deleted: unknown[] = [];
  const backs: number[] = [];
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionDelete: (patchId: string) => {
            deleted.push(patchId);
            return Promise.resolve({});
          },
          loadState: () => Promise.resolve(stateOf({ sections: [] })),
        }),
        onBack: () => backs.push(1),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "deleteLabel" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.getAttribute("aria-label")).toBe("confirmDeleteSection");
  fireEvent.click(within(dialog).getByRole("button", { name: "deleteLabel" }));
  await waitFor(() => expect(deleted).toEqual(["prompt-section-greeting"]));
  await waitFor(() => expect(backs.length).toBeGreaterThan(0));
});

test("the lifecycle controls are disabled while a mutation is in flight", async () => {
  render(
    <SectionForm
      {...formProps({
        api: apiOf({
          sectionCreate: () => never(),
        }),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "duplicate" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "deleteLabel" })).toHaveProperty("disabled", true));
  expect(screen.getByRole("button", { name: "renameId" })).toHaveProperty("disabled", true);
});
