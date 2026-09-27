/**
 * #region moduleContract
 * @modulecontract
 * @purpose Cover the jsdom gap the client specs need: a ResizeObserver the
 *   primitives' Tooltip only needs to exist — nothing measures a viewport.
 * #endregion moduleContract
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
