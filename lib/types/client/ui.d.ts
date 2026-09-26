/** #region moduleContract
 * @modulecontract
 * @purpose The shared React building blocks of the client UI: the installed
 *   platform primitives (Button, Menu, Tooltip, Modal, Toast, Input,
 *   SegmentedTabs, Checkbox, Tag, icons, all externals of this bundle), the
 *   layout tokens the chip and the settings page share, and the small controls
 *   both surfaces compose (icon button, inline error, confirmation dialog,
 *   default-profile selector).
 * @scope
 *  - Primitive imports and the narrow prop/component types derived from them,
 *    shared styles, `inlineError`, `iconControl`, `useNotifier`,
 *    `ConfirmDialog`, `DefaultMenu`.
 *  - NOT: data loading (src/client/settings-shared.ts), the flows
 *    (src/client/flows.ts) or the api (src/client/remote.ts).
 * @invariants
 *  - The primitives are used with their REAL installed contract: Menu is
 *    owner-controlled (open/anchor/onClose), Toast is render-only (never
 *    called as a function), SegmentedTabs items carry value/label/id/panelId.
 * @keywords ui, primitives, shared styles, notifier, confirm dialog, default menu
 * #endregion moduleContract */
import { React } from "./element.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
export declare const errorStyle: React.CSSProperties;
export declare const mutedStyle: React.CSSProperties;
export declare const rowStyle: React.CSSProperties;
export declare const fieldStyle: React.CSSProperties;
export declare const triggerLabelStyle: React.CSSProperties;
export declare const triggerChevronStyle: React.CSSProperties;
export declare const chipMaxWidth: React.CSSProperties;
/** @purpose The inline error line the edit forms show next to their fields. */
export declare const inlineError: (text: string) => React.ReactElement | null;
/** @purpose What an icon factory must accept (the platform's IconProps subset this UI uses). */
export type IconComponent = (props: {
    size?: number;
}) => React.ReactElement;
/** Pass-through extras of one icon control. */
export interface IconControlExtra {
    variant?: "primary" | "ghost" | "outline" | "toolbar";
    title?: string;
    disabled?: boolean;
    tooltip?: boolean;
    key?: string;
    props?: Record<string, unknown>;
}
/**
 * @purpose The single icon-only control wrapper, used by the row actions, the
 *   drag grip and the back affordance. The installed Button primitive owns
 *   geometry, typography and the hover/focus/active states; `extra` carries
 *   pass-through button props (disabled, drag/keyboard handlers) plus the
 *   variant and whether a Tooltip wrapper is wanted (the back button relies on
 *   the Button's own native `title`).
 */
export declare function iconControl(label: string, Icon: IconComponent, onClick: ((event: {
    stopPropagation: () => void;
}) => void) | null, extra?: IconControlExtra): React.ReactElement;
/** The change event surface the controlled fields read. */
export interface ValueChangeEvent {
    target: {
        value: string;
    };
}
/** The drag event surface the outline's reorder handlers read. */
export interface DragEventLike {
    dataTransfer?: {
        effectAllowed?: string;
        setData?: (format: string, data: string) => void;
        getData?: (format: string) => string;
    } | null;
    preventDefault?: () => void;
}
/** The keydown surface the drag grip's arrow handling reads. */
export interface KeyboardEventLike {
    key?: string;
    preventDefault?: () => void;
}
export interface Notifier {
    notify: (text: string) => void;
    dismiss: () => void;
    banner: React.ReactElement | null;
}
/**
 * @purpose Installed notification pattern (same as dsh-client-ui-workspace's
 *   RowActionToast): the owner keeps {seq, text}; the Toast COMPONENT is
 *   rendered keyed by seq and unmounts itself through onDone. Toast uses
 *   hooks internally, so calling it as a plain function is an invalid hook
 *   call — it must only ever be used as a createElement type.
 */
export declare function useNotifier(): Notifier;
export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    body?: React.ReactNode;
    actionLabel?: string;
    extraChildren?: React.ReactNode;
    onCancel: () => void;
    onConfirm: () => void;
    t: Translate;
}
/** @purpose Generic two-button confirmation modal for destructive actions. */
export declare function ConfirmDialog({ open, title, body, actionLabel, extraChildren, onCancel, onConfirm, t, }: ConfirmDialogProps): React.ReactElement;
export interface DefaultMenuProps {
    state: StateDocument;
    t: Translate;
    onPick: (id: string) => void;
}
/** @purpose «Default for new sessions» selector (none + sorted profiles). */
export declare function DefaultMenu({ state, t, onPick }: DefaultMenuProps): React.ReactElement;
