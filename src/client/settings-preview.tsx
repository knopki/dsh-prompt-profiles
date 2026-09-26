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

import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { errText, idOf, type PreviewPlan, previewPlan, previewVariableNotice, refIdOf } from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
import { DefaultMenu, mutedStyle } from "./ui.tsx";

// #region TYPE_previewTab
export interface PreviewTabProps {
  state: StateDocument;
  api: RemoteApi;
  t: Translate;
  notify: (text: string) => void;
}
// #endregion TYPE_previewTab

// #region COMPONENT_PreviewTab
/**
 * @purpose Profile selector + host preview: our sections in final order,
 *   visually separated from built-in placeholder groups, skipped sections
 *   with reasons.
 */
export function PreviewTab({ state, api, t, notify }: PreviewTabProps): React.ReactElement {
  const [profileId, setProfileId] = React.useState(state.default || (idOf((state.profiles ?? [])[0]) ?? ""));
  const [data, setData] = React.useState<PreviewPlan | null>(null);
  React.useEffect(() => {
    let live = true;
    setData(null);
    if (!profileId) return undefined;
    api
      .preview(profileId)
      .then((value) => {
        if (live) setData(previewPlan(value));
      })
      .catch((err) => {
        if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"));
      });
    return () => {
      live = false;
    };
  }, [profileId, api, t, notify]);
  return (
    <div>
      <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={mutedStyle}>{t("profileWord")}</span>
        <DefaultMenu state={{ ...state, default: profileId }} t={t} onPick={setProfileId} />
      </div>
      {!profileId && <p style={mutedStyle}>{t("noProfiles")}</p>}
      {profileId && !data && <p style={mutedStyle}>…</p>}
      {(data?.plan ?? []).map((entry, i) => {
        if (entry.kind === "builtins") {
          return (
            <div
              key={`b${i}`}
              style={{
                ...mutedStyle,
                padding: "8px",
                margin: "8px 0",
                borderRadius: "8px",
                background: "var(--dsw-alias-bg-l2)",
              }}
            >
              {`${t("builtinMarker")}  ${entry.names.join(", ")}`}
            </div>
          );
        }
        // The preview is assembled without the session, so any interpolation
        // variable is flagged here rather than shown as if it were exact.
        const body = (state.sections ?? []).find((s) => refIdOf(s) === entry.id)?.body;
        const flagged = previewVariableNotice(entry.text, body, data?.variables ?? null, null);
        return (
          <div key={`${i}:${entry.id}`} style={{ padding: "8px 0", borderTop: "1px solid var(--dsw-alias-border-l2)" }}>
            <div>
              <span
                style={{ ...mutedStyle, width: "72px", display: "inline-block", fontVariantNumeric: "tabular-nums" }}
              >
                {entry.order !== undefined ? String(entry.order) : ""}
              </span>
              <strong>{` ${entry.title}`}</strong>
              {flagged && (
                <span style={{ ...mutedStyle, marginLeft: "8px" }}>
                  <Tag>{`⚠ ${t("previewVariables")}`}</Tag>
                  {` ${flagged.map((name) => `{{${name}}}`).join(", ")}`}
                </span>
              )}
            </div>
            <pre style={{ margin: "4px 0 0 72px", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px" }}>
              {entry.text}
            </pre>
          </div>
        );
      })}
      {data && data.skipped.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          {data.skipped.map((s) => (
            <div key={s.id ?? s.title} style={{ ...mutedStyle, fontStyle: "italic" }}>
              {`${t("skippedMarker")} ${s.title} — ${s.reason}`}
            </div>
          ))}
        </div>
      )}
      {/* A profile made only of broken/skipped refs still emits nothing: say so
          explicitly instead of leaving the pane looking unfinished. */}
      {data && data.plan.length === 0 && <p style={mutedStyle}>{t("previewEmpty")}</p>}
    </div>
  );
}
// #endregion COMPONENT_PreviewTab
