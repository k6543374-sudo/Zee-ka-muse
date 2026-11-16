import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { t } from "./i18n";
import { Button, colors, s } from "./ui";

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function VoiceControls({
  onTranscript,
  reply,
  busy,
  active,
  startOpen,
  onHide,
}: {
  onTranscript: (text: string) => void;
  reply: string;
  busy: boolean;
  active: boolean;
  startOpen?: boolean;
  onHide?: () => void;
}) {
  const [open, setOpen] = useState(!!startOpen);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const recognition = useRef<Recognition | null>(null);
  useEffect(
    () => () => {
      recognition.current?.abort();
      if (Platform.OS === "web" && typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (!active) {
      recognition.current?.abort();
      if (Platform.OS === "web" && typeof window !== "undefined") window.speechSynthesis?.cancel();
    }
  }, [active]);
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const Speech =
    (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
  function listen() {
    if (!Speech) {
      setStatus("Voice input is not supported by this browser. You can still type.");
      return;
    }
    window.speechSynthesis?.cancel();
    const next = new Speech();
    recognition.current = next;
    next.lang = navigator.language || "en-IN";
    next.interimResults = false;
    next.onresult = (event) => {
      onTranscript(event.results[0][0].transcript);
      setStatus("Added to your message. Review it, then tap Send.");
    };
    next.onerror = (event) => {
      setListening(false);
      setStatus(
        event.error === "not-allowed"
          ? "Microphone permission was denied. You can allow it in browser settings, or type instead."
          : "Could not hear that. Try again, or type your message.",
      );
    };
    next.onend = () => setListening(false);
    try {
      next.start();
      setListening(true);
      setStatus("Listening. Tap Stop mic when finished.");
    } catch {
      setStatus("Microphone could not start. Try again.");
    }
  }
  function readReply() {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      setStatus("Read aloud is not supported by this browser.");
      return;
    }
    recognition.current?.abort();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      reply
        .replace(/```[\s\S]*?```/g, " Code block omitted. ")
        .replace(/[*#`]/g, "")
        .slice(0, 10000),
    );
    utterance.lang = navigator.language || "en-IN";
    utterance.onerror = () => setStatus("Could not read the reply aloud. You can read it in chat.");
    window.speechSynthesis.speak(utterance);
    setStatus("Reading the latest reply. Tap Stop audio to stop.");
  }
  return (
    <View style={{ gap: 6, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Button
          small
          onPress={() => {
            const next = !open;
            setOpen(next);
            if (!next) {
              recognition.current?.abort();
              window.speechSynthesis?.cancel();
              onHide?.();
            }
          }}
        >
          {open ? t("voice.off") : t("voice.mode")}
        </Button>
        {open && (
          <>
            <Button small onPress={() => (listening ? recognition.current?.stop() : listen())}>
              {listening ? t("voice.stopMic") : t("voice.speak")}
            </Button>
            <Button small disabled={!reply || busy} onPress={readReply}>
              {t("voice.read")}
            </Button>
            <Button
              small
              onPress={() => {
                window.speechSynthesis?.cancel();
                setStatus("Audio stopped.");
              }}
            >
              {t("voice.stopAudio")}
            </Button>
          </>
        )}
      </View>
      {open && (
        <>
          <Text style={s.small}>{t("voice.disclosure")}</Text>
          {!!status && (
            <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: colors.muted }}>
              {status}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
