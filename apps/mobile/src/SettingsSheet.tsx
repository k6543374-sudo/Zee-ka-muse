import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { Image, Modal, Platform, Pressable, Text, View } from "react-native";
import { accents, type AccentId, type AppSettings, defaultSettings } from "./settings";
import { Button, Card, colors, Field, s } from "./ui";

export function SettingsSheet({
  visible,
  settings,
  onSave,
  onClose,
  onSignOut,
}: {
  visible: boolean;
  settings: AppSettings;
  onSave: (next: AppSettings) => void;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState(settings.appName);
  const [accent, setAccent] = useState<AccentId>(settings.accent);
  const [mascot, setMascot] = useState(settings.mascot);
  const [logoUri, setLogoUri] = useState(settings.logoUri);
  const pickLogo = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "image/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    let uri = result.assets[0].uri;
    if (Platform.OS !== "web") {
      try {
        const dir = `${FileSystem.documentDirectory}custom/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const dot = uri.lastIndexOf(".");
        const ext = dot > 0 ? uri.slice(dot).split("?")[0] : ".png";
        const target = `${dir}logo${ext}`;
        await FileSystem.copyAsync({ from: uri, to: target });
        uri = target;
      } catch {
        // keep the picker URI if the copy fails
      }
    }
    setLogoUri(uri);
  };
  useEffect(() => {
    if (visible) {
      setName(settings.appName);
      setAccent(settings.accent);
      setMascot(settings.mascot);
      setLogoUri(settings.logoUri);
    }
  }, [visible, settings]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(17,25,28,0.35)",
          alignItems: "center",
          justifyContent: "center",
          padding: 22,
        }}
      >
        <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 420 }}>
          <Card>
            <Text style={[s.title, { fontSize: 20, marginBottom: 16 }]}>App settings</Text>
            <Field
              label="App display name"
              value={name}
              onChangeText={setName}
              placeholder="OpenMuse"
              maxLength={30}
            />
            <Text style={[s.label, { marginBottom: 8 }]}>Accent colour</Text>
            <View style={[s.row, { gap: 12, marginBottom: 18 }]}>
              {(Object.keys(accents) as AccentId[]).map((id) => {
                const pick = accents[id];
                const selected = accent === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={`${pick.label} accent${selected ? ", selected" : ""}`}
                    onPress={() => setAccent(id)}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: pick.light,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: selected ? 3 : 0,
                      borderColor: pick.dark,
                    }}
                  >
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: pick.dark,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
            <View style={[s.between, { marginBottom: 18 }]}>
              <View style={s.row}>
                <Text style={s.text}>Custom logo</Text>
                {!!logoUri && (
                  <Image
                    source={{ uri: logoUri }}
                    style={{ width: 28, height: 28, borderRadius: 14, marginLeft: 10 }}
                  />
                )}
              </View>
              <View style={[s.row, { gap: 8 }]}>
                <Button small onPress={() => void pickLogo()}>
                  {logoUri ? "Change" : "Choose"}
                </Button>
                {!!logoUri && (
                  <Button small onPress={() => setLogoUri("")}>
                    Remove
                  </Button>
                )}
              </View>
            </View>
            <View style={[s.between, { marginBottom: 18 }]}>
              <Text style={s.text}>Capybara mascot</Text>
              <View style={[s.row, { gap: 8 }]}>
                <Button small primary={mascot} onPress={() => setMascot(true)}>
                  Show
                </Button>
                <Button small primary={!mascot} onPress={() => setMascot(false)}>
                  Hide
                </Button>
              </View>
            </View>
            <View style={[s.row, { gap: 10 }]}>
              <Button
                primary
                onPress={() => {
                  onSave({
                    appName: name.trim() || defaultSettings.appName,
                    accent,
                    mascot,
                    logoUri,
                  });
                  onClose();
                }}
              >
                Save
              </Button>
              <Button
                onPress={() => {
                  setName(defaultSettings.appName);
                  setAccent(defaultSettings.accent);
                  setMascot(defaultSettings.mascot);
                }}
              >
                Reset
              </Button>
            </View>
            <View style={s.divider} />
            <Button danger onPress={onSignOut}>
              Sign out and forget the access key
            </Button>
            <Text style={[s.small, { marginTop: 14 }]}>
              Name, colour and mascot update inside the app straight away. The name and icon on your
              phone's home screen are fixed when the app is built - ask for a new build to change
              them.
            </Text>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
