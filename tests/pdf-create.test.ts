import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { createTextPdf } from "../apps/server/src/pdf-create.ts";

test("creates a multi-page PDF with title, headings and wrapped text", async () => {
  const bytes = await createTextPdf("Trip plan", "# Day one\n- Train\n- Lunch\n\n## Notes\n" + "Useful text. ".repeat(3000));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), "Trip plan");
  assert.ok(pdf.getPageCount() > 1);
  assert.ok(bytes.length < 100_000);
});
test("long words wrap and empty document still creates a page", async () => {
  for (const text of ["", "x".repeat(1000)]) {
    const pdf = await PDFDocument.load(await createTextPdf("Title", text));
    assert.ok(pdf.getPageCount() >= 1);
  }
});
test("rejects unsupported scripts instead of corrupting content", async () => {
  await assert.rejects(createTextPdf("Title", "हिंदी"), /Latin-script/);
});
test("rejects oversized content", async () => {
  await assert.rejects(createTextPdf("Title", "x".repeat(60001)), /too long/);
});
