/** #region moduleContract
 * @modulecontract
 * @purpose The Sections tab of the settings page: the searchable section list
 *   with source/used-in badges and drill-down, plus the section editor — title
 *   and body with whole-object autosave, duplicate/delete through the
 *   optimistic mutation flow, and the Change-id dialog.
 * @scope
 *  - `SectionsTab` and `SectionForm`.
 *  - NOT: the Profiles/Preview tabs, the api facade or the host rules.
 * @invariants
 *  - An EMPTY title is never written (the server rejects it) and no write
 *    happens before the create-flow poll confirmed the row in /state.
 *  - A rename sends the typed id VERBATIM: the host owns prefixing, and it does
 *    NOT rewrite profile references — leftovers are reported, not fixed here.
 *  - A bundle-owned row's id cannot be changed: the host would disable rather
 *    than rewrite the bundle, so the action is blocked with a reason.
 * @keywords settings, sections tab, section form, rename id, autosave
 * #endregion moduleContract */
import { React } from "./element.ts";
import { type CreateFlow } from "./flows.ts";
import type { Translate } from "./i18n.ts";
import type { RowEntry, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
export interface SectionsTabProps {
    state: StateDocument;
    api: RemoteApi;
    reload: () => Promise<void>;
    t: Translate;
    notify: (text: string) => void;
    drill: string | null;
    setDrill: (id: string | null) => void;
    setState: (value: StateDocument | null) => void;
    createFlow?: CreateFlow;
}
export interface SectionFormProps {
    section: RowEntry;
    state: StateDocument;
    api: RemoteApi;
    reload: () => Promise<void>;
    t: Translate;
    notify: (text: string) => void;
    onBack: () => void;
    onRenamed: (id: string) => void;
    onDrill: (id: string | null) => void;
    setState: (value: StateDocument | null) => void;
    autoFocusTitle: boolean;
}
/**
 * @purpose Section editor: title + body (whole-object autosaved), an
 *   inline error line next to the fields, read-only used-in with scopes,
 *   source, duplicate/delete/rename-id actions. No scope control
 *   (SPEC decision 26). After creation the title is focused + selected.
 */
export declare function SectionForm({ section, state, api, reload, t, notify, onBack, onRenamed, onDrill, setState, autoFocusTitle, }: SectionFormProps): React.ReactElement;
/**
 * @purpose Section list with search, used-in, source, drill-down, and a
 *   modal-free create action (POST default title → poll /state → drill
 *   into the editor with the title focused and selected). The create
 *   button is disabled while a create is in flight.
 */
export declare function SectionsTab({ state, api, reload, t, notify, drill, setDrill, setState, createFlow, }: SectionsTabProps): React.ReactElement;
