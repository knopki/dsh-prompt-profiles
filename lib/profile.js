import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  fiberEntryId,
  suppressAutoSettings
} from "./chunks/chunk-6IVLYWYW.js";
import "./chunks/chunk-EU2VRU6C.js";

// src/host/entrypoints/profile.ts
import z from "@deepseek-ai/schemastery";
var name = "@knopki/dsh-prompt-profiles/profile";
var inject = ["promptProfiles"];
var SectionRef = z.object({
  id: z.string().required(),
  order: z.number().required(),
  scope: z.union([z.const("inherit"), z.const("main-only"), z.const("subagents-only")]).default("inherit")
});
var Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  sections: z.array(SectionRef).default([]).volatile()
});
var promptProfilesOf = (ctx) => ctx.promptProfiles;
function apply(ctx, config) {
  suppressAutoSettings(ctx, ctx.fiber);
  ctx.effect(
    () => promptProfilesOf(ctx).registerProfile({
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
//# sourceMappingURL=profile.js.map
