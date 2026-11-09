import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { DotPage, DotSpace } from "../../../packages/domain/src/dots.ts";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";

// OpenDots-inspired workspace slice. Uses Muse's existing owner/schema-scoped
// records, not a second SQLite store or a new conversation/model backend.
export function dotsRoutes(db: Store) {
  const app = new Hono<{ Variables: { owner: string } }>();
  const space = async (owner: string, id: string) => {
    const row = await db.get<DotSpace>(owner, "dot-spaces", id);
    if (!row) throw new AppError("Space not found", 404);
    return row;
  };
  app.get("/", async (c) =>
    c.json({ spaces: await db.list<DotSpace>(c.get("owner"), "dot-spaces") }),
  );
  app.post("/spaces", async (c) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(80) })
      .strict()
      .parse(await c.req.json());
    const row: DotSpace = {
      id: randomUUID(),
      name: body.name,
      createdAt: new Date().toISOString(),
    };
    await db.put(c.get("owner"), "dot-spaces", row);
    return c.json(row, 201);
  });
  app.get("/spaces/:id/pages", async (c) => {
    const owner = c.get("owner"),
      id = c.req.param("id");
    await space(owner, id);
    const pages = (await db.list<DotPage>(owner, "dot-pages"))
      .filter((p) => p.spaceId === id)
      .map(({ content, ...summary }) => summary);
    return c.json({ pages });
  });
  app.post("/spaces/:id/pages", async (c) => {
    const owner = c.get("owner"),
      spaceId = c.req.param("id");
    await space(owner, spaceId);
    const body = z
      .object({
        title: z.string().trim().min(1).max(160),
        content: z.string().max(60000).default(""),
      })
      .strict()
      .parse(await c.req.json());
    const now = new Date().toISOString();
    const row: DotPage = {
      id: randomUUID(),
      spaceId,
      ...body,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.put(owner, "dot-pages", row);
    return c.json(row, 201);
  });
  app.get("/pages/:id", async (c) => {
    const row = await db.get<DotPage>(c.get("owner"), "dot-pages", c.req.param("id"));
    if (!row) throw new AppError("Page not found", 404);
    return c.json(row);
  });
  app.put("/pages/:id", async (c) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(160),
        content: z.string().max(60000),
        revision: z.number().int().positive(),
      })
      .strict()
      .parse(await c.req.json());
    const owner = c.get("owner"),
      id = c.req.param("id");
    if (!(await db.get<DotPage>(owner, "dot-pages", id))) throw new AppError("Page not found", 404);
    const row = await db.compareAndSwap<DotPage>(
      owner,
      "dot-pages",
      id,
      { revision: body.revision },
      {
        title: body.title,
        content: body.content,
        revision: body.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    );
    if (!row)
      throw new AppError(
        "This page changed elsewhere. Your draft is kept here. Copy it before reopening the saved page.",
        409,
      );
    return c.json(row);
  });
  return app;
}
