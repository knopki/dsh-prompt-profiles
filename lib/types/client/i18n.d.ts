/** #region moduleContract
 * @modulecontract
 * @purpose The client's three dictionaries and the translation entry point:
 *   `en` is the fallback every key must exist in, `ru`/`zh` are registered
 *   beside it, and `boundT` translates through the locale service the plugin
 *   entry binds once `apply` runs.
 * @scope
 *  - The dictionaries, the registered `messages` bundle and the binder.
 *  - NOT: any rendering (components receive `t` as a prop from the slot).
 * @invariants
 *  - `ru` and `zh` are key-for-key identical to `en`; a missing key is a
 *    compile error and, at runtime, the lookup falls back to the key itself.
 * @keywords i18n, dictionaries, locale, prompt profiles strings
 * #endregion moduleContract */
export declare const NS = "promptProfiles";
export declare const en: {
    none: string;
    untitled: string;
    loadError: string;
    saveError: string;
    remoteUnavailable: string;
    menuLabel: string;
    chooseNeedsWorkspace: string;
    nav: string;
    tabProfiles: string;
    tabSections: string;
    tabPreview: string;
    profileWord: string;
    back: string;
    searchPlaceholder: string;
    newProfile: string;
    newSection: string;
    addSection: string;
    creating: string;
    defaultSectionTitle: string;
    defaultProfileTitle: string;
    createError: string;
    createTimeout: string;
    defaultForNewSessions: string;
    builtIn: string;
    builtInNote: string;
    scopeLabel: string;
    scopeInherit: string;
    scopeMainOnly: string;
    scopeSubagentsOnly: string;
    sourceLabel: string;
    sourceBundle: string;
    sourceUnknown: string;
    usedIn: string;
    notUsed: string;
    openInSectionTab: string;
    remove: string;
    duplicate: string;
    deleteLabel: string;
    renameId: string;
    copySuffix: string;
    renameIdLocked: string;
    titleLabel: string;
    bodyLabel: string;
    orderLabel: string;
    cancel: string;
    confirm: string;
    confirmDeleteProfile: string;
    confirmDeleteSection: string;
    confirmRemoveRef: string;
    confirmRename: string;
    renameNote: string;
    renameAffected: string;
    renameEmpty: string;
    titleRequired: string;
    dragHandle: string;
    missingSection: string;
    emptyBody: string;
    completeModeWarning: string;
    conflictError: string;
    pickerTitle: string;
    pickerAdd: string;
    pickerEmpty: string;
    builtinMarker: string;
    skippedMarker: string;
    brokenWord: string;
    noProfiles: string;
    noSections: string;
    previewEmpty: string;
    previewVariables: string;
    sectionsWord: string;
};
/** The locale key set `en` defines; `ru`/`zh` must carry exactly these keys. */
export type MessageKey = keyof typeof en;
export declare const ru: Record<MessageKey, string>;
export declare const zh: Record<MessageKey, string>;
/** Every registered dictionary, as `ctx.locale.register(NS, messages)` takes it. */
export declare const messages: {
    en: {
        none: string;
        untitled: string;
        loadError: string;
        saveError: string;
        remoteUnavailable: string;
        menuLabel: string;
        chooseNeedsWorkspace: string;
        nav: string;
        tabProfiles: string;
        tabSections: string;
        tabPreview: string;
        profileWord: string;
        back: string;
        searchPlaceholder: string;
        newProfile: string;
        newSection: string;
        addSection: string;
        creating: string;
        defaultSectionTitle: string;
        defaultProfileTitle: string;
        createError: string;
        createTimeout: string;
        defaultForNewSessions: string;
        builtIn: string;
        builtInNote: string;
        scopeLabel: string;
        scopeInherit: string;
        scopeMainOnly: string;
        scopeSubagentsOnly: string;
        sourceLabel: string;
        sourceBundle: string;
        sourceUnknown: string;
        usedIn: string;
        notUsed: string;
        openInSectionTab: string;
        remove: string;
        duplicate: string;
        deleteLabel: string;
        renameId: string;
        copySuffix: string;
        renameIdLocked: string;
        titleLabel: string;
        bodyLabel: string;
        orderLabel: string;
        cancel: string;
        confirm: string;
        confirmDeleteProfile: string;
        confirmDeleteSection: string;
        confirmRemoveRef: string;
        confirmRename: string;
        renameNote: string;
        renameAffected: string;
        renameEmpty: string;
        titleRequired: string;
        dragHandle: string;
        missingSection: string;
        emptyBody: string;
        completeModeWarning: string;
        conflictError: string;
        pickerTitle: string;
        pickerAdd: string;
        pickerEmpty: string;
        builtinMarker: string;
        skippedMarker: string;
        brokenWord: string;
        noProfiles: string;
        noSections: string;
        previewEmpty: string;
        previewVariables: string;
        sectionsWord: string;
    };
    ru: Record<"addSection" | "back" | "bodyLabel" | "brokenWord" | "builtIn" | "builtInNote" | "builtinMarker" | "cancel" | "chooseNeedsWorkspace" | "completeModeWarning" | "confirm" | "confirmDeleteProfile" | "confirmDeleteSection" | "confirmRemoveRef" | "confirmRename" | "conflictError" | "copySuffix" | "createError" | "createTimeout" | "creating" | "defaultForNewSessions" | "defaultProfileTitle" | "defaultSectionTitle" | "deleteLabel" | "dragHandle" | "duplicate" | "emptyBody" | "loadError" | "menuLabel" | "missingSection" | "nav" | "newProfile" | "newSection" | "noProfiles" | "noSections" | "none" | "notUsed" | "openInSectionTab" | "orderLabel" | "pickerAdd" | "pickerEmpty" | "pickerTitle" | "previewEmpty" | "previewVariables" | "profileWord" | "remoteUnavailable" | "remove" | "renameAffected" | "renameEmpty" | "renameId" | "renameIdLocked" | "renameNote" | "saveError" | "scopeInherit" | "scopeLabel" | "scopeMainOnly" | "scopeSubagentsOnly" | "searchPlaceholder" | "sectionsWord" | "skippedMarker" | "sourceBundle" | "sourceLabel" | "sourceUnknown" | "tabPreview" | "tabProfiles" | "tabSections" | "titleLabel" | "titleRequired" | "untitled" | "usedIn", string>;
    zh: Record<"addSection" | "back" | "bodyLabel" | "brokenWord" | "builtIn" | "builtInNote" | "builtinMarker" | "cancel" | "chooseNeedsWorkspace" | "completeModeWarning" | "confirm" | "confirmDeleteProfile" | "confirmDeleteSection" | "confirmRemoveRef" | "confirmRename" | "conflictError" | "copySuffix" | "createError" | "createTimeout" | "creating" | "defaultForNewSessions" | "defaultProfileTitle" | "defaultSectionTitle" | "deleteLabel" | "dragHandle" | "duplicate" | "emptyBody" | "loadError" | "menuLabel" | "missingSection" | "nav" | "newProfile" | "newSection" | "noProfiles" | "noSections" | "none" | "notUsed" | "openInSectionTab" | "orderLabel" | "pickerAdd" | "pickerEmpty" | "pickerTitle" | "previewEmpty" | "previewVariables" | "profileWord" | "remoteUnavailable" | "remove" | "renameAffected" | "renameEmpty" | "renameId" | "renameIdLocked" | "renameNote" | "saveError" | "scopeInherit" | "scopeLabel" | "scopeMainOnly" | "scopeSubagentsOnly" | "searchPlaceholder" | "sectionsWord" | "skippedMarker" | "sourceBundle" | "sourceLabel" | "sourceUnknown" | "tabPreview" | "tabProfiles" | "tabSections" | "titleLabel" | "titleRequired" | "untitled" | "usedIn", string>;
};
/** @purpose A dictionary lookup, as the locale service hands one out. */
export type Translate = (key: string) => string;
/** @purpose Translate through the bound locale service, else through `en`. */
export declare function boundT(key: string): string;
/** @purpose Install the locale service's per-key binder (called once by the plugin entry). */
export declare function bindT(translate: Translate): void;
