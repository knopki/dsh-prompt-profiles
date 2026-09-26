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
export {};
