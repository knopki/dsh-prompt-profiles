import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  fiberEntryId,
  suppressAutoSettings
} from "./chunks/chunk-6IVLYWYW.js";
import "./chunks/chunk-EU2VRU6C.js";

// src/host/entrypoints/section.ts
import z from "@deepseek-ai/schemastery";
var name = "@knopki/dsh-prompt-profiles/section";
var inject = ["promptProfiles"];
var Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  body: z.string().required().volatile()
});
var promptProfilesOf = (ctx) => ctx.promptProfiles;
function apply(ctx, config) {
  suppressAutoSettings(ctx, ctx.fiber);
  ctx.effect(
    () => promptProfilesOf(ctx).registerSection({
      rowId: fiberEntryId(ctx),
      config
    })
  );
}
export {
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=section.js.map
