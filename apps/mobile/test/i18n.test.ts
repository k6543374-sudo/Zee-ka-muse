import assert from "node:assert/strict";
import test from "node:test";
import { getLanguage, setLanguage, t } from "../src/i18n.ts";

test("English is the default language", () => {
  assert.equal(getLanguage(), "en");
  assert.equal(t("nav.chat"), "Chat");
});

test("Hindi translations replace English where present", () => {
  setLanguage("hi");
  assert.equal(t("nav.chat"), "चैट");
  assert.equal(t("sidebar.newChat"), "नई चैट");
  setLanguage("en");
});

test("interpolation fills named placeholders and leaves unknown ones", () => {
  assert.equal(t("chat.showEarlier", { n: 5, total: 12 }), "Show 5 earlier of 12 older messages");
  assert.equal(t("chat.showEarlier"), "Show {n} earlier of {total} older messages");
});
