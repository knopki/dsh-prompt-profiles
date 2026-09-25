import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  SKIP_REASONS,
  errorMessage,
  interpolationSkipReason,
  planInsertion,
  sectionSkipReason
} from "./chunk-M5XL7FMX.js";

// src/host/application/assembler.ts
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
function createPromptAssembler(ports) {
  const log = (level, message, details) => {
    try {
      ports.log?.[level]?.(message, details ?? "");
    } catch {
    }
  };
  return {
    async apply({ agent, assembly }) {
      const session = agent?.session;
      if (!session?.id || !Array.isArray(assembly?.sections)) return;
      try {
        const cwd = session.header?.cwd ?? null;
        const workspaceKeys = await ports.workspaces.keys({ session, cwd });
        const workspaceKey = workspaceKeys[0] ?? "";
        const snapshot = await ports.snapshots.seal(session.id, () => {
          const skips = [];
          const profiles = ports.registry.profiles();
          const { profileId, reset } = resolveProfileId({
            lastByWorkspace: ports.registry.lastByWorkspace(),
            workspaceKeys,
            defaultId: ports.registry.defaultId(),
            profileIds: profiles.map((profile2) => profile2.id)
          });
          if (reset) {
            log("debug", "prompt-profiles stale workspace choice reset", {
              sessionId: session.id,
              workspaceKey
            });
          }
          const profile = profiles.find((row) => row.id === profileId);
          const sections = new Map(ports.registry.sections().map((row) => [row.id, row]));
          for (const ref of profile?.sections ?? []) {
            if (!sections.has(ref.id)) log("warn", "prompt-profiles missing section", { profileId, sectionId: ref.id });
          }
          const sealed = buildSnapshot({
            profile,
            sectionsById: sections,
            isSubagent: isSubagent(agent),
            isFork: isFork(agent),
            // Seal-time interpolation: variables of THIS assembly, final text
            // stored, never re-interpolated.
            variables: assembly.variables ?? {},
            warn: (message, details) => log("warn", message, details),
            onSkip: (skip) => skips.push(skip)
          });
          log("info", "prompt-profiles seal", {
            sessionId: session.id,
            workspaceKey,
            profileId: sealed.profileId,
            selected: sealed.sections.length,
            skipped: skips.length,
            skipReasons: skips,
            sectionIds: sealed.sections.map((section) => section.id)
          });
          return sealed;
        });
        if (snapshot.sections.length) {
          const planned = planInsertion({
            snapshot,
            assemblySections: assembly.sections,
            builtinOrdersByName: ports.orders.ordersByName()
          });
          for (let i = planned.length - 1; i >= 0; i--) {
            const { index, ...entry } = planned[i];
            assembly.sections.splice(index, 0, entry);
          }
          log("debug", "prompt-profiles inserted", {
            sessionId: session.id,
            workspaceKey,
            profileId: snapshot.profileId,
            inserted: planned.map((entry) => ({ name: entry.name, index: entry.index })),
            assemblySections: assembly.sections.length
          });
        } else {
          log("info", "prompt-profiles: no sections to insert", {
            sessionId: session.id,
            workspaceKey,
            profileId: snapshot.profileId,
            assemblySections: assembly.sections.length
          });
        }
      } catch (error) {
        log("warn", "prompt-profiles snapshot unavailable; prompt unchanged", { sessionId: session.id, error });
      }
    }
  };
}

export {
  resolveProfileId,
  isSubagent,
  isFork,
  interpolateSealedText,
  buildSnapshot,
  createPromptAssembler
};
//# sourceMappingURL=chunk-VHHPWZQJ.js.map
