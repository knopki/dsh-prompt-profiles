/**
 * The dictionaries are the single content source: `ru`/`zh` must be key-for-key
 * identical to `en` (a drifting key silently falls back) and no entry may be
 * blank. Keys with no remaining call site stay deleted from all three.
 */
import { expect, test } from "vitest";
import { en, messages, NS, ru, zh } from "../../src/client/i18n.ts";

const enKeys = Object.keys(en).sort();

test("the namespace is the registered one", () => {
  expect(NS).toBe("promptProfiles");
});

test("ru and zh carry exactly the en keys — no drift, so no key silently falls back", () => {
  expect(Object.keys(ru).sort()).toEqual(enKeys);
  expect(Object.keys(zh).sort()).toEqual(enKeys);
  expect(Object.keys(ru).length).toBeGreaterThan(0);
});

test("every entry is a non-empty string (a blank would render instead of falling back)", () => {
  for (const [id, dictionary] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(dictionary)) {
      expect(typeof value, `${id}.${key}`).toBe("string");
      expect(value.trim(), `${id}.${key}`).not.toBe("");
    }
  }
});

test("the retired keys are gone from all three dictionaries", () => {
  for (const dead of ["selected", "sourceUser", "newIdLabel", "manage", "manageUnavailable", "profile"]) {
    for (const dictionary of [en, ru, zh]) {
      expect((dictionary as Record<string, string>)[dead], `dead key "${dead}"`).toBeUndefined();
    }
  }
});

test("the rename warning promises nothing the host does not do", () => {
  expect(en.renameNote).toMatch(/NOT updated/);
  expect(en.renameNote).not.toMatch(/will be updated\./);
});
