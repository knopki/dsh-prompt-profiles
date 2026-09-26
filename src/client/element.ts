/** #region moduleContract
 * @modulecontract
 * @purpose The one place the client binds React and builds elements: the
 *   platform provides `react` as an external module-table entry, and every
 *   component renders through this `h`.
 * @scope
 *  - The React binding and the element factory.
 *  - NOT: the platform primitives (src/client/ui.ts) or any component.
 * @invariants
 *  - No JSX in this step: every element is an explicit `h(type, props, …)`
 *    call, and `h` forwards its arguments to React.createElement unchanged.
 * @rationale
 *  - Q: Why is `h` a cast of React.createElement instead of the typed
 *    function? A: call sites pass style-ish props (`flex`) and DOM
 *    pass-through props on elements whose React prop types do not declare
 *    them; the permissive signature renders exactly what the pre-split client
 *    rendered. Types on our components, hooks, api and state documents are
 *    exact.
 * @keywords react, createElement, h, client render
 * #endregion moduleContract */

import * as React from "react";

export { React };

/** An element type this UI builds: a DOM tag or a platform component. */
export type ElementType = React.ElementType;

/** @purpose Build one element — the single element factory of the client bundle. */
export const h = React.createElement as unknown as (
  type: ElementType,
  props?: Record<string, unknown> | null,
  ...children: unknown[]
) => React.ReactElement;
