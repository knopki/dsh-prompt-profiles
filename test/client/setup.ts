// jsdom has no ResizeObserver; the primitives' Tooltip (and the observed slot
// outlet) only need it to exist — nothing in these tests measures a viewport.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
