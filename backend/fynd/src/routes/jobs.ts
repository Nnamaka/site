import { zValidator } from "@hono/zod-validator";
import { JOB_TABS, jobsQuerySchema, OUTCOME_LABEL, outcomeSchema, type JobsPageDto, type JobTab } from "@nnamaka/fynd-shared";
import type { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prepareJob, startApply } from "../agent/runner";
import { db } from "../db";
import type { AppEnv } from "../middleware";
import { jobDetail, rowInclude, toRow } from "../services/dto";

const tabWhere: Record<JobTab, Prisma.JobWhereInput> = {
  all: {},
  awaiting: { status: "AWAITING" },
  applied: { status: { in: ["APPLIED", "APPLIED_MANUALLY"] } },
  issues: { issueKind: { not: null } },
};

async function ownJob(userId: string, id: string) {
  const job = await db.job.findFirst({ where: { id, userId }, include: { source: true } });
  if (!job) throw new HTTPException(404, { message: "Job not found" });
  return job;
}

async function detailOr404(userId: string, id: string) {
  const d = await jobDetail(userId, id);
  if (!d) throw new HTTPException(404, { message: "Job not found" });
  return d;
}

export const jobs = new Hono<AppEnv>()
  .get("/", zValidator("query", jobsQuerySchema), async (c) => {
    const user = c.get("user");
    const { tab, role, q, page, pageSize } = c.req.valid("query");
    const base: Prisma.JobWhereInput = {
      userId: user.id,
      ...(role !== "all" ? { roleId: role } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const where = { ...base, ...tabWhere[tab] };
    const [total, rows, ...counts] = await Promise.all([
      db.job.count({ where }),
      db.job.findMany({ where, include: rowInclude, orderBy: { foundAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      ...JOB_TABS.map((t) => db.job.count({ where: { ...base, ...tabWhere[t] } })),
    ]);
    const body: JobsPageDto = {
      rows: rows.map(toRow),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      counts: Object.fromEntries(JOB_TABS.map((t, i) => [t, counts[i]])) as Record<JobTab, number>,
    };
    return c.json(body);
  })

  .get("/:id", async (c) => c.json(await detailOr404(c.get("user").id, c.req.param("id"))))

  .post("/:id/apply", async (c) => {
    const user = c.get("user");
    const job = await ownJob(user.id, c.req.param("id"));
    if (!["AWAITING", "APPLY_FAILED"].includes(job.status)) throw new HTTPException(409, { message: "This job can't be applied to right now." });
    await startApply(job.id);
    return c.json(await detailOr404(user.id, job.id));
  })

  .post("/:id/skip", async (c) => {
    const user = c.get("user");
    const job = await ownJob(user.id, c.req.param("id"));
    await db.job.update({ where: { id: job.id }, data: { status: "SKIPPED", events: { create: { type: "skipped", message: "Skipped by you" } } } });
    return c.json(await detailOr404(user.id, job.id));
  })

  .post("/:id/mark-applied", async (c) => {
    const user = c.get("user");
    const job = await ownJob(user.id, c.req.param("id"));
    await db.job.update({
      where: { id: job.id },
      data: {
        status: "APPLIED_MANUALLY",
        appliedAt: new Date(),
        ...(job.issueKind === "APPLY" ? { issueKind: null, issueMessage: null } : {}),
        events: { create: { type: "manual", message: "Marked as applied manually" } },
      },
    });
    return c.json(await detailOr404(user.id, job.id));
  })

  .patch("/:id/outcome", zValidator("json", outcomeSchema), async (c) => {
    const user = c.get("user");
    const job = await ownJob(user.id, c.req.param("id"));
    const { outcome } = c.req.valid("json");
    await db.job.update({ where: { id: job.id }, data: { outcome, events: { create: { type: "outcome", message: `Outcome: ${OUTCOME_LABEL[outcome]}` } } } });
    return c.json(await detailOr404(user.id, job.id));
  })

  .post("/:id/retry", async (c) => {
    const user = c.get("user");
    const job = await ownJob(user.id, c.req.param("id"));
    if (job.issueKind === "APPLY" || job.status === "APPLY_FAILED") await startApply(job.id);
    else await prepareJob(job.id);
    return c.json(await detailOr404(user.id, job.id));
  })

  .get("/:id/documents/:docId", async (c) => {
    const user = c.get("user");
    const doc = await db.document.findFirst({ where: { id: c.req.param("docId"), jobId: c.req.param("id"), job: { userId: user.id } } });
    if (!doc) throw new HTTPException(404, { message: "Document not found" });
    if (c.req.query("download") !== undefined) {
      return c.body(doc.content, 200, {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
      });
    }
    return c.json({ id: doc.id, kind: doc.kind, fileName: doc.fileName, atsScore: doc.atsScore, createdAt: doc.createdAt.toISOString(), content: doc.content });
  });
