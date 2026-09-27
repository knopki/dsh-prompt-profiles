/** #region moduleContract
 * @modulecontract
 * @purpose The client plugin entry: register dictionaries, mount Remote and
 *   register the chip and settings surfaces.
 * @invariants
 *  - `inject` declares exactly `slots`, `locale` and `remote`.
 *  - The build banner's ModuleLoader id remains `@knopki/dsh-prompt-profiles`.
 * #endregion moduleContract */

import { PromptProfileChip } from "./chip.tsx";
import { findEntry, makeCreateFlow, makeMutationFlow, optimisticEntry } from "./flows.ts";
import { helpers } from "./helpers.ts";
import { bindT, messages, NS } from "./i18n.ts";
import type { LastChoice } from "./remote.ts";
import * as remoteClient from "./remote.ts";
import { PromptProfilesSection } from "./settings-page.tsx";
import { PreviewTab } from "./settings-preview.tsx";
import { ProfileOutline, ProfilesTab } from "./settings-profiles.tsx";
import { SectionForm, SectionsTab } from "./settings-sections.tsx";
import { runSave } from "./settings-shared.ts";
import { getActiveApi, mountRemote, type PluginCtx, readyApi } from "./transport.ts";

module.exports = {
  // apply() touches exactly these services; undeclared services stay unreachable on ctx.
  inject: ["slots", "locale", "remote"],
  helpers,
  // Test seams (also reusable building blocks).
  makeCreateFlow,
  makeMutationFlow,
  runSave,
  findEntry,
  optimisticEntry,
  remote: remoteClient,
  getActiveApi,
  readyApi,
  components: { ProfilesTab, SectionsTab, SectionForm, ProfileOutline, PreviewTab },
  // #region FUNC_apply
  /** @purpose Register the plugin's locale entries, Remote mount and slot surfaces. */
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
// #endregion FUNC_apply
