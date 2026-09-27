/** #region moduleContract
 * @modulecontract
 * @purpose The Preview tab: pick a profile and show the host preview in final
 *   order, with skipped sections and variable flags.
 * @invariants
 *  - A preview is sessionless, so a used interpolation variable is always flagged.
 * #endregion moduleContract */
import * as React from "react";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
interface PreviewTabProps {
    state: StateDocument;
    api: RemoteApi;
    t: Translate;
    notify: (text: string) => void;
}
/** @purpose Profile selector plus the host preview in final order. */
export declare function PreviewTab({ state, api, t, notify }: PreviewTabProps): React.ReactElement;
export {};
