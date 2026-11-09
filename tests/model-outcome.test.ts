import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import { createStore } from "../apps/server/src/db.ts";
import type { ActionProposal } from "../packages/domain/src/index.ts";
import { modelFixture } from "./helpers/model.ts";

for (const scenario of [
  {
    name: "finish_task",
    arguments: { summary: "The requested work is complete." },
    status: "succeeded",
  },
  {
    name: "ask_user",
    arguments: { question: "Which date should I use?" },
    status: "waiting_input",
  },
  {
    name: "prepare_event",
    arguments: {
      title: "Sample walk",
      start: "2026-10-10T10:00:00-07:00",
      end: "2026-10-10T11:00:00-07:00",
    },
    status: "waiting_approval",
  },
  {
    name: "prepare_email",
    arguments: { to: ["friend@example.com"], subject: "Sample plan", body: "A walk tomorrow?" },
    status: "waiting_approval",
  },
]) {
  test(`${scenario.name} settles the task without another model request`, async (t) => {
    const { requests } = await modelFixture(t, () => scenario, {
      // A provider failure after the outcome must not replace it with a failed task.
      errorStatus: (index) => (index > 0 ? 503 : undefined),
    });
    const directory = await mkdtemp(join(tmpdir(), "openmuse-model-outcome-"));
    const db = await createStore();
    const server = await createApp(db, {
      mode: "sample",
      port: 8787,
      host: "127.0.0.1",
      publicUrl: "http://localhost:8787",
      dataDir: directory,
      agentBackend: "model",
      model: "openai/fixture",
      intelligenceApiKey: "test-project-key-never-sent",
      googleRedirectUri: "http://localhost:8787/api/google/callback",
      allowedOrigins: [],
    });
    try {
      const task = await server.agent.createTask("owner", { prompt: "Make a sample plan" });
      await server.agent.worker.tick();
      const saved = await server.agent.getTask("owner", task.id);
      assert.equal(saved.status, scenario.status, saved.error ?? saved.question);
      assert.equal(requests.length, 1, "the outcome ends the model loop before its next turn");
      if (scenario.status === "succeeded") assert.equal(saved.result, scenario.arguments.summary);
      if (scenario.status === "waiting_input")
        assert.equal(saved.question, scenario.arguments.question);
      if (scenario.status === "waiting_approval") {
        assert.ok(saved.actionId);
        const proposal = await db.get<ActionProposal>("owner", "actions", saved.actionId);
        assert.equal(proposal?.status, "awaiting_review", "a model never approves the action");
      }
    } finally {
      await server.agent.stop();
      await db.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("a model task keeps every earlier answer when it asks again", async (t) => {
  const { requests } = await modelFixture(t, (index) =>
    index === 0
      ? { name: "ask_user", arguments: { question: "Which date should I use?" } }
      : index === 1
        ? { name: "ask_user", arguments: { question: "What time works?" } }
        : { name: "finish_task", arguments: { summary: "Planned." } },
  );
  const directory = await mkdtemp(join(tmpdir(), "openmuse-model-answers-"));
  const db = await createStore();
  const server = await createApp(db, {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    model: "openai/fixture",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: [],
  });
  try {
    const task = await server.agent.createTask("owner", { prompt: "Plan a sample walk" });
    await server.agent.worker.tick();
    await server.agent.answer("owner", task.id, "Friday");
    await server.agent.worker.tick();
    await server.agent.answer("owner", task.id, "3pm");
    await server.agent.worker.tick();
    assert.equal((await server.agent.getTask("owner", task.id)).status, "succeeded");
    assert.equal(requests.length, 3);
    const userMessage = (body: string) =>
      JSON.stringify(
        (JSON.parse(body) as { input: { role?: string; content: unknown }[] }).input.find(
          (item) => item.role === "user",
        )?.content,
      );
    const last = userMessage(requests[2].body);
    for (const text of ["Which date should I use?", "Friday", "What time works?", "3pm"])
      assert.ok(last.includes(text), `the third run's request is missing "${text}": ${last}`);
  } finally {
    await server.agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const status of ["none", "failed", "awaiting_review", "succeeded"] as const) {
  test(`email finish_task requires its own Gmail receipt (${status})`, async (t) => {
    await modelFixture(t, () => ({
      name: "finish_task",
      arguments: { summary: "Email sent to friend@example.com." },
    }));
    const directory = await mkdtemp(join(tmpdir(), "openmuse-send-receipt-"));
    const db = await createStore();
    const server = await createApp(db, {
      mode: "sample",
      port: 8787,
      host: "127.0.0.1",
      publicUrl: "http://localhost:8787",
      dataDir: directory,
      agentBackend: "model",
      model: "openai/fixture",
      intelligenceApiKey: "test-project-key-never-sent",
      googleRedirectUri: "http://localhost:8787/api/google/callback",
      allowedOrigins: [],
    });
    try {
      const task = await server.agent.createTask("owner", {
        prompt: "Send an email to friend@example.com introducing the app",
        kind: "agent",
      });
      // No network mail API is used. Seed only local fixture receipts.
      if (status !== "none")
        await db.put("owner", "actions", {
          id: "test-receipt",
          taskId: task.id,
          kind: "email.send",
          status,
          result: status === "succeeded" ? "Gmail sent message · fixture123" : undefined,
          data: {
            to: ["friend@example.com"],
            cc: [],
            bcc: [],
            subject: "Test",
            body: "Fixture only",
            attachmentIds: [],
          },
          title: "Fixture email",
          hash: "h",
          expiresAt: "2099-01-01T00:00:00Z",
          createdAt: "2026-11-09T00:00:00Z",
        });
      await server.agent.worker.tick();
      const saved = await server.agent.getTask("owner", task.id);
      assert.equal(
        saved.status,
        status === "succeeded" ? "succeeded" : "waiting_input",
        saved.error ?? saved.question,
      );
      if (status === "succeeded") {
        assert.match(saved.result ?? "", /fixture123/);
        assert.match(saved.result ?? "", /not delivery/);
      } else {
        assert.match(saved.question ?? "", /No successful Gmail send receipt/);
        assert.equal(saved.result, undefined);
      }
    } finally {
      await server.agent.stop();
      await db.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
