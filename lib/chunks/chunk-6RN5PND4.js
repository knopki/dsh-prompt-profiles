import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  SECTION_ID_PREFIX,
  isValidToken,
  normalizeNewRowId,
  toPatchId
} from "./chunk-NG7OBEWS.js";

// src/host/domain/refs.ts
function sectionRefTargets(rows) {
  const targets = /* @__PURE__ */ new Map();
  const alias = (key, value) => {
    if (key !== "" && !targets.has(key)) targets.set(key, value);
  };
  for (const row of rows) {
    const id = row.id;
    if (typeof id !== "string" || id === "") continue;
    targets.set(id, id);
    const patch = typeof row.rowId === "string" ? toPatchId(row.rowId) : "";
    if (patch !== "") {
      alias(patch, id);
      alias(`include:${patch}`, id);
    }
    if (id.startsWith(SECTION_ID_PREFIX)) alias(id.slice(SECTION_ID_PREFIX.length), id);
    else alias(`${SECTION_ID_PREFIX}${id}`, id);
  }
  return targets;
}
function resolveSectionRefId(raw, { targets, pending }) {
  if (typeof raw !== "string" || raw === "") return null;
  const direct = targets.get(raw) ?? targets.get(toPatchId(raw));
  if (direct !== void 0) return direct;
  const full = normalizeNewRowId("section", raw);
  if (full === null) return null;
  const registered = targets.get(full);
  if (registered !== void 0) return registered;
  const token = full.slice(SECTION_ID_PREFIX.length);
  if (token === "" || !isValidToken(token)) return null;
  return pending?.has(full) ? full : null;
}
function rowAliases(row) {
  const aliases = /* @__PURE__ */ new Set([row.id]);
  if (typeof row.rowId === "string" && row.rowId !== "") aliases.add(toPatchId(row.rowId));
  if (row.id.startsWith(SECTION_ID_PREFIX)) aliases.add(row.id.slice(SECTION_ID_PREFIX.length));
  return aliases;
}
function refNamesRow(value, aliases) {
  return aliases.has(value) || aliases.has(toPatchId(value));
}
function usedIn(profiles, sectionId) {
  const uses = [];
  for (const profile of profiles) {
    for (const ref of profile.sections ?? []) {
      if (ref.id === sectionId) uses.push({ profileId: profile.id, scope: ref.scope ?? "inherit" });
    }
  }
  return uses.sort((a, b) => a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0);
}

export {
  sectionRefTargets,
  resolveSectionRefId,
  rowAliases,
  refNamesRow,
  usedIn
};
//# sourceMappingURL=chunk-6RN5PND4.js.map
