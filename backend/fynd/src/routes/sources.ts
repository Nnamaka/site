import { zValidator } from "@hono/zod-validator";
import { sourcePatchSchema, type SourceConfig, type SourceDto } from "@nnamaka/fynd-shared";
import type { Prisma, Source } from "@prisma/client";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { loadCampaignCtx, runSource } from "../agent/runner";
import { db } from "../db";
import { startOfMonthUTC } from "../lib/util";
import type { AppEnv } from "../middleware";
import { getActiveCampaign } from "../services/campaign";

const toDto = (s: Source, found: number): SourceDto => ({
  id: s.id,
  kind: s.kind,
  name: s.name,
  enabled: s.enabled,
  health: s.health,
  lastError: s.lastError,
  lastRunAt: s.lastRunAt?.toISOString() ?? null,
  foundThisMonth: found,
  config: (s.config ?? {}) as SourceConfig,
});

async function foundCounts(userId: string) {
  const rows = await db.job.groupBy({ by: ["sourceId"], where: { userId, foundAt: { gte: startOfMonthUTC() } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.sourceId, r._count._all]));
}

async function ownSource(userId: string, id: string) {
  const s = await db.source.findFirst({ where: { id, userId } });
  if (!s) throw new HTTPException(404, { message: "Source not found" });
  return s;
}

export const sources = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    const [list, counts] = await Promise.all([db.source.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }), foundCounts(user.id)]);
    return c.json(list.map((s) => toDto(s, counts.get(s.id) ?? 0)));
  })

  .patch("/:id", zValidator("json", sourcePatchSchema), async (c) => {
    const user = c.get("user");
    const s = await ownSource(user.id, c.req.param("id"));
    const { enabled, config } = c.req.valid("json");
    const updated = await db.source.update({
      where: { id: s.id },
      data: { enabled, ...(config ? { config: config as Prisma.InputJsonValue, health: "HEALTHY" as const, lastError: null } : {}) },
    });
    return c.json(toDto(updated, (await foundCounts(user.id)).get(s.id) ?? 0));
  })

  /** Run this source now for the active campaign. */
  .post("/:id/retry", async (c) => {
    const user = c.get("user");
    const s = await ownSource(user.id, c.req.param("id"));
    const active = await getActiveCampaign(user.id);
    const ctx = await loadCampaignCtx(active.id);
    if (!ctx.roles.length) throw new HTTPException(409, { message: "Add a role to your campaign first." });
    const created = await runSource(ctx, s);
    const fresh = await db.source.findUniqueOrThrow({ where: { id: s.id } });
    return c.json({ source: toDto(fresh, (await foundCounts(user.id)).get(s.id) ?? 0), created });
  });
