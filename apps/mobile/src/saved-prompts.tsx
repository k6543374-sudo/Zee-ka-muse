import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type StringKey, t } from "./i18n";
import {
  normalizePrompts,
  PROMPTS_STORAGE_KEY,
  quickActions,
  removePrompt,
  type SavedPrompt,
  upsertPrompt,
} from "./prompt-store";
import { Button, colors, Field, Sheet, s } from "./ui";

export function PromptsSheet({
  draft,
  open,
  onUse,
  onClose,
}: {
  draft: string;
  open: boolean;
  onUse: (text: string) => void;
  onClose: () => void;
}) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) return;
    void AsyncStorage.getItem(PROMPTS_STORAGE_KEY)
      .then((raw) => setPrompts(normalizePrompts(raw)))
      .catch(() => {});
  }, [open]);
  function persist(next: SavedPrompt[]) {
    setPrompts(next);
    void AsyncStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }
  function add() {
    const trimmedLabel = label.trim();
    const trimmedText = text.trim();
    if (!trimmedLabel || !trimmedText) return;
    persist(
      upsertPrompt(prompts, {
        id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: trimmedLabel.slice(0, 40),
        text: trimmedText.slice(0, 2000),
      }),
    );
    setLabel("");
    setText("");
  }
  function use(text: string) {
    onUse(text);
    onClose();
  }
  if (!open) return null;
  return (
    <Sheet title={t("prompts.title")} onClose={onClose}>
      <Text style={[s.label, { marginBottom: 8 }]}>Quick actions</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
        {quickActions.map((action) => (
          <ChipButton
            key={action.key}
            label={t(action.key as StringKey)}
            onPress={() => use(action.text)}
          />
        ))}
      </View>
      <Text style={[s.label, { marginBottom: 8 }]}>{t("prompts.title")}</Text>
      {prompts.length ? (
        prompts.map((prompt) => (
          <View
            key={prompt.id}
            style={[
              s.between,
              { gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.text, { fontWeight: "600" }]}>{prompt.label}</Text>
              <Text numberOfLines={2} style={s.small}>
                {prompt.text}
              </Text>
            </View>
            <View style={[s.row, { gap: 6 }]}>
              <Button small onPress={() => use(prompt.text)}>
                {t("prompts.use")}
              </Button>
              <Button small danger onPress={() => persist(removePrompt(prompts, prompt.id))}>
                {t("prompts.delete")}
              </Button>
            </View>
          </View>
        ))
      ) : (
        <Text style={[s.muted, { marginBottom: 14 }]}>{t("prompts.empty")}</Text>
      )}
      <View style={{ height: 18 }} />
      <Field
        label={t("prompts.save")}
        value={label}
        onChangeText={setLabel}
        placeholder={t("prompts.labelPlaceholder")}
        maxLength={40}
      />
      <Field
        label=""
        value={text}
        onChangeText={setText}
        placeholder={t("prompts.textPlaceholder")}
        multiline
      />
      <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
        <Button small primary disabled={!label.trim() || !text.trim()} onPress={add}>
          {t("prompts.add")}
        </Button>
        {!!draft.trim() && (
          <Button small onPress={() => setText(draft.trim().slice(0, 2000))}>
            {t("prompts.useDraft")}
          </Button>
        )}
      </View>
      <Text style={[s.small, { marginTop: 14 }]}>
        Saved prompts stay on this device. Tapping one puts its text in your message box - you
        review and send it.
      </Text>
    </Sheet>
  );
}

function ChipButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 18,
        backgroundColor: pressed ? colors.sidebarActive : colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
