import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import { Files } from "../apps/server/src/files.ts";
import { RemoteFileStore } from "../apps/server/src/storage.ts";
import { createSamplePdf } from "../packages/integrations/src/pdf.ts";

/** Fake private Supabase bucket: POST stores, GET returns or 400s like the real object API. */
function fakeBucket(objects = new Map<string, Uint8Array>()) {
  const calls: { method: string; url: string; upsert: string | null }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const key = url.split("/storage/v1/object/")[1];
    assert.ok(key, `unexpected URL ${url}`);
    calls.push({
      method,
      url,
      upsert: (init?.headers as Record<string, string> | undefined)?.["x-upsert"] ?? null,
    });
    if (method === "POST") {
      objects.set(key, new Uint8Array(init?.body as ArrayBuffer));
      return new Response("{}", { status: 200 });
    }
    const stored = objects.get(key);
    if (!stored) return new Response('{"error":"not_found"}', { status: 400 });
    return new Response(stored as unknown as BodyInit, { status: 200 });
  };
  return { objects, calls, fetch };
}

async function fixture(remote?: RemoteFileStore) {
  const dataDir = await mkdtemp(join(tmpdir(), "openmuse-files-"));
  const store = await createStore();
  const config = { mode: "sample", dataDir } as unknown as Config;
  const files = new Files(store, config, { sign: () => "sig" } as never, remote);
  return { dataDir, store, files, config };
}

const remote = () =>
  new RemoteFileStore({
    url: "https://project.supabase.co",
    serviceKey: "service-role-key",
    bucket: "openmuse-files",
  });

test("import mirrors PDF bytes into the remote bucket with upsert", async (t) => {
  const bucket = fakeBucket();
  t.mock.method(globalThis, "fetch", bucket.fetch);
  const { files, store, dataDir } = await fixture(remote());
  try {
    const pdf = await createSamplePdf();
    const artifact = await files.import("owner", "report.pdf", pdf, "test");
    const key = `openmuse-files/owner/${artifact.id}.pdf`;
    assert.deepEqual(bucket.objects.get(key), pdf);
    assert.equal(bucket.calls.length, 1);
    assert.equal(bucket.calls[0].method, "POST");
    assert.equal(bucket.calls[0].upsert, "true");
    assert.equal(bucket.calls[0].url, `https://project.supabase.co/storage/v1/object/${key}`);
  } finally {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("bytes restores a wiped local file from the remote mirror", async (t) => {
  const bucket = fakeBucket();
  t.mock.method(globalThis, "fetch", bucket.fetch);
  const { files, store, dataDir } = await fixture(remote());
  try {
    const pdf = await createSamplePdf();
    const artifact = await files.import("owner", "report.pdf", pdf, "test");
    // Simulate the host wiping DATA_DIR between restarts.
    await rm(join(dataDir, "files"), { recursive: true, force: true });
    const restored = await files.bytes("owner", artifact.id);
    assert.deepEqual(new Uint8Array(restored), pdf);
    // The local cache is repopulated, so a second read needs no network.
    await stat(join(dataDir, "files", `${artifact.id}.pdf`));
    const getCalls = bucket.calls.filter((call) => call.method === "GET").length;
    await files.bytes("owner", artifact.id);
    assert.equal(bucket.calls.filter((call) => call.method === "GET").length, getCalls);
  } finally {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("a failed mirror upload warns but never rejects the import", async (t) => {
  t.mock.method(globalThis, "fetch", () => new Response("boom", { status: 500 }));
  const logged = t.mock.method(console, "error", () => {});
  const { files, store, dataDir } = await fixture(remote());
  try {
    const pdf = await createSamplePdf();
    const artifact = await files.import("owner", "report.pdf", pdf, "test");
    assert.equal(artifact.name, "report.pdf");
    assert.equal(logged.mock.callCount(), 1);
    // Local copy still works.
    assert.deepEqual(new Uint8Array(await files.bytes("owner", artifact.id)), pdf);
  } finally {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("without a remote store no network calls happen and bytes stay local-only", async (t) => {
  const fetched = t.mock.method(globalThis, "fetch", () => {
    throw new Error("network must not be touched");
  });
  const { files, store, dataDir } = await fixture();
  try {
    const pdf = await createSamplePdf();
    const artifact = await files.import("owner", "report.pdf", pdf, "test");
    assert.deepEqual(new Uint8Array(await files.bytes("owner", artifact.id)), pdf);
    // Local loss with no mirror is an error, mirroring the pre-change behavior.
    await rm(join(dataDir, "files"), { recursive: true, force: true });
    await assert.rejects(files.bytes("owner", artifact.id), { code: "ENOENT" });
    assert.equal(fetched.mock.callCount(), 0);
  } finally {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("a missing remote object surfaces as File not found", async (t) => {
  const bucket = fakeBucket();
  t.mock.method(globalThis, "fetch", bucket.fetch);
  const { files, store, dataDir } = await fixture(remote());
  try {
    const pdf = await createSamplePdf();
    const artifact = await files.import("owner", "report.pdf", pdf, "test");
    bucket.objects.clear();
    await rm(join(dataDir, "files"), { recursive: true, force: true });
    await assert.rejects(files.bytes("owner", artifact.id), { message: /File not found/ });
  } finally {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
