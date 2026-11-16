import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import { Auth } from "../apps/server/src/auth.ts";
import { type Config, isPublicAuthKey } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import { loginOwner } from "../apps/server/src/login.ts";

const boss = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const config: Config = {
  mode: "live",
  port: 8787,
  host: "127.0.0.1",
  publicUrl: "http://localhost:8787",
  dataDir: "/tmp/fixture",
  agentBackend: "model",
  allowedOrigins: [],
  googleRedirectUri: "http://localhost:8787/api/google/callback",
  intelligenceApiKey: "test-project-key-never-sent",
  authProvider: "supabase",
  authOwnerId: boss,
  storageUrl: "https://fixture.invalid",
  authPublishableKey: "public-fixture-key",
  authPublicLogin: true,
};
function mockIssuer(t: TestContext) {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    requests.push(url);
    assert.equal(new Headers(init?.headers).get("apikey"), "public-fixture-key");
    const token = new Headers(init?.headers).get("authorization")?.slice(7);
    if (url.endsWith("logout?scope=local")) return new Response(null, { status: 204 });
    if (token === "down") throw new Error("issuer down");
    if (!["boss", "other", "unverified"].includes(token ?? ""))
      return Response.json({}, { status: 401 });
    return Response.json({
      id: token === "boss" ? boss : other,
      email_confirmed_at: token === "unverified" ? null : "2026-11-12T00:00:00Z",
      user_metadata: { owner: "local-user" },
    });
  });
  return requests;
}

test("verified UUID maps Boss only, other users stay separate and metadata cannot claim ownership", async (t) => {
  mockIssuer(t);
  assert.equal(await loginOwner(config, "boss"), "local-user");
  assert.equal(await loginOwner(config, "other"), `user:${other}`);
  await assert.rejects(loginOwner(config, "unverified"), /Verify your email/);
  await assert.rejects(loginOwner(config, "fake"), /Session expired/);
  await assert.rejects(loginOwner(config, "down"), /unavailable/);
  await assert.rejects(loginOwner({ ...config, authPublicLogin: false }, "other"), /not invited/);
  await assert.rejects(loginOwner({ ...config, authOwnerId: undefined }, "boss"), /not configured/);
});
test("supabase mode rejects the old shared key and all old local sessions; logout reaches issuer", async (t) => {
  const requests = mockIssuer(t);
  const db = await createStore();
  t.after(() => db.close());
  const auth = new Auth(db, config, "test-signing-key");
  await db.put("system", "sessions", {
    id: createHash("sha256").update("old").digest("hex"),
    owner: "local-user",
    expiresAt: Date.now() + 60000,
  });
  await assert.rejects(auth.session("shared-secret"), /Sign in/);
  await assert.rejects(auth.owner("Bearer old"), /expired/);
  const session = await auth.session(undefined, "other");
  assert.equal(await auth.owner(`Bearer ${session.token}`), `user:${other}`);
  await auth.revoke("Bearer other");
  await assert.rejects(auth.owner("Bearer other"), /expired/);
  assert.ok(requests.some((url) => url.endsWith("logout?scope=local")));
});
test("API accounts see only their own stored data and bootstrap never returns the service key", async (t) => {
  mockIssuer(t);
  const dataDir = await mkdtemp(join(tmpdir(), "spark-login-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const db = await createStore();
  t.after(() => db.close());
  const { app } = await createApp(db, { ...config, dataDir, taskWorkerEnabled: false });
  const boot = await (await app.request("/api/auth/config")).json();
  assert.deepEqual(boot, {
    provider: "supabase",
    url: config.storageUrl,
    publishableKey: config.authPublishableKey,
  });
  await db.put("local-user", "activity", { id: "boss-private", title: "Boss private data" });
  await db.put(`user:${other}`, "activity", { id: "other-private", title: "Other private data" });
  for (const [token, included, excluded] of [
    ["boss", "Boss private data", "Other private data"],
    ["other", "Other private data", "Boss private data"],
  ]) {
    const session = await app.request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supabaseToken: token }),
    });
    assert.equal(session.status, 200);
    const response = await app.request("/api/workspace", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(included), body);
    assert.ok(!body.includes(excluded));
  }
  assert.equal((await app.request("/api/workspace")).status, 401);
  await db.put("local-user", "memories", { id: "private-memory", text: "Boss-only memory" });
  const otherAgent = await app.request("/api/agent", {
    headers: { Authorization: "Bearer other" },
  });
  assert.ok(!(await otherAgent.text()).includes("Boss-only memory"));
  const foreignTask = await app.request("/api/agent/tasks/boss-private-task", {
    headers: { Authorization: "Bearer other" },
  });
  assert.equal(foreignTask.status, 404);
  const foreignFile = await app.request("/api/files/boss-private-file/content", {
    headers: { Authorization: "Bearer other" },
  });
  assert.equal(foreignFile.status, 404);
});

test("public auth bootstrap config rejects secret and service-role credentials", () => {
  const jwt = (role: string) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.equal(isPublicAuthKey("sb_publishable_fixture"), true);
  assert.equal(isPublicAuthKey(jwt("anon")), true);
  assert.equal(isPublicAuthKey("sb_secret_fixture"), false);
  assert.equal(isPublicAuthKey(jwt("service_role")), false);
});
