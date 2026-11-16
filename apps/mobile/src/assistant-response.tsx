import { useCallback, useState } from "react";
import { Linking, Platform, Pressable, Text, type TextStyle, View } from "react-native";
import Markdown, { type MarkdownStyles, type RenderRules } from "react-native-markdown-renderer";
import { assistantMarkdown, isSafeAssistantUrl } from "./assistant-markdown";
import { colors, ErrorNotice } from "./ui";

const buildStyle = (): Partial<MarkdownStyles> => ({
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  list: { marginBottom: 6 },
  headingContainer: { marginTop: 8, marginBottom: 4 },
  heading1: { fontSize: 21, lineHeight: 27 },
  heading2: { fontSize: 19, lineHeight: 25 },
  heading3: { fontSize: 17, lineHeight: 23 },
  link: { color: colors.blueDark, textDecorationLine: "underline" },
  codeInline: { backgroundColor: colors.codeBg, color: colors.text },
  codeBlock: { backgroundColor: colors.codeBg, color: colors.text },
});
const renderCodeBlock: RenderRules["fence"] = (node, _children, _parent, styles) => (
  <Text key={node.key} selectable style={styles.codeBlock as TextStyle}>
    {node.content.replace(/\n$/, "")}
  </Text>
);
const rules: RenderRules = {
  textgroup: (node, children) => (
    <Text key={node.key} selectable style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>
      {children}
    </Text>
  ),
  image: (node) => (
    <Text key={node.key} selectable style={{ color: colors.muted }}>
      {node.attributes.alt ? `[Image: ${node.attributes.alt}]` : "[Image]"}
    </Text>
  ),
  code_block: renderCodeBlock,
  fence: renderCodeBlock,
};

export function AssistantResponse({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [linkError, setLinkError] = useState("");
  const onLinkPress = useCallback((url: string) => {
    if (!isSafeAssistantUrl(url)) return false;
    setLinkError("");
    void Linking.openURL(url).catch((error) =>
      setLinkError(error instanceof Error ? error.message : String(error)),
    );
    return false;
  }, []);
  return (
    <>
      <Markdown
        markdownit={assistantMarkdown}
        style={buildStyle()}
        rules={rules}
        onLinkPress={onLinkPress}
      >
        {content}
      </Markdown>
      {Platform.OS === "web" && (
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy response"
            onPress={() => {
              if (typeof navigator === "undefined" || !navigator.clipboard) {
                setLinkError("Copy is unavailable here. Select the response text to copy it.");
                return;
              }
              void navigator.clipboard
                .writeText(content)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
                .catch(() => setLinkError("Could not copy. Select the response text to copy it."));
            }}
            style={{ paddingVertical: 6, paddingHorizontal: 8 }}
          >
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {copied ? "Copied" : "Copy response"}
            </Text>
          </Pressable>
        </View>
      )}
      <ErrorNotice error={linkError} />
    </>
  );
}
