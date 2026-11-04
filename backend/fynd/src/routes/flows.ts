import { zValidator } from "@hono/zod-validator";
import { flowSchema, type FlowDto, type FlowEdge, type FlowNode } from "@nnamaka/fynd-shared";
import type { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { db } from "../db";
import type { AppEnv } from "../middleware";
import { defaultFlowData, getActiveCampaign } from "../services/campaign";

async function flowFor(userId: string) {
  const campaign = await getActiveCampaign(userId);
  return db.flow.upsert({ where: { campaignId: campaign.id }, update: {}, create: { campaignId: campaign.id, ...defaultFlowData() } });
}

const toDto = (f: { nodes: unknown; edges: unknown; updatedAt: Date }): FlowDto => ({
  nodes: f.nodes as FlowNode[],
  edges: f.edges as FlowEdge[],
  updatedAt: f.updatedAt.toISOString(),
});

export const flows = new Hono<AppEnv>()
  .get("/", async (c) => c.json(toDto(await flowFor(c.get("user").id))))
  .put("/", zValidator("json", flowSchema), async (c) => {
    const flow = await flowFor(c.get("user").id);
    const { nodes, edges } = c.req.valid("json");
    const ids = new Set(nodes.map((n) => n.id));
    const saved = await db.flow.update({
      where: { id: flow.id },
      data: {
        nodes: nodes as unknown as Prisma.InputJsonValue,
        edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) as unknown as Prisma.InputJsonValue,
      },
    });
    return c.json(toDto(saved));
  });
