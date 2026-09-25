import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  SKIP_REASONS,
  errorMessage,
  interpolationSkipReason,
  sectionSkipReason
} from "./chunk-M5XL7FMX.js";

// src/host/resolve.ts
function resolveProfileId({
  lastByWorkspace = {},
  workspaceKey,
  workspaceKeys,
  defaultId,
  profileIds
}) {
  const ids = new Set(profileIds ?? []);
  const keys = Array.isArray(workspaceKeys) ? workspaceKeys : workspaceKey === void 0 ? [] : [workspaceKey];
  const valid = (id) => typeof id === "string" && id !== "" && ids.has(id);
  for (const key of keys) {
    if (!Object.hasOwn(lastByWorkspace ?? {}, key)) continue;
    const last = lastByWorkspace[key];
    if (last === "") return { profileId: null, reset: false };
    if (valid(last)) return { profileId: last, reset: false };
    return { profileId: valid(defaultId) ? defaultId : null, reset: true };
  }
  return { profileId: valid(defaultId) ? defaultId : null, reset: false };
}
function isSubagent(agent) {
  return agent?.session?.header?.origin === "subagent";
}
function isFork(agent) {
  return isSubagent(agent) && agent?.session?.header?.isSeeded === true;
}
var GROUP_AT = /^\{\{([^{}]*)\}\}/;
var VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
function interpolateSealedText(sectionId, text, variables) {
  const known = variables ?? {};
  let result = "";
  let last = 0;
  for (let open = text.indexOf("{{"); open >= 0; open = text.indexOf("{{", last)) {
    const group = GROUP_AT.exec(text.slice(open));
    if (group === null) {
      if (text.indexOf("}}", open + 2) >= 0) {
        throw new Error(
          `malformed prompt variable reference at "${text.slice(open, open + 16)}\u2026" in section "${sectionId}" (references are complete simple {{name}} groups)`
        );
      }
      result += text.slice(last, open + 2);
      last = open + 2;
      continue;
    }
    const name = group[0].slice(2, -2);
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(
        `malformed prompt variable reference "{{${name}}}" in section "${sectionId}" (variable names match ${String(VARIABLE_NAME)})`
      );
    }
    if (!Object.hasOwn(known, name)) {
      throw new Error(
        `unknown prompt variable "{{${name}}}" in section "${sectionId}"; registered variables: ${Object.keys(known).join(", ") || "(none)"}`
      );
    }
    const value = known[name];
    if (value === void 0) {
      throw new Error(`prompt variable "{{${name}}}" has no value for this assembly (section "${sectionId}")`);
    }
    result += text.slice(last, open) + String(value);
    last = open + group[0].length;
  }
  return result + text.slice(last);
}
function buildSnapshot({
  profile,
  sectionsById,
  isSubagent: subagent = false,
  isFork: fork = false,
  variables = {},
  warn = () => {
  },
  onSkip = () => {
  }
}) {
  const sections = [];
  const skip = (id, reason) => {
    try {
      onSkip({ id, reason });
    } catch {
    }
  };
  for (const ref of profile?.sections ?? []) {
    const section = sectionsById instanceof Map ? sectionsById.get(ref.id) : sectionsById[ref.id];
    const reason = sectionSkipReason(ref, section, { subagent, fork });
    if (reason !== null || section === void 0) {
      skip(ref.id, reason ?? SKIP_REASONS.sectionNotFound);
      continue;
    }
    let text;
    try {
      text = interpolateSealedText(ref.id, section.body, variables);
    } catch (error) {
      warn(`prompt-profiles section "${ref.id}" skipped: ${errorMessage(error)}`, { sectionId: ref.id });
      skip(ref.id, interpolationSkipReason(error));
      continue;
    }
    if (!text.trim()) {
      skip(ref.id, SKIP_REASONS.emptyAfterInterpolation);
      continue;
    }
    sections.push({ id: ref.id, title: section.title, order: ref.order, text });
  }
  return { profileId: profile?.id ?? null, sections };
}

export {
  resolveProfileId,
  isSubagent,
  isFork,
  interpolateSealedText,
  buildSnapshot
};
//# sourceMappingURL=chunk-76XK6KH2.js.map
