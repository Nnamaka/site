import { zValidator } from "@hono/zod-validator";
import { notificationsPatchSchema, type NotificationsDto } from "@nnamaka/fynd-shared";
import { Hono } from "hono";
import { db } from "../db";
import { env } from "../env";
import type { AppEnv } from "../middleware";
import { telegramConfigured } from "../services/telegram";

async function notificationsDto(userId: string): Promise<NotificationsDto> {
  const [prefs, link] = await Promise.all([
    db.notificationSettings.upsert({ where: { userId }, update: {}, create: { userId } }),
    db.telegramLink.findUnique({ where: { userId } }),
  ]);
  return {
    telegramEnabled: prefs.telegramEnabled,
    telegramShowStats: prefs.telegramShowStats,
    emailEnabled: prefs.emailEnabled,
    telegram: {
      configured: telegramConfigured(),
      linked: Boolean(link),
      username: link?.username ?? null,
      linkedAt: link?.linkedAt.toISOString() ?? null,
      botUsername: env.TELEGRAM_BOT_USERNAME,
    },
  };
}

export const settings = new Hono<AppEnv>()
  .get("/notifications", async (c) => c.json(await notificationsDto(c.get("user").id)))
  .patch("/notifications", zValidator("json", notificationsPatchSchema), async (c) => {
    const user = c.get("user");
    await db.notificationSettings.upsert({ where: { userId: user.id }, update: c.req.valid("json"), create: { userId: user.id, ...c.req.valid("json") } });
    return c.json(await notificationsDto(user.id));
  })
  .delete("/telegram", async (c) => {
    const user = c.get("user");
    await db.telegramLink.deleteMany({ where: { userId: user.id } });
    return c.json(await notificationsDto(user.id));
  });
