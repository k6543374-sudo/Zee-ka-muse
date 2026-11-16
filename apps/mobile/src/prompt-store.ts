export type SavedPrompt = { id: string; label: string; text: string };

export const PROMPTS_STORAGE_KEY = "zee-spark.savedPrompts.v1";

/** Parse stored JSON, dropping anything that is not a usable prompt. */
export function normalizePrompts(raw: string | null): SavedPrompt[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : `prompt-${Math.random()}`,
        label: typeof item.label === "string" ? item.label.trim().slice(0, 40) : "",
        text: typeof item.text === "string" ? item.text.trim().slice(0, 2000) : "",
      }))
      .filter((item) => item.label && item.text)
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function upsertPrompt(list: SavedPrompt[], prompt: SavedPrompt): SavedPrompt[] {
  const rest = list.filter((item) => item.id !== prompt.id);
  return [...rest, prompt].slice(-30);
}

export function removePrompt(list: SavedPrompt[], id: string): SavedPrompt[] {
  return list.filter((item) => item.id !== id);
}

/** Built-in quick actions; text is what lands in the message box. */
export const quickActions: { key: string; text: string }[] = [
  { key: "prompts.quickSummarize", text: "Summarize this chat so far." },
  { key: "prompts.quickSimple", text: "Explain the last reply in simple words." },
  { key: "prompts.quickHindi", text: "Please reply in Hindi from now on." },
];
