/** #region moduleContract
 * @modulecontract
 * @purpose Shared client UI building blocks: platform primitives, layout
 *   tokens and the small controls both surfaces compose.
 * @scope
 *  - Shared styles, `inlineError`, `iconControl`, `useNotifier`,
 *    `ConfirmDialog`, `DefaultMenu`.
 *  - NOT: data loading, flows or the api.
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
import { idOf, type KeyEventLike, profileLabel } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";

const errorStyle: React.CSSProperties = {
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

// #region FUNC_inlineError
/** @purpose The inline error line the edit forms show next to their fields. */
export const inlineError = (text: string): React.ReactElement | null =>
  text ? (
    <div role="alert" style={errorStyle}>
      {text}
    </div>
  ) : null;
// #endregion FUNC_inlineError

/** What an icon factory must accept (the platform's IconProps subset this UI uses). */
type IconComponent = (props: { size?: number }) => React.ReactElement;

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

// #region FUNC_iconControl
/** @purpose The single icon-only control wrapper for row actions, the drag grip and back. */
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
/** Alias of the shared key-event surface, kept for existing import sites. */
export type KeyboardEventLike = KeyEventLike;

interface Notifier {
  notify: (text: string) => void;
  dismiss: () => void;
  banner: React.ReactElement | null;
}

// #region FUNC_useNotifier
/** @purpose Toast-backed notifier: Toast must render as JSX, never as a function call. */
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

interface DefaultMenuProps {
  state: StateDocument;
  t: Translate;
  onPick: (id: string) => void;
  labelKey?: string;
}

// #region COMPONENT_DefaultMenu
/** @purpose «Default for new sessions» selector (none + sorted profiles). */
export function DefaultMenu({ state, t, onPick, labelKey }: DefaultMenuProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const profiles = [...(state.profiles ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const selected = profiles.find((p) => idOf(p) === state.default);
  const label = t(labelKey ?? "defaultForNewSessions");
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      anchor={
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          title={label}
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
