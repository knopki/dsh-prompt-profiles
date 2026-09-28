/** #region moduleContract
 * @modulecontract
 * @purpose Declare the failure codes this bundle publishes on its Remote
 *   surface, so both halves agree on what a failure means.
 * @scope
 *  - Codes and their detail shapes; NOT the mapping to sentences.
 * @invariants
 *  - A code mirrors one domain failure reason and never carries prose.
 * #endregion moduleContract */

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface RemoteErrorDetailsMap {
    /// A new section id is already taken by another row.
    "promptProfiles/section-id-taken": { readonly id: string };
    /// A new profile id already exists.
    "promptProfiles/profile-id-exists": { readonly id: string };
    /// The addressed profile is not registered.
    "promptProfiles/profile-not-registered": { readonly id: string };
    /// The addressed section is not registered.
    "promptProfiles/section-not-registered": { readonly id: string };
    /// The addressed patch row is absent.
    "promptProfiles/row-not-found": { readonly id: string };
    /// The profile storage service is absent or unusable.
    "promptProfiles/storage-unavailable": Record<string, never>;
    /// The write lost its revision race.
    "promptProfiles/conflict": { readonly expected?: number };
  }
}

export {};
