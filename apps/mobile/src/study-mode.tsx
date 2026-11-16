import { useState } from "react";
import { Text, View } from "react-native";
import { getLanguage, t } from "./i18n";
import { Button, colors, s } from "./ui";

const templates = {
  notes:
    "Study mode: turn this conversation into clear revision notes. Use short headings, bullet the key points, and end with a three-line summary.",
  quiz: "Study mode: make a quiz from this conversation with 5 questions, mixing multiple choice and short answer. List the questions first, then put an answer key at the end.",
  flashcards:
    "Study mode: create flashcards from this conversation as a numbered list. Put 'Q:' and the question on one line, then 'A:' and the answer on the next, covering the key facts.",
} as const;

export function StudyMode({
  disabled,
  empty,
  onPick,
  startOpen,
  onHide,
}: {
  disabled: boolean;
  empty: boolean;
  onPick: (text: string) => void;
  startOpen?: boolean;
  onHide?: () => void;
}) {
  const [open, setOpen] = useState(!!startOpen);
  const [status, setStatus] = useState("");
  function pick(kind: keyof typeof templates) {
    if (empty) {
      setStatus("Chat with Zee Spark first, then make notes, a quiz or flashcards from it.");
      return;
    }
    const hindi = getLanguage() === "hi" ? " Write it in Hindi." : "";
    onPick(`${templates[kind]}${hindi}`);
    setStatus("Added to your message box. Review it, then tap Send.");
  }
  return (
    <View style={{ gap: 6, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Button
          small
          disabled={disabled}
          onPress={() => {
            const next = !open;
            setOpen(next);
            if (!next) onHide?.();
          }}
        >
          {open ? `${t("study.title")} ×` : t("study.button")}
        </Button>
        {open && (
          <>
            <Button small onPress={() => pick("notes")}>
              {t("study.notes")}
            </Button>
            <Button small onPress={() => pick("quiz")}>
              {t("study.quiz")}
            </Button>
            <Button small onPress={() => pick("flashcards")}>
              {t("study.flashcards")}
            </Button>
          </>
        )}
      </View>
      {open && <Text style={s.small}>{t("study.hint")}</Text>}
      {!!status && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: colors.muted }}>
          {status}
        </Text>
      )}
    </View>
  );
}
