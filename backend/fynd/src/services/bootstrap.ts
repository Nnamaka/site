import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { getActiveCampaign } from "./campaign";

export const DEFAULT_SOURCES = [
  { kind: "REMOTEOK", name: "Remote OK", enabled: true, config: {} },
  { kind: "GREENHOUSE", name: "Greenhouse", enabled: false, config: { boards: [] } },
  { kind: "LEVER", name: "Lever", enabled: false, config: { boards: [] } },
  { kind: "ASHBY", name: "Ashby", enabled: false, config: { boards: [] } },
  { kind: "CAREER_PAGE", name: "Career pages", enabled: false, config: { urls: [] } },
] satisfies Omit<Prisma.SourceCreateManyInput, "userId">[];

/** Runs once after a user registers: settings, default sources, first campaign. */
export async function bootstrapUser(userId: string) {
  await db.notificationSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  if ((await db.source.count({ where: { userId } })) === 0) {
    await db.source.createMany({ data: DEFAULT_SOURCES.map((s) => ({ ...s, userId })) });
  }
  await getActiveCampaign(userId);
}
