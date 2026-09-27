import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  require_dist
} from "./chunk-EU4N3AP7.js";
import {
  toPatchId
} from "./chunk-FCXDNQEO.js";
import {
  __toESM
} from "./chunk-EU2VRU6C.js";

// src/host/infra/patch-writer.ts
var import_yaml = __toESM(require_dist(), 1);
import { randomBytes } from "node:crypto";
import { promises as fsp, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
var parseOptions = { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] };
var mutexTail = Promise.resolve();
function withMutex(fn) {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.then(
    () => {
    },
    () => {
    }
  );
  return run;
}
var withWriteLock = withMutex;
var writeLock = { run: (fn) => withMutex(fn) };
var writeGate = null;
function setWriteGate(gate) {
  writeGate = gate;
}
function runGated(section) {
  return writeGate ? writeGate(section) : section();
}
function loadDocument(patchPath) {
  let text;
  try {
    text = readFileSync(patchPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    text = "[]\n";
  }
  const document = (0, import_yaml.parseDocument)(text, parseOptions);
  if (document.errors.length > 0) throw document.errors[0];
  if (!(0, import_yaml.isSeq)(document.contents)) throw new Error("prompt-profiles writer: profile patch must be a YAML sequence");
  document.contents.flow = false;
  return { document, text };
}
async function writeAtomic(patchPath, text) {
  const directory = dirname(patchPath);
  const temp = join(directory, `.${basename(patchPath)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const handle = await fsp.open(temp, "wx", 384);
    try {
      await handle.writeFile(text, "utf8");
    } finally {
      await handle.close();
    }
    await fsp.rename(temp, patchPath);
  } catch (error) {
    await fsp.rm(temp, { force: true });
    throw error;
  }
}
function findInsertItem(document, rowId) {
  const items = document.contents.items;
  for (let entry = 0; entry < items.length; entry++) {
    const holder = items[entry];
    const insert = (0, import_yaml.isMap)(holder) ? holder.get("insert") : void 0;
    if (!(0, import_yaml.isSeq)(insert)) continue;
    for (let row = 0; row < insert.items.length; row++) {
      const candidate = insert.items[row];
      if ((0, import_yaml.isMap)(candidate) && candidate.get("id") === rowId) return { entry, row };
    }
  }
  return null;
}
function findBareRow(document, rowId, name) {
  const items = document.contents.items;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (!(0, import_yaml.isMap)(item) || item.has("insert") || item.get("id") !== rowId) continue;
    const expectedName = item.get("name");
    if (name != null && expectedName != null && expectedName !== name) continue;
    return index;
  }
  return null;
}
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function validateRow(row) {
  if (!row || typeof row !== "object") throw new TypeError("writer: row must be an object");
  if (typeof row.id !== "string" || row.id === "") throw new TypeError("writer: row.id must be a non-empty string");
  if (!SAFE_ID.test(row.id) || row.id.includes("..")) {
    throw new TypeError(`writer: row.id must be a slug without '/', '' or '..' segments (got "${row.id}")`);
  }
  if (typeof row.name !== "string" || row.name === "")
    throw new TypeError("writer: row.name must be a non-empty string");
}
function findExistingRowId(document, rowId) {
  const items = document.contents.items;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!(0, import_yaml.isMap)(item)) continue;
    if (item.get("id") === rowId && !item.has("insert")) return { kind: "bare" };
    const insert = item.get("insert");
    if ((0, import_yaml.isSeq)(insert)) {
      for (const row of insert.items) {
        if ((0, import_yaml.isMap)(row) && row.get("id") === rowId) return { kind: "insert" };
      }
    }
  }
  return null;
}
async function editUnlocked(patchPath, mutate) {
  const { document } = loadDocument(patchPath);
  if (mutate(document) === false) return false;
  await writeAtomic(patchPath, String(document));
  return true;
}
function insertMutation(row) {
  validateRow(row);
  return (document) => {
    const existing = findExistingRowId(document, row.id);
    if (existing !== null) {
      throw new Error(`writer: row id "${row.id}" already exists in the profile patch (as a ${existing.kind} row)`);
    }
    document.add(document.createNode({ insert: [row] }));
  };
}
function preserveLeadingComment(document, index) {
  const comment = document.contents.items[index]?.commentBefore;
  if (typeof comment !== "string" || comment === "") return;
  const next = document.contents.items[index + 1];
  if (next) next.commentBefore = next.commentBefore ? `${comment}
${next.commentBefore}` : comment;
  else
    document.contents.commentBefore = document.contents.commentBefore ? `${document.contents.commentBefore}
${comment}` : comment;
}
function removeMutation(rowId) {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  return (document) => {
    const found = findInsertItem(document, rowId);
    if (found === null) return false;
    const holder = document.contents.items[found.entry];
    const insert = (0, import_yaml.isMap)(holder) ? holder.get("insert") : void 0;
    if (!(0, import_yaml.isSeq)(insert)) return false;
    insert.delete(found.row);
    if (insert.items.length === 0) {
      preserveLeadingComment(document, found.entry);
      document.delete(found.entry);
    }
    for (let index = document.contents.items.length - 1; index >= 0; index--) {
      const item = document.contents.items[index];
      if ((0, import_yaml.isMap)(item) && !item.has("insert") && item.get("id") === rowId) {
        preserveLeadingComment(document, index);
        document.delete(index);
      }
    }
  };
}
function disableMutation(rowId, name) {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  if (typeof name !== "string" || name === "") throw new TypeError("writer: name must be a non-empty string");
  return (document) => {
    const index = findBareRow(document, rowId, name);
    if (index === null) {
      document.add(document.createNode({ id: rowId, name, disabled: true }));
      return;
    }
    const item = document.contents.items[index];
    if (!(0, import_yaml.isMap)(item)) return;
    if (item.get("disabled") === true) return false;
    item.set("name", name);
    item.set("disabled", true);
  };
}
function insertRow({ patchPath, row }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, insertMutation(row))));
}
function removeRow({ patchPath, rowId }) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, removeMutation(rowId))));
}
function disableRow({
  patchPath,
  rowId,
  name
}) {
  return withMutex(() => runGated(() => editUnlocked(patchPath, disableMutation(rowId, name))));
}
function rowNamesId(node, candidates) {
  if (!(0, import_yaml.isMap)(node)) return false;
  const config = node.get("config");
  for (const value of [node.get("id"), (0, import_yaml.isMap)(config) ? config.get("id") : null]) {
    if (typeof value !== "string" || value === "") continue;
    if (candidates.has(value)) return true;
    const normalized = toPatchId(value);
    if (typeof normalized === "string" && normalized !== "" && candidates.has(normalized)) return true;
  }
  return false;
}
function provenance({ patchPath, rowId }) {
  if (typeof rowId !== "string" || rowId === "") throw new TypeError("writer: rowId must be a non-empty string");
  const normalized = toPatchId(rowId);
  const candidates = new Set(typeof normalized === "string" && normalized !== "" ? [rowId, normalized] : [rowId]);
  const { document } = loadDocument(patchPath);
  let inserted = false;
  let overridden = false;
  for (const item of document.contents.items) {
    const insert = (0, import_yaml.isMap)(item) ? item.get("insert") : void 0;
    if ((0, import_yaml.isSeq)(insert)) {
      if (!inserted && insert.items.some((row) => rowNamesId(row, candidates))) inserted = true;
      continue;
    }
    if (!overridden && (0, import_yaml.isMap)(item) && rowNamesId(item, candidates)) overridden = true;
  }
  return {
    source: inserted ? "user" : overridden ? "bundle" : "unknown",
    inserted,
    overridden
  };
}
function listRowIds({ patchPath }) {
  const { document } = loadDocument(patchPath);
  const ids = /* @__PURE__ */ new Set();
  for (const item of document.contents.items) {
    if (!(0, import_yaml.isMap)(item)) continue;
    if (!item.has("insert")) {
      const id = item.get("id");
      if (typeof id === "string") ids.add(id);
      continue;
    }
    const insert = item.get("insert");
    if ((0, import_yaml.isSeq)(insert)) {
      for (const row of insert.items) {
        if ((0, import_yaml.isMap)(row)) {
          const id = row.get("id");
          if (typeof id === "string") ids.add(id);
        }
      }
    }
  }
  return ids;
}
function readPatchRows({ patchPath }) {
  const { document } = loadDocument(patchPath);
  const rows = [];
  const push = (row) => {
    if (!(0, import_yaml.isMap)(row)) return;
    const config = row.get("config");
    const configMap = (0, import_yaml.isMap)(config) ? config : null;
    rows.push({
      id: typeof row.get("id") === "string" ? row.get("id") : null,
      name: typeof row.get("name") === "string" ? row.get("name") : null,
      disabled: row.get("disabled") === true,
      hasConfig: configMap !== null,
      configId: configMap && typeof configMap.get("id") === "string" ? configMap.get("id") : null
    });
  };
  for (const item of document.contents.items) {
    if (!(0, import_yaml.isMap)(item)) continue;
    const insert = item.get("insert");
    if ((0, import_yaml.isSeq)(insert)) {
      for (const row of insert.items) push(row);
      continue;
    }
    push(item);
  }
  return rows;
}
function renameSectionRow({
  patchPath,
  row,
  oldRowId,
  oldName,
  bundleOwned
}) {
  return withPatchBatch(
    { patchPath },
    (edit) => edit((document) => {
      insertMutation(row)(document);
      if (bundleOwned) disableMutation(oldRowId, oldName)(document);
      else removeMutation(oldRowId)(document);
    })
  );
}
async function withPatchBatch({ patchPath }, run) {
  return withMutex(
    () => runGated(async () => {
      let backup;
      try {
        backup = await fsp.readFile(patchPath, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        backup = "[]\n";
      }
      let wrote = false;
      try {
        return await run(async (mutate) => {
          const result = await editUnlocked(patchPath, mutate);
          if (result === true) wrote = true;
          return result;
        });
      } catch (error) {
        if (wrote) await writeAtomic(patchPath, backup);
        throw error;
      }
    })
  );
}
function createPatchPort(editor) {
  const path = () => editor.documentPath;
  return {
    path,
    rows: () => readPatchRows({ patchPath: path() }),
    rowIds: () => listRowIds({ patchPath: path() }),
    ownership: (rowId) => provenance({ patchPath: path(), rowId }),
    patchIdOf: (rowId) => {
      try {
        const entry = (editor.entries?.() ?? []).find((candidate) => {
          const id = candidate?.options?.id;
          return typeof id === "string" && (id === rowId || toPatchId(id) === toPatchId(rowId));
        });
        if (entry?.options?.id !== void 0) return toPatchId(entry.options.id);
      } catch {
      }
      return toPatchId(rowId);
    },
    insert: (row) => insertRow({ patchPath: path(), row }),
    remove: (rowId) => removeRow({ patchPath: path(), rowId }),
    disable: (rowId, name) => disableRow({ patchPath: path(), rowId, name }),
    renameSection: (request) => renameSectionRow({ patchPath: path(), ...request })
  };
}

export {
  withWriteLock,
  writeLock,
  setWriteGate,
  insertRow,
  removeRow,
  disableRow,
  provenance,
  listRowIds,
  readPatchRows,
  renameSectionRow,
  withPatchBatch,
  createPatchPort
};
//# sourceMappingURL=chunk-K2IK3FRY.js.map
