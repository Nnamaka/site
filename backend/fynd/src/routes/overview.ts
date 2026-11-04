import { zValidator } from "@hono/zod-validator";
import { overviewQuerySchema, type DailyPoint, type OverviewDto } from "@nnamaka/fynd-shared";
import { Hono } from "hono";
import { db } from "../db";
import { addDays, daysInMonthUTC, isoDay, startOfDayUTC, startOfMonthUTC } from "../lib/util";
import type { AppEnv } from "../middleware";
import { APPLIED_STATUSES, getActiveCampaign } from "../services/campaign";
import { buildFunnel } from "../services/funnel";

export const overview = new Hono<AppEnv>().get("/", zValidator("query", overviewQuerySchema), async (c) => {
  const user = c.get("user");
  const { range } = c.req.valid("query");
  const now = new Date();
  const monthStart = startOfMonthUTC(now);
  const dailySince = range === "7d" ? addDays(startOfDayUTC(now), -6) : monthStart;
  const campaign = await getActiveCampaign(user.id);

  const [roles, grouped, awaiting, awaitingToday, failingSources, dailyRows] = await Promise.all([
    db.role.findMany({ where: { campaignId: campaign.id }, orderBy: { position: "asc" } }),
    db.job.groupBy({ by: ["roleId", "status", "outcome"], where: { campaignId: campaign.id, foundAt: { gte: monthStart } }, _count: { _all: true } }),
    db.job.count({ where: { userId: user.id, status: "AWAITING" } }),
    db.job.count({ where: { userId: user.id, status: "AWAITING", foundAt: { gte: startOfDayUTC(now) } } }),
    db.source.findMany({ where: { userId: user.id, enabled: true, health: { not: "HEALTHY" } }, select: { id: true, name: true, health: true, lastError: true } }),
    db.$queryRaw<{ day: Date; roleId: string | null; n: number }[]>`
      SELECT date_trunc('day', "foundAt" AT TIME ZONE 'UTC') AS day, "roleId", COUNT(*)::int AS n
      FROM "Job"
      WHERE "campaignId" = ${campaign.id} AND "foundAt" >= ${dailySince}
      GROUP BY 1, 2 ORDER BY 1`,
  ]);

  const roleStats = roles.map((r) => {
    const mine = grouped.filter((g) => g.roleId === r.id);
    const found = mine.reduce((a, g) => a + g._count._all, 0);
    const applied = mine.filter((g) => APPLIED_STATUSES.includes(g.status)).reduce((a, g) => a + g._count._all, 0);
    return { id: r.id, title: r.title, found, applied, target: r.monthlyTarget, pct: r.monthlyTarget ? Math.min(100, Math.round((found / r.monthlyTarget) * 100)) : 0 };
  });

  const daily: DailyPoint[] = [];
  for (let d = dailySince; d <= now; d = addDays(d, 1)) daily.push({ date: isoDay(d), counts: Object.fromEntries(roles.map((r) => [r.id, 0])) });
  const index = new Map(daily.map((p, i) => [p.date, i]));
  for (const row of dailyRows) {
    const i = index.get(isoDay(new Date(row.day)));
    if (i !== undefined && row.roleId) daily[i].counts[row.roleId] = (daily[i].counts[row.roleId] ?? 0) + row.n;
  }

  const body: OverviewDto = {
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status, dayOfMonth: now.getUTCDate(), daysInMonth: daysInMonthUTC(now) },
    roles: roleStats,
    awaiting,
    awaitingToday,
    funnel: buildFunnel(grouped),
    daily,
    failingSources,
  };
  return c.json(body);
});
