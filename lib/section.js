import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import "./chunks/chunk-EU2VRU6C.js";

// src/host/section.ts
import z from "@deepseek-ai/schemastery";
var name = "@knopki/dsh-prompt-profiles/section";
var inject = ["promptProfiles"];
var Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  body: z.string().required().volatile()
});
function apply(ctx, config) {
  ctx.inject(["settings"], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)));
  ctx.effect(
    () => ctx.promptProfiles.registerSection({
      rowId: ctx.fiber?.entry?.id ?? null,
      config
      // source is resolved by the service from profile-patch insert
      // ownership (writer.provenance); 'unknown' only when configEditor is
      // absent or the patch is unreadable.
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
