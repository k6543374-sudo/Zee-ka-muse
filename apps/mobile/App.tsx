import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { StatusBar } from "expo-status-bar";
import {
  Bell,
  Check,
  Lightbulb,
  type LucideIcon,
  Menu,
  MessageCircle,
  PanelsTopLeft,
  Plus,
  Settings as SettingsIcon,
  Shapes,
  SquareCheck,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Section, Workspace } from "../../packages/domain/src";
import {
  AgentActivityScreen,
  AgentStatus,
  AppsScreen,
  GoalsScreen,
  IdeasScreen,
} from "./src/agent-ui";
import { AgentWorkspaceProvider, useAgentWorkspace } from "./src/agent-workspace";
import { API_URL, createSession, MuseApi } from "./src/api";
import { ChatScreen, WorkspaceTools } from "./src/chat";
import { ChatSidebar } from "./src/chat-sidebar";
import { ComputerEntry } from "./src/computer";
import { ComputerDraftProvider } from "./src/computer-drafts";
import { Details } from "./src/details";
import { DotsScreen } from "./src/dots";
import { type StringKey, t } from "./src/i18n";
import {
  changeLoginPassword,
  type LoginConfig,
  passwordLogin,
  rememberedLogin,
  rememberLogin,
  requestAccountEmail,
} from "./src/login";
import { SettingsSheet } from "./src/SettingsSheet";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./src/screens";
import {
  type AppSettings,
  applySettings,
  clearAccessKey,
  defaultSettings,
  loadAccessKey,
  loadSettings,
  saveAccessKey,
  saveSettings,
} from "./src/settings";
import { ThreadsProvider, ThreadsSheet, useMuseThread } from "./src/threads";
import { Button, Card, colors, ErrorNotice, Field, IconButton, Mascot, s } from "./src/ui";
import { wakeWorkerOnce } from "./src/worker-wake";
import { type Detail, useWorkspace, WorkspaceContext } from "./src/workspace";

const nav: { id: Section; labelKey: StringKey; icon: LucideIcon }[] = [
  { id: "chat", labelKey: "nav.chat", icon: MessageCircle },
  { id: "activity", labelKey: "nav.activity", icon: PanelsTopLeft },
  { id: "ideas", labelKey: "nav.ideas", icon: Lightbulb },
  { id: "goals", labelKey: "nav.goals", icon: SquareCheck },
  { id: "apps", labelKey: "nav.apps", icon: Shapes },
];
const titles: Partial<Record<Section, { title: string; subtitle: string }>> = {
  activity: { title: "Activity", subtitle: "Plans, progress, decisions and results." },
  ideas: { title: "Ideas", subtitle: "Useful next steps, grounded in your world." },
  goals: {
    title: "Goals",
    subtitle: "Longer-term goals and things to keep an eye on.",
  },
  apps: {
    title: "Apps",
    subtitle: "Connections, capabilities and what your agent remembers.",
  },
  connections: { title: "Apps", subtitle: "Connections and capabilities." },
  mail: { title: "Mail", subtitle: "The conversations behind your work." },
  calendar: { title: "Calendar", subtitle: "Time for what matters." },
  browser: { title: "Browser", subtitle: "Your connected browsing sessions." },
  dots: { title: "Spaces & pages", subtitle: "Your private document workspace." },
  files: { title: "Files", subtitle: "Documents, forms and filled copies." },
};
export default function App() {
  const loginGeneration = useRef(0);
  const [token, setToken] = useState("");
  const [loginConfig, setLoginConfig] = useState<LoginConfig>({ provider: "key" });
  const [notice, setNotice] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const connect = useCallback(async (key?: string, supabaseToken?: string) => {
    setBusy(true);
    setError("");
    try {
      const session = await createSession(key, supabaseToken);
      setToken(session.token);
      if (key) void saveAccessKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const savePrefs = useCallback((next: AppSettings) => {
    setSettings(next);
    applySettings(next);
    void saveSettings(next);
  }, []);
  const signOut = useCallback(() => {
    loginGeneration.current++;
    if (token)
      void new MuseApi(token)
        .request("/api/session", undefined, "DELETE")
        .catch(() =>
          setError(
            "Signed out on this device. The login service could not confirm sign-out; try signing in and out again when it is available.",
          ),
        );
    void rememberLogin(null);
    setPassword("");
    void clearAccessKey();
    setAccessKey("");
    setToken("");
    setSettingsOpen(false);
  }, [token]);
  useEffect(() => {
    void (async () => {
      const stored = await loadSettings();
      applySettings(stored);
      setSettings(stored);
      setSettingsReady(true);
      const response = await fetch(`${API_URL}/api/auth/config`);
      if (!response.ok) throw new Error("Could not load sign-in settings. Try reloading.");
      const config: LoginConfig = await response.json();
      setLoginConfig(config);
      if (config.provider === "supabase") {
        await clearAccessKey();
        if (Platform.OS === "web" && typeof window !== "undefined" && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.slice(1));
          const recovered = params.get("access_token");
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          if (recovered && params.get("type") === "recovery") {
            await createSession(undefined, recovered);
            setRecoveryToken(recovered);
            setNotice("Choose a new password for your account.");
            setBusy(false);
            return;
          }
          if (params.get("type") === "signup") setNotice("Email verified. You can sign in now.");
        }
        const saved = await rememberedLogin();
        if (saved) {
          const next = await passwordLogin(config, { refresh_token: saved.refresh_token });
          await rememberLogin(next);
          await connect(undefined, next.access_token);
        } else setBusy(false);
        return;
      }
      const remembered = await loadAccessKey();
      // Only auto-connect with a remembered key; a keyless attempt against a
      // live server just surfaces "Access key is incorrect" on a fresh visit.
      if (remembered) void connect(remembered);
      else setBusy(false);
    })().catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    });
  }, [connect]);
  useEffect(() => {
    if (!token || loginConfig.provider !== "supabase") return;
    const timer = setInterval(() => {
      void (async () => {
        const saved = await rememberedLogin();
        if (saved && saved.expires_at * 1000 < Date.now() + 120000) {
          const generation = loginGeneration.current;
          const next = await passwordLogin(loginConfig, { refresh_token: saved.refresh_token });
          if (generation !== loginGeneration.current) return;
          await rememberLogin(next);
          if (generation !== loginGeneration.current) {
            await rememberLogin(null);
            return;
          }
          setToken(next.access_token);
        }
      })().catch(() => {
        setToken("");
        setError("Session expired. Sign in again.");
      });
    }, 30000);
    return () => clearInterval(timer);
  }, [token, loginConfig]);
  const signIn = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (creatingAccount || recoveryToken) {
        if (password.length < 12) throw new Error("Use at least 12 characters for your password.");
        if (recoveryToken) {
          await changeLoginPassword(loginConfig, recoveryToken, password);
          setRecoveryToken("");
          await rememberLogin(null);
          setNotice("Password updated. Sign in with your new password.");
        } else {
          await requestAccountEmail(loginConfig, email.trim(), password);
          setCreatingAccount(false);
          setNotice(
            "Check your email for a verification link. If you already have an account, sign in instead.",
          );
        }
        setPassword("");
        return;
      }
      const session = await passwordLogin(loginConfig, { email: email.trim(), password });
      await createSession(undefined, session.access_token);
      await rememberLogin(session);
      setPassword("");
      setToken(session.access_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!settingsReady)
    return (
      <SafeAreaProvider>
        <StatusBar style={settings.theme === "dark" ? "light" : "dark"} />
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.blueDark} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style={settings.theme === "dark" ? "light" : "dark"} />
      <SettingsSheet
        visible={settingsOpen}
        settings={settings}
        onSave={savePrefs}
        onClose={() => setSettingsOpen(false)}
        onSignOut={signOut}
      />
      {token ? (
        <CopilotKitProvider
          runtimeUrl={`${API_URL}/api/copilotkit`}
          headers={{ Authorization: `Bearer ${token}` }}
        >
          <WorkspaceApp
            token={token}
            displayName={settings.appName}
            mascot={settings.mascot}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </CopilotKitProvider>
      ) : (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <ScrollView
            style={{ width: "100%", maxWidth: 420 }}
            contentContainerStyle={{ gap: 22, alignItems: "center", paddingVertical: 18 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {settings.mascot && <Mascot size={72} />}
            <Text
              style={{ fontSize: 32, color: colors.text, letterSpacing: -1, fontWeight: "500" }}
            >
              Welcome to {settings.appName}.
            </Text>
            <Text style={[s.muted, { textAlign: "center" }]}>
              Your ideas. Your work. One place.
            </Text>
            {busy ? (
              <ActivityIndicator color={colors.blueDark} />
            ) : (
              <Card style={{ width: "100%" }}>
                <ErrorNotice error={error} />
                {notice ? <Text style={[s.small, { marginBottom: 12 }]}>{notice}</Text> : null}
                {loginConfig.provider === "supabase" ? (
                  <>
                    {!recoveryToken && (
                      <Field
                        label="Email"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                      />
                    )}
                    <Field
                      label={recoveryToken ? "New password" : "Password"}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete={
                        creatingAccount || recoveryToken ? "new-password" : "current-password"
                      }
                    />
                    <Button primary onPress={() => void signIn()}>
                      {recoveryToken
                        ? "Save new password"
                        : creatingAccount
                          ? "Create account"
                          : "Sign in"}
                    </Button>
                    {!recoveryToken && (
                      <>
                        <Button
                          onPress={() => {
                            setCreatingAccount(!creatingAccount);
                            setError("");
                            setNotice("");
                          }}
                        >
                          {creatingAccount
                            ? "Already have an account? Sign in"
                            : "Create an account"}
                        </Button>
                        {!creatingAccount && (
                          <Button
                            onPress={() => {
                              if (!email.trim()) {
                                setError("Enter your email first.");
                                return;
                              }
                              setBusy(true);
                              setError("");
                              void requestAccountEmail(loginConfig, email.trim())
                                .then(() =>
                                  setNotice(
                                    "If an account exists, you will receive a password reset email.",
                                  ),
                                )
                                .catch((e) => setError(e.message))
                                .finally(() => setBusy(false));
                            }}
                          >
                            Forgot password?
                          </Button>
                        )}
                      </>
                    )}
                    <Text style={[s.small, { marginTop: 15 }]}>
                      Your own private workspace. Verify your email before signing in. Passwords are
                      checked by Supabase, not saved in this app.
                    </Text>
                  </>
                ) : (
                  <>
                    <Field
                      label="Workspace access key"
                      value={accessKey}
                      onChangeText={setAccessKey}
                      secureTextEntry
                      placeholder="Required for a live workspace"
                    />
                    <Button primary onPress={() => void connect(accessKey || undefined)}>
                      Open workspace
                    </Button>
                    <Text style={[s.small, { marginTop: 15 }]}>
                      Local workspaces open without a key. Make sure your OpenMuse server is running
                      at {API_URL}.
                    </Text>
                  </>
                )}
              </Card>
            )}
          </ScrollView>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}
function WorkspaceApp({
  token,
  displayName,
  mascot,
  onOpenSettings,
}: {
  token: string;
  displayName: string;
  mascot: boolean;
  onOpenSettings: () => void;
}) {
  const api = useMemo(() => new MuseApi(token), [token]);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [section, setSection] = useState<Section>("chat");
  const [detail, setDetail] = useState<Detail>();
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState<{ id: number; text: string }>();
  const refresh = useCallback(async () => {
    const snapshot = await api.request<Workspace>("/api/workspace");
    setWorkspace(snapshot);
    const browser = snapshot.connections.find((c) => c.id === "browser");
    wakeWorkerOnce(browser?.wakeUrl, browser?.status === "unavailable");
    setError("");
  }, [api]);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, [refresh]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch((e) => setError(String(e)));
    });
    return () => listener.remove();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = useCallback(
    (next: Section) =>
      setSection(next === "today" ? "chat" : next === "connections" ? "apps" : next),
    [],
  );
  const open = useCallback((next: Detail) => setDetail(next), []);
  const close = useCallback(() => setDetail(undefined), []);
  const ask = useCallback((text: string) => {
    setPrompt({ id: Date.now(), text });
    setSection("chat");
  }, []);
  if (!workspace)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 18,
        }}
      >
        <Mascot size={56} />
        {error ? (
          <>
            <ErrorNotice error={error} />
            <Button onPress={() => void refresh().catch((e) => setError(String(e)))}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.blueDark} />
            <Text style={s.muted}>Opening your workspace…</Text>
          </>
        )}
      </SafeAreaView>
    );
  return (
    <WorkspaceContext.Provider
      value={{ workspace, api, section, navigate, refresh, open, close, notify: setToast, ask }}
    >
      <AgentWorkspaceProvider>
        <ComputerDraftProvider key={token}>
          <ThreadsProvider>
            <WorkspaceShell
              detail={detail}
              toast={toast}
              clearToast={() => setToast("")}
              error={error}
              prompt={prompt}
              displayName={displayName}
              mascot={mascot}
              onOpenSettings={onOpenSettings}
            />
          </ThreadsProvider>
        </ComputerDraftProvider>
      </AgentWorkspaceProvider>
    </WorkspaceContext.Provider>
  );
}
function WorkspaceShell({
  detail,
  toast,
  clearToast,
  error,
  prompt,
  displayName,
  mascot,
  onOpenSettings,
}: {
  detail?: Detail;
  toast: string;
  clearToast: () => void;
  error: string;
  prompt?: { id: number; text: string };
  displayName: string;
  mascot: boolean;
  onOpenSettings: () => void;
}) {
  const { workspace, section, navigate, open } = useWorkspace();
  const { data } = useAgentWorkspace();
  const {
    selection,
    start: startChat,
    visited,
    mainId,
    loading: threadsLoading,
    error: threadsError,
    retry: retryThreads,
    enabled: richThreads,
  } = useMuseThread();
  const [threadsOpen, setThreadsOpen] = useState(false);
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const pending =
    (data?.notifications.filter((n) => !n.read).length || 0) +
    workspace.actions.filter((a) => a.status === "awaiting_review").length;
  const activeTask =
    data?.tasks.find(
      (task) => task.status === "waiting_approval" || task.status === "waiting_input",
    ) || data?.tasks.find((task) => task.status === "running");
  const agentName = displayName !== "OpenMuse" ? displayName : data?.identity.name || "OpenMuse";
  const status = activeTask
    ? activeTask.status === "waiting_approval"
      ? `Ready to review · ${activeTask.title}`
      : activeTask.status === "waiting_input"
        ? `Needs your input · ${activeTask.title}`
        : activeTask.plan.find((step) => step.status === "running")?.title || activeTask.title
    : data?.tasks.some((task) => task.status === "queued")
      ? "Picking up your next task…"
      : "Here when you need me";
  const title = titles[section] || titles.apps;
  const Screen =
    section === "dots"
      ? DotsScreen
      : section === "mail"
        ? MailScreen
        : section === "calendar"
          ? CalendarScreen
          : section === "browser"
            ? BrowserScreen
            : section === "files"
              ? FilesScreen
              : section === "activity"
                ? AgentActivityScreen
                : section === "ideas"
                  ? IdeasScreen
                  : section === "goals"
                    ? GoalsScreen
                    : AppsScreen;
  const utility = ["mail", "calendar", "browser", "files", "dots"].includes(section);
  return (
    <>
      <WorkspaceTools />
      <SafeAreaView
        style={{ flex: 1, flexDirection: "row", backgroundColor: colors.canvas }}
        edges={["top", "bottom"]}
      >
        {desktop && (
          <ChatSidebar
            name={agentName}
            onManage={() => setThreadsOpen(true)}
            onSettings={onOpenSettings}
          />
        )}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            width: "100%",
            maxWidth: 1060,
            alignSelf: "stretch",
            marginHorizontal: "auto",
          }}
        >
          <View
            style={{
              height: desktop ? 94 : 96,
              paddingTop: desktop ? 14 : 2,
              marginHorizontal: 20,
            }}
          >
            <View style={{ position: "absolute", left: 0, top: 16 }}>
              <IconButton
                icon={desktop ? Plus : Menu}
                label={desktop ? t("header.startNewChat") : t("header.openMenu")}
                onPress={() => (desktop ? startChat() : setThreadsOpen(true))}
              />
            </View>
            <View pointerEvents="box-none" style={{ alignItems: "center", gap: 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${agentName} activity and approvals`}
                onPress={() => navigate("activity")}
                style={({ pressed }) => ({
                  alignItems: "center",
                  maxWidth: "70%",
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                {mascot && <Mascot size={26} variant={data?.identity.avatar} />}
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: colors.text,
                    letterSpacing: -0.4,
                  }}
                >
                  {agentName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}
                >
                  {status}
                </Text>
              </Pressable>
              {section === "chat" && <ComputerEntry />}
            </View>
            <View style={{ position: "absolute", right: 0, top: 16, flexDirection: "row", gap: 4 }}>
              <IconButton
                icon={SettingsIcon}
                label={t("header.openSettings")}
                onPress={onOpenSettings}
              />
              <IconButton
                icon={Bell}
                label={`Notifications, ${pending} unread or pending`}
                onPress={() => open({ type: "notifications" })}
              />
              {pending > 0 && (
                <View
                  pointerEvents="none"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 4,
                    position: "absolute",
                    top: 7,
                    right: 9,
                    backgroundColor: colors.blueDark,
                  }}
                />
              )}
            </View>
          </View>
          <View style={{ flex: 1, minHeight: 0 }}>
            {!!workspace.sourceErrors && (
              <View style={{ paddingHorizontal: desktop ? 42 : 17, paddingVertical: 8 }}>
                <ErrorNotice error={Object.values(workspace.sourceErrors).join(" ")} />
              </View>
            )}
            {section !== "chat" && (
              <ScrollView
                key={section}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: desktop ? 42 : 22, paddingBottom: 28 }}
                keyboardShouldPersistTaps="handled"
              >
                {utility && (
                  <Button
                    small
                    style={{ alignSelf: "flex-start", marginBottom: 18 }}
                    onPress={() => navigate("apps")}
                  >
                    Back to Apps
                  </Button>
                )}
                <Text style={[s.title, { fontSize: 25, marginBottom: 22 }]}>{title?.title}</Text>
                <ErrorNotice error={error} />
                <Screen />
              </ScrollView>
            )}
            <View
              style={{
                display: section === "chat" ? "flex" : "none",
                flex: 1,
                paddingHorizontal: desktop ? 42 : 17,
              }}
            >
              <AgentStatus />
              {richThreads ? (
                <>
                  <ErrorNotice error={threadsError} />
                  {threadsError ? (
                    <Button onPress={retryThreads}>Retry main chat</Button>
                  ) : threadsLoading ? (
                    <ActivityIndicator color={colors.blueDark} />
                  ) : null}
                  {!threadsLoading && selection.id !== mainId && (
                    <Text style={[s.small, { textAlign: "center", marginBottom: 8 }]}>
                      Side chat
                    </Text>
                  )}
                  {visited.map((thread) => (
                    <View
                      key={thread.id}
                      style={{ display: selection.id === thread.id ? "flex" : "none", flex: 1 }}
                    >
                      <ChatScreen
                        thread={thread}
                        active={section === "chat" && selection.id === thread.id}
                        prompt={selection.id === thread.id ? prompt : undefined}
                        appName={agentName}
                      />
                    </View>
                  ))}
                </>
              ) : (
                <ChatScreen prompt={prompt} active={section === "chat"} appName={agentName} />
              )}
            </View>
          </View>
          <View
            style={{
              paddingHorizontal: 22,
              paddingTop: 10,
              paddingBottom: desktop ? 22 : 7,
              alignItems: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                width: "100%",
                maxWidth: 370,
                padding: 5,
                backgroundColor: colors.raised,
                borderRadius: 40,
                shadowColor: "#132631",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.07,
                shadowRadius: 18,
                elevation: 3,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              {nav.map((item) => {
                const active = section === item.id || (item.id === "apps" && utility);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityLabel={t(item.labelKey)}
                    accessibilityState={{ selected: active }}
                    onPress={() => navigate(item.id)}
                    style={{
                      flex: 1,
                      height: 51,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? colors.surface : "transparent",
                      borderRadius: 28,
                    }}
                  >
                    <item.icon size={19} strokeWidth={1.8} color={colors.text} />
                    <Text style={{ fontSize: 9, marginTop: 3, color: colors.text }}>
                      {t(item.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        {!!toast && (
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", bottom: 94, left: 20, right: 20, alignItems: "center" }}
          >
            <View
              style={[
                s.row,
                {
                  gap: 10,
                  padding: 14,
                  backgroundColor: colors.text,
                  borderRadius: 20,
                  maxWidth: 560,
                },
              ]}
            >
              <Check size={16} color={colors.blue} />
              <Text style={{ color: "#FFF", fontSize: 13, flexShrink: 1 }}>{toast}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                onPress={clearToast}
              >
                <X size={16} color="#FFF" />
              </Pressable>
            </View>
          </View>
        )}
        {threadsOpen && <ThreadsSheet onClose={() => setThreadsOpen(false)} />}
        {detail && (
          <Details
            key={
              detail.type === "task"
                ? detail.taskId
                : detail.type === "file"
                  ? detail.file.id
                  : detail.type === "browser"
                    ? detail.browser.id
                    : detail.type === "mail"
                      ? detail.mail.id
                      : detail.type === "review"
                        ? detail.action.id
                        : detail.type === "email"
                          ? JSON.stringify(detail.draft)
                          : detail.type === "event"
                            ? detail.event?.id || "event-new"
                            : detail.type
            }
            detail={detail}
          />
        )}
      </SafeAreaView>
    </>
  );
}
