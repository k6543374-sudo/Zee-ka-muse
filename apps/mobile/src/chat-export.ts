export type ExportMessage = { role: string; content?: unknown };

/** Messages worth exporting: user and assistant turns with plain text content. */
export function exportableMessages(messages: ExportMessage[]): { role: string; text: string }[] {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .map((message) => ({ role: message.role, text: (message.content as string).trim() }));
}

/** Plain-text transcript of one conversation, safe to save or print. */
export function buildTranscript(
  messages: ExportMessage[],
  appName: string,
  now: Date = new Date(),
): string {
  const date = now.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const turns = exportableMessages(messages).map(
    (message) => `${message.role === "user" ? "You" : appName}:\n${message.text}`,
  );
  return [`${appName} conversation`, `Exported ${date}`, "", ...turns].join("\n\n");
}

/** Minimal HTML escaping for the print view. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Print-friendly HTML page holding the transcript; the browser turns it into a PDF. */
export function buildPrintHtml(
  messages: ExportMessage[],
  appName: string,
  now: Date = new Date(),
): string {
  const date = now.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const turns = exportableMessages(messages)
    .map((message) => {
      const who = message.role === "user" ? "You" : appName;
      return `<div class="turn ${message.role}"><div class="who">${escapeHtml(who)}</div><div class="text">${escapeHtml(message.text)}</div></div>`;
    })
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(appName)} conversation</title>
<style>
body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 32px; color: #11191C; }
h1 { font-size: 20px; margin: 0 0 4px; }
.meta { color: #697176; font-size: 12px; margin-bottom: 24px; }
.turn { margin-bottom: 18px; }
.who { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #697176; margin-bottom: 4px; }
.user .who { color: #1473C8; }
.text { white-space: pre-wrap; font-size: 14px; line-height: 1.55; }
</style></head>
<body><h1>${escapeHtml(appName)} conversation</h1><div class="meta">Exported ${escapeHtml(date)}</div>
${turns}
</body></html>`;
}

/** Filename-safe stamp for downloads, e.g. zee-spark-chat-2026-11-13.txt */
export function exportFilename(appName: string, ext: string, now: Date = new Date()): string {
  const slug =
    appName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app";
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${slug}-chat-${stamp}.${ext}`;
}
