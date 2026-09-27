/** #region moduleContract
 * @modulecontract
 * @purpose The Profiles tab: profile list with drill-down, modal-free
 *   creation and the composed outline editor.
 * @invariants
 *  - A ref is addressed by occurrence (`row.seq`), never by section id.
 *  - Reorders write integer orders from `insertionOrders` and move the ref too.
 * #endregion moduleContract */
import * as React from "react";
import { type CreateFlow } from "./flows.ts";
import type { Translate } from "./i18n.ts";
import type { RowEntry, StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
export interface ProfilesTabProps {
    state: StateDocument;
    api: RemoteApi;
    reload: () => Promise<void>;
    t: Translate;
    notify: (text: string) => void;
    drill: string | null;
    setDrill: (id: string | null) => void;
    onOpenSection: (id: string) => void;
    setState: (value: StateDocument | null) => void;
    createFlow?: CreateFlow;
}
interface AddSectionPickerProps {
    sections: RowEntry[];
    alreadyIn: Set<string>;
    onAdd: (ids: string[]) => void;
    onClose: () => void;
    t: Translate;
}
interface ProfileOutlineProps {
    profile: RowEntry;
    state: StateDocument;
    api: RemoteApi;
    reload: () => Promise<void>;
    t: Translate;
    notify: (text: string) => void;
    onBack: () => void;
    onOpenSection: (id: string) => void;
    autoFocusTitle: boolean;
}
/** @purpose Searchable multi-select picker that adds existing sections to a profile. */
export declare function AddSectionPicker({ sections, alreadyIn, onAdd, onClose, t, }: AddSectionPickerProps): React.ReactElement;
/** @purpose The profile composition editor: title autosave, outline rows, add picker. */
export declare function ProfileOutline({ profile, state, api, reload, t, notify, onBack, onOpenSection, autoFocusTitle, }: ProfileOutlineProps): React.ReactElement;
/** @purpose Profile list with modal-free creation, default selector and drill-down. */
export declare function ProfilesTab({ state, api, reload, t, notify, drill, setDrill, onOpenSection, setState, createFlow, }: ProfilesTabProps): React.ReactElement;
export {};
