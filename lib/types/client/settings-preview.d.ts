/** #region moduleContract
 * @modulecontract
 * @purpose The Preview tab: pick a profile, ask the host for its preview and
 *   show our sections in final order, visually separated from collapsed
 *   built-in groups, with skipped sections and their reasons — and honest
 *   flags wherever an interpolation variable makes the preview illustrative
 *   rather than exact.
 * @scope
 *  - `PreviewTab` only.
 *  - NOT: the Profiles/Sections tabs or the host preview rules.
 * @invariants
 *  - A preview is assembled WITHOUT the session, so a used interpolation
 *    variable is always flagged; a host-reported value is never presented as
 *    the session's own.
 * @keywords settings, preview tab, interpolation, skipped sections
 * #endregion moduleContract */
import { React } from "./element.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
export interface PreviewTabProps {
    state: StateDocument;
    api: RemoteApi;
    t: Translate;
    notify: (text: string) => void;
}
/**
 * @purpose Profile selector + host preview: our sections in final order,
 *   visually separated from built-in placeholder groups, skipped sections
 *   with reasons.
 */
export declare function PreviewTab({ state, api, t, notify }: PreviewTabProps): React.ReactElement;
