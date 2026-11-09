import assert from "node:assert/strict";
import { test } from "node:test";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { from, lastValueFrom, toArray } from "rxjs";
import type { ActionProposal } from "../packages/domain/src/index.ts";
import {
  emailSendClaim,
  emailSendTask,
  gmailReceipts,
  guardEmailClaims,
} from "../apps/server/src/engine/email-receipts.ts";
const action = (patch = {}) =>
  ({
    title: "Send email",
    hash: "hash",
    expiresAt: "2026-11-10T12:00:00Z",
    id: "a",
    taskId: "task-a",
    kind: "email.send",
    status: "succeeded",
    result: "Gmail sent message · real123",
    data: {
      to: ["friend@example.org"],
      cc: [],
      bcc: [],
      subject: "Test",
      body: "Body",
      attachmentIds: [],
    },
    createdAt: "2026-11-09T12:00:00Z",
    ...patch,
  }) as ActionProposal;
const chunk = (delta: string) =>
  ({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m", role: "assistant", delta }) as BaseEvent;
const input = (text: string) => [
  { type: EventType.RUN_STARTED, runId: "r", threadId: "t" } as BaseEvent,
  chunk(text.slice(0, 12)),
  chunk(text.slice(12)),
  { type: EventType.RUN_FINISHED, runId: "r", threadId: "t" } as BaseEvent,
];
const run = async (text: string, actions: ActionProposal[]) =>
  lastValueFrom(guardEmailClaims(from(input(text)), async () => actions).pipe(toArray()));
const body = (events: BaseEvent[]) =>
  events.map((e) => (e as { delta?: string }).delta ?? "").join("");
test("only Gmail success receipts for this task qualify", () => {
  assert.equal(
    gmailReceipts(
      [
        action(),
        action({ status: "awaiting_review" }),
        action({ result: "model says sent" }),
        action({ kind: "calendar.create" }),
      ],
      "task-a",
    ).length,
    1,
  );
  assert.equal(gmailReceipts([action()], "other-task").length, 0);
});
test("blocks fabricated split streaming claim, keeps event order", async () => {
  const events = await run("I have sent the email to friend@example.org.", []);
  assert.match(body(events), /cannot confirm/);
  assert.doesNotMatch(body(events), /I have sent/);
  assert.equal(events[0].type, EventType.RUN_STARTED);
  assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED);
});
test("pending, failed and unrelated receipts cannot substantiate claim", async () => {
  const events = await run("Email successfully sent to stranger@example.org.", [
    action(),
    action({ status: "failed" }),
  ]);
  assert.match(body(events), /cannot confirm/);
});
test("a matching receipt emits deterministic ID and delivery caveat", async () => {
  const text = body(await run("Email sent to friend@example.org.", [action()]));
  assert.match(text, /real123/);
  assert.match(text, /may be earlier/);
  assert.match(text, /not delivery/);
});
test("ordinary draft text and unrelated conversation pass unchanged", async () => {
  for (const text of ["Here is a draft email for your review.", "The weather is clear."])
    assert.equal(body(await run(text, [])), text);
});
test("receipt read failure fails closed", async () => {
  const e = await lastValueFrom(
    guardEmailClaims(from(input("I sent the email.")), async () => {
      throw Error("offline");
    }).pipe(toArray()),
  );
  assert.match(body(e), /cannot confirm/);
});
test("send-task and common multilingual claim classification", () => {
  assert.ok(emailSendTask("Send introduction email to friend@example.org"));
  assert.ok(emailSendClaim("Email bhej diya"));
  assert.ok(emailSendClaim("The email has been sent."));
  assert.equal(emailSendClaim("I have not sent"), false);
});
