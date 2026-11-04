import type { CampaignDto, JobDetailDto, JobRow, AtsBreakdown } from "@nnamaka/fynd-shared";
import type { Prisma } from "@prisma/client";
import { adapters } from "../agent/sources";
import { db } from "../db";
import { startOfMonthUTC } from "../lib/util";
import { APPLIED_STATUSES, getActiveCampaign } from "./campaign";

export const rowInclude = {
  role: { select: { id: true, title: true } },
  source: { select: { id: true, name: true, kind: true } },
} satisfies Prisma.JobInclude;

export const detailInclude = {
  ...rowInclude,
  documents: { select: { id: true, kind: true, fileName: true, atsScore: true, createdAt: true }, orderBy: { kind: "asc" } },
  events: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.JobInclude;

type JobWithRow = Prisma.JobGetPayload<{ include: typeof rowInclude }>;
type JobWithDetail = Prisma.JobGetPayload<{ include: typeof detailInclude }>;

export const toRow = (j: JobWithRow): JobRow => ({
  id: j.id,
  title: j.title,
  company: j.company,
  location: j.location,
  salary: j.salary,
  status: j.status,
  issueKind: j.issueKind,
  issueMessage: j.issueMessage,
  atsScore: j.atsScore,
  foundAt: j.foundAt.toISOString(),
  role: j.role,
  source: j.source,
});

export const toDetail = (j: JobWithDetail): JobDetailDto => ({
  ...toRow(j),
  url: j.url,
  description: j.description,
  postedAt: j.postedAt?.toISOString() ?? null,
  outcome: j.outcome,
  baseAtsScore: j.baseAtsScore,
  atsBreakdown: (j.atsBreakdown as AtsBreakdown | null) ?? null,
  matchedKeywords: j.matchedKeywords,
  missingKeywords: j.missingKeywords,
  appliedAt: j.appliedAt?.toISOString() ?? null,
  canAutoApply: Boolean(adapters[j.source.kind].apply),
  documents: j.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  events: j.events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })),
});

export async function jobDetail(userId: string, id: string) {
  const job = await db.job.findFirst({ where: { id, userId }, include: detailInclude });
  return job ? toDetail(job) : null;
}

export async function campaignDto(userId: string): Promise<CampaignDto> {
  const active = await getActiveCampaign(userId);
  const c = await db.campaign.findUniqueOrThrow({
    where: { id: active.id },
    include: {
      roles: {
        orderBy: { position: "asc" },
        include: { variants: { orderBy: { title: "asc" } }, suggestions: { orderBy: { title: "asc" } } },
      },
      keywords: { orderBy: { createdAt: "asc" } },
    },
  });
  const counts = await db.job.groupBy({
    by: ["roleId", "status"],
    where: { campaignId: c.id, foundAt: { gte: startOfMonthUTC() } },
    _count: { _all: true },
  });
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    startedAt: c.startedAt.toISOString(),
    locations: c.locations,
    seniority: c.seniority,
    minAts: c.minAts,
    postedWithinDays: c.postedWithinDays,
    autoApply: c.autoApply,
    keywords: c.keywords.map((k) => ({ id: k.id, value: k.value })),
    roles: c.roles.map((r) => {
      const mine = counts.filter((x) => x.roleId === r.id);
      return {
        id: r.id,
        title: r.title,
        monthlyTarget: r.monthlyTarget,
        found: mine.reduce((a, x) => a + x._count._all, 0),
        applied: mine.filter((x) => APPLIED_STATUSES.includes(x.status)).reduce((a, x) => a + x._count._all, 0),
        variants: r.variants.map((v) => ({ id: v.id, title: v.title })),
        suggestions: r.suggestions.map((s) => ({ id: s.id, title: s.title })),
      };
    }),
  };
}
