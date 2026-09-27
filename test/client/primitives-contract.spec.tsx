/**
 * #region moduleContract
 * @modulecontract
 * @purpose Pin the installed primitives' contracts while the real components
 *   render: a recording wrapper reads the props the UI passes while the DOM
 *   still comes from the production implementation.
 * #endregion moduleContract
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const rec = vi.hoisted(() => ({ entries: [] as Array<{ name: string; props: Record<string, unknown> }> }));

vi.mock("@deepseek-ai/dsh-client-ui-primitives", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const ReactModule = await import("react");
  const RECORDED = [
    "Button",
    "Menu",
    "Modal",
    "Toast",
    "Tooltip",
    "SegmentedTabs",
    "Checkbox",
    "Input",
    "Tag",
    "IconChevronDownOutlineRegular",
    "IconChevronLeftOutlineMedium",
    "IconChevronsUpDownOutlineRegular",
    "IconWarningOutlineRegular",
    "IconPlusOutlineRegular",
  ];
  const out: Record<string, unknown> = { ...actual };
  for (const name of RECORDED) {
    const Real = actual[name];
    if (!Real) continue;
    // forwardRef so the Tooltip's ref injection into its anchor still lands.
    out[name] = ReactModule.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      rec.entries.push({ name, props });
      return ReactModule.createElement(Real as React.ElementType, ref ? { ...props, ref } : props);
    });
  }
  return out;
});

const { PromptProfileChip } = await import("../../src/client/chip.tsx");
const { DefaultMenu, ConfirmDialog, useNotifier } = await import("../../src/client/ui.tsx");
const { AddSectionPicker, ProfileOutline } = await import("../../src/client/settings-profiles.tsx");
const { PromptProfilesSection } = await import("../../src/client/settings-page.tsx");
const { chipProps, installRemoteApi, keyT, profileMain, stateOf, storeHook } = await import("./harness.ts");

const propsOf = (name: string) => rec.entries.filter((entry) => entry.name === name).at(-1)?.props;
const allOf = (name: string) => rec.entries.filter((entry) => entry.name === name).map((entry) => entry.props);
const never = () => new Promise(() => {});
const noop = () => {};

beforeEach(() => {
  rec.entries.length = 0;
});
afterEach(cleanup);

test("the chip drives the owner-controlled Menu: open/anchor/onClose/items/side/portal", async () => {
  const remote = installRemoteApi();
  remote.answer("state", stateOf());
  render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(propsOf("Menu")).toBeTruthy());
  const menu = propsOf("Menu") as Record<string, unknown>;
  expect(menu.open).toBe(false);
  expect(menu.anchor).toBeTruthy();
  expect(typeof menu.onClose).toBe("function");
  expect(menu.side).toBe("top");
  expect(menu.portal).toBe(true);
  expect(menu.selectedId).toBe("main");
  expect(menu.items).toEqual([
    { id: "none", label: "none" },
    { id: "main", label: "Main" },
  ]);
  expect((menu.items as Array<Record<string, unknown>>).some((item) => item.type === "separator")).toBe(false);
});

test("the chip's trigger is the installed Button primitive with the composer geometry", async () => {
  const remote = installRemoteApi();
  remote.answer("state", stateOf());
  render(<PromptProfileChip {...chipProps()} />);
  await waitFor(() => expect(propsOf("Button")).toBeTruthy());
  const button = propsOf("Button") as Record<string, unknown>;
  expect(button.variant).toBe("ghost");
  expect(button.size).toBe("sm");
  expect(button.icon).toBeUndefined();
  expect(button["aria-label"]).toBe("menuLabel");
  expect(button.title).toBe("menuLabel");
  expect(Object.keys(button.style as object)).toEqual(["maxWidth"]);
  expect((button.style as React.CSSProperties).maxWidth).toBe("220px");

  const children = React.Children.toArray(button.children as React.ReactNode) as React.ReactElement[];
  expect(children).toHaveLength(2);
  expect(children[0].type).toBe("span");
  expect((children[0].props.style as React.CSSProperties).textOverflow).toBe("ellipsis");
  expect((children[0].props.style as React.CSSProperties).color).toBe("var(--dsw-alias-label-secondary)");
  expect(children[1].type).toBe("span");
  expect(children[1].props["aria-hidden"]).toBe(true);
  expect((children[1].props.style as React.CSSProperties).color).toBe("var(--dsw-alias-label-caption)");
  const chevron = propsOf("IconChevronDownOutlineRegular");
  expect(chevron).toBeTruthy();
  expect(chevron?.size).toBe(14);
});

test("the complete-mode marker sits between label and chevron and dims the trigger", async () => {
  const remote = installRemoteApi();
  remote.answer(
    "state",
    stateOf({
      profiles: [{ rowId: "prompt-profile-light", patchId: "light", configId: "light", title: "Light", sections: [] }],
      default: "light",
      modes: [{ id: "minimal", title: "minimal", complete: true }],
    }),
  );
  render(
    <PromptProfileChip
      {...chipProps({
        useSessions: storeHook({
          byId: { sid: { cwd: "/work/repo", projectionValues: { agentPreset: "minimal" } } },
        }),
      })}
    />,
  );
  await waitFor(() => expect(propsOf("Button")).toBeTruthy());
  await waitFor(() => expect(propsOf("IconWarningOutlineRegular")).toBeTruthy());
  const button = propsOf("Button") as Record<string, unknown>;
  const children = React.Children.toArray(button.children as React.ReactNode) as React.ReactElement[];
  expect(children).toHaveLength(3);
  expect(children[0].type).toBe("span");
  expect(children[1].props["data-complete-warning"]).toBe("minimal");
  expect(children[1].props["aria-hidden"]).toBe(true);
  expect(children[2].props["aria-hidden"]).toBe(true);
  expect(String(button.title)).toContain("completeModeWarning");
  expect(String(button.title)).toContain("minimal");
  expect((button.style as React.CSSProperties).opacity).toBeLessThan(1);
});

test("a non-complete or unknown active mode adds nothing to the trigger", async () => {
  const remote = installRemoteApi();
  remote.answer(
    "state",
    stateOf({
      profiles: [{ rowId: "prompt-profile-light", patchId: "light", configId: "light", title: "Light", sections: [] }],
      default: "light",
      modes: [{ id: "minimal", title: "minimal", complete: true }],
    }),
  );
  const cases: Array<Record<string, unknown> | undefined> = [
    { agentPreset: "default", complete: false },
    { agentPreset: "ghost-mode" },
    undefined,
  ];
  for (const projection of cases) {
    rec.entries.length = 0;
    const view = render(
      <PromptProfileChip
        {...chipProps({
          useSessions: storeHook({ byId: { sid: { cwd: "/work/repo", projectionValues: projection } } }),
        })}
      />,
    );
    await waitFor(() => expect(propsOf("Button")).toBeTruthy());
    const button = propsOf("Button") as Record<string, unknown>;
    expect(React.Children.toArray(button.children as React.ReactNode)).toHaveLength(2);
    expect(button.title).toBe("menuLabel");
    expect(Object.keys(button.style as object)).toEqual(["maxWidth"]);
    view.unmount();
  }
});

test("DefaultMenu renders the same trigger shape and offers none + sorted profiles", async () => {
  render(<DefaultMenu state={stateOf()} t={keyT} onPick={noop} />);
  const menu = propsOf("Menu") as Record<string, unknown>;
  expect(menu.open).toBe(false);
  expect(typeof menu.onClose).toBe("function");
  expect(menu.selectedId).toBe("main");
  expect(menu.items).toEqual([
    { id: "none", label: "none" },
    { id: "main", label: "Main" },
  ]);
  const button = propsOf("Button") as Record<string, unknown>;
  expect(button["aria-label"]).toBe("defaultForNewSessions");
  const children = React.Children.toArray(button.children as React.ReactNode) as React.ReactElement[];
  expect(children).toHaveLength(2);
  expect((children[0].props.style as React.CSSProperties).color).toBe("var(--dsw-alias-label-secondary)");
  expect((children[1].props.style as React.CSSProperties).color).toBe("var(--dsw-alias-label-caption)");
});

test("ConfirmDialog drives the Modal with a two-button footer", () => {
  render(
    <ConfirmDialog open title="Delete?" body="Main" actionLabel="Delete" t={keyT} onCancel={noop} onConfirm={noop} />,
  );
  const modal = propsOf("Modal") as Record<string, unknown>;
  expect(modal.open).toBe(true);
  expect(modal.title).toBe("Delete?");
  expect(modal.closeLabel).toBe("cancel");
  expect(typeof modal.onClose).toBe("function");
  // The footer is one Fragment wrapping the two actions.
  const fragment = modal.footer as React.ReactElement;
  const footer = React.Children.toArray(fragment.props.children) as React.ReactElement[];
  expect(footer).toHaveLength(2);
  expect(footer[0].props.variant).toBe("outline");
  expect(footer[1].props.variant).toBe("primary");
  expect(footer[1].props.children).toBe("Delete");
});

test("ConfirmDialog falls back to the localized confirm label", () => {
  render(<ConfirmDialog open title="Remove?" t={keyT} onCancel={noop} onConfirm={noop} />);
  const modal = propsOf("Modal") as Record<string, unknown>;
  const fragment = modal.footer as React.ReactElement;
  const footer = React.Children.toArray(fragment.props.children) as React.ReactElement[];
  expect(footer[1].props.children).toBe("confirm");
});

test("AddSectionPicker searches with a Modal, a labeled Checkbox per candidate and a counted primary action", () => {
  render(
    <AddSectionPicker
      sections={[
        { rowId: "a", patchId: "a", configId: "prompt-section-a", title: "A", body: "body" },
        { rowId: "b", patchId: "b", configId: "prompt-section-b", title: "B", body: "  " },
      ]}
      alreadyIn={new Set(["prompt-section-a"])}
      onAdd={noop}
      onClose={noop}
      t={keyT}
    />,
  );
  const modal = propsOf("Modal") as Record<string, unknown>;
  expect(modal.open).toBe(true);
  expect(modal.title).toBe("pickerTitle");
  expect(modal.closeLabel).toBe("cancel");
  const input = propsOf("Input") as Record<string, unknown>;
  expect(input.placeholder).toBe("searchPlaceholder");
  expect(input.icon).toBeTruthy();
  const checkboxes = allOf("Checkbox");
  expect(checkboxes).toHaveLength(1);
  expect(checkboxes[0].checked).toBe(false);
  expect(checkboxes[0].label).toBe("B");
  expect(typeof checkboxes[0].onChange).toBe("function");
  const add = allOf("Button").at(-1) as Record<string, unknown>;
  expect(add.variant).toBe("primary");
  expect(add.disabled).toBe(true);
  expect(add.children).toBe("pickerAdd (0)");
  expect(propsOf("Tag")).toBeTruthy();
});

test("the notifier renders the Toast component (never calls it) with text and onDone", () => {
  function Probe(): React.ReactElement {
    const { notify, banner } = useNotifier();
    return (
      <>
        <button type="button" onClick={() => notify("hello")}>
          go
        </button>
        {banner}
      </>
    );
  }
  const view = render(<Probe />);
  fireEvent.click(view.getByText("go"));
  const toast = propsOf("Toast") as Record<string, unknown>;
  expect(toast.text).toBe("hello");
  expect(typeof toast.onDone).toBe("function");
});

test("iconControl wraps the Button in a Tooltip, or leaves the native title alone", () => {
  render(
    <ProfileOutline
      profile={{ ...profileMain, sections: [{ id: "prompt-section-greeting", order: 10 }] }}
      state={stateOf()}
      api={{ loadState: never } as never}
      reload={noop as never}
      t={keyT}
      notify={noop}
      onBack={noop}
      onOpenSection={noop}
      autoFocusTitle={false}
    />,
  );
  const tooltips = allOf("Tooltip");
  const labels = tooltips.map((tooltip) => tooltip.label);
  expect(labels).toContain("dragHandle");
  expect(labels).toContain("remove");
  expect(labels).toContain("openInSectionTab");
  expect(labels).not.toContain("back");
  expect(tooltips.every((tooltip) => React.isValidElement(tooltip.children))).toBe(true);
  const back = allOf("Button").find((button) => button["aria-label"] === "back") as Record<string, unknown>;
  expect(back).toBeTruthy();
  expect(back.variant).toBe("outline");
  expect(back.size).toBe("sm");
  expect(back.icon).toBeTruthy();
  expect(back.title).toBe("back");
  const grip = allOf("Button").find((button) => button["aria-label"] === "dragHandle") as Record<string, unknown>;
  expect(grip.draggable).toBe(true);
  expect(grip["data-drag-handle"]).toBe(0);
  expect(typeof grip.onDragStart).toBe("function");
  expect(typeof grip.onDragEnd).toBe("function");
  expect(typeof grip.onKeyDown).toBe("function");
});

test("the add-section action keeps the icon and drops the plus from its label", () => {
  render(
    <ProfileOutline
      profile={{ ...profileMain, sections: [] }}
      state={stateOf()}
      api={{ loadState: never } as never}
      reload={noop as never}
      t={keyT}
      notify={noop}
      onBack={noop}
      onOpenSection={noop}
      autoFocusTitle={false}
    />,
  );
  const add = allOf("Button").find((button) => button.children === "addSection") as Record<string, unknown>;
  expect(add).toBeTruthy();
  expect(add.variant).toBe("outline");
  expect(add.icon).toBeTruthy();
});

test("the scope selector's Menu anchor is the Button primitive, keyed per occurrence", () => {
  const profile = {
    ...profileMain,
    sections: [
      { id: "prompt-section-greeting", order: 10, scope: "inherit" },
      { id: "prompt-section-greeting", order: 20, scope: "main-only" },
    ],
  };
  render(
    <ProfileOutline
      profile={profile}
      state={stateOf()}
      api={{ loadState: never } as never}
      reload={noop as never}
      t={keyT}
      notify={noop}
      onBack={noop}
      onOpenSection={noop}
      autoFocusTitle={false}
    />,
  );
  const anchors = allOf("Menu")
    .map((menu) => menu.anchor)
    .filter(Boolean) as React.ReactElement[];
  const scopeAnchors = anchors.filter((anchor) => anchor.type !== undefined && anchor.props.size === "sm");
  expect(scopeAnchors.length).toBe(2);
  expect(new Set(scopeAnchors.map((anchor) => anchor.props["aria-label"])).size).toBe(2);
  const scopeMenu = allOf("Menu").find((menu) => Array.isArray(menu.items) && (menu.items as unknown[]).length === 3);
  const scopeItems = (scopeMenu?.items ?? []) as Array<{ id: string }>;
  expect(scopeItems.map((item) => item.id)).toEqual(["inherit", "main-only", "subagents-only"]);
  expect(scopeMenu?.selectedId).toBe("inherit");
});

test("SegmentedTabs receives labeled items with DOM ids and a panel link", async () => {
  render(<PromptProfilesSection t={keyT} api={{ loadState: () => Promise.resolve(stateOf()) } as never} />);
  await waitFor(() => expect(propsOf("SegmentedTabs")).toBeTruthy());
  const tabs = propsOf("SegmentedTabs") as Record<string, unknown>;
  expect(tabs.value).toBe("profiles");
  expect(tabs.label).toBe("nav");
  expect(typeof tabs.onChange).toBe("function");
  expect(tabs.items).toEqual([
    { value: "profiles", label: "tabProfiles", id: "pp-tab-profiles", panelId: "pp-tab-profiles-panel" },
    { value: "sections", label: "tabSections", id: "pp-tab-sections", panelId: "pp-tab-sections-panel" },
    { value: "preview", label: "tabPreview", id: "pp-tab-preview", panelId: "pp-tab-preview-panel" },
  ]);
});
