import assert from "node:assert/strict";
import { test } from "node:test";
import { HELPER_ROLES, helperTools, modelRunner } from "../apps/server/src/engine/helpers.ts";
import { chatCompletionsFixture } from "./helpers/model.ts";

type Exec = { name: string; execute: (args: unknown) => Promise<unknown> };
const byName = (tools: unknown[]) => new Map((tools as Exec[]).map((tool) => [tool.name, tool]));

// UNIT (fake runner): tool shape and result handling only.
test("four helper tools exist with distinct roles and return advice-only results", async () => {
  const seen: string[] = [];
  const tools = byName(
    helperTools(async (system, user) => {
      seen.push(system, user);
      return "  step 1  ";
    }),
  );
  assert.deepEqual(
    [...tools.keys()].sort(),
    Object.values(HELPER_ROLES)
      .map((role) => role.tool)
      .sort(),
  );
  assert.equal(tools.size, 4);
  const result = (await tools.get("ask_planner")?.execute({ task: "ship it", material: "m" })) as {
    advice: string;
    note: string;
  };
  assert.equal(result.advice, "step 1");
  assert.match(result.note, /no action/i);
  assert.match(seen[0] ?? "", /Planner/);
  assert.match(seen[1] ?? "", /untrusted data/);
});

test("helper failure and empty output are reported, not hidden", async () => {
  const failing = byName(
    helperTools(async () => {
      throw new Error("boom");
    }),
  );
  assert.deepEqual(await failing.get("ask_writer")?.execute({ task: "x" }), {
    role: "writer",
    error: "boom",
  });
  const empty = byName(helperTools(async () => "  "));
  assert.deepEqual(await empty.get("ask_reviewer")?.execute({ task: "x" }), {
    role: "reviewer",
    error: "Helper returned no text",
  });
});

// PROVIDER-WIRE (local fixture server speaking Chat Completions, not a real model).
test("modelRunner streams through the OpenAI-compatible Chat Completions path", async (t) => {
  const previous = { c: process.env.OPENAI_CHAT_COMPLETIONS, k: process.env.OPENAI_API_KEY };
  process.env.OPENAI_CHAT_COMPLETIONS = "true";
  process.env.OPENAI_API_KEY ??= "dummy";
  t.after(() => {
    if (previous.c === undefined) delete process.env.OPENAI_CHAT_COMPLETIONS;
    else process.env.OPENAI_CHAT_COMPLETIONS = previous.c;
    if (previous.k === undefined) delete process.env.OPENAI_API_KEY;
  });
  const { requests } = await chatCompletionsFixture(t, () => undefined);
  const text = await modelRunner("openai/fixture")("You are a helper.", "hello");
  assert.ok(text.length > 0, "fixture reply text collected");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.path, "/v1/chat/completions");
  assert.match(requests[0]?.body ?? "", /You are a helper/);
});

// WIRE (local server that accepts the request and never answers, like a stalled gateway).
test("modelRunner times out instead of hanging on a stalled gateway", async (t) => {
  const { createServer } = await import("node:http");
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const prev = {
    b: process.env.OPENAI_BASE_URL,
    c: process.env.OPENAI_CHAT_COMPLETIONS,
    t: process.env.HELPER_TIMEOUT_MS,
    k: process.env.OPENAI_API_KEY,
  };
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.OPENAI_CHAT_COMPLETIONS = "true";
  process.env.OPENAI_API_KEY ??= "dummy";
  t.after(() => {
    server.closeAllConnections();
    server.close();
    for (const [k, v] of Object.entries({
      OPENAI_BASE_URL: prev.b,
      OPENAI_CHAT_COMPLETIONS: prev.c,
      OPENAI_API_KEY: prev.k,
    }))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  });
  process.env.HELPER_TIMEOUT_MS = "300";
  t.after(() => {
    if (prev.t === undefined) delete process.env.HELPER_TIMEOUT_MS;
    else process.env.HELPER_TIMEOUT_MS = prev.t;
  });
  await assert.rejects(modelRunner("openai/stalled")("sys", "hi"), /timed out/);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(modelRunner("openai/stalled")("sys", "hi", controller.signal), /cancelled/);
});

// A transport that ignores abort must not keep the tool running forever.
test("helper deadline settles even when the provider ignores cancellation", async (t) => {
  const { boundedHelperCall } = await import("../apps/server/src/engine/helpers.ts");
  const previous = process.env.HELPER_TIMEOUT_MS;
  process.env.HELPER_TIMEOUT_MS = "30";
  t.after(() => {
    if (previous === undefined) delete process.env.HELPER_TIMEOUT_MS;
    else process.env.HELPER_TIMEOUT_MS = previous;
  });
  let transport: AbortController | undefined;
  await assert.rejects(
    boundedHelperCall(async (controller) => {
      transport = controller;
      return new Promise<string>(() => {});
    }),
    /timed out/,
  );
  assert.equal(transport?.signal.aborted, true);
  const parent = new AbortController();
  const cancelled = boundedHelperCall(async () => new Promise<string>(() => {}), parent.signal);
  parent.abort();
  await assert.rejects(cancelled, /cancelled/);
  let called = false;
  await assert.rejects(
    boundedHelperCall(async () => {
      called = true;
    }, parent.signal),
    /cancelled/,
  );
  assert.equal(called, false);
});
