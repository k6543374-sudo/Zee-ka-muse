import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkerServer } from "../src/server.ts";

test("public GET and HEAD health work while session routes stay authenticated", async () => {
  const worker = await createWorkerServer(
    { token: "test-token-".repeat(5), dataDir: "/tmp/unused-health" },
    (async () => ({ close: async () => {} })) as never,
  );
  try {
    await new Promise<void>((resolve) => worker.server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(worker.server.address() as { port: number }).port}`;
    const get = await fetch(`${url}/health`);
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), { status: "ok" });
    const head = await fetch(`${url}/health`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    for (const path of ["/sessions", "/health/private", "/sessions/private/read"]) {
      assert.equal((await fetch(`${url}${path}`, { method: "HEAD" })).status, 401);
    }
    assert.equal((await fetch(`${url}/health`, { method: "POST" })).status, 401);
  } finally {
    await worker.close();
  }
});
