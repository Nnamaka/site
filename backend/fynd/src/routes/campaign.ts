import { zValidator } from "@hono/zod-validator";
import { campaignPatchSchema, keywordSchema, MAX_ROLES, rolePatchSchema, titleSchema } from "@nnamaka/fynd-shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import type { AppEnv } from "../middleware";
import { getActiveCampaign } from "../services/campaign";
import { campaignDto } from "../services/dto";
import { suggestTitles } from "../services/suggest";

async function ownRole(userId: string, roleId: string) {
  const role = await db.role.findFirst({ where: { id: roleId, campaign: { userId } }, include: { variants: true } });
  if (!role) throw new HTTPException(404, { message: "Role not found" });
  return role;
}

const ignoreDuplicate = (e: unknown) => {
  if ((e as { code?: string }).code === "P2002") return;
  throw e;
};

export const campaign = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await campaignDto(c.get("user").id)))

  .patch("/", zValidator("json", campaignPatchSchema), async (c) => {
    const user = c.get("user");
    const active = await getActiveCampaign(user.id);
    await db.campaign.update({ where: { id: active.id }, data: c.req.valid("json") });
    return c.json(await campaignDto(user.id));
  })

  /* roles */
  .post("/roles", zValidator("json", titleSchema), async (c) => {
    const user = c.get("user");
    const { title } = c.req.valid("json");
    const active = await getActiveCampaign(user.id);
    const count = await db.role.count({ where: { campaignId: active.id } });
    if (count >= MAX_ROLES) throw new HTTPException(409, { message: `A campaign can have up to ${MAX_ROLES} roles.` });
    await db.role.create({
      data: {
        campaignId: active.id,
        title,
        position: count,
        suggestions: { create: suggestTitles(title).map((t) => ({ title: t })) },
      },
    });
    return c.json(await campaignDto(user.id), 201);
  })

  .patch("/roles/:id", zValidator("json", rolePatchSchema), async (c) => {
    const user = c.get("user");
    const role = await ownRole(user.id, c.req.param("id"));
    await db.role.update({ where: { id: role.id }, data: c.req.valid("json") });
    return c.json(await campaignDto(user.id));
  })

  .delete("/roles/:id", async (c) => {
    const user = c.get("user");
    const role = await ownRole(user.id, c.req.param("id"));
    if ((await db.role.count({ where: { campaignId: role.campaignId } })) <= 1) {
      throw new HTTPException(409, { message: "A campaign needs at least one role." });
    }
    await db.role.delete({ where: { id: role.id } });
    return c.json(await campaignDto(user.id));
  })

  /* similar titles */
  .post("/roles/:id/variants", zValidator("json", titleSchema), async (c) => {
    const user = c.get("user");
    const role = await ownRole(user.id, c.req.param("id"));
    const { title } = c.req.valid("json");
    await db.roleVariant.create({ data: { roleId: role.id, title } }).catch(ignoreDuplicate);
    await db.roleSuggestion.deleteMany({ where: { roleId: role.id, title } });
    return c.json(await campaignDto(user.id));
  })

  .delete("/roles/:id/variants/:variantId", async (c) => {
    const user = c.get("user");
    const role = await ownRole(user.id, c.req.param("id"));
    await db.roleVariant.deleteMany({ where: { id: c.req.param("variantId"), roleId: role.id } });
    return c.json(await campaignDto(user.id));
  })

  .post("/roles/:id/suggestions/accept-all", async (c) => {
    const user = c.get("user");
    const role = await ownRole(user.id, c.req.param("id"));
    const suggestions = await db.roleSuggestion.findMany({ where: { roleId: role.id } });
    await db.$transaction([
      db.roleVariant.createMany({ data: suggestions.map((s) => ({ roleId: role.id, title: s.title })), skipDuplicates: true }),
      db.roleSuggestion.deleteMany({ where: { roleId: role.id } }),
    ]);
    return c.json(await campaignDto(user.id));
  })

  .post("/roles/:id/suggestions/:suggestionId/accept", async (c) => {
    const user = c.get("user");
    const role = await ownRole(user.id, c.req.param("id"));
    const s = await db.roleSuggestion.findFirst({ where: { id: c.req.param("suggestionId"), roleId: role.id } });
    if (s) {
      await db.$transaction([
        db.roleVariant.createMany({ data: [{ roleId: role.id, title: s.title }], skipDuplicates: true }),
        db.roleSuggestion.delete({ where: { id: s.id } }),
      ]);
    }
    return c.json(await campaignDto(user.id));
  })

  .delete("/roles/:id/suggestions/:suggestionId", async (c) => {
    const user = c.get("user");
    const role = await ownRole(user.id, c.req.param("id"));
    await db.roleSuggestion.deleteMany({ where: { id: c.req.param("suggestionId"), roleId: role.id } });
    return c.json(await campaignDto(user.id));
  })

  /* keywords */
  .post("/keywords", zValidator("json", keywordSchema), async (c) => {
    const user = c.get("user");
    const active = await getActiveCampaign(user.id);
    await db.keyword.create({ data: { campaignId: active.id, value: c.req.valid("json").value } }).catch(ignoreDuplicate);
    return c.json(await campaignDto(user.id));
  })

  .delete("/keywords/:id", async (c) => {
    const user = c.get("user");
    await db.keyword.deleteMany({ where: { id: c.req.param("id"), campaign: { userId: user.id } } });
    return c.json(await campaignDto(user.id));
  });
