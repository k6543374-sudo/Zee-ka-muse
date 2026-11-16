import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { buildPrintHtml, buildTranscript, type ExportMessage, exportFilename } from "./chat-export";
import { t } from "./i18n";
import { Button, colors, s } from "./ui";

export function ExportControl({
  messages,
  appName,
  disabled,
  startOpen,
  onHide,
}: {
  messages: ExportMessage[];
  appName: string;
  disabled: boolean;
  startOpen?: boolean;
  onHide?: () => void;
}) {
  const [open, setOpen] = useState(!!startOpen);
  const [status, setStatus] = useState("");
  const hasTurns = messages.some(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim(),
  );
  function guard(): boolean {
    if (!hasTurns) {
      setStatus(t("export.empty"));
      return false;
    }
    return true;
  }
  async function exportText() {
    if (!guard()) return;
    const transcript = buildTranscript(messages, appName);
    const filename = exportFilename(appName, "txt");
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } else {
        const path = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(path, transcript);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
      }
      setStatus(t("export.saved"));
    } catch {
      setStatus("Export did not finish. You can still select the chat text and copy it.");
    }
  }
  function exportPdf() {
    if (!guard()) return;
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setStatus("PDF export is available on the web app. On mobile, export a text file instead.");
      return;
    }
    const view = window.open("", "_blank", "width=820,height=900");
    if (!view) {
      setStatus(t("export.popupBlocked"));
      return;
    }
    view.document.write(buildPrintHtml(messages, appName));
    view.document.close();
    view.focus();
    try {
      view.print();
    } catch {
      // headless and some embedded browsers skip printing; the page stays open for manual print
    }
    setStatus(t("export.saved"));
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
          {t("export.button")}
        </Button>
        {open && (
          <>
            <Button small onPress={() => void exportText()}>
              {t("export.text")}
            </Button>
            <Button small onPress={exportPdf}>
              {t("export.pdf")}
            </Button>
          </>
        )}
      </View>
      {open && <Text style={s.small}>{t("export.hint")}</Text>}
      {!!status && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: colors.muted }}>
          {status}
        </Text>
      )}
    </View>
  );
}
