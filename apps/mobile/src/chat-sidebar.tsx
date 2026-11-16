import { useThreads } from "@copilotkit/react-native/headless";
import { MessageCircle, Plus, Settings } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { t } from "./i18n";
import { useMuseThread } from "./threads";
import { Button, colors, ErrorNotice, Mascot, s } from "./ui";

export function ChatSidebar({
  name,
  onManage,
  onSettings,
}: {
  name: string;
  onManage: () => void;
  onSettings: () => void;
}) {
  const { enabled, selection, mainId, start, select, visited } = useMuseThread();
  const history = useThreads({ agentId: "default", enabled, limit: 30 });
  const savedIds = new Set(history.threads.map((thread) => thread.id));
  return (
    <View
      style={{
        width: 254,
        backgroundColor: colors.sidebar,
        borderRightWidth: 1,
        borderColor: colors.line,
        padding: 18,
        gap: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Mascot size={30} />
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: colors.text,
            marginTop: 14,
            marginBottom: 10,
          }}
        >
          {name}
        </Text>
      </View>
      <Button primary icon={Plus} onPress={start}>
        {t("sidebar.newChat")}
      </Button>
      <Text style={[s.label, { marginTop: 12 }]}>{t("sidebar.yourConversations")}</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
        {[
          { id: mainId, name: t("sidebar.mainChat") },
          ...visited
            .filter((thread) => thread.id !== mainId && !savedIds.has(thread.id))
            .map((thread) => ({ id: thread.id, name: t("sidebar.newConversation") })),
          ...history.threads.filter((t) => t.id !== mainId && !t.archived),
        ].map((thread) => (
          <Pressable
            key={thread.id}
            accessibilityRole="button"
            accessibilityLabel={`Open conversation: ${thread.name || t("sidebar.untitled")}`}
            onPress={() =>
              select({ id: thread.id, existing: thread.id === mainId || savedIds.has(thread.id) })
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              padding: 12,
              borderRadius: 12,
              backgroundColor: selection.id === thread.id ? colors.sidebarActive : "transparent",
            }}
          >
            <MessageCircle size={16} color={colors.muted} />
            <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 13 }}>
              {thread.name || t("sidebar.untitled")}
            </Text>
          </Pressable>
        ))}
        {history.isLoading && <ActivityIndicator color={colors.blueDark} />}
        <ErrorNotice error={history.error?.message || ""} />
        {history.hasMoreThreads && (
          <Button small onPress={history.fetchMoreThreads}>
            {t("sidebar.moreChats")}
          </Button>
        )}
      </ScrollView>
      <Button small onPress={onManage}>
        {t("sidebar.manage")}
      </Button>
      <Button small icon={Settings} onPress={onSettings}>
        {t("sidebar.settings")}
      </Button>
      <Text style={s.small}>{t("sidebar.privacy")}</Text>
    </View>
  );
}
