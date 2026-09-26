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

import {
  Button,
  IconChevronDownOutlineRegular,
  IconWarningOutlineRegular,
  Menu,
  Modal,
  Toast,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { idOf, profileLabel } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";

// #region CONST_styles
export const errorStyle: React.CSSProperties = {
  color: "var(--dsh-alias-state-error-primary, red)",
  margin: "8px 0",
};
export const mutedStyle: React.CSSProperties = { color: "var(--dsw-alias-label-secondary)" };
export const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 4px",
  borderBottom: "1px solid var(--dsw-alias-border-l2)",
};
export const fieldStyle: React.CSSProperties = {
  color: "var(--dsw-alias-label-primary)",
  background: "var(--dsw-alias-bg-l2)",
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: "8px",
  padding: "6px 8px",
  fontFamily: "inherit",
  fontSize: "inherit",
};
// The Button primitive offers no truncation slot and no max width, so these
// remain the only hand-written bits: long profile titles need the ellipsis,
// and the chip must not outgrow the composer control it mirrors.
export const triggerLabelStyle: React.CSSProperties = {
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  overflow: "hidden",
  minWidth: 0,
  color: "var(--dsw-alias-label-secondary)",
};
export const triggerChevronStyle: React.CSSProperties = {
  color: "var(--dsw-alias-label-caption)",
  flex: "none",
  display: "inline-flex",
};
export const chipMaxWidth: React.CSSProperties = { maxWidth: "220px" };
// The outline/list rows grow their middle cell through a pass-through `flex`
// attribute, exactly as the pre-TSX `h("span", { flex: 1 })` calls passed it
// (React renders it inert). It is NOT a style, and promoting it to one would
// change the layout this UI has always had.
export const flexFill = { flex: 1 } as React.HTMLAttributes<HTMLElement>;
// #endregion CONST_styles

// #region FUNC_inlineError
/** @purpose The inline error line the edit forms show next to their fields. */
export const inlineError = (text: string): React.ReactElement | null =>
  text ? (
    <div role="alert" style={errorStyle}>
      {text}
    </div>
  ) : null;
// #endregion FUNC_inlineError

// #region TYPE_iconControl
/** @purpose What an icon factory must accept (the platform's IconProps subset this UI uses). */
export type IconComponent = (props: { size?: number }) => React.ReactElement;

/** Pass-through extras of one icon control. */
export interface IconControlExtra {
  variant?: "primary" | "ghost" | "outline" | "toolbar";
  title?: string;
  disabled?: boolean;
  tooltip?: boolean;
  key?: string;
  /** Extra button attributes (drag/keyboard handlers) forwarded verbatim. */
  props?: Record<string, unknown>;
}
// #endregion TYPE_iconControl

// #region FUNC_iconControl
/**
 * @purpose The single icon-only control wrapper, used by the row actions, the
 *   drag grip and the back affordance. The installed Button primitive owns
 *   geometry, typography and the hover/focus/active states; `extra` carries
 *   pass-through button props (disabled, drag/keyboard handlers) plus the
 *   variant and whether a Tooltip wrapper is wanted (the back button relies on
 *   the Button's own native `title`).
 */
export function iconControl(
  label: string,
  Icon: IconComponent,
  onClick: ((event: React.MouseEvent) => void) | null,
  extra: IconControlExtra = {},
): React.ReactElement {
  const button = (
    <Button
      variant={extra.variant ?? "ghost"}
      size="sm"
      icon={<Icon size={14} />}
      aria-label={label}
      title={extra.title ?? label}
      disabled={extra.disabled === true}
      onClick={onClick ?? undefined}
      {...(extra.props as React.ComponentProps<typeof Button>)}
    />
  );
  return extra.tooltip === false ? (
    button
  ) : (
    <Tooltip key={extra.key ?? label} label={label}>
      {button}
    </Tooltip>
  );
}
// #endregion FUNC_iconControl

// #region TYPE_events
/** The change event surface the controlled fields read. */
export interface ValueChangeEvent {
  target: { value: string };
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
// #endregion TYPE_events

// #region TYPE_notifier
export interface Notifier {
  notify: (text: string) => void;
  dismiss: () => void;
  banner: React.ReactElement | null;
}
// #endregion TYPE_notifier

// #region FUNC_useNotifier
/**
 * @purpose Installed notification pattern (same as dsh-client-ui-workspace's
 *   RowActionToast): the owner keeps {seq, text}; the Toast COMPONENT is
 *   rendered keyed by seq and unmounts itself through onDone. Toast uses
 *   hooks internally, so calling it as a plain function is an invalid hook
 *   call — it must only ever be used as JSX.
 */
export function useNotifier(): Notifier {
  const [notice, setNotice] = React.useState<{ seq: number; text: string } | null>(null);
  const seq = React.useRef(0);
  const notify = React.useCallback((text: string) => {
    seq.current += 1;
    setNotice({ seq: seq.current, text: String(text ?? "") });
  }, []);
  const dismiss = React.useCallback(() => setNotice(null), []);
  const banner = notice ? (
    <Toast key={`notice-${notice.seq}`} text={notice.text} icon={<IconWarningOutlineRegular />} onDone={dismiss} />
  ) : null;
  return { notify, dismiss, banner };
}
// #endregion FUNC_useNotifier

// #region TYPE_confirmDialog
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
// #endregion TYPE_confirmDialog

// #region COMPONENT_ConfirmDialog
/** @purpose Generic two-button confirmation modal for destructive actions. */
export function ConfirmDialog({
  open,
  title,
  body,
  actionLabel,
  extraChildren,
  onCancel,
  onConfirm,
  t,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      closeLabel={t("cancel")}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {actionLabel || t("confirm")}
          </Button>
        </>
      }
    >
      <p style={mutedStyle}>{body}</p>
      {extraChildren}
    </Modal>
  );
}
// #endregion COMPONENT_ConfirmDialog

// #region TYPE_defaultMenu
export interface DefaultMenuProps {
  state: StateDocument;
  t: Translate;
  onPick: (id: string) => void;
}
// #endregion TYPE_defaultMenu

// #region COMPONENT_DefaultMenu
/** @purpose «Default for new sessions» selector (none + sorted profiles). */
export function DefaultMenu({ state, t, onPick }: DefaultMenuProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const selected = profiles.find((p) => idOf(p) === state.default);
  // Owner-controlled Menu: open + anchor (rendered in place) + data rows.
  // The anchor is the Button primitive (ghost/sm) like the composer chip.
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      anchor={
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("defaultForNewSessions")}
          title={t("defaultForNewSessions")}
          onClick={() => setOpen(!open)}
          style={chipMaxWidth}
        >
          <span style={triggerLabelStyle}>{profileLabel(selected, t)}</span>
          <span aria-hidden style={triggerChevronStyle}>
            <IconChevronDownOutlineRegular size={14} />
          </span>
        </Button>
      }
      items={[{ id: "none", label: t("none") }, ...profiles.map((p) => ({ id: idOf(p) as string, label: p.title }))]}
      selectedId={selected ? (idOf(selected) as string) : state.default || "none"}
      onSelect={(id: string) => {
        setOpen(false);
        onPick(id === "none" ? "" : id);
      }}
    />
  );
}
// #endregion COMPONENT_DefaultMenu
