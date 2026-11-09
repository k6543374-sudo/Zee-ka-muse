import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { z } from "zod";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { dotsRoutes } from "../apps/server/src/dots-routes.ts";
import { AppError } from "../apps/server/src/errors.ts";
import type { DotPage, DotSpace } from "../packages/domain/src/dots.ts";

let db: Store;
const app = new Hono<{ Variables: { owner: string } }>();
app.use("*", async (c, next) => {
  if (!c.req.header("authorization")) return c.json({ error: "Unauthorized" }, 401);
  c.set("owner", c.req.header("authorization") || "");
  await next();
});
app.onError((e, c) =>
  c.json(
    { error: e.message },
    e instanceof AppError ? e.status : e instanceof z.ZodError ? 422 : 500,
  ),
);
before(async () => {
  db = await createStore();
  app.route("/api/dots", dotsRoutes(db));
});
after(async () => {
  await db.close();
});
const req = (
  path: string,
  body?: unknown,
  owner = "owner-a",
  method = body === undefined ? "GET" : "POST",
) =>
  app.request(`/api/dots${path}`, {
    method,
    headers: { authorization: owner, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
let space: DotSpace, page: DotPage;
test("Spaces and pages require authentication", async () => {
  assert.equal((await app.request("/api/dots")).status, 401);
});
test("creates a Space and editable Page without model or service calls", async () => {
  const s = await req("/spaces", { name: "My study notes" });
  assert.equal(s.status, 201);
  space = await s.json();
  const p = await req(`/spaces/${space.id}/pages`, { title: "Plan", content: "# Plan\n- Read" });
  assert.equal(p.status, 201);
  page = await p.json();
  assert.equal(page.revision, 1);
  const list = await (await req(`/spaces/${space.id}/pages`)).json();
  assert.equal(list.pages.length, 1);
  assert.equal(list.pages[0].content, undefined);
  const read = await (await req(`/pages/${page.id}`)).json();
  assert.equal(read.content, "# Plan\n- Read");
});
test("foreign owners cannot list, read, edit or create pages in another Space", async () => {
  assert.deepEqual(await (await req("", undefined, "owner-b")).json(), { spaces: [] });
  assert.equal((await req(`/spaces/${space.id}/pages`, undefined, "owner-b")).status, 404);
  assert.equal(
    (await req(`/spaces/${space.id}/pages`, { title: "Intrude" }, "owner-b")).status,
    404,
  );
  assert.equal((await req(`/pages/${page.id}`, undefined, "owner-b")).status, 404);
  assert.equal(
    (
      await req(
        `/pages/${page.id}`,
        { title: "Intrude", content: "", revision: 1 },
        "owner-b",
        "PUT",
      )
    ).status,
    404,
  );
});
test("revision guard rejects stale and simultaneous edits without overwriting", async () => {
  const save = await req(
    `/pages/${page.id}`,
    { title: "Updated", content: "Saved body", revision: 1 },
    "owner-a",
    "PUT",
  );
  assert.equal(save.status, 200);
  assert.equal((await save.json()).revision, 2);
  const stale = await req(
    `/pages/${page.id}`,
    { title: "Stale", content: "Lost", revision: 1 },
    "owner-a",
    "PUT",
  );
  assert.equal(stale.status, 409);
  const results = await Promise.all(
    ["A", "B"].map((title) =>
      req(`/pages/${page.id}`, { title, content: title, revision: 2 }, "owner-a", "PUT"),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await (await req(`/pages/${page.id}`)).json()).revision, 3);
});
test("rejects empty names, oversized pages and caller-supplied ownership", async () => {
  assert.equal((await req("/spaces", { name: " " })).status, 422);
  assert.equal((await req("/spaces", { name: "x", owner: "owner-b" })).status, 422);
  assert.equal(
    (await req(`/spaces/${space.id}/pages`, { title: "Long", content: "x".repeat(60001) })).status,
    422,
  );
  assert.equal((await req(`/spaces/${space.id}/pages`, { title: " ", content: "" })).status, 422);
});
