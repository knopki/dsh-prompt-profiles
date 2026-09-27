/** #region moduleContract
 * @modulecontract
 * @purpose The Sections tab: searchable section list with drill-down, plus
 *   the section editor with autosave and the Change-id dialog.
 * @invariants
 *  - An empty title is never written, and no write happens before the
 *    create-flow poll confirmed the row in /state.
 *  - A rename sends the typed id verbatim and does not rewrite references.
 *  - A bundle-owned row's id cannot be changed.
 * #endregion moduleContract */
import * as React from "react";
import { type CreateFlow } from "./flows.ts";
import type { Translate } from "./i18n.ts";
import type { RowEntry, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
interface SectionsTabProps {
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
/** @purpose Section editor: autosaved title and body, used-in feed, rename-id dialog. */
export declare function SectionForm({ section, state, api, reload, t, notify, onBack, onRenamed, onDrill, setState, autoFocusTitle, }: SectionFormProps): React.ReactElement;
/** @purpose Section list with search, drill-down and modal-free creation. */
export declare function SectionsTab({ state, api, reload, t, notify, drill, setDrill, setState, createFlow, }: SectionsTabProps): React.ReactElement;
export {};
