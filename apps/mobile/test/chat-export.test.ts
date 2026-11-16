import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrintHtml,
  buildTranscript,
  escapeHtml,
  exportableMessages,
  exportFilename,
} from "../src/chat-export.ts";

const messages = [
  { id: "u1", role: "user", content: "Explain photosynthesis." },
  { id: "a1", role: "assistant", content: "Plants turn light into energy." },
  { id: "t1", role: "tool", content: "tool result stays out" },
  { id: "s1", role: "system", content: "system note stays out" },
  { id: "u2", role: "user", content: "   " },
  { id: "u3", role: "user", content: "Thanks!" },
];

test("export keeps only user and assistant text turns", () => {
  assert.deepEqual(exportableMessages(messages), [
    { role: "user", text: "Explain photosynthesis." },
    { role: "assistant", text: "Plants turn light into energy." },
    { role: "user", text: "Thanks!" },
  ]);
});

test("transcript names the app and the speaker for each turn", () => {
  const transcript = buildTranscript(messages, "Zee Spark", new Date("2026-11-13T18:00:00"));
  assert.ok(transcript.startsWith("Zee Spark conversation"));
  assert.ok(transcript.includes("You:\nExplain photosynthesis."));
  assert.ok(transcript.includes("Zee Spark:\nPlants turn light into energy."));
  assert.ok(!transcript.includes("tool result stays out"));
  assert.ok(!transcript.includes("system note stays out"));
});

test("empty conversation still produces a header-only transcript", () => {
  const transcript = buildTranscript([], "Zee Spark", new Date("2026-11-13T18:00:00"));
  assert.ok(transcript.includes("Zee Spark conversation"));
  assert.ok(!transcript.includes("You:"));
});

test("print HTML escapes markup in messages and app name", () => {
  const html = buildPrintHtml(
    [{ role: "assistant", content: '<script>alert(1)</script> & "quotes"' }],
    "Zee <Spark>",
    new Date("2026-11-13T18:00:00"),
  );
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;"));
  assert.ok(html.includes("Zee &lt;Spark&gt;"));
});

test("escapeHtml covers the markup characters", () => {
  assert.equal(escapeHtml(`<a href="x">&`), `&lt;a href=&quot;x&quot;&gt;&amp;`);
});

test("export filenames are safe and dated", () => {
  assert.equal(
    exportFilename("Zee Spark", "txt", new Date("2026-11-13T18:00:00")),
    "zee-spark-chat-2026-11-13.txt",
  );
  assert.equal(
    exportFilename("!!!", "txt", new Date("2026-11-13T18:00:00")),
    "app-chat-2026-11-13.txt",
  );
});
