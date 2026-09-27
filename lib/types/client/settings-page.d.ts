/** #region moduleContract
 * @modulecontract
 * @purpose The settings page shell: state loading, three tabs, one drill-down per tab.
 * @invariants
 *  - Esc and repeated tab click close the drill-down; a missing document renders a placeholder.
 * #endregion moduleContract */
import * as React from "react";
import type { Translate } from "./i18n.ts";
import type { RemoteApi } from "./remote.ts";
interface PromptProfilesSectionProps {
    t: Translate;
    api?: RemoteApi;
}
/** @purpose Settings shell: three tabs with drill-down inside a tab. */
export declare function PromptProfilesSection(props: PromptProfilesSectionProps): React.ReactElement;
export {};
