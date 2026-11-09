import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const MAX_CHARS = 60_000;

// Standard PDF fonts cover WinAnsi only. Reject unsupported text without data loss.
function clean(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text.replace(/\t/g, "    ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      throw new Error("PDF creation currently supports Latin-script text only. Please request an English or Romanized version.");
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // Break very long words.
    candidate = word;
    while (font.widthOfTextAtSize(candidate, size) > width && candidate.length > 1) {
      let cut = candidate.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(candidate.slice(0, cut), size) > width) cut--;
      lines.push(candidate.slice(0, cut));
      candidate = candidate.slice(cut);
    }
    line = candidate;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/**
 * Build a simple text PDF. Content lines: "# Heading", "## Subheading",
 * "- bullet" / "* bullet", blank line = paragraph gap, anything else = paragraph.
 */
export async function createTextPdf(title: string, content: string): Promise<Uint8Array> {
  if (content.length > MAX_CHARS) throw new Error("Document text is too long (max 60,000 characters)");
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safeTitle = clean(title.trim() || "Document", bold).slice(0, 200);
  doc.setTitle(safeTitle);
  doc.setCreator("OpenMuse");
  const width = PAGE_W - MARGIN * 2;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };
  const draw = (text: string, font: PDFFont, size: number, indent = 0, gap = 4) => {
    for (const line of wrap(clean(text, font), font, size, width - indent)) {
      ensure(size + gap);
      y -= size;
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: rgb(0.1, 0.1, 0.12) });
      y -= gap;
    }
  };
  draw(safeTitle, bold, 22, 0, 8);
  y -= 6;
  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      y -= 8;
      continue;
    }
    if (line.startsWith("## ")) {
      y -= 4;
      draw(line.slice(3), bold, 13, 0, 5);
    } else if (line.startsWith("# ")) {
      y -= 8;
      draw(line.slice(2), bold, 16, 0, 6);
    } else if (/^\s*[-*] /.test(line)) {
      const text = line.replace(/^\s*[-*] /, "");
      ensure(15);
      page.drawText("-", { x: MARGIN + 6, y: y - 11, size: 11, font: regular });
      draw(text, regular, 11, 20, 4);
    } else draw(line, regular, 11, 0, 4);
  }
  return doc.save();
}
