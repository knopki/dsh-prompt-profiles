/** #region moduleContract
 * @modulecontract
 * @purpose The Profiles tab of the settings page: the profile list with
 *   drill-down, modal-free creation (write a default title → poll → open the
 *   outline with the title focused), duplicate/delete through the optimistic
 *   mutation flow, and the composed outline editor (title, refs, scope,
 *   drag/keyboard reorder) that IS the profile editor.
 * @scope
 *  - `ProfilesTab`, `ProfileOutline` and `AddSectionPicker`.
 *  - NOT: the Sections/Preview tabs, the api facade or the host rules.
 * @invariants
 *  - A ref is identified by its OCCURRENCE (its index in `refs`, carried as
 *    `row.seq`), never by its section id: one profile may reference the same
 *    section twice and those refs must move/scope/remove independently.
 *  - Dragging never writes a half-step: the new order is the integer rule in
 *    `insertionOrders`, and the ref also MOVES in the array, because equal
 *    orders are broken by position.
 * @keywords settings, profiles tab, outline, drag reorder, add section picker
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
export interface AddSectionPickerProps {
    sections: RowEntry[];
    alreadyIn: Set<string>;
    onAdd: (ids: string[]) => void;
    onClose: () => void;
    t: Translate;
}
export interface ProfileOutlineProps {
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
/**
 * @purpose Picker with search and multi-select that adds existing sections
 *   to a profile (the ONLY add path — cross-tab drag is impossible).
 */
export declare function AddSectionPicker({ sections, alreadyIn, onAdd, onClose, t, }: AddSectionPickerProps): React.ReactElement;
/**
 * @purpose The profile composition form: editable title (whole-object
 *   autosave), outline of built-ins (read-only) and our rows with scope
 *   selector, ↑↓ reorder, numeric order field, add-section picker, and
 *   the complete-mode warning.
 */
export declare function ProfileOutline({ profile, state, api, reload, t, notify, onBack, onOpenSection, autoFocusTitle, }: ProfileOutlineProps): React.ReactElement;
/**
 * @purpose Profile list, modal-free new-profile creation (POST a default
 *   title → poll → drill into the outline with the title focused and
 *   selected), default selector, drill-down.
 */
export declare function ProfilesTab({ state, api, reload, t, notify, drill, setDrill, onOpenSection, setState, createFlow, }: ProfilesTabProps): React.ReactElement;
