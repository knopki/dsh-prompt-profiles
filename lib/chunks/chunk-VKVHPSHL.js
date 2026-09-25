import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  insertionIndex
} from "./chunk-U4Z25UPO.js";

// src/host/resolve.ts
function resolveProfileId({ lastByWorkspace = {}, workspaceKey, workspaceKeys, defaultId, profileIds }) {
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
async function resolveWorkspaceKeys({ workspaceRegistry, session, workspaceId, cwd } = {}) {
  const path = typeof cwd === "string" && cwd !== "" ? cwd : null;
  const candidates = [];
  const add = (value) => {
    if (typeof value === "string" && value !== "" && !candidates.includes(value)) candidates.push(value);
  };
  const sessionId = session?.id;
  if (typeof sessionId === "string" && sessionId !== "" && typeof workspaceRegistry?.list === "function") {
    try {
      const owner = workspaceRegistry.list().find((workspace) => {
        const ids = workspace?.sessionIds;
        return Array.isArray(ids) && ids.includes(sessionId);
      });
      add(owner?.id);
    } catch {
    }
  }
  if (path !== null && typeof workspaceRegistry?.resolveByPath === "function") {
    try {
      const owner = await workspaceRegistry.resolveByPath(path);
      add(owner?.id);
    } catch {
    }
  }
  add(path);
  add(workspaceId);
  return candidates.length > 0 ? candidates : [""];
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
    result += text.slice(last, open) + value;
    last = open + group[0].length;
  }
  return result + text.slice(last);
}
function sectionSkipReason(ref, section, { subagent = false, fork = false } = {}) {
  const scope = ref?.scope ?? "inherit";
  if (scope === "main-only" && subagent) return "scope main-only in a subagent";
  if (scope === "subagents-only" && (!subagent || fork)) return "scope subagents-only outside a plain subagent";
  if (!["inherit", "main-only", "subagents-only"].includes(scope)) return `unknown scope "${scope}"`;
  if (!section) return "section not found";
  if (section.disabled) return "section disabled";
  if (typeof section.body !== "string" || !section.body.trim()) return "empty body";
  return null;
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
    const section = sectionsById instanceof Map ? sectionsById.get(ref.id) : sectionsById?.[ref.id];
    const reason = sectionSkipReason(ref, section, { subagent, fork });
    if (reason !== null) {
      skip(ref.id, reason);
      continue;
    }
    let text;
    try {
      text = interpolateSealedText(ref.id, section.body, variables);
    } catch (error) {
      const failed = `interpolation failed: ${error?.message ?? String(error)}`;
      warn(`prompt-profiles section "${ref.id}" skipped: ${error?.message ?? String(error)}`, { sectionId: ref.id });
      skip(ref.id, failed);
      continue;
    }
    if (!text.trim()) {
      skip(ref.id, "empty after interpolation");
      continue;
    }
    sections.push({ id: ref.id, title: section.title, order: ref.order, text });
  }
  return { profileId: profile?.id ?? null, sections };
}
function planInsertion({ snapshot, assemblySections, builtinOrdersByName }) {
  if (!snapshot?.sections?.length) return [];
  const names = assemblySections.map((section) => section.name);
  const sorted = snapshot.sections.map((section, position) => ({ section, position })).sort((a, b) => a.section.order - b.section.order || a.position - b.position);
  const orders = sorted.map(({ section }) => section.order);
  const anchors = insertionIndex(orders, names, builtinOrdersByName);
  return sorted.map(({ section }, position) => ({
    name: `prompt-profile:${section.id}`,
    text: section.text,
    // Sealed text is final: the engine must not interpolate it again (astra
    // finding D) — literal `{{` can never break rendering.
    interpolate: false,
    index: anchors[position].index
  }));
}
async function sealSnapshot({ sessionId, createSnapshot, memo, openTable, warn = () => {
} }) {
  if (!memo.has(sessionId)) {
    let snapshot;
    let persisted = false;
    try {
      const table = await openTable();
      const saved = table.get(sessionId);
      if (saved !== void 0) {
        snapshot = saved;
        persisted = true;
      } else {
        snapshot = createSnapshot();
      }
    } catch (error) {
      warn("prompt-profiles storage unavailable; snapshot decision pinned in memory", { sessionId, error });
      snapshot = createSnapshot();
    }
    memo.set(sessionId, { snapshot, persisted });
  }
  const entry = memo.get(sessionId);
  if (!entry.persisted) {
    try {
      const table = await openTable();
      if (table.get(sessionId) === void 0) await table.put(sessionId, entry.snapshot);
      entry.persisted = true;
    } catch {
    }
  }
  return entry.snapshot;
}
function retryingCache(create) {
  let cached = null;
  const get = () => {
    cached ??= Promise.resolve().then(create).then(
      (value) => value,
      (error) => {
        cached = null;
        throw error;
      }
    );
    return cached;
  };
  get.cached = () => cached;
  return get;
}

export {
  resolveProfileId,
  resolveWorkspaceKeys,
  isSubagent,
  isFork,
  interpolateSealedText,
  sectionSkipReason,
  buildSnapshot,
  planInsertion,
  sealSnapshot,
  retryingCache
};
//# sourceMappingURL=chunk-VKVHPSHL.js.map
