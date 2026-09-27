import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/host/entrypoints/row-support.ts
function settingsOf(ctx) {
  return ctx.settings;
}
function fiberEntryId(ctx) {
  return ctx.fiber?.entry?.id ?? null;
}
function suppressAutoSettings(ctx, fiber) {
  ctx.inject(["settings"], (child) => child.effect(() => settingsOf(child).configure({ auto: false }, fiber)));
}

export {
  fiberEntryId,
  suppressAutoSettings
};
//# sourceMappingURL=chunk-6IVLYWYW.js.map
