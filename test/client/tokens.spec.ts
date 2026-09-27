/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove theme-token hygiene of the SHIPPED bundle: every custom
 *   property the client references is a token the platform actually ships.
 * #endregion moduleContract
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const REAL_TOKENS = new Set([
  "--dsw-alias-label-primary",
  "--dsw-alias-label-secondary",
  "--dsw-alias-label-tertiary",
  "--dsw-alias-label-caption",
  "--dsw-alias-label-dimmed",
  "--dsw-alias-label-error",
  "--dsw-alias-bg-l1",
  "--dsw-alias-bg-l2",
  "--dsw-alias-bg-layer-1",
  "--dsw-alias-bg-layer-2",
  "--dsw-alias-border-l1",
  "--dsw-alias-border-l2",
  "--dsw-alias-border-l3",
  "--dsw-alias-separator-primary",
  "--dsw-alias-interactive-bg-hover",
  "--dsw-alias-state-warning-primary",
  "--dsw-alias-state-warn-primary",
  "--dsw-alias-state-error-primary",
  "--dsw-alias-state-success-primary",
]);

test("every --dsw-alias-* token in the shipped client bundle exists", () => {
  const bundle = readFileSync(resolve(process.cwd(), "lib/client.js"), "utf8");
  const used = [...new Set([...bundle.matchAll(/--dsw-alias-[a-z0-9-]+/g)].map((match) => match[0]))];
  expect(used.length).toBeGreaterThan(5);
  for (const token of used) {
    expect(REAL_TOKENS.has(token), `unknown theme token: ${token}`).toBe(true);
  }
});
