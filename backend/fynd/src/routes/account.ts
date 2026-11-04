import type { AccountDto } from "@nnamaka/fynd-shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { atsScore } from "../agent/match";
import { db } from "../db";
import { env } from "../env";
import { errMsg } from "../lib/util";
import type { AppEnv } from "../middleware";
import { getActiveCampaign } from "../services/campaign";

const MAX_BYTES = 5 * 1024 * 1024;

async function extractText(file: File, bytes: Uint8Array): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { extractText: pdfText } = await import("unpdf");
    const { text } = await pdfText(bytes, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (file.type.startsWith("text/") || /\.(md|txt)$/i.test(file.name)) return new TextDecoder().decode(bytes);
  return "";
}

async function accountDto(userId: string): Promise<AccountDto> {
  const [user, accountsUsed, cv] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.user.count(),
    db.baseCv.findUnique({ where: { userId }, select: { fileName: true, size: true, uploadedAt: true, atsBaseline: true, text: true } }),
  ]);
  return {
    email: user.email,
    name: user.name,
    accountsUsed,
    maxAccounts: env.MAX_ACCOUNTS,
    cv: cv ? { fileName: cv.fileName, size: cv.size, uploadedAt: cv.uploadedAt.toISOString(), atsBaseline: cv.atsBaseline, hasText: cv.text.length > 0 } : null,
  };
}

export const account = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await accountDto(c.get("user").id)))

  .put("/cv", async (c) => {
    const user = c.get("user");
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new HTTPException(400, { message: "Attach a file named 'file'." });
    if (file.size > MAX_BYTES) throw new HTTPException(413, { message: "CV must be under 5 MB." });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "";
    try {
      text = await extractText(file, bytes);
    } catch (e) {
      console.warn("[cv] text extraction failed:", errMsg(e));
    }
    const campaign = await getActiveCampaign(user.id);
    const keywords = (await db.keyword.findMany({ where: { campaignId: campaign.id } })).map((k) => k.value);
    const atsBaseline = text ? atsScore(text, keywords, "", "").breakdown.keywordCoverage : null;
    const data = { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data: Buffer.from(bytes), text, atsBaseline };
    await db.baseCv.upsert({ where: { userId: user.id }, update: { ...data, uploadedAt: new Date() }, create: { userId: user.id, ...data } });
    return c.json(await accountDto(user.id));
  })

  .patch("/", async (c) => {
    const user = c.get("user");
    const { name } = (await c.req.json()) as { name?: string };
    if (typeof name === "string" && name.trim()) await db.user.update({ where: { id: user.id }, data: { name: name.trim().slice(0, 80) } });
    return c.json(await accountDto(user.id));
  });
