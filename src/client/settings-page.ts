/** #region moduleContract
 * @modulecontract
 * @purpose The settings page shell: load the state document, own the three
 *   tabs, and keep one drill-down per tab with Esc/back/repeated-tab-click
 *   returning to the list. There is no URL or deep-link state.
 * @scope
 *  - `PromptProfilesSection` and the page-level scroll container.
 *  - NOT: the tab contents (settings-profiles/sections/preview).
 * @invariants
 *  - Esc closes the drill-down only outside editable fields and open dialogs
 *    or menus (`escapesDrillDown`), and a repeated click on the active tab is
 *    the same dismissal.
 *  - Until the first state read resolves the page renders a placeholder — it
 *    never renders a tab against a missing document.
 * @keywords settings page, tabs, drill down, escape, scroll gutter
 * #endregion moduleContract */

import { SegmentedTabs } from "@deepseek-ai/dsh-client-ui-primitives";
import { h, React } from "./element.ts";
import { escapesDrillDown } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { RemoteApi } from "./remote.ts";
import { PreviewTab } from "./settings-preview.ts";
import { ProfilesTab } from "./settings-profiles.ts";
import { SectionsTab } from "./settings-sections.ts";
import { useProfilesState } from "./settings-shared.ts";
import { unavailableApi } from "./transport.ts";
import { mutedStyle, useNotifier } from "./ui.ts";

// The host mounts this section as the ONLY child of its own scroll panel
// (`dsh-client-ui-settings-general` `.options`: flex:1; min-height:0;
// overflow-y:auto) which does NOT reserve a scrollbar gutter. Making OUR
// root the scroller with a stable gutter keeps the profiles list ↔ outline
// height change from toggling that panel's scrollbar (the "profile → back"
// jolt) without touching the host package. height:100% resolves because the
// shell's options panel is a flex item with a definite height.
const pageStyle: React.CSSProperties = {
  height: "100%",
  minHeight: 0,
  boxSizing: "border-box",
  overflowY: "auto",
  scrollbarGutter: "stable",
};

// #region TYPE_settingsPage
export interface PromptProfilesSectionProps {
  t: Translate;
  api?: RemoteApi;
}
// #endregion TYPE_settingsPage

// #region COMPONENT_PromptProfilesSection
/**
 * @purpose Settings page shell: three tabs with drill-down INSIDE a tab;
 *   back via the back icon, Esc, or a repeated click on the active tab.
 */
export function PromptProfilesSection(props: PromptProfilesSectionProps): React.ReactElement {
  const { t, api } = props;
  const { notify, banner } = useNotifier();
  const { state, setState, reload } = useProfilesState(api ?? unavailableApi, t, notify);
  const [tab, setTab] = React.useState("profiles");
  const [drill, setDrillState] = React.useState<Record<string, string | null>>({ profiles: null, sections: null });
  const setDrill = (value: string | null) => setDrillState((prev) => ({ ...prev, [tab]: value }));
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Esc must not throw the user out of the drill-down while they are
      // typing, nor fight an open dialog/menu (see escapesDrillDown).
      if (escapesDrillDown(event, typeof window !== "undefined" ? window : undefined)) {
        setDrillState((prev) => ({ ...prev, [tab]: null }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);
  const selectTab = (value: string) => {
    if (value === tab) setDrillState((prev) => ({ ...prev, [tab]: null }));
    else setTab(value);
  };
  const onOpenSection = (sectionId: string) => {
    setTab("sections");
    setDrillState((prev) => ({ ...prev, sections: sectionId }));
  };
  if (!state) return h("div", { style: pageStyle }, h("p", { style: mutedStyle }, "…"), banner);
  return h(
    "div",
    { style: pageStyle },
    h(SegmentedTabs, {
      items: [
        { value: "profiles", label: t("tabProfiles"), id: "pp-tab-profiles", panelId: "pp-tab-profiles-panel" },
        { value: "sections", label: t("tabSections"), id: "pp-tab-sections", panelId: "pp-tab-sections-panel" },
        { value: "preview", label: t("tabPreview"), id: "pp-tab-preview", panelId: "pp-tab-preview-panel" },
      ],
      value: tab,
      onChange: selectTab,
      label: t("nav"),
    }),
    h(
      "div",
      { style: { marginTop: "12px" } },
      tab === "profiles" &&
        h(ProfilesTab, {
          state,
          api: api ?? unavailableApi,
          reload,
          t,
          notify,
          drill: drill.profiles ?? null,
          setDrill,
          onOpenSection,
          setState,
        }),
      tab === "sections" &&
        h(SectionsTab, {
          state,
          api: api ?? unavailableApi,
          reload,
          t,
          notify,
          drill: drill.sections ?? null,
          setDrill,
          setState,
        }),
      tab === "preview" && h(PreviewTab, { state, api: api ?? unavailableApi, t, notify }),
    ),
    banner,
  );
}
// #endregion COMPONENT_PromptProfilesSection
