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
        "promptProfiles/section-id-taken": {
            readonly id: string;
        };
        "promptProfiles/profile-id-exists": {
            readonly id: string;
        };
        "promptProfiles/profile-not-registered": {
            readonly id: string;
        };
        "promptProfiles/section-not-registered": {
            readonly id: string;
        };
        "promptProfiles/row-not-found": {
            readonly id: string;
        };
        "promptProfiles/storage-unavailable": Record<string, never>;
        "promptProfiles/conflict": {
            readonly expected?: number;
        };
    }
}
export {};
