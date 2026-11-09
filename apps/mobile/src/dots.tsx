import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { DotPage, DotPageSummary, DotSpace } from "../../../packages/domain/src/dots";
import { Button, Card, ErrorNotice, Field, s } from "./ui";
import { useWorkspace } from "./workspace";

/** A native-friendly first slice of the OpenDots workspace, not its agent runtime. */
export function DotsScreen() {
  const { api } = useWorkspace();
  const draftQueue = useRef(Promise.resolve());
  const draftKey = (id: string) => `openmuse.page-draft.${id}`;
  const persistDraft = (p: DotPage, nextTitle: string, nextContent: string) => {
    draftQueue.current = draftQueue.current
      .then(() =>
        AsyncStorage.setItem(
          draftKey(p.id),
          JSON.stringify({ title: nextTitle, content: nextContent, revision: p.revision }),
        ),
      )
      .catch(() => {
        setError("Device draft backup failed. Save before leaving this screen.");
      });
  };
  const [spaces, setSpaces] = useState<DotSpace[]>([]);
  const [space, setSpace] = useState<DotSpace>();
  const [pages, setPages] = useState<DotPageSummary[]>([]);
  const [page, setPage] = useState<DotPage>();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const dirty = Boolean(page && (title !== page.title || content !== page.content));
  useEffect(() => {
    let active = true;
    api
      .request<{ spaces: DotSpace[] }>("/api/dots")
      .then((d) => {
        if (active) setSpaces(d.spaces);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [api]);
  // The app's navigation may unmount this screen. Warn on browser close/reload,
  // and keep the in-screen navigation locked until the owner saves or discards.
  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const work = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const loadPages = async (selected: DotSpace) => {
    const d = await api.request<{ pages: DotPageSummary[] }>(
      `/api/dots/spaces/${selected.id}/pages`,
    );
    setSpace(selected);
    setPages(d.pages);
    setPage(undefined);
    setQuery("");
  };
  const edit = (p: DotPage) => {
    setPage(p);
    setTitle(p.title);
    setContent(p.content);
  };
  const openPage = async (id: string) => {
    const p = await api.request<DotPage>(`/api/dots/pages/${id}`);
    await draftQueue.current;
    const raw = await AsyncStorage.getItem(draftKey(id));
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        if (
          typeof draft.title === "string" &&
          typeof draft.content === "string" &&
          Number.isInteger(draft.revision) &&
          (draft.title !== p.title || draft.content !== p.content)
        ) {
          setPage({ ...p, revision: draft.revision });
          setTitle(draft.title);
          setContent(draft.content);
          setError(
            draft.revision !== p.revision
              ? "Recovered a device draft. The saved page changed elsewhere. Copy your draft before discarding it and reopening the saved page."
              : "Recovered unsaved edits from this device.",
          );
          return;
        }
      } catch {
        /* malformed device backup does not replace the saved page */
      }
    }
    edit(p);
  };
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.title}>Spaces & pages</Text>
      <Text style={s.muted}>
        OpenDots-inspired workspace inside Muse. Manual pages are saved privately in this workspace.
        No new model or service is connected.
      </Text>
      <ErrorNotice error={error} />
      {!space ? (
        <>
          <Card>
            <Field
              label="Space name"
              value={name}
              onChangeText={setName}
              maxLength={80}
              placeholder="School, ideas, projects…"
            />
            <Button
              primary
              busy={busy}
              disabled={!name.trim()}
              onPress={() =>
                void work(async () => {
                  const created = await api.request<DotSpace>("/api/dots/spaces", {
                    name: name.trim(),
                  });
                  setSpaces((current) => [created, ...current]);
                  setName("");
                  await loadPages(created);
                })
              }
            >
              Create space
            </Button>
          </Card>
          {spaces.map((item) => (
            <Button key={item.id} disabled={busy} onPress={() => void work(() => loadPages(item))}>
              {item.name}
            </Button>
          ))}
          {!spaces.length && (
            <Text style={s.muted}>Create your first Space to keep related pages together.</Text>
          )}
        </>
      ) : !page ? (
        <>
          <Button
            disabled={busy}
            onPress={() => {
              setSpace(undefined);
              setSaved("");
            }}
          >
            Back to spaces
          </Button>
          <Text style={s.heading}>{space.name}</Text>
          <Field label="Search page titles" value={query} onChangeText={setQuery} />
          <Button
            primary
            busy={busy}
            onPress={() =>
              void work(async () => {
                const p = await api.request<DotPage>(`/api/dots/spaces/${space.id}/pages`, {
                  title: "Untitled page",
                  content: "",
                });
                setPages((current) => [p, ...current]);
                edit(p);
              })
            }
          >
            New page
          </Button>
          {pages
            .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
            .map((p) => (
              <Button
                key={p.id}
                disabled={busy}
                onPress={() => void work(async () => openPage(p.id))}
              >
                {p.title}
              </Button>
            ))}
          {!pages.length && <Text style={s.muted}>No pages yet. Add notes, drafts or a plan.</Text>}
        </>
      ) : (
        <>
          <Button disabled={busy || dirty} onPress={() => void work(() => loadPages(space))}>
            Back to {space.name}
          </Button>
          <Field
            label="Page title"
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              persistDraft(page, v, content);
            }}
            maxLength={160}
            editable={!busy}
          />
          <Text style={s.label}>Page content (plain text / Markdown)</Text>
          <TextInput
            accessibilityLabel="Page content"
            multiline
            value={content}
            onChangeText={(v) => {
              setContent(v);
              persistDraft(page, title, v);
            }}
            editable={!busy}
            maxLength={60000}
            textAlignVertical="top"
            style={[s.input, { minHeight: 280, lineHeight: 23 }]}
            placeholder="Write here. Save before leaving this screen."
          />
          <Text accessibilityLiveRegion="polite" style={s.muted}>
            {dirty
              ? "Unsaved changes. Device draft backed up as you type. Save to sync across devices."
              : saved || `Saved · revision ${page.revision}`}
          </Text>
          <Button
            primary
            busy={busy}
            disabled={!title.trim() || !dirty}
            onPress={() =>
              void work(async () => {
                const p = await api.request<DotPage>(
                  `/api/dots/pages/${page.id}`,
                  { title: title.trim(), content, revision: page.revision },
                  "PUT",
                );
                await draftQueue.current;
                await AsyncStorage.removeItem(draftKey(p.id));
                edit(p);
                setSaved(`Saved · revision ${p.revision}`);
              })
            }
          >
            Save page
          </Button>
          {dirty && (
            <Button
              disabled={busy}
              onPress={() =>
                void work(async () => {
                  await draftQueue.current;
                  await AsyncStorage.removeItem(draftKey(page.id));
                  await openPage(page.id);
                })
              }
            >
              Discard unsaved edits
            </Button>
          )}
        </>
      )}
      <Text style={s.small}>
        First slice only: Spaces and manual text pages. Specialist Dots, rich visual editing, calls,
        Slack, MCP and separate computers are not enabled. Gemini and the existing approval rules
        stay unchanged.
      </Text>
    </View>
  );
}
