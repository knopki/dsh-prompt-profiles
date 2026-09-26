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
import { React } from "./element.ts";
import type { Translate } from "./i18n.ts";
import type { RemoteApi } from "./remote.ts";
export interface PromptProfilesSectionProps {
    t: Translate;
    api?: RemoteApi;
}
/**
 * @purpose Settings page shell: three tabs with drill-down INSIDE a tab;
 *   back via the back icon, Esc, or a repeated click on the active tab.
 */
export declare function PromptProfilesSection(props: PromptProfilesSectionProps): React.ReactElement;
