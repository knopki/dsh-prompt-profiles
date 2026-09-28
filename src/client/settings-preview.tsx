/** #region moduleContract
 * @modulecontract
 * @purpose The Preview tab: pick a profile and show the host preview in final
 *   order, with skipped sections and variable flags.
 * @invariants
 *  - A preview is sessionless, so a used interpolation variable is always flagged.
 * #endregion moduleContract */

import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import {
  errorNote,
  idOf,
  type PreviewPlan,
  previewPlan,
  previewVariableNotice,
  refIdOf,
  skipReasonText,
} from "./helpers.ts";
import type { Translate } from "./i18n.ts";
import type { StateDocument } from "./model.ts";
import type { RemoteApi } from "./remote.ts";
import { DefaultMenu, mutedStyle } from "./ui.tsx";

interface PreviewTabProps {
  state: StateDocument;
  api: RemoteApi;
  t: Translate;
  notify: (text: string) => void;
}

// #region COMPONENT_PreviewTab
/** @purpose Profile selector plus the host preview in final order. */
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
        if (live) notify(errorNote(err, t, t("loadError")));
      });
    return () => {
      live = false;
    };
  }, [profileId, api, t, notify]);
  return (
    <div>
      <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={mutedStyle}>{t("profileWord")}</span>
        <DefaultMenu state={{ ...state, default: profileId }} t={t} onPick={setProfileId} labelKey="previewProfile" />
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
              {`${t("skippedMarker")} ${s.title} — ${skipReasonText(s.reason, s.detail, t)}`}
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
