window.__ModuleLoader__.load({ id: "@knopki/dsh-prompt-profiles", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";

// src/client/index.ts
var React = require("react");
var {
  Menu,
  Modal,
  Tag,
  Toast,
  Tooltip,
  Input,
  SegmentedTabs,
  Checkbox,
  Button,
  IconChevronsUpDownOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineMedium,
  IconEditOutlineRegular,
  IconCopyOutlineRegular,
  IconTrashOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  IconWarningOutlineRegular
} = require("@deepseek-ai/dsh-client-ui-primitives");
var h = React.createElement;
var NS = "promptProfiles";
var messages = {
  // chip
  none: "None",
  untitled: "(no title)",
  loadError: "Could not load prompt profiles.",
  saveError: "Could not save prompt profile.",
  requestFailed: "Prompt profiles request failed",
  menuLabel: "Choose a prompt profile",
  chooseNeedsWorkspace: "Choose a workspace first \u2014 the profile choice is remembered per workspace.",
  // settings page
  nav: "Prompt profiles",
  tabProfiles: "Profiles",
  tabSections: "Sections",
  tabPreview: "Preview",
  profileWord: "Profile",
  back: "Back",
  searchPlaceholder: "Search\u2026",
  newProfile: "+ New profile",
  newSection: "+ New section",
  addSection: "Add section",
  creating: "creating\u2026",
  defaultSectionTitle: "New section",
  defaultProfileTitle: "New profile",
  createError: "Could not create:",
  createTimeout: "the new item did not appear in time \u2014 retry or reload the page.",
  defaultForNewSessions: "Default for new sessions",
  builtIn: "built-in",
  builtInNote: "Some built-in sections may be absent in a given mode.",
  scopeLabel: "Scope",
  scopeInherit: "inherit",
  scopeMainOnly: "main-only",
  scopeSubagentsOnly: "subagents-only",
  sourceLabel: "source",
  sourceBundle: "bundle",
  sourceUnknown: "unknown",
  usedIn: "Used in",
  notUsed: "not used",
  openInSectionTab: "Open in Sections",
  remove: "Remove from profile",
  duplicate: "Duplicate",
  deleteLabel: "Delete",
  renameId: "Change id",
  copySuffix: "(copy)",
  renameIdLocked: "Bundle-owned section \u2014 its id cannot be changed, only disabled.",
  titleLabel: "Title",
  bodyLabel: "Body",
  orderLabel: "Order",
  cancel: "Cancel",
  confirm: "Confirm",
  confirmDeleteProfile: "Delete this profile?",
  confirmDeleteSection: "Delete this section?",
  confirmRemoveRef: "Remove this section from the profile?",
  confirmRename: "Change section id?",
  // The host no longer rewrites profile references on rename.
  renameNote: "Change the id? References in profiles are NOT updated \u2014 fix them manually.",
  renameAffected: "These profiles still reference the old id \u2014 fix them manually:",
  renameEmpty: "Enter a new id \u2014 it cannot be empty.",
  titleRequired: "Enter a name \u2014 a section needs a non-empty title before it can be saved.",
  dragHandle: "Drag to reorder",
  missingSection: "section not found",
  emptyBody: "empty body \u2014 not emitted",
  completeModeWarning: "Profile sections are discarded in complete modes:",
  conflictError: "Concurrent edit \u2014 state reloaded.",
  pickerTitle: "Add sections",
  pickerAdd: "Add",
  pickerEmpty: "No sections to add",
  builtinMarker: "\u27E8built-in\u27E9",
  skippedMarker: "\u27E8skipped\u27E9",
  brokenWord: "broken",
  noProfiles: "No profiles yet.",
  noSections: "No sections yet.",
  previewEmpty: "This profile emits no sections.",
  previewVariables: "Substituted at session start \u2014 may differ from this preview:",
  sectionsWord: "sections"
};
var ru = {
  // chip
  none: "\u041D\u0435\u0442",
  untitled: "(\u0431\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F)",
  loadError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u0438 \u043F\u0440\u043E\u043C\u043F\u0442\u0430.",
  saveError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u0440\u043E\u043C\u043F\u0442\u0430.",
  requestFailed: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u043F\u0440\u043E\u0444\u0438\u043B\u0435\u0439 \u043F\u0440\u043E\u043C\u043F\u0442\u0430",
  menuLabel: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u0440\u043E\u043C\u043F\u0442\u0430",
  chooseNeedsWorkspace: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u043E\u0440\u043A\u0441\u043F\u0435\u0439\u0441 \u2014 \u0432\u044B\u0431\u043E\u0440 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u0437\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u0432\u043E\u0440\u043A\u0441\u043F\u0435\u0439\u0441\u0430.",
  // settings page
  nav: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438 \u043F\u0440\u043E\u043C\u043F\u0442\u0430",
  tabProfiles: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438",
  tabSections: "\u0421\u0435\u043A\u0446\u0438\u0438",
  tabPreview: "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440",
  profileWord: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C",
  back: "\u041D\u0430\u0437\u0430\u0434",
  searchPlaceholder: "\u041F\u043E\u0438\u0441\u043A\u2026",
  newProfile: "+ \u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
  newSection: "+ \u041D\u043E\u0432\u0430\u044F \u0441\u0435\u043A\u0446\u0438\u044F",
  addSection: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0435\u043A\u0446\u0438\u044E",
  creating: "\u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435\u2026",
  defaultSectionTitle: "\u041D\u043E\u0432\u0430\u044F \u0441\u0435\u043A\u0446\u0438\u044F",
  defaultProfileTitle: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
  createError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C:",
  createTimeout: "\u043D\u043E\u0432\u044B\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u043D\u0435 \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F \u0432\u043E\u0432\u0440\u0435\u043C\u044F \u2014 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.",
  defaultForNewSessions: "\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0434\u043B\u044F \u043D\u043E\u0432\u044B\u0445 \u0441\u0435\u0441\u0441\u0438\u0439",
  builtIn: "\u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u0430\u044F",
  builtInNote: "\u0427\u0430\u0441\u0442\u044C \u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u044B\u0445 \u0441\u0435\u043A\u0446\u0438\u0439 \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u0432 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435.",
  scopeLabel: "\u041E\u0431\u043B\u0430\u0441\u0442\u044C",
  scopeInherit: "\u043D\u0430\u0441\u043B\u0435\u0434\u0443\u0435\u0442\u0441\u044F",
  scopeMainOnly: "\u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0430\u0433\u0435\u043D\u0442",
  scopeSubagentsOnly: "\u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u044B",
  sourceLabel: "\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A",
  sourceBundle: "\u0438\u0437 \u0431\u0430\u043D\u0434\u043B\u0430",
  sourceUnknown: "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E",
  usedIn: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0432",
  notUsed: "\u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F",
  openInSectionTab: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 \xAB\u0421\u0435\u043A\u0446\u0438\u044F\u0445\xBB",
  remove: "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044F",
  duplicate: "\u0414\u0443\u0431\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  deleteLabel: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
  renameId: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C id",
  copySuffix: "(\u043A\u043E\u043F\u0438\u044F)",
  renameIdLocked: "\u0421\u0435\u043A\u0446\u0438\u044F \u0438\u0437 \u0431\u0430\u043D\u0434\u043B\u0430 \u2014 id \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F, \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C.",
  titleLabel: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
  bodyLabel: "\u0422\u0435\u043A\u0441\u0442",
  orderLabel: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A",
  cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
  confirm: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C",
  confirmDeleteProfile: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u043E\u0442 \u043F\u0440\u043E\u0444\u0438\u043B\u044C?",
  confirmDeleteSection: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0443 \u0441\u0435\u043A\u0446\u0438\u044E?",
  confirmRemoveRef: "\u0423\u0431\u0440\u0430\u0442\u044C \u044D\u0442\u0443 \u0441\u0435\u043A\u0446\u0438\u044E \u0438\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044F?",
  confirmRename: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C id \u0441\u0435\u043A\u0446\u0438\u0438?",
  renameNote: "\u0421\u0441\u044B\u043B\u043A\u0438 \u0432 \u043F\u0440\u043E\u0444\u0438\u043B\u044F\u0445 \u043F\u0440\u0438 \u044D\u0442\u043E\u043C \u041D\u0415 \u043E\u0431\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u2014 \u0438\u0445 \u043F\u0440\u0438\u0434\u0451\u0442\u0441\u044F \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
  renameAffected: "\u0412 \u044D\u0442\u0438\u0445 \u043F\u0440\u043E\u0444\u0438\u043B\u044F\u0445 \u043E\u0441\u0442\u0430\u043B\u0430\u0441\u044C \u0441\u0442\u0430\u0440\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430 \u2014 \u043F\u043E\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0432\u0440\u0443\u0447\u043D\u0443\u044E:",
  renameEmpty: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 id \u2014 \u043F\u0443\u0441\u0442\u044B\u043C \u043E\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u043E\u0436\u0435\u0442.",
  titleRequired: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u2014 \u0441\u0435\u043A\u0446\u0438\u044E \u043D\u0435\u043B\u044C\u0437\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441 \u043F\u0443\u0441\u0442\u044B\u043C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C.",
  dragHandle: "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E\u0440\u044F\u0434\u043E\u043A",
  missingSection: "\u0441\u0435\u043A\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430",
  emptyBody: "\u043F\u0443\u0441\u0442\u043E\u0439 \u0442\u0435\u043A\u0441\u0442 \u2014 \u043D\u0435 \u0432\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F",
  completeModeWarning: "\u0412 \u0440\u0435\u0436\u0438\u043C\u0430\u0445 \u0441 \u043F\u043E\u043B\u043D\u043E\u0439 \u0437\u0430\u043C\u0435\u043D\u043E\u0439 \u043F\u0440\u043E\u043C\u043F\u0442\u0430 \u0441\u0435\u043A\u0446\u0438\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u043E\u0442\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F:",
  conflictError: "\u041F\u0430\u0440\u0430\u043B\u043B\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u2014 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E.",
  pickerTitle: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0435\u043A\u0446\u0438\u0438",
  pickerAdd: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C",
  pickerEmpty: "\u041D\u0435\u0442 \u0441\u0435\u043A\u0446\u0438\u0439 \u0434\u043B\u044F \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u044F",
  builtinMarker: "\u27E8\u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u0430\u044F\u27E9",
  skippedMarker: "\u27E8\u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E\u27E9",
  brokenWord: "\u0431\u0438\u0442\u044B\u0445",
  noProfiles: "\u041F\u0440\u043E\u0444\u0438\u043B\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
  noSections: "\u0421\u0435\u043A\u0446\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
  previewEmpty: "\u042D\u0442\u043E\u0442 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435 \u0432\u044B\u0434\u0430\u0451\u0442 \u043D\u0438 \u043E\u0434\u043D\u043E\u0439 \u0441\u0435\u043A\u0446\u0438\u0438.",
  previewVariables: "\u041F\u043E\u0434\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u043F\u0440\u043E\u0438\u0437\u043E\u0439\u0434\u0451\u0442 \u043F\u0440\u0438 \u0441\u0442\u0430\u0440\u0442\u0435 \u0441\u0435\u0441\u0441\u0438\u0438 \u2014 \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F \u043E\u0442 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430:",
  sectionsWord: "\u0441\u0435\u043A\u0446\u0438\u0439"
};
var zh = {
  // chip
  none: "\u65E0",
  untitled: "\uFF08\u65E0\u6807\u9898\uFF09",
  loadError: "\u65E0\u6CD5\u52A0\u8F7D\u63D0\u793A\u914D\u7F6E\u3002",
  saveError: "\u65E0\u6CD5\u4FDD\u5B58\u63D0\u793A\u914D\u7F6E\u3002",
  requestFailed: "\u63D0\u793A\u914D\u7F6E\u8BF7\u6C42\u5931\u8D25",
  menuLabel: "\u9009\u62E9\u63D0\u793A\u914D\u7F6E",
  chooseNeedsWorkspace: "\u8BF7\u5148\u9009\u62E9\u5DE5\u4F5C\u533A\u2014\u2014\u63D0\u793A\u914D\u7F6E\u7684\u9009\u62E9\u6309\u5DE5\u4F5C\u533A\u4FDD\u5B58\u3002",
  // settings page
  nav: "\u63D0\u793A\u914D\u7F6E",
  tabProfiles: "\u914D\u7F6E",
  tabSections: "\u7247\u6BB5",
  tabPreview: "\u9884\u89C8",
  profileWord: "\u914D\u7F6E",
  back: "\u8FD4\u56DE",
  searchPlaceholder: "\u641C\u7D22\u2026",
  newProfile: "+ \u65B0\u5EFA\u914D\u7F6E",
  newSection: "+ \u65B0\u5EFA\u7247\u6BB5",
  addSection: "\u6DFB\u52A0\u7247\u6BB5",
  creating: "\u521B\u5EFA\u4E2D\u2026",
  defaultSectionTitle: "\u65B0\u7247\u6BB5",
  defaultProfileTitle: "\u65B0\u914D\u7F6E",
  createError: "\u521B\u5EFA\u5931\u8D25\uFF1A",
  createTimeout: "\u65B0\u6761\u76EE\u672A\u80FD\u53CA\u65F6\u51FA\u73B0\u2014\u2014\u8BF7\u91CD\u8BD5\u6216\u5237\u65B0\u9875\u9762\u3002",
  defaultForNewSessions: "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4",
  builtIn: "\u5185\u7F6E",
  builtInNote: "\u90E8\u5206\u5185\u7F6E\u7247\u6BB5\u5728\u7279\u5B9A\u6A21\u5F0F\u4E0B\u53EF\u80FD\u4E0D\u5B58\u5728\u3002",
  scopeLabel: "\u4F5C\u7528\u8303\u56F4",
  scopeInherit: "\u7EE7\u627F",
  scopeMainOnly: "\u4EC5\u4E3B\u4EE3\u7406",
  scopeSubagentsOnly: "\u4EC5\u5B50\u4EE3\u7406",
  sourceLabel: "\u6765\u6E90",
  sourceBundle: "\u6765\u81EA\u63D2\u4EF6\u5305",
  sourceUnknown: "\u672A\u77E5",
  usedIn: "\u7528\u4E8E",
  notUsed: "\u672A\u4F7F\u7528",
  openInSectionTab: "\u5728\u300C\u7247\u6BB5\u300D\u4E2D\u6253\u5F00",
  remove: "\u4ECE\u914D\u7F6E\u4E2D\u79FB\u9664",
  duplicate: "\u590D\u5236",
  deleteLabel: "\u5220\u9664",
  renameId: "\u4FEE\u6539 id",
  copySuffix: "\uFF08\u526F\u672C\uFF09",
  renameIdLocked: "\u63D2\u4EF6\u5305\u63D0\u4F9B\u7684\u7247\u6BB5\u2014\u2014\u65E0\u6CD5\u4FEE\u6539\u5176 id\uFF0C\u53EA\u80FD\u505C\u7528\u3002",
  titleLabel: "\u6807\u9898",
  bodyLabel: "\u5185\u5BB9",
  orderLabel: "\u987A\u5E8F",
  cancel: "\u53D6\u6D88",
  confirm: "\u786E\u8BA4",
  confirmDeleteProfile: "\u5220\u9664\u6B64\u914D\u7F6E\uFF1F",
  confirmDeleteSection: "\u5220\u9664\u6B64\u7247\u6BB5\uFF1F",
  confirmRemoveRef: "\u4ECE\u914D\u7F6E\u4E2D\u79FB\u9664\u6B64\u7247\u6BB5\uFF1F",
  confirmRename: "\u4FEE\u6539\u7247\u6BB5 id\uFF1F",
  renameNote: "\u914D\u7F6E\u4E2D\u7684\u5F15\u7528\u4E0D\u4F1A\u968F\u4E4B\u66F4\u65B0\u2014\u2014\u8BF7\u624B\u52A8\u4FEE\u6539\u3002",
  renameAffected: "\u4EE5\u4E0B\u914D\u7F6E\u4ECD\u5F15\u7528\u65E7 id\u2014\u2014\u8BF7\u624B\u52A8\u4FEE\u6539\uFF1A",
  renameEmpty: "\u8BF7\u8F93\u5165\u65B0\u7684 id\u2014\u2014\u4E0D\u80FD\u4E3A\u7A7A\u3002",
  titleRequired: "\u8BF7\u8F93\u5165\u540D\u79F0\u2014\u2014\u7247\u6BB5\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A\u624D\u80FD\u4FDD\u5B58\u3002",
  dragHandle: "\u62D6\u52A8\u4EE5\u8C03\u6574\u987A\u5E8F",
  missingSection: "\u672A\u627E\u5230\u7247\u6BB5",
  emptyBody: "\u5185\u5BB9\u4E3A\u7A7A\u2014\u2014\u4E0D\u4F1A\u6CE8\u5165",
  completeModeWarning: "\u5728\u5B8C\u5168\u66FF\u6362\u63D0\u793A\u8BCD\u7684\u6A21\u5F0F\u4E0B\uFF0C\u914D\u7F6E\u7247\u6BB5\u4F1A\u88AB\u4E22\u5F03\uFF1A",
  conflictError: "\u5E76\u53D1\u7F16\u8F91\u2014\u2014\u72B6\u6001\u5DF2\u91CD\u65B0\u52A0\u8F7D\u3002",
  pickerTitle: "\u6DFB\u52A0\u7247\u6BB5",
  pickerAdd: "\u6DFB\u52A0",
  pickerEmpty: "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u7247\u6BB5",
  builtinMarker: "\u27E8\u5185\u7F6E\u27E9",
  skippedMarker: "\u27E8\u5DF2\u8DF3\u8FC7\u27E9",
  brokenWord: "\u635F\u574F",
  noProfiles: "\u8FD8\u6CA1\u6709\u914D\u7F6E\u3002",
  noSections: "\u8FD8\u6CA1\u6709\u7247\u6BB5\u3002",
  previewEmpty: "\u6B64\u914D\u7F6E\u4E0D\u4F1A\u6CE8\u5165\u4EFB\u4F55\u7247\u6BB5\u3002",
  previewVariables: "\u5C06\u5728\u4F1A\u8BDD\u542F\u52A8\u65F6\u66FF\u6362\u2014\u2014\u53EF\u80FD\u4E0E\u9884\u89C8\u4E0D\u540C\uFF1A",
  sectionsWord: "\u4E2A\u7247\u6BB5"
};
var boundT = (key) => messages.en[key] ?? key;
function idOf(entry) {
  return entry?.configId ?? entry?.patchId ?? entry?.id ?? null;
}
function refIdOf(entry) {
  return idOf(entry);
}
function dedupeRowPrefix(id) {
  return String(id ?? "").replace(
    /^(prompt-(?:section|profile)-)(?:prompt-(?:section|profile)-)+/,
    "$1"
  );
}
function normalizeSections(refs) {
  return (refs ?? []).map((ref) => ref ? { ...ref, id: dedupeRowPrefix(ref.id) } : ref);
}
function addSectionsToRefs(refs, ids, step = 100) {
  const base = normalizeSections(refs);
  const maxOrder = base.reduce((max, ref) => Math.max(max, ref.order ?? 0), 0);
  return [...base, ...(ids ?? []).map((id, i) => ({
    id: dedupeRowPrefix(id),
    order: maxOrder + step * (i + 1),
    scope: "inherit"
  }))];
}
function profileLabel(profile, t) {
  if (!profile) return t("none");
  return profile.title || idOf(profile) || t("untitled");
}
function escapesDrillDown(event, root) {
  if (!event || event.key !== "Escape") return false;
  const target = event.target;
  if (target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable]")) return false;
  const doc = root && root.document || (typeof document !== "undefined" ? document : null);
  if (doc && typeof doc.querySelector === "function" && doc.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]')) return false;
  return true;
}
function insertionOrders(rows) {
  const orderOf = (row) => row && row.kind !== "broken" && typeof row.order === "number" ? row.order : null;
  const list = rows ?? [];
  const orders = [];
  for (const row of list) {
    const order = orderOf(row);
    if (order !== null) orders.push(order);
  }
  const out = [];
  for (let i = 0; i <= list.length; i++) {
    let above = null;
    for (let j = i - 1; j >= 0; j--) {
      above = orderOf(list[j]);
      if (above !== null) break;
    }
    let below = null;
    for (let j = i; j < list.length; j++) {
      below = orderOf(list[j]);
      if (below !== null) break;
    }
    out[i] = orders.length === 0 ? 100 : above === null ? orders[0] - 1 : below === null ? orders[orders.length - 1] + 1 : above + 1;
  }
  return out;
}
function canSaveSection(title, confirmed) {
  return confirmed === true && String(title ?? "").trim() !== "";
}
function sourceKindOf(source) {
  if (source === "bundle") return "bundle";
  if (source === "unknown") return "unknown";
  return null;
}
function usedInProfileName(state, profileId) {
  const profile = (state?.profiles ?? []).find((p) => idOf(p) === profileId);
  return profile?.title || profileId;
}
function scopeKeyOf(scope) {
  return scope === "main-only" ? "scopeMainOnly" : scope === "subagents-only" ? "scopeSubagentsOnly" : "scopeInherit";
}
function renameNotice(result, t) {
  const affected = Array.isArray(result?.affectedProfiles) ? result.affectedProfiles : [];
  if (affected.length === 0) return null;
  const names = affected.map((p) => p?.title || p?.profileId).filter(Boolean);
  const list = names.length ? names.join(", ") : String(affected.length);
  return `${t("renameAffected")} ${list}`;
}
function outlineRows(profile, sectionsById, builtinOrders) {
  const builtins = builtinOrders ?? {};
  const mapLike = !!sectionsById && typeof sectionsById.get === "function" && typeof sectionsById.has === "function";
  const byId = mapLike ? sectionsById : new Map(Object.entries(sectionsById ?? {}).map(([id, section]) => [id, section]));
  const rows = [];
  for (const [name, order] of Object.entries(builtins)) {
    rows.push({ kind: "builtin", name, order, key: `builtin:${name}` });
  }
  for (const [seq, rawRef] of (profile?.sections ?? []).entries()) {
    const ref = rawRef ? { ...rawRef, id: dedupeRowPrefix(rawRef.id) } : rawRef;
    const section = byId.get(ref.id);
    if (!section) {
      rows.push({ kind: "broken", ref, order: ref.order, seq, key: `broken:${seq}:${ref.id}` });
      continue;
    }
    rows.push({ kind: "ours", ref, section, order: ref.order, seq, key: `ours:${seq}:${ref.id}` });
  }
  rows.sort((a, b) => {
    if (a.kind === "broken" || b.kind === "broken") {
      if (a.kind === b.kind) return (a.seq ?? 0) - (b.seq ?? 0);
      return a.kind === "broken" ? 1 : -1;
    }
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    if (a.kind !== b.kind) return a.kind === "builtin" ? 1 : -1;
    if (a.kind === "builtin") return String(a.name).localeCompare(String(b.name));
    if ((a.seq ?? 0) !== (b.seq ?? 0)) return (a.seq ?? 0) - (b.seq ?? 0);
    return String(a.ref?.id ?? "").localeCompare(String(b.ref?.id ?? ""));
  });
  return rows;
}
function filterSections(sections, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return sections.slice();
  return sections.filter((s) => String(s.title ?? "").toLowerCase().includes(q) || String(idOf(s) ?? "").toLowerCase().includes(q));
}
function previewPlan(response) {
  const r = response ?? {};
  const items = Array.isArray(r.sections) ? r.sections : [];
  const plan = [];
  let builtins = [];
  const flush = () => {
    if (builtins.length) {
      plan.push({ kind: "builtins", names: builtins });
      builtins = [];
    }
  };
  for (const item of items) {
    const isBuiltin = item && (item.builtin === true || item.kind === "builtin" || item.ours === false);
    if (isBuiltin) builtins.push(item.title ?? item.name ?? item.id ?? "?");
    else {
      flush();
      plan.push({ kind: "ours", id: item?.id, title: item?.title ?? item?.id ?? "?", order: item?.order, text: item?.text ?? item?.body ?? "" });
    }
  }
  flush();
  const skipped = (Array.isArray(r.skipped) ? r.skipped : []).map((s) => ({ id: s?.id, title: s?.title ?? s?.id ?? "?", reason: s?.reason ?? "" }));
  return { plan, skipped, variables: r.variables ?? null };
}
function previewVariableNames(text) {
  const names = [];
  const src = String(text ?? "");
  const re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}
function previewVariableNotice(text, body, variables, sessionValues) {
  const used = [.../* @__PURE__ */ new Set([...previewVariableNames(body), ...previewVariableNames(text)])];
  if (used.length === 0) return null;
  const flagged = used.filter((name) => {
    const preview = variables ? variables[name] : void 0;
    if (preview === null || preview === void 0) return true;
    const real = sessionValues ? sessionValues[name] : void 0;
    return real === void 0 || real !== preview;
  });
  return flagged.length ? flagged : null;
}
var profileStateListeners = /* @__PURE__ */ new Set();
var profileStateSeq = 0;
var PROFILES_REFRESH_DEBOUNCE_MS = 150;
function notifyProfilesChanged() {
  profileStateSeq += 1;
  for (const listener of [...profileStateListeners]) {
    try {
      listener(profileStateSeq);
    } catch (_) {
    }
  }
}
function subscribeProfilesChanged(listener) {
  profileStateListeners.add(listener);
  return () => {
    profileStateListeners.delete(listener);
  };
}
var helpers = {
  insertionOrders,
  outlineRows,
  filterSections,
  previewPlan,
  idOf,
  refIdOf,
  dedupeRowPrefix,
  normalizeSections,
  addSectionsToRefs,
  canSaveSection,
  sourceKindOf,
  usedInProfileName,
  renameNotice,
  scopeKeyOf,
  profileLabel,
  escapesDrillDown,
  previewVariableNotice,
  notifyProfilesChanged,
  subscribeProfilesChanged
};
var ApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
async function request(path, options) {
  const hasBody = options?.body !== void 0;
  const headers = hasBody ? { "content-type": "application/json", ...options?.headers || {} } : { ...options?.headers || {} };
  const response = await fetch(`/api/__dsh-prompt-profiles/${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `${boundT("requestFailed")} (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error?.message) message = data.error.message;
    } catch (_) {
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}
var post = (body) => ({ method: "POST", body: JSON.stringify(body) });
function errText(err) {
  return err && typeof err.message === "string" ? err.message : "";
}
var makeApi = (req) => ({
  loadState: () => req("state"),
  preview: (profileId) => req(`preview?profileId=${encodeURIComponent(profileId)}`),
  sectionCreate: (value) => req("section/create", post(value)),
  sectionUpdate: (patchId, value) => req("section/update", post({ rowId: patchId, value })),
  sectionDelete: (patchId) => req("section/delete", post({ rowId: patchId })),
  sectionRename: (patchId, id) => req("section/rename", post({ rowId: patchId, id })),
  profileCreate: (value) => req("profile/create", post(value)),
  profileUpdate: (patchId, value) => req("profile/update", post({ rowId: patchId, value })),
  profileDelete: (patchId) => req("profile/delete", post({ rowId: patchId })),
  setDefault: (value) => req("default", post({ default: value }))
});
var clientApi = makeApi(request);
function useNotifier() {
  const [notice, setNotice] = React.useState(null);
  const seq = React.useRef(0);
  const notify = React.useCallback((text) => {
    seq.current += 1;
    setNotice({ seq: seq.current, text: String(text ?? "") });
  }, []);
  const dismiss = React.useCallback(() => setNotice(null), []);
  const banner = notice && h(Toast, {
    key: `notice-${notice.seq}`,
    text: notice.text,
    icon: h(IconWarningOutlineRegular, {}),
    onDone: dismiss
  });
  return { notify, dismiss, banner };
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function findEntry(state, patchId) {
  for (const key of ["sections", "profiles"]) {
    const hit = (state?.[key] ?? []).find((entry) => entry && (entry.patchId === patchId || entry.configId === patchId || entry.rowId === patchId));
    if (hit) return hit;
  }
  return null;
}
function optimisticEntry(kind, created) {
  const id = created?.configId ?? created?.patchId ?? created?.rowId;
  if (kind === "section") {
    return {
      rowId: created?.rowId ?? id,
      patchId: created?.patchId ?? id,
      configId: id,
      title: created?.title ?? "",
      body: created?.body ?? "",
      usedIn: [],
      source: "user",
      emits: typeof created?.body === "string" && created.body.trim() !== ""
    };
  }
  return {
    rowId: created?.rowId ?? id,
    patchId: created?.patchId ?? id,
    configId: id,
    title: created?.title ?? "",
    sections: created?.sections ?? [],
    usedIn: [],
    source: "user"
  };
}
function makeCreateFlow({
  api,
  t,
  notify,
  reload,
  getState,
  onState,
  onDrill,
  onPending,
  pollInterval = 500,
  pollDeadline = 1e4
}) {
  let busy = false;
  const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
  async function pollFor(patchId) {
    for (let attempt = 1; ; attempt++) {
      const state = await api.loadState();
      const found = findEntry(state, patchId);
      if (found) return { state, found };
      if (attempt >= maxTries) {
        throw new ApiError(504, `${t("createTimeout")}`);
      }
      await sleep(pollInterval);
    }
  }
  async function create(kind, value) {
    if (busy) return { ok: false, busy: true };
    busy = true;
    if (onPending) onPending(true);
    try {
      const created = kind === "section" ? await api.sectionCreate(value) : await api.profileCreate(value);
      const prior = getState ? getState() : null;
      const listKey = kind === "section" ? "sections" : "profiles";
      if (onState && prior) {
        onState({ ...prior, [listKey]: [...prior?.[listKey] ?? [], optimisticEntry(kind, created)] });
      }
      const { state, found } = await pollFor(created.patchId ?? created.rowId);
      if (onState) onState(state);
      if (onDrill) onDrill(idOf(found));
      notifyProfilesChanged();
      return { ok: true, item: found, created };
    } catch (err) {
      notify(`${t("createError")} ${errText(err)}`.trim());
      if (reload) {
        try {
          await reload();
        } catch (_) {
        }
      }
      return { ok: false, error: err };
    } finally {
      busy = false;
      if (onPending) onPending(false);
    }
  }
  return { create, isBusy: () => busy };
}
function makeMutationFlow({
  api,
  t,
  notify,
  reload,
  getState,
  onState,
  onPending,
  pollInterval = 500,
  pollDeadline = 1e4
}) {
  let busy = false;
  const maxTries = Math.max(1, Math.floor(pollDeadline / Math.max(1, pollInterval)));
  async function run({ mutate, optimistic, agree, onDone }) {
    if (busy) return { ok: false, busy: true };
    busy = true;
    if (onPending) onPending(true);
    const prior = getState ? getState() : null;
    try {
      const result = await mutate();
      if (onState && prior && optimistic) onState(optimistic(prior, result));
      let state = prior;
      for (let attempt = 1; ; attempt++) {
        state = await api.loadState();
        if (!agree || agree(state, result)) break;
        if (attempt >= maxTries) throw new ApiError(504, `${t("createTimeout")}`);
        await sleep(pollInterval);
      }
      if (onState) onState(state);
      if (onDone) onDone(state, result);
      notifyProfilesChanged();
      return { ok: true, result };
    } catch (err) {
      if (onState && prior) onState(prior);
      notify(`${t("createError")} ${errText(err)}`.trim());
      if (reload) {
        try {
          await reload();
        } catch (_) {
        }
      }
      return { ok: false, error: err };
    } finally {
      busy = false;
      if (onPending) onPending(false);
    }
  }
  return { run, isBusy: () => busy };
}
var triggerLabelStyle = {
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  overflow: "hidden",
  minWidth: 0,
  color: "var(--dsw-alias-label-secondary)"
};
var triggerChevronStyle = {
  color: "var(--dsw-alias-label-caption)",
  flex: "none",
  display: "inline-flex"
};
var chipMaxWidth = { maxWidth: "220px" };
function PromptProfileChip(props) {
  const { sessionId, useSession, useWorkspaces, useSessions = () => void 0, t, pick } = props;
  const session = useSession((s) => s);
  const workspace = useWorkspaces((s) => s.items.find((w) => w.sessionIds.includes(sessionId)));
  const workspaceId = workspace?.workspaceId;
  const cwd = useSessions((s) => s?.byId?.[sessionId]?.cwd) ?? workspace?.path;
  const activeModeId = useSessions((s) => {
    const value = s?.byId?.[sessionId]?.projectionValues?.agentPreset;
    return typeof value === "string" ? value : void 0;
  });
  const [state, setState] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const { notify, banner } = useNotifier();
  React.useEffect(() => {
    let live = true;
    const load = () => request("state").then((value) => {
      if (live) setState(value);
    }).catch((err) => {
      if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"));
    });
    load();
    let timer = null;
    const unsubscribe = subscribeProfilesChanged(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        load();
      }, PROFILES_REFRESH_DEBOUNCE_MS);
    });
    return () => {
      live = false;
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [t, notify]);
  if (!session || session.blank !== true || !state || !state.profiles?.length) return null;
  const lastKey = workspaceId ?? cwd;
  const lastChoice = state.lastByWorkspace ?? {};
  const hasChoice = Boolean(lastKey) && Object.prototype.hasOwnProperty.call(lastChoice, lastKey);
  const chosen = hasChoice ? lastChoice[lastKey] : void 0;
  const chosenProfile = chosen ? state.profiles.find((p) => idOf(p) === chosen) : void 0;
  const selected = hasChoice && chosen === "" ? void 0 : chosenProfile || state.profiles.find((p) => idOf(p) === state.default);
  const activeMode = activeModeId ? (state.modes ?? []).find((m) => m.id === activeModeId) : void 0;
  const completeMode = activeMode && activeMode.complete === true ? activeMode : void 0;
  const modeWarning = completeMode ? `${t("completeModeWarning")} ${completeMode.title ?? completeMode.id}` : null;
  const profiles = [...state.profiles].sort((a, b) => a.title.localeCompare(b.title));
  const choose = async (profileId) => {
    if (!lastKey) {
      setOpen(false);
      notify(t("chooseNeedsWorkspace"));
      return;
    }
    const previous = state;
    setState({ ...state, lastByWorkspace: { ...state.lastByWorkspace, [lastKey]: profileId || "" } });
    setOpen(false);
    const choice = { profileId };
    if (workspaceId) choice.workspaceId = workspaceId;
    else if (cwd) choice.cwd = cwd;
    try {
      await pick(choice);
      const refreshed = await request("state");
      setState(refreshed);
    } catch (err) {
      setState(previous);
      notify(errText(err) ? `${t("saveError")} ${errText(err)}`.trim() : t("saveError"));
    }
  };
  const items = [
    { id: "none", label: t("none") },
    ...profiles.map((profile) => ({ id: idOf(profile), label: profile.title }))
  ];
  const triggerChildren = [
    h("span", { style: triggerLabelStyle }, profileLabel(selected, t)),
    completeMode && h("span", {
      "data-complete-warning": completeMode.id,
      "aria-hidden": true,
      style: { color: "var(--dsw-alias-state-warning-primary, orange)", flex: "none", display: "inline-flex" }
    }, h(IconWarningOutlineRegular, { size: 14 })),
    h("span", { "aria-hidden": true, style: triggerChevronStyle }, h(IconChevronDownOutlineRegular, { size: 14 }))
  ].filter(Boolean);
  return h(
    React.Fragment,
    null,
    h(Menu, {
      open,
      onClose: () => setOpen(false),
      // Match the composer's own dropdowns (see conversation.input.permission):
      // they open UPWARD, portaled out of the composer's clipping.
      side: "top",
      portal: true,
      // Button owns radius/padding/typography/colour and the hover, focus
      // and active states; the chevron is a TRAILING child (the primitive has
      // no trailing-icon slot), after the label, as on the neighbouring
      // composer controls.
      anchor: h(Button, {
        variant: "ghost",
        size: "sm",
        "aria-label": t("menuLabel"),
        // The complete-mode warning wins the hover text (it explains why the
        // chosen profile will not be used); otherwise the blocked state
        // explains itself and the accessible name stays the control's label.
        title: modeWarning ?? (lastKey ? t("menuLabel") : t("chooseNeedsWorkspace")),
        onClick: () => setOpen(!open),
        // Dim the trigger in a complete mode — the profile is inert.
        style: completeMode ? { ...chipMaxWidth, opacity: 0.6 } : chipMaxWidth
      }, ...triggerChildren),
      items,
      selectedId: selected ? idOf(selected) : "none",
      onSelect: (id) => choose(id === "none" ? "" : id)
    }),
    banner
  );
}
function useProfilesState(api, t, notify) {
  const [state, setState] = React.useState(null);
  const reload = React.useCallback(() => api.loadState().then(setState).catch((err) => notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"))), [api, t, notify]);
  React.useEffect(() => {
    reload();
  }, [reload]);
  return { state, setState, reload };
}
function useAutosave(value, save, delay = 1200) {
  const latest = React.useRef(save);
  latest.current = save;
  const skipFirst = React.useRef(true);
  const timer = React.useRef(null);
  const dirty = React.useRef(false);
  const flush = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (dirty.current) {
      dirty.current = false;
      latest.current();
    }
  }, []);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return void 0;
    }
    dirty.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      dirty.current = false;
      latest.current();
    }, delay);
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [value, delay]);
  React.useEffect(() => () => flush(), [flush]);
  return flush;
}
async function runSave(fn, reload, t, notify, onError) {
  const fail = (prefix, err) => {
    const text = `${prefix} ${errText(err)}`.trim();
    notify(text);
    if (onError) onError(text);
  };
  try {
    await fn();
    await reload();
    if (onError) onError("");
    notifyProfilesChanged();
    return true;
  } catch (err) {
    if (err && err.status === 409) {
      try {
        await reload();
        await fn();
        await reload();
        if (onError) onError("");
        notifyProfilesChanged();
        return true;
      } catch (retryErr) {
        fail(t("conflictError"), retryErr);
        return false;
      }
    }
    fail(t("saveError"), err);
    return false;
  }
}
function useFocusSelect(ref, active) {
  React.useEffect(() => {
    if (active && ref.current && typeof ref.current.focus === "function") {
      ref.current.focus();
      if (typeof ref.current.select === "function") ref.current.select();
    }
  }, [active, ref]);
}
var errorStyle = { color: "var(--dsh-alias-state-error-primary, red)", margin: "8px 0" };
var inlineError = (text) => text ? h("div", { role: "alert", style: errorStyle }, text) : null;
var iconControl = (label, Icon, onClick, extra = {}) => {
  const button = h(Button, {
    variant: extra.variant ?? "ghost",
    size: "sm",
    icon: h(Icon, { size: 14 }),
    "aria-label": label,
    title: extra.title ?? label,
    disabled: extra.disabled === true,
    onClick,
    ...extra.props ?? {}
  });
  return extra.tooltip === false ? button : h(Tooltip, { key: extra.key ?? label, label }, button);
};
var mutedStyle = { color: "var(--dsw-alias-label-secondary)" };
var rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 4px",
  borderBottom: "1px solid var(--dsw-alias-border-l2)"
};
var fieldStyle = {
  color: "var(--dsw-alias-label-primary)",
  background: "var(--dsw-alias-bg-l2)",
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: "8px",
  padding: "6px 8px",
  fontFamily: "inherit",
  fontSize: "inherit"
};
function ConfirmDialog({ open, title, body, actionLabel, extraChildren, onCancel, onConfirm, t }) {
  return h(Modal, {
    open,
    onClose: onCancel,
    title,
    closeLabel: t("cancel"),
    footer: h(
      React.Fragment,
      null,
      h(Button, { variant: "outline", onClick: onCancel }, t("cancel")),
      h(Button, { variant: "primary", onClick: onConfirm }, actionLabel || t("confirm"))
    )
  }, h("p", { style: mutedStyle }, body), extraChildren);
}
function AddSectionPicker({ sections, alreadyIn, onAdd, onClose, t }) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState(() => /* @__PURE__ */ new Set());
  const candidates = filterSections(
    sections.filter((s) => !alreadyIn.has(refIdOf(s))),
    query
  );
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return h(
    Modal,
    { open: true, onClose, title: t("pickerTitle"), closeLabel: t("cancel") },
    h(Input, {
      icon: h(IconSearchOutlineRegular, { size: 14 }),
      placeholder: t("searchPlaceholder"),
      value: query,
      onChange: (e) => setQuery(e.target.value),
      style: { width: "100%", boxSizing: "border-box" }
    }),
    h(
      "div",
      { style: { maxHeight: "320px", overflowY: "auto", marginTop: "8px" } },
      candidates.length === 0 && h("p", { style: mutedStyle }, t("pickerEmpty")),
      candidates.map((s) => h(
        "label",
        { key: refIdOf(s), style: { ...rowStyle, cursor: "pointer" } },
        h(Checkbox, { checked: selected.has(refIdOf(s)), onChange: () => toggle(refIdOf(s)), label: s.title }),
        h("span", null, s.title),
        !String(s.body ?? "").trim() && h(Tag, null, t("emptyBody"))
      ))
    ),
    h(
      "div",
      { style: { textAlign: "right", marginTop: "8px" } },
      h(Button, {
        variant: "primary",
        disabled: selected.size === 0,
        onClick: () => {
          onAdd([...selected]);
          onClose();
        }
      }, `${t("pickerAdd")} (${selected.size})`)
    )
  );
}
function ProfileOutline({ profile, state, api, reload, t, notify, onBack, onOpenSection, autoFocusTitle }) {
  const [title, setTitle] = React.useState(profile.title ?? "");
  const [refs, setRefs] = React.useState(normalizeSections(profile.sections));
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [scopeOpen, setScopeOpen] = React.useState(null);
  const [error, setError] = React.useState("");
  const titleRef = React.useRef(null);
  useFocusSelect(titleRef, autoFocusTitle === true);
  const sectionsById = new Map((state.sections ?? []).map((s) => [refIdOf(s), s]));
  const builtinOrders = state.builtinOrders ?? {};
  const ours = refs.filter((ref) => sectionsById.has(ref.id));
  const saveProfile = () => runSave(
    () => api.profileUpdate(profile.patchId, { title, sections: normalizeSections(refs) }),
    reload,
    t,
    notify,
    setError
  );
  const flushTitle = useAutosave(title, () => {
    if (title !== (profile.title ?? "")) saveProfile();
  });
  const flushRefs = useAutosave(refs, () => {
    if (JSON.stringify(refs) !== JSON.stringify(profile.sections ?? [])) saveProfile();
  });
  const leave = () => {
    flushTitle();
    flushRefs();
    onBack();
  };
  const writeRefs = (next) => setRefs(next);
  const [dragId, setDragId] = React.useState(null);
  const [dragOverIndex, setDragOverIndex] = React.useState(null);
  const [confirmRemove, setConfirmRemove] = React.useState(null);
  const dragStart = (refSeq) => (event) => {
    setDragId(refSeq);
    if (event?.dataTransfer) {
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(refSeq));
      } catch (_) {
      }
    }
  };
  const dragEnd = () => {
    setDragId(null);
    setDragOverIndex(null);
  };
  const droppedSeq = (event) => {
    let from = dragId;
    if (from === null || from === void 0 || from === "") {
      if (typeof event?.dataTransfer?.getData === "function") {
        try {
          from = event.dataTransfer.getData("text/plain");
        } catch (_) {
          from = null;
        }
      }
    }
    if (from === null || from === void 0 || from === "") return null;
    const seq = Number(from);
    return Number.isInteger(seq) && seq >= 0 ? seq : null;
  };
  const patchRef = (refSeq, patch) => writeRefs(refs.map((ref, index) => index === refSeq ? { ...ref, ...patch } : ref));
  const changeScope = (refSeq, scope) => patchRef(refSeq, { scope });
  const changeOrder = (refSeq, order) => {
    if (!Number.isFinite(order)) return;
    patchRef(refSeq, { order });
  };
  const removeRef = (refSeq) => writeRefs(refs.filter((_, index) => index !== refSeq));
  const addSections = (ids) => writeRefs(addSectionsToRefs(refs, ids));
  const completeModes = (state.modes ?? []).filter((m) => m.complete === true);
  const rows = outlineRows({ ...profile, sections: refs }, sectionsById, builtinOrders);
  const brokenRows = rows.filter((row) => row.kind === "broken");
  const scopeMenu = (row) => {
    const { ref, seq } = row;
    const scopeLabel = `${t("scopeLabel")}: ${t(scopeKeyOf(ref.scope))}`;
    return h(Menu, {
      open: scopeOpen === seq,
      onClose: () => setScopeOpen(null),
      anchor: h(Button, {
        variant: "ghost",
        size: "sm",
        "aria-label": scopeLabel,
        onClick: () => setScopeOpen((openSeq) => openSeq === seq ? null : seq)
      }, scopeLabel),
      items: ["inherit", "main-only", "subagents-only"].map((scope) => ({ id: scope, label: t(scopeKeyOf(scope)) })),
      selectedId: ref.scope ?? "inherit",
      onSelect: (scope) => {
        changeScope(seq, scope);
        setScopeOpen(null);
      }
    });
  };
  const boundaryOrders = insertionOrders(rows);
  const dropAt = (index, fromSeq) => {
    const order = boundaryOrders[index];
    if (fromSeq === null || typeof order !== "number") return;
    const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === fromSeq);
    if (ownIndex < 0 || ownIndex === index || ownIndex === index - 1) return;
    const withOrder = refs.map((ref, i) => i === fromSeq ? { ...ref, order } : ref);
    const movedSeqs = rows.filter((row) => row.kind === "ours").map((row) => row.seq).filter((seq) => seq !== fromSeq);
    const aboveCount = rows.slice(0, index).filter((row) => row.kind === "ours" && row.seq !== fromSeq).length;
    movedSeqs.splice(aboveCount, 0, fromSeq);
    const rest = withOrder.map((_, i) => i).filter((i) => !movedSeqs.includes(i));
    writeRefs([...movedSeqs, ...rest].map((i) => withOrder[i]));
  };
  const moveRefBy = (refSeq, direction) => {
    const ownIndex = rows.findIndex((row) => row.kind === "ours" && row.seq === refSeq);
    if (ownIndex < 0) return;
    const boundary = direction === "up" ? ownIndex - 1 : ownIndex + 2;
    if (boundary < 0 || boundary > rows.length) return;
    dropAt(boundary, refSeq);
  };
  const dropZone = (index) => h("div", {
    key: `drop-${index}`,
    "data-drop-index": index,
    style: {
      height: dragOverIndex === index ? "18px" : "6px",
      margin: "2px 0",
      borderRadius: "4px",
      background: dragOverIndex === index ? "var(--dsw-alias-interactive-bg-hover)" : "transparent"
    },
    onDragOver: (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (dragId !== null && dragOverIndex !== index) setDragOverIndex(index);
    },
    onDrop: (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      const from = droppedSeq(event);
      dragEnd();
      dropAt(index, from);
    }
  });
  const renderRow = (row) => {
    if (row.kind === "builtin") {
      return h(
        "div",
        { key: row.key, style: { ...rowStyle, opacity: 0.55 } },
        h("span", { style: { width: "64px", fontVariantNumeric: "tabular-nums" } }, String(row.order)),
        h("span", { flex: 1 }, row.name),
        h(Tag, null, t("builtIn"))
      );
    }
    if (row.kind === "broken") {
      return h(
        "div",
        { key: row.key, style: { ...rowStyle, color: "var(--dsw-alias-state-warning-primary, orange)" } },
        h("span", { style: { width: "64px", fontVariantNumeric: "tabular-nums" } }, String(row.ref.order)),
        h("span", { flex: 1 }, row.ref.id, " \u2014 ", t("missingSection")),
        iconControl(t("remove"), IconTrashOutlineRegular, () => setConfirmRemove(row.seq))
      );
    }
    const { ref, section, seq } = row;
    return h(
      "div",
      { key: row.key, style: { ...rowStyle, opacity: dragId === seq ? 0.5 : 1 } },
      // Focusable grip: a real Button (keyboard + semantics), carrying the
      // drag handlers and ↑/↓ reordering.
      iconControl(t("dragHandle"), IconChevronsUpDownOutlineRegular, null, {
        props: {
          draggable: true,
          onDragStart: dragStart(seq),
          onDragEnd: dragEnd,
          onKeyDown: (event) => {
            if (event?.key === "ArrowUp") {
              event.preventDefault?.();
              moveRefBy(seq, "up");
            } else if (event?.key === "ArrowDown") {
              event.preventDefault?.();
              moveRefBy(seq, "down");
            }
          },
          "data-drag-handle": seq
        }
      }),
      h("input", {
        type: "number",
        value: ref.order,
        "aria-label": t("orderLabel"),
        onChange: (e) => changeOrder(seq, Number(e.target.value)),
        style: { ...fieldStyle, width: "76px" }
      }),
      h(
        "span",
        { style: { flex: 1, minWidth: 0 } },
        section.title,
        !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody"))
      ),
      scopeMenu(row),
      iconControl(t("openInSectionTab"), IconEditOutlineRegular, () => onOpenSection(ref.id)),
      iconControl(t("remove"), IconTrashOutlineRegular, () => setConfirmRemove(seq))
    );
  };
  const outlineRowsEls = [];
  rows.forEach((row, index) => {
    outlineRowsEls.push(dropZone(index));
    outlineRowsEls.push(renderRow(row));
  });
  outlineRowsEls.push(dropZone(rows.length));
  return h(
    "div",
    null,
    h(
      "div",
      { style: { ...rowStyle, borderBottom: "none" } },
      iconControl(t("back"), IconChevronLeftOutlineMedium, leave, { variant: "outline", tooltip: false, key: "back" }),
      h("strong", { style: { flex: 1 } }, title || idOf(profile)),
      // Count only the resolvable sections; broken refs are called out.
      h(Tag, null, brokenRows.length ? `${ours.length} ${t("sectionsWord")} \xB7 ${brokenRows.length} ${t("brokenWord")}` : `${ours.length} ${t("sectionsWord")}`)
    ),
    h("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
    inlineError(error),
    h(
      "label",
      { style: { display: "block", marginBottom: "8px" } },
      t("titleLabel"),
      h("input", {
        ref: titleRef,
        value: title,
        onChange: (e) => setTitle(e.target.value),
        style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" }
      })
    ),
    h("p", { style: { ...mutedStyle, fontSize: "12px" } }, t("builtInNote")),
    h("div", null, outlineRowsEls),
    h(
      "div",
      { style: { marginTop: "8px" } },
      // Icon via the Button `icon` slot — the label is "Add section" with NO
      // plus in the text (the leading + is the icon only).
      h(Button, {
        variant: "outline",
        icon: h(IconPlusOutlineRegular, { size: 14 }),
        onClick: () => setPickerOpen(true)
      }, t("addSection"))
    ),
    completeModes.length > 0 && h("p", {
      style: { marginTop: "12px", color: "var(--dsw-alias-state-warning-primary, orange)" }
    }, `\u26A0 ${t("completeModeWarning")} ${completeModes.map((m) => m.title ?? m.id).join(", ")}`),
    // Removing a ref is destructive too — same confirmation as the other
    // destructive actions (no silent one-click removal).
    // Removing a ref is destructive too — same confirmation as the other
    // destructive actions (no silent one-click removal). `confirmRemove` is
    // the ref OCCURRENCE, so removing one of two duplicate refs keeps the other.
    confirmRemove !== null && h(ConfirmDialog, {
      open: true,
      title: t("confirmRemoveRef"),
      actionLabel: t("remove"),
      body: sectionsById.get(refs[confirmRemove]?.id)?.title || refs[confirmRemove]?.id || "",
      t,
      onCancel: () => setConfirmRemove(null),
      onConfirm: () => {
        const seq = confirmRemove;
        setConfirmRemove(null);
        removeRef(seq);
      }
    }),
    pickerOpen && h(AddSectionPicker, {
      sections: state.sections ?? [],
      alreadyIn: new Set(refs.map((ref) => ref.id)),
      onAdd: addSections,
      onClose: () => setPickerOpen(false),
      t
    })
  );
}
function ProfilesTab({ state, api, reload, t, notify, drill, setDrill, onOpenSection, setState, createFlow }) {
  const [creating, setCreating] = React.useState(false);
  const [confirming, setConfirming] = React.useState(null);
  const [justCreated, setJustCreated] = React.useState(null);
  const [mutating, setMutating] = React.useState(false);
  const profiles = [...state.profiles ?? []].sort((a, b) => a.title.localeCompare(b.title));
  const flow = createFlow ?? makeCreateFlow({
    api,
    t,
    notify,
    reload,
    getState: () => state,
    onState: setState,
    onPending: setCreating,
    onDrill: (id) => {
      setJustCreated(id);
      setDrill(id);
    }
  });
  const mutation = makeMutationFlow({
    api,
    t,
    notify,
    reload,
    getState: () => state,
    onState: setState,
    onPending: setMutating
  });
  if (drill) {
    const profile = profiles.find((p) => idOf(p) === drill);
    if (profile) {
      return h(ProfileOutline, {
        profile,
        state,
        api,
        reload,
        t,
        notify,
        autoFocusTitle: justCreated === drill,
        onBack: () => {
          setJustCreated(null);
          setDrill(null);
        },
        onOpenSection
      });
    }
    setDrill(null);
  }
  const duplicateProfile = (profile) => mutation.run({
    mutate: () => api.profileCreate({
      title: `${profile.title} ${t("copySuffix")}`,
      sections: normalizeSections(profile.sections)
    }),
    optimistic: (prior, created) => ({
      ...prior,
      profiles: [...prior?.profiles ?? [], optimisticEntry("profile", created)]
    }),
    agree: (polled, created) => Boolean(findEntry(polled, created?.patchId ?? created?.rowId ?? created?.configId))
  });
  const deleteProfile = (profile) => mutation.run({
    mutate: () => api.profileDelete(profile.patchId),
    optimistic: (prior) => ({
      ...prior,
      profiles: (prior?.profiles ?? []).filter((p) => p.patchId !== profile.patchId)
    }),
    agree: (polled) => !findEntry(polled, profile.patchId)
  });
  const setDefault = (value) => runSave(() => api.setDefault(value), reload, t, notify);
  return h(
    "div",
    null,
    profiles.length === 0 && h("p", { style: mutedStyle }, t("noProfiles")),
    profiles.map((profile) => h(
      "div",
      {
        key: idOf(profile),
        style: { ...rowStyle, cursor: "pointer" },
        onClick: () => setDrill(idOf(profile))
      },
      h("span", { flex: 1 }, profile.title),
      h("span", { style: mutedStyle }, `${(profile.sections ?? []).length} ${t("sectionsWord")}`),
      iconControl("edit", IconEditOutlineRegular, () => setDrill(idOf(profile))),
      iconControl(t("duplicate"), IconCopyOutlineRegular, (e) => {
        e.stopPropagation();
        duplicateProfile(profile);
      }, { disabled: mutating }),
      iconControl(t("deleteLabel"), IconTrashOutlineRegular, (e) => {
        e.stopPropagation();
        setConfirming(profile);
      }, { disabled: mutating })
    )),
    h(
      "div",
      { style: { marginTop: "8px" } },
      h(Button, {
        variant: "outline",
        disabled: creating || mutating,
        onClick: () => flow.create("profile", { title: t("defaultProfileTitle"), sections: [] })
      }, creating ? t("creating") : t("newProfile"))
    ),
    h(
      "div",
      { style: { marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" } },
      h("span", { style: mutedStyle }, t("defaultForNewSessions")),
      h(DefaultMenu, { state, t, onPick: setDefault })
    ),
    confirming && h(ConfirmDialog, {
      open: true,
      title: t("confirmDeleteProfile"),
      actionLabel: t("deleteLabel"),
      body: confirming.title,
      t,
      onCancel: () => setConfirming(null),
      onConfirm: () => {
        const profile = confirming;
        setConfirming(null);
        deleteProfile(profile);
      }
    })
  );
}
function DefaultMenu({ state, t, onPick }) {
  const [open, setOpen] = React.useState(false);
  const profiles = [...state.profiles ?? []].sort((a, b) => a.title.localeCompare(b.title));
  const selected = profiles.find((p) => idOf(p) === state.default);
  return h(Menu, {
    open,
    onClose: () => setOpen(false),
    anchor: h(
      Button,
      {
        variant: "ghost",
        size: "sm",
        "aria-label": t("defaultForNewSessions"),
        title: t("defaultForNewSessions"),
        onClick: () => setOpen(!open),
        style: chipMaxWidth
      },
      h("span", { style: triggerLabelStyle }, profileLabel(selected, t)),
      h("span", { "aria-hidden": true, style: triggerChevronStyle }, h(IconChevronDownOutlineRegular, { size: 14 }))
    ),
    items: [
      { id: "none", label: t("none") },
      ...profiles.map((p) => ({ id: idOf(p), label: p.title }))
    ],
    selectedId: selected ? idOf(selected) : state.default || "none",
    onSelect: (id) => {
      setOpen(false);
      onPick(id === "none" ? "" : id);
    }
  });
}
function SectionForm({ section, state, api, reload, t, notify, onBack, onRenamed, onDrill, setState, autoFocusTitle }) {
  const [title, setTitle] = React.useState(section.title);
  const [body, setBody] = React.useState(section.body ?? "");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(refIdOf(section));
  const [confirmRename, setConfirmRename] = React.useState(false);
  const [error, setError] = React.useState("");
  const [mutating, setMutating] = React.useState(false);
  const [renameHint, setRenameHint] = React.useState("");
  const titleRef = React.useRef(null);
  useFocusSelect(titleRef, autoFocusTitle === true);
  const mutation = makeMutationFlow({
    api,
    t,
    notify,
    reload,
    getState: () => state,
    onState: setState,
    onPending: setMutating
  });
  const confirmed = Boolean(section?.patchId) && (state?.sections ?? []).some((s) => s.patchId === section.patchId || idOf(s) === idOf(section));
  const titleOk = String(title ?? "").trim() !== "";
  const saveSection = () => {
    if (!canSaveSection(title, confirmed)) return Promise.resolve(false);
    return runSave(
      () => api.sectionUpdate(section.patchId, { title, body }),
      reload,
      t,
      notify,
      setError
    );
  };
  const flushTitle = useAutosave(title, () => {
    if (title !== section.title) saveSection();
  });
  const flushBody = useAutosave(body, () => {
    if (body !== (section.body ?? "")) saveSection();
  });
  const leave = () => {
    flushTitle();
    flushBody();
    onBack();
  };
  const duplicate = () => mutation.run({
    mutate: () => api.sectionCreate({
      title: `${section.title} ${t("copySuffix")}`,
      body: section.body ?? ""
    }),
    optimistic: (prior, created) => ({
      ...prior,
      sections: [...prior?.sections ?? [], optimisticEntry("section", created)]
    }),
    agree: (polled, created) => Boolean(findEntry(polled, created?.configId ?? created?.patchId ?? created?.rowId)),
    // Creation-style navigation: open the COPY, not the row it came from.
    onDone: (polled, created) => {
      const copy = findEntry(polled, created?.configId ?? created?.patchId ?? created?.rowId);
      if (copy && onDrill) onDrill(idOf(copy));
    }
  });
  const remove = () => mutation.run({
    mutate: () => api.sectionDelete(section.patchId),
    optimistic: (prior) => ({
      ...prior,
      sections: (prior?.sections ?? []).filter((s) => s.patchId !== section.patchId)
    }),
    agree: (polled) => !findEntry(polled, section.patchId),
    onDone: () => onBack()
  });
  const rename = () => {
    const typed = dedupeRowPrefix(String(renameValue ?? "").trim());
    const oldId = refIdOf(section);
    if (!typed) {
      setRenameHint(t("renameEmpty"));
      return;
    }
    setRenameHint("");
    setConfirmRename(false);
    if (typed === oldId) return;
    const prefix = /^prompt-(?:section|profile)-/.exec(oldId ?? "")?.[0] ?? "";
    const newId = prefix && !typed.startsWith(prefix) ? `${prefix}${typed}` : typed;
    return mutation.run({
      mutate: () => api.sectionRename(section.patchId, typed),
      // The host canonicalizes the id and leaves profile references alone:
      // the polled row carries the new id, and the response lists any profile
      // still pointing at the old one — only a full /state reload reconciles
      // the outlines.
      agree: (polled) => (polled?.sections ?? []).some((s) => refIdOf(s) === newId),
      onDone: (polled, result) => {
        const notice = renameNotice(result, t);
        if (notice && notify) notify(notice);
        const live = (polled?.sections ?? []).find((s) => refIdOf(s) === newId);
        if (onRenamed) onRenamed(live ? refIdOf(live) : newId);
      }
    });
  };
  const usedIn = section.usedIn ?? [];
  const sourceKind = sourceKindOf(section.source);
  const bundleOwned = section.source === "bundle";
  const emptyBody = !String(body ?? "").trim();
  return h(
    "div",
    null,
    h(
      "div",
      { style: { ...rowStyle, borderBottom: "none" } },
      iconControl(t("back"), IconChevronLeftOutlineMedium, leave, { variant: "outline", tooltip: false, key: "back" }),
      h("strong", { style: { flex: 1 } }, idOf(section)),
      iconControl(t("duplicate"), IconCopyOutlineRegular, duplicate, { disabled: mutating }),
      iconControl(t("deleteLabel"), IconTrashOutlineRegular, () => setConfirmDelete(true), { disabled: mutating })
    ),
    h("hr", { style: { border: "none", borderTop: "1px solid var(--dsw-alias-border-l2)" } }),
    inlineError(error),
    h(
      "label",
      { style: { display: "block", marginBottom: "8px" } },
      t("titleLabel"),
      h("input", {
        ref: titleRef,
        value: title,
        onChange: (e) => setTitle(e.target.value),
        onBlur: flushTitle,
        style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px" }
      }),
      !titleOk && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("titleRequired"))
    ),
    h(
      "label",
      { style: { display: "block", marginBottom: "8px" } },
      t("bodyLabel"),
      h("textarea", {
        value: body,
        rows: 8,
        onChange: (e) => setBody(e.target.value),
        onBlur: flushBody,
        style: { ...fieldStyle, width: "100%", boxSizing: "border-box", marginTop: "4px", resize: "vertical" }
      }),
      emptyBody && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("emptyBody"))
    ),
    h(
      "div",
      { style: mutedStyle, marginBottom: "4px" },
      `${t("usedIn")}: `,
      usedIn.length === 0 ? t("notUsed") : usedIn.map((u, index) => h(
        "span",
        {
          // profileId alone repeats when one profile references the section
          // with two scopes — the index keeps every React key unique.
          key: `${u.profileId}:${u.scope}:${index}`,
          style: { marginRight: "8px" }
        },
        `${usedInProfileName(state, u.profileId)} \u2014 ${t("scopeLabel")}: ${t(scopeKeyOf(u.scope))}`
      ))
    ),
    sourceKind && h(
      "div",
      { style: mutedStyle, marginBottom: "8px" },
      `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}`
    ),
    h(
      "div",
      { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
      h(Button, {
        variant: "outline",
        disabled: mutating || bundleOwned,
        // Both the button's own label and the confirmation carry the honest
        // warning that profile references are NOT rewritten any more.
        title: bundleOwned ? t("renameIdLocked") : t("renameNote"),
        onClick: () => {
          setRenameValue(refIdOf(section));
          setRenameHint("");
          setConfirmRename(true);
        }
      }, t("renameId")),
      // Blocked with a plain-language reason instead of a silent dead button.
      bundleOwned && h("span", { style: { ...mutedStyle, fontSize: "12px" } }, t("renameIdLocked"))
    ),
    confirmDelete && h(ConfirmDialog, {
      open: true,
      title: t("confirmDeleteSection"),
      actionLabel: t("deleteLabel"),
      body: section.title,
      t,
      onCancel: () => setConfirmDelete(false),
      onConfirm: () => {
        setConfirmDelete(false);
        remove();
      }
    }),
    confirmRename && h(ConfirmDialog, {
      open: true,
      title: t("confirmRename"),
      actionLabel: t("confirm"),
      body: t("renameNote"),
      t,
      onCancel: () => {
        setConfirmRename(false);
        setRenameHint("");
      },
      onConfirm: rename,
      extraChildren: h(
        React.Fragment,
        null,
        h("input", {
          value: renameValue,
          autoFocus: true,
          onChange: (e) => setRenameValue(e.target.value),
          style: { ...fieldStyle, width: "100%", boxSizing: "border-box" }
        }),
        // Soft hint: the id may not be blank (the dialog stays open).
        renameHint && h("p", { style: { ...mutedStyle, marginTop: "8px", marginBottom: 0 } }, renameHint)
      )
    })
  );
}
function SectionsTab({ state, api, reload, t, notify, drill, setDrill, setState, createFlow }) {
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [justCreated, setJustCreated] = React.useState(null);
  const sections = filterSections(state.sections ?? [], query);
  const flow = createFlow ?? makeCreateFlow({
    api,
    t,
    notify,
    reload,
    getState: () => state,
    onState: setState,
    onPending: setCreating,
    onDrill: (id) => {
      setJustCreated(id);
      setDrill(id);
    }
  });
  if (drill) {
    const live = (state.sections ?? []).find((s) => idOf(s) === drill);
    if (live) return h(SectionForm, {
      // Key on the row id: after DUPLICATE the drill moves to the copy and
      // React must remount the form with the copy's state, not reuse the
      // original's useState values.
      key: idOf(live),
      section: live,
      state,
      api,
      reload,
      t,
      notify,
      autoFocusTitle: justCreated === drill,
      onBack: () => {
        setJustCreated(null);
        setDrill(null);
      },
      // After a rename the drill must follow the NEW id or the form drops
      // back to the list (the old id no longer resolves).
      onRenamed: (id) => {
        setJustCreated(null);
        setDrill(id);
      },
      // Duplicate opens the copy (creation-style drill).
      onDrill: (id) => {
        setJustCreated(null);
        setDrill(id);
      },
      setState
    });
    setDrill(null);
  }
  return h(
    "div",
    null,
    h(
      "div",
      { style: { display: "flex", gap: "8px", marginBottom: "8px" } },
      h(Input, {
        icon: h(IconSearchOutlineRegular, { size: 14 }),
        placeholder: t("searchPlaceholder"),
        value: query,
        onChange: (e) => setQuery(e.target.value),
        style: { flex: 1 }
      }),
      h(Button, {
        variant: "outline",
        disabled: creating,
        onClick: () => flow.create("section", { title: t("defaultSectionTitle"), body: "" })
      }, creating ? t("creating") : t("newSection"))
    ),
    sections.length === 0 && h("p", { style: mutedStyle }, t("noSections")),
    sections.map((section) => {
      const sourceKind = sourceKindOf(section.source);
      return h(
        "div",
        {
          key: idOf(section),
          style: { ...rowStyle, cursor: "pointer" },
          onClick: () => setDrill(idOf(section))
        },
        h(
          "span",
          { flex: 1 },
          section.title,
          !String(section.body ?? "").trim() && h(Tag, null, t("emptyBody"))
        ),
        h(
          "span",
          { style: mutedStyle },
          `${t("usedIn")}: `,
          (section.usedIn ?? []).length === 0 ? t("notUsed") : (section.usedIn ?? []).map((u) => usedInProfileName(state, u.profileId)).join(", ")
        ),
        // Source badge only for `bundle`/`unknown`; `user` rows stay calm.
        sourceKind && h(Tag, null, `${t("sourceLabel")}: ${t(sourceKind === "bundle" ? "sourceBundle" : "sourceUnknown")}`)
      );
    })
  );
}
function PreviewTab({ state, api, t, notify }) {
  const [profileId, setProfileId] = React.useState(state.default || (idOf((state.profiles ?? [])[0]) ?? ""));
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    setData(null);
    if (!profileId) return void 0;
    api.preview(profileId).then((value) => {
      if (live) setData(previewPlan(value));
    }).catch((err) => {
      if (live) notify(errText(err) ? `${t("loadError")} ${errText(err)}`.trim() : t("loadError"));
    });
    return () => {
      live = false;
    };
  }, [profileId, api, t, notify]);
  const profiles = [...state.profiles ?? []].sort((a, b) => a.title.localeCompare(b.title));
  const selected = profiles.find((p) => idOf(p) === profileId);
  return h(
    "div",
    null,
    h(
      "div",
      { style: { marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" } },
      h("span", { style: mutedStyle }, t("profileWord")),
      h(DefaultMenu, { state: { ...state, default: profileId }, t, onPick: setProfileId })
    ),
    !profileId && h("p", { style: mutedStyle }, t("noProfiles")),
    profileId && !data && h("p", { style: mutedStyle }, "\u2026"),
    data && data.plan.map((entry, i) => {
      if (entry.kind === "builtins") {
        return h("div", {
          key: `b${i}`,
          style: { ...mutedStyle, padding: "8px", margin: "8px 0", borderRadius: "8px", background: "var(--dsw-alias-bg-l2)" }
        }, `${t("builtinMarker")}  ${entry.names.join(", ")}`);
      }
      const body = (state.sections ?? []).find((s) => refIdOf(s) === entry.id)?.body;
      const flagged = previewVariableNotice(entry.text, body, data.variables, null);
      return h(
        "div",
        {
          key: `${i}:${entry.id}`,
          style: { padding: "8px 0", borderTop: "1px solid var(--dsw-alias-border-l2)" }
        },
        h(
          "div",
          null,
          h(
            "span",
            { style: { ...mutedStyle, width: "72px", display: "inline-block", fontVariantNumeric: "tabular-nums" } },
            entry.order !== void 0 ? String(entry.order) : ""
          ),
          h("strong", null, ` ${entry.title}`),
          flagged && h(
            "span",
            { style: { ...mutedStyle, marginLeft: "8px" } },
            h(Tag, null, `\u26A0 ${t("previewVariables")}`),
            ` ${flagged.map((name) => `{{${name}}}`).join(", ")}`
          )
        ),
        h("pre", {
          style: { margin: "4px 0 0 72px", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px" }
        }, entry.text)
      );
    }),
    data && data.skipped.length > 0 && h(
      "div",
      { style: { marginTop: "12px" } },
      data.skipped.map((s) => h("div", {
        key: s.id ?? s.title,
        style: { ...mutedStyle, fontStyle: "italic" }
      }, `${t("skippedMarker")} ${s.title} \u2014 ${s.reason}`))
    ),
    // A profile made only of broken/skipped refs still emits nothing: say so
    // explicitly instead of leaving the pane looking unfinished.
    data && data.plan.length === 0 && h("p", { style: mutedStyle }, t("previewEmpty"))
  );
}
var pageStyle = {
  height: "100%",
  minHeight: 0,
  boxSizing: "border-box",
  overflowY: "auto",
  scrollbarGutter: "stable"
};
function PromptProfilesSection(props) {
  const { t, api } = props;
  const { notify, banner } = useNotifier();
  const { state, setState, reload } = useProfilesState(api ?? clientApi, t, notify);
  const [tab, setTab] = React.useState("profiles");
  const [drill, setDrillState] = React.useState({ profiles: null, sections: null });
  const setDrill = (value) => setDrillState((prev) => ({ ...prev, [tab]: value }));
  React.useEffect(() => {
    const onKey = (event) => {
      if (escapesDrillDown(event, typeof window !== "undefined" ? window : void 0)) {
        setDrillState((prev) => ({ ...prev, [tab]: null }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);
  const selectTab = (value) => {
    if (value === tab) setDrillState((prev) => ({ ...prev, [tab]: null }));
    else setTab(value);
  };
  const onOpenSection = (sectionId) => {
    setTab("sections");
    setDrillState((prev) => ({ ...prev, sections: sectionId }));
  };
  if (!state) return h("div", { style: pageStyle }, h("p", { style: mutedStyle }, "\u2026"), banner);
  return h(
    "div",
    { style: pageStyle },
    h(SegmentedTabs, {
      items: [
        { value: "profiles", label: t("tabProfiles"), id: "pp-tab-profiles", panelId: "pp-tab-profiles-panel" },
        { value: "sections", label: t("tabSections"), id: "pp-tab-sections", panelId: "pp-tab-sections-panel" },
        { value: "preview", label: t("tabPreview"), id: "pp-tab-preview", panelId: "pp-tab-preview-panel" }
      ],
      value: tab,
      onChange: selectTab,
      label: t("nav")
    }),
    h(
      "div",
      { style: { marginTop: "12px" } },
      tab === "profiles" && h(ProfilesTab, {
        state,
        api: api ?? clientApi,
        reload,
        t,
        notify,
        drill: drill.profiles,
        setDrill,
        onOpenSection,
        setState
      }),
      tab === "sections" && h(SectionsTab, {
        state,
        api: api ?? clientApi,
        reload,
        t,
        notify,
        drill: drill.sections,
        setDrill,
        setState
      }),
      tab === "preview" && h(PreviewTab, { state, api: api ?? clientApi, t, notify })
    ),
    banner
  );
}
module.exports = {
  // apply() touches exactly these two services at registration time:
  // ctx.locale.register/bind and ctx.slots.inject/register. In Cordis a
  // service is reachable on ctx only when declared here — with an empty
  // list apply() threw (undefined ctx.slots/ctx.locale) and web boot
  // reported "1 entry did not activate".
  inject: ["slots", "locale"],
  helpers,
  // Test seams (also reusable building blocks): the API facade factory,
  // the modal-free create flow, the optimistic+poll mutation flow, the
  // whole-object save runner, and the tab components for shim-level
  // render assertions.
  makeApi,
  makeCreateFlow,
  makeMutationFlow,
  runSave,
  findEntry,
  optimisticEntry,
  components: { ProfilesTab, SectionsTab, SectionForm, ProfileOutline, PreviewTab },
  apply(ctx) {
    ctx.locale.register(NS, { en: messages, ru, zh });
    if (typeof ctx.locale.bind === "function") boundT = ctx.locale.bind(NS);
    ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
      name: "conversation.input.left",
      id: "prompt-profile",
      order: 10,
      locale: NS,
      inject: (sessionId) => ({
        // `choice` is {profileId, workspaceId?, cwd?}: the host keys `last`
        // by workspace id when known, else by the Session cwd. JSON.stringify
        // drops the absent fields.
        pick: (choice) => request("last", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: choice?.workspaceId,
            cwd: choice?.cwd,
            profileId: choice?.profileId
          })
        }),
        sessionId
      })
    }, PromptProfileChip));
    ctx.slots.inject("settings.section", () => {
      const bound = typeof ctx.locale.bind === "function" ? ctx.locale.bind(NS) : null;
      return ctx.slots.register({
        name: "settings.section",
        id: "prompt-profiles",
        order: 25,
        label: () => bound ? bound("nav") : messages.en.nav,
        locale: NS,
        inject: () => ({ api: clientApi })
      }, PromptProfilesSection);
    });
  }
};
return module.exports; } });
//# sourceMappingURL=client.js.map
