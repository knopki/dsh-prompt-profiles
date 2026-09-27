import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/domain/model.ts
var SECTION_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/section";
var PROFILE_PLUGIN_NAME = "@knopki/dsh-prompt-profiles/profile";
var SECTION_ID_PREFIX = "prompt-section-";
var PROFILE_ID_PREFIX = "prompt-profile-";
var PERSONA_PLUGIN_NAME = "@deepseek-ai/dsh-persona";
var SCOPES = ["inherit", "main-only", "subagents-only"];

// src/host/domain/ids.ts
import { randomUUID } from "node:crypto";
var ID_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
function idPrefix(kind) {
  return kind === "section" ? SECTION_ID_PREFIX : PROFILE_ID_PREFIX;
}
function isValidToken(token) {
  return ID_TOKEN_PATTERN.test(token);
}
function toPatchId(value) {
  if (typeof value !== "string" || value === "") return value;
  return value.slice(value.lastIndexOf(":") + 1);
}
function rowId(kind, token) {
  return `${idPrefix(kind)}${token}`;
}
function normalizeNewRowId(kind, value) {
  if (typeof value !== "string") return null;
  const bare = toPatchId(value);
  if (typeof bare !== "string" || bare === "") return null;
  const prefix = idPrefix(kind);
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}
function normalizeExplicitRowId(kind, value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const full = normalizeNewRowId(kind, value);
  if (full === null) return null;
  const token = full.slice(idPrefix(kind).length);
  return isValidToken(token) ? full : null;
}
function findRow(rows, value) {
  if (typeof value !== "string" || value === "") return null;
  const normalized = toPatchId(value);
  return (rows ?? []).find(
    (candidate) => candidate.rowId === value || candidate.rowId === normalized || toPatchId(candidate.rowId) === normalized || candidate.id === value || candidate.id === normalized
  ) ?? null;
}
var tokenSource = { next: () => randomUUID().replace(/-/g, "").slice(0, 8) };
function newRowId(kind, taken) {
  for (; ; ) {
    const candidate = normalizeNewRowId(kind, tokenSource.next());
    if (candidate !== null && !taken.has(candidate)) return candidate;
  }
}
function takenIds(rows, extra) {
  const taken = /* @__PURE__ */ new Set();
  const add = (value) => {
    if (typeof value !== "string" || value === "") return;
    taken.add(value);
    const normalized = toPatchId(value);
    if (typeof normalized === "string" && normalized !== "") taken.add(normalized);
  };
  for (const row of rows) {
    add(row.rowId);
    add(row.id);
  }
  for (const value of extra ?? []) add(value);
  return taken;
}
function configIds(rows) {
  return new Set(rows.map((row) => row.id).filter((id) => typeof id === "string"));
}

export {
  SECTION_PLUGIN_NAME,
  PROFILE_PLUGIN_NAME,
  SECTION_ID_PREFIX,
  PROFILE_ID_PREFIX,
  PERSONA_PLUGIN_NAME,
  SCOPES,
  ID_TOKEN_PATTERN,
  idPrefix,
  isValidToken,
  toPatchId,
  rowId,
  normalizeNewRowId,
  normalizeExplicitRowId,
  findRow,
  tokenSource,
  newRowId,
  takenIds,
  configIds
};
//# sourceMappingURL=chunk-FCXDNQEO.js.map
