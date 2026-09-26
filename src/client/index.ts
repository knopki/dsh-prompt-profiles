/** #region moduleContract
 * @modulecontract
 * @purpose The client plugin entry: register the three dictionaries, mount the
 *   Remote contribution, and register the two UI surfaces — the composer chip
 *   and the settings page. It is the only module of the client bundle with a
 *   side effect on the ModuleLoader handshake (`module.exports` is what the
 *   build banner's factory returns).
 * @scope
 *  - The Cordis plugin object: config `inject`, the slot registrations and
 *    `apply`, plus the test/reuse seams the shim test loads.
 *  - NOT: any component, helper or transport implementation — those live in
 *    the sibling modules this entry wires together.
 * @invariants
 *  - `inject` declares exactly the services `apply` touches: `slots`, `locale`
 *    and `remote` (Cordis leaves undeclared services unreachable on ctx, and
 *    web boot reports "1 entry did not activate").
 *  - The ModuleLoader id stays `@knopki/dsh-prompt-profiles` (src/client/index.ts
 *    is the build entry; build.mjs owns the banner with that id).
 *  - No component is rendered here: the slots receive the component TYPE.
 * @keywords plugin entry, cordis, slots, locale, module loader, client bundle
 * #endregion moduleContract */

import { PromptProfileChip } from "./chip.ts";
import { findEntry, makeCreateFlow, makeMutationFlow, optimisticEntry } from "./flows.ts";
import { helpers } from "./helpers.ts";
import { bindT, messages, NS } from "./i18n.ts";
import type { LastChoice } from "./remote.ts";
import * as remoteClient from "./remote.ts";
import { PromptProfilesSection } from "./settings-page.ts";
import { PreviewTab } from "./settings-preview.ts";
import { ProfileOutline, ProfilesTab } from "./settings-profiles.ts";
import { SectionForm, SectionsTab } from "./settings-sections.ts";
import { runSave } from "./settings-shared.ts";
import { getActiveApi, mountRemote, type PluginCtx, readyApi } from "./transport.ts";

module.exports = {
  // apply() touches exactly these services at registration time:
  // ctx.locale.register/bind, ctx.slots.inject/register and (inside a Cordis
  // effect) ctx.remote.$mount. In Cordis a service is reachable on ctx only
  // when declared here — with an empty list apply() threw (undefined
  // ctx.slots/ctx.locale) and web boot reported "1 entry did not activate".
  inject: ["slots", "locale", "remote"],
  helpers,
  // Test seams (also reusable building blocks): the API facade factory,
  // the modal-free create flow, the optimistic+poll mutation flow, the
  // whole-object save runner, the Remote client helpers, and the tab
  // components for shim-level render assertions.
  makeCreateFlow,
  makeMutationFlow,
  runSave,
  findEntry,
  optimisticEntry,
  remote: remoteClient,
  getActiveApi,
  readyApi,
  components: { ProfilesTab, SectionsTab, SectionForm, ProfileOutline, PreviewTab },
  apply(ctx: PluginCtx) {
    ctx.locale.register(NS, messages);
    // The service owns per-key English fallback; the low-level request
    // fallback uses its binder so that string is localizable too.
    if (typeof ctx.locale.bind === "function") bindT(ctx.locale.bind(NS));
    // Remote first: mount the contribution in an effect so it is disposed
    // with the plugin; data paths wait for the outcome (transport.ts).
    if (typeof ctx.effect === "function") mountRemote(ctx);
    ctx.slots.inject("conversation.input.left", () =>
      ctx.slots.register(
        {
          name: "conversation.input.left",
          id: "prompt-profile",
          order: 10,
          locale: NS,
          inject: (sessionId: string) => ({
            // `choice` is {profileId, workspaceId?, cwd?}: the host keys `last`
            // by workspace id when known, else by the Session cwd.
            pick: (choice: LastChoice) => readyApi().then((api) => api.last(choice)),
            sessionId,
          }),
        },
        PromptProfileChip,
      ),
    );
    ctx.slots.inject("settings.section", () => {
      const bound = typeof ctx.locale.bind === "function" ? ctx.locale.bind(NS) : null;
      return ctx.slots.register(
        {
          name: "settings.section",
          id: "prompt-profiles",
          order: 25,
          label: () => (bound ? bound("nav") : messages.en.nav),
          locale: NS,
          inject: () => ({ api: getActiveApi() }),
        },
        PromptProfilesSection,
      );
    });
  },
};
