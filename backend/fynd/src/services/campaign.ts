import { DEFAULT_FLOW } from "@nnamaka/fynd-shared";
import type { JobStatus, Prisma } from "@prisma/client";
import { db } from "../db";

export const APPLIED_STATUSES: JobStatus[] = ["APPLIED", "APPLIED_MANUALLY"];

export function seasonName(d = new Date()) {
  const m = d.getUTCMonth();
  const season = m === 11 || m < 2 ? "Winter" : m < 5 ? "Spring" : m < 8 ? "Summer" : "Autumn";
  return `${season} search`;
}

export const defaultFlowData = () => ({
  nodes: DEFAULT_FLOW.nodes as unknown as Prisma.InputJsonValue,
  edges: DEFAULT_FLOW.edges as unknown as Prisma.InputJsonValue,
});

/** The user's current campaign (running or paused). Creates one on first use. */
export async function getActiveCampaign(userId: string) {
  const existing = await db.campaign.findFirst({
    where: { userId, status: { not: "ENDED" } },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;
  return db.campaign.create({ data: { userId, name: seasonName(), flow: { create: defaultFlowData() } } });
}
