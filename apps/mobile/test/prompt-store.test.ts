import assert from "node:assert/strict";
import test from "node:test";
import { normalizePrompts, quickActions, removePrompt, upsertPrompt } from "../src/prompt-store.ts";

test("normalizePrompts drops invalid entries and tolerates broken JSON", () => {
  assert.deepEqual(normalizePrompts(null), []);
  assert.deepEqual(normalizePrompts("not json"), []);
  assert.deepEqual(normalizePrompts("{}"), []);
  const stored = JSON.stringify([
    { id: "a", label: "Weekly plan", text: "Plan my week" },
    { id: "b", label: "", text: "no label" },
    { id: "c", label: "no text", text: "  " },
    "junk",
    { label: 5, text: 6 },
  ]);
  assert.deepEqual(normalizePrompts(stored), [
    { id: "a", label: "Weekly plan", text: "Plan my week" },
  ]);
});

test("upsert replaces the same id and appends new prompts", () => {
  const first = { id: "a", label: "One", text: "v1" };
  const second = { id: "b", label: "Two", text: "v2" };
  const updated = upsertPrompt([first, second], { id: "a", label: "One", text: "v2" });
  assert.deepEqual(updated, [second, { id: "a", label: "One", text: "v2" }]);
});

test("removePrompt deletes by id", () => {
  const list = [
    { id: "a", label: "One", text: "v1" },
    { id: "b", label: "Two", text: "v2" },
  ];
  assert.deepEqual(removePrompt(list, "a"), [list[1]]);
});

test("built-in quick actions always send text", () => {
  assert.ok(quickActions.length >= 3);
  for (const action of quickActions) {
    assert.ok(action.key.startsWith("prompts."));
    assert.ok(action.text.length > 10);
  }
});
