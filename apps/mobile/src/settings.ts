import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { type Language, setLanguage } from "./i18n";
import { applyTheme, colors, setLogoOverride, type ThemeMode } from "./ui";

export type AccentId = "blue" | "green" | "orange" | "purple" | "pink";
export const accents: Record<AccentId, { label: string; light: string; dark: string }> = {
  blue: { label: "Blue", light: "#C8E7FF", dark: "#1473C8" },
  green: { label: "Green", light: "#CDECDA", dark: "#1F8A4C" },
  orange: { label: "Orange", light: "#FBE0B8", dark: "#C26A00" },
  purple: { label: "Purple", light: "#E5DBFB", dark: "#6A3FC8" },
  pink: { label: "Pink", light: "#FBD7E4", dark: "#C2185B" },
};
export type AppSettings = {
  appName: string;
  accent: AccentId;
  mascot: boolean;
  logoUri: string;
  theme: ThemeMode;
  language: Language;
};
export const defaultSettings: AppSettings = {
  appName: "Zee Spark",
  accent: "blue",
  mascot: true,
  logoUri: "",
  theme: "light",
  language: "en",
};

const SETTINGS_KEY = "openmuse.settings.v1";
const ACCESS_KEY_ITEM = "openmuse.accessKey";
const secure = Platform.OS !== "web";

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      appName:
        typeof parsed.appName === "string" && parsed.appName.trim() && parsed.appName !== "OpenMuse"
          ? parsed.appName.trim().slice(0, 30)
          : defaultSettings.appName,
      accent: parsed.accent && parsed.accent in accents ? parsed.accent : defaultSettings.accent,
      mascot: parsed.mascot !== false,
      logoUri: typeof parsed.logoUri === "string" ? parsed.logoUri : "",
      theme: parsed.theme === "dark" ? "dark" : "light",
      language: parsed.language === "hi" ? "hi" : "en",
    };
  } catch {
    return defaultSettings;
  }
}
export async function saveSettings(next: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}
/** Recolour the shared palette; screens re-read these values on the next render. */
export function applyAccent(accent: AccentId, theme: ThemeMode = "light"): void {
  const pick = accents[accent] ?? accents.blue;
  colors.blue = theme === "dark" ? pick.dark : pick.light;
  colors.blueDark = pick.dark;
}
/** Apply everything user-visible from stored settings (call once at startup and on save). */
export function applySettings(next: AppSettings): void {
  applyTheme(next.theme);
  applyAccent(next.accent, next.theme);
  setLogoOverride(next.logoUri || null);
  setLanguage(next.language);
}
/** The workspace access key, remembered on this device only (secure enclave on native). */
export async function loadAccessKey(): Promise<string> {
  try {
    if (secure) return (await SecureStore.getItemAsync(ACCESS_KEY_ITEM)) ?? "";
    return (await AsyncStorage.getItem(ACCESS_KEY_ITEM)) ?? "";
  } catch {
    return "";
  }
}
export async function saveAccessKey(key: string): Promise<void> {
  try {
    if (secure) await SecureStore.setItemAsync(ACCESS_KEY_ITEM, key);
    else await AsyncStorage.setItem(ACCESS_KEY_ITEM, key);
  } catch {
    // remembering the key is best-effort; sign-in still works without it
  }
}
export async function clearAccessKey(): Promise<void> {
  try {
    if (secure) await SecureStore.deleteItemAsync(ACCESS_KEY_ITEM);
    else await AsyncStorage.removeItem(ACCESS_KEY_ITEM);
  } catch {
    // ignore
  }
}
