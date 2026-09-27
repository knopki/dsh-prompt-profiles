/** #region moduleContract
 * @modulecontract
 * @purpose Shared client UI building blocks: platform primitives, layout
 *   tokens and the small controls both surfaces compose.
 * @scope
 *  - Shared styles, `inlineError`, `iconControl`, `useNotifier`,
 *    `ConfirmDialog`, `DefaultMenu`.
 *  - NOT: data loading, flows or the api.
 * #endregion moduleContract */
import * as React from "react";
import { type KeyEventLike } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
export declare const mutedStyle: React.CSSProperties;
export declare const rowStyle: React.CSSProperties;
export declare const fieldStyle: React.CSSProperties;
export declare const triggerLabelStyle: React.CSSProperties;
export declare const triggerChevronStyle: React.CSSProperties;
export declare const chipMaxWidth: React.CSSProperties;
/** @purpose The inline error line the edit forms show next to their fields. */
export declare const inlineError: (text: string) => React.ReactElement | null;
/** What an icon factory must accept (the platform's IconProps subset this UI uses). */
type IconComponent = (props: {
    size?: number;
}) => React.ReactElement;
/** Pass-through extras of one icon control. */
interface IconControlExtra {
    variant?: "primary" | "ghost" | "outline" | "toolbar";
    title?: string;
    disabled?: boolean;
    tooltip?: boolean;
    key?: string;
    /** Extra button attributes (drag/keyboard handlers) forwarded verbatim. */
    props?: Record<string, unknown>;
}
/** @purpose The single icon-only control wrapper for row actions, the drag grip and back. */
export declare function iconControl(label: string, Icon: IconComponent, onClick: ((event: React.MouseEvent) => void) | null, extra?: IconControlExtra): React.ReactElement;
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
/** Alias of the shared key-event surface, kept for existing import sites. */
export type KeyboardEventLike = KeyEventLike;
interface Notifier {
    notify: (text: string) => void;
    dismiss: () => void;
    banner: React.ReactElement | null;
}
/** @purpose Toast-backed notifier: Toast must render as JSX, never as a function call. */
export declare function useNotifier(): Notifier;
interface ConfirmDialogProps {
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
interface DefaultMenuProps {
    state: StateDocument;
    t: Translate;
    onPick: (id: string) => void;
    labelKey?: string;
}
/** @purpose «Default for new sessions» selector (none + sorted profiles). */
export declare function DefaultMenu({ state, t, onPick, labelKey }: DefaultMenuProps): React.ReactElement;
export {};
