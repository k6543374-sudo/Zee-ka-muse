import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type LoginConfig = { provider: "key" | "supabase"; url?: string; publishableKey?: string };
export type LoginSession = { access_token: string; refresh_token: string; expires_at: number };
const key = "zeespark.login.v1";
export async function rememberedLogin(): Promise<LoginSession | null> {
  try {
    const value =
      Platform.OS === "web" ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
export async function rememberLogin(session: LoginSession | null) {
  if (Platform.OS === "web") {
    if (session) await AsyncStorage.setItem(key, JSON.stringify(session));
    else await AsyncStorage.removeItem(key);
  } else {
    if (session) await SecureStore.setItemAsync(key, JSON.stringify(session));
    else await SecureStore.deleteItemAsync(key);
  }
}
export async function passwordLogin(
  config: LoginConfig,
  credentials: { email: string; password: string } | { refresh_token: string },
): Promise<LoginSession> {
  if (!config.url || !config.publishableKey) throw new Error("Login is not configured yet.");
  const grant = "refresh_token" in credentials ? "refresh_token" : "password";
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!response.ok)
    throw new Error(
      grant === "password"
        ? "Could not sign in. Check your email and password, and verify your email."
        : "Session expired. Sign in again.",
    );
  const payload = await response.json();
  if (!payload.access_token || !payload.refresh_token)
    throw new Error("Login service returned an incomplete session.");
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at ?? Math.floor(Date.now() / 1000) + payload.expires_in,
  };
}

export async function requestAccountEmail(config: LoginConfig, email: string, password?: string) {
  if (!config.url || !config.publishableKey) throw new Error("Login is not configured yet.");
  const response = await fetch(
    `${config.url}/auth/v1/${password === undefined ? "recover" : "signup"}`,
    {
      method: "POST",
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...(password === undefined ? {} : { password }) }),
    },
  );
  if (!response.ok)
    throw new Error("Could not send the email. Try again later or contact support.");
}
export async function changeLoginPassword(config: LoginConfig, token: string, password: string) {
  if (!config.url || !config.publishableKey) throw new Error("Login is not configured yet.");
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error("Password could not be changed. Request a new reset email.");
}
