import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventSchemas, EventType, type RunAgentInput } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import { browserFixture } from "./helpers/browser.ts";
import { modelFixture } from "./helpers/model.ts";

const threadId = "fresh-read-chat";
const priorSessionId = randomUUID();
let pageText = "The current top story is Gemini Omni 1.2 Flash.";
const page = () => ({
  url: "https://news.ycombinator.com/",
  title: "Hacker News",
  text: pageText,
  truncated: false,
});

function runInput(content: string): RunAgentInput {
  return {
    threadId,
    runId: randomUUID(),
    messages: [
      {
        id: randomUUID(),
        role: "assistant",
        content: 'The current top story on Hacker News is "Gemini Omni 1.2 Flash" (blog.google).',
      },
      { id: randomUUID(), role: "user", content },
    ],
    tools: [],
    context: [],
    state: {},
  };
}

async function fixture(t: TestContext, failSessions?: string, workerDown = false) {
  const browserCalls: string[] = [];
  const browser = await browserFixture(t, (path, body) => {
    if (path !== "/health") browserCalls.push(path);
    if (path === "/health")
      return workerDown
        ? { status: 502, data: { error: { message: "worker asleep" } } }
        : { data: { status: "ok" } };
    if (failSessions && path === "/sessions") return { status: 502, data: { error: { message: failSessions } } };
    return {
      data: path.endsWith("/read")
        ? page()
        : {
            id: body.id,
            title: "Hacker News",
            url: body.url,
            status: "active",
            updatedAt: new Date().toISOString(),
          },
    };
  });
  // A thread that already browsed Hacker News earlier (the stale-answer setup).
  await browser.db.insertIfAbsent("local-user", "chat-browsers", {
    id: threadId,
    sessionId: priorSessionId,
  });
  await browser.db.put("local-user", "browsers", {
    id: priorSessionId,
    url: "https://news.ycombinator.com/",
    title: "Hacker News",
    status: "active",
    updatedAt: "2026-11-06T15:29:28.845Z",
  });
  const config = { ...browser.config, agentBackend: "model", model: "openai/fixture" } as const;
  const server = await createApp(browser.db, config);
  t.after(() => server.agent.stop());
  return {
    ...browser,
    ...server,
    browserCalls,
    conversation: new ConversationAgent(config, server.agent, "local-user"),
  };
}

test("explicit fresh-read question forces a live read even when the model calls no tool", async (t) => {
  const { requests } = await modelFixture(t, () => undefined);
  const fx = await fixture(t);
  const events = (
    await lastValueFrom(
      fx.conversation.run(runInput("what is the current top story on Hacker News")).pipe(toArray()),
    )
  ).map((event) => EventSchemas.parse(event));
  assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED);
  // The read happened server-side: session create + read on the thread's own session id.
  assert.ok(fx.browserCalls.includes("/sessions"), `calls: ${fx.browserCalls.join(",")}`);
  assert.ok(
    fx.browserCalls.includes(`/sessions/${priorSessionId}/read`),
    `calls: ${fx.browserCalls.join(",")}`,
  );
  // The model's first (and only) request carries the fresh page text as context.
  assert.equal(requests.length, 1);
  assert.ok(requests[0].body.includes(pageText), "fresh page text missing from model input");
  assert.ok(requests[0].body.includes("CURRENT content"), "fresh-read instruction missing");
});

test("repeating the same question after the source changed forces a new read of new content", async (t) => {
  const { requests } = await modelFixture(t, () => undefined);
  const fx = await fixture(t);
  await lastValueFrom(
    fx.conversation.run(runInput("what is the current top story on Hacker News")).pipe(toArray()),
  );
  assert.ok(requests[0].body.includes("Gemini Omni 1.2 Flash"));
  pageText = "The current top story is Deus Ex.";
  await lastValueFrom(
    fx.conversation
      .clone()
      .run(runInput("what is the current top story on Hacker News"))
      .pipe(toArray()),
  );
  assert.equal(requests.length, 2);
  assert.ok(requests[1].body.includes("Deus Ex"), "second run did not re-read the changed page");
  assert.equal(
    fx.browserCalls.filter((path) => path === "/sessions").length,
    2,
    "no second live read happened",
  );
});

test("a failed forced read gives the model an explicit UNVERIFIED state, not silence", async (t) => {
  const { requests } = await modelFixture(t, () => undefined);
  const fx = await fixture(t, "Public page could not be opened");
  const events = (
    await lastValueFrom(
      fx.conversation.run(runInput("what is the current top story on Hacker News")).pipe(toArray()),
    )
  ).map((event) => EventSchemas.parse(event));
  assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED);
  assert.ok(!events.some((event) => event.type === EventType.RUN_ERROR), "run must not fail");
  assert.ok(requests[0].body.includes("UNVERIFIED"), "unverified state missing from model input");
  assert.ok(requests[0].body.includes("Public page could not be opened"));
});

test("ordinary chat and unmatched fresh-read words never force a read", async (t) => {
  await modelFixture(t, () => undefined);
  const fx = await fixture(t);
  await lastValueFrom(
    fx.conversation.run(runInput("thanks, that was really helpful")).pipe(toArray()),
  );
  await lastValueFrom(
    fx.conversation
      .clone()
      .run(runInput("what is the latest news about the city budget"))
      .pipe(toArray()),
  );
  assert.deepEqual(fx.browserCalls, []);
});

test("an explicit URL in a fresh-read message is read without any prior browse", async (t) => {
  const { requests } = await modelFixture(t, () => undefined);
  const browserCalls: string[] = [];
  const browser = await browserFixture(t, (path, body) => {
    if (path !== "/health") browserCalls.push(path);
    if (path === "/health") return { data: { status: "ok" } };
    return {
      data: path.endsWith("/read")
        ? page()
        : {
            id: body.id,
            title: "Hacker News",
            url: body.url,
            status: "active",
            updatedAt: new Date().toISOString(),
          },
    };
  });
  const config = { ...browser.config, agentBackend: "model", model: "openai/fixture" } as const;
  const server = await createApp(browser.db, config);
  t.after(() => server.agent.stop());
  const conversation = new ConversationAgent(config, server.agent, "local-user");
  const events = (
    await lastValueFrom(
      conversation
        .run(runInput("is https://news.ycombinator.com/ showing the same top story right now"))
        .pipe(toArray()),
    )
  ).map((event) => EventSchemas.parse(event));
  assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED);
  assert.ok(browserCalls.includes("/sessions"), `calls: ${browserCalls.join(",")}`);
  assert.ok(requests[0].body.includes(pageText));
});

test("workspace snapshot reports stored sessions as unverified while the worker is offline", async (t) => {
  const fx = await fixture(t, undefined, true);
  const { token } = await fx.auth.session();
  const response = await fx.app.request("/api/workspace", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  const row = snapshot.browsers.find((b: { id: string }) => b.id === priorSessionId);
  assert.equal(row.status, "error");
  assert.match(row.lastError, /offline/);
  const connection = snapshot.connections.find((c: { id: string }) => c.id === "browser");
  assert.equal(connection.status, "unavailable");
});
