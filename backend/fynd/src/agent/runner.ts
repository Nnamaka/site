import { AUTO_APPLY_MIN_ATS } from "@nnamaka/fynd-shared";
import type { Campaign, Keyword, Role, RoleVariant, Source } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { errMsg } from "../lib/util";
import { notifyApplicationReady } from "../services/telegram";
import { atsScore, jobKeywords, matchRole, rejectReason } from "./match";
import { adapters, type RawJob } from "./sources";
import { tailor } from "./tailor";

type CampaignCtx = Campaign & { roles: (Role & { variants: RoleVariant[] })[]; keywords: Keyword[] };

const campaignInclude = { roles: { include: { variants: true } }, keywords: true } as const;
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "");

let timer: NodeJS.Timeout | undefined;
let running = false;

export function startAgent() {
  if (!env.AGENT_ENABLED) return;
  const tick = () => runOnce().catch((e) => console.error("[agent]", errMsg(e)));
  setTimeout(tick, 15_000);
  timer = setInterval(tick, env.AGENT_INTERVAL_MINUTES * 60_000);
}
export const stopAgent = () => timer && clearInterval(timer);

/** One pass over every running campaign. Safe to call concurrently: overlapping runs are skipped. */
export async function runOnce() {
  if (running) return;
  running = true;
  const started = Date.now();
  let created = 0;
  try {
    const campaigns = await db.campaign.findMany({ where: { status: "RUNNING" }, include: campaignInclude });
    for (const c of campaigns) {
      if (!c.roles.length) continue;
      const sources = await db.source.findMany({ where: { userId: c.userId, enabled: true } });
      let budget = env.AGENT_MAX_NEW_PER_RUN;
      for (const s of sources) {
        if (budget <= 0) break;
        const n = await runSource(c, s, budget);
        budget -= n;
        created += n;
      }
    }
  } finally {
    running = false;
    console.log(`[agent] run finished: ${created} new jobs in ${Math.round((Date.now() - started) / 1000)}s`);
  }
}

/** Reads one source for one campaign and stores new exact matches. Returns how many jobs were created. */
export async function runSource(c: CampaignCtx, s: Source, budget = env.AGENT_MAX_NEW_PER_RUN): Promise<number> {
  const queries = c.roles.flatMap((r) => [r.title, ...r.variants.map((v) => v.title)]);
  let raws: RawJob[];
  try {
    raws = await adapters[s.kind].fetchJobs(s.config, { queries });
  } catch (e) {
    await db.source.update({ where: { id: s.id }, data: { health: "EXTRACT_FAILING", lastError: errMsg(e), lastRunAt: new Date() } });
    return 0;
  }
  const keepApplyIssue = s.health === "APPLY_FAILING";
  await db.source.update({
    where: { id: s.id },
    data: { health: keepApplyIssue ? "APPLY_FAILING" : "HEALTHY", lastError: keepApplyIssue ? s.lastError : null, lastRunAt: new Date() },
  });

  let created = 0;
  for (const raw of raws) {
    if (created >= budget) break;
    const roleId = matchRole(raw.title, c.roles);
    if (!roleId || rejectReason(raw, c)) continue;
    const exists = await db.job.findUnique({
      where: { userId_sourceId_externalId: { userId: c.userId, sourceId: s.id, externalId: raw.externalId } },
      select: { id: true },
    });
    if (exists) continue;
    const thin = raw.description.length < 300;
    const job = await db.job.create({
      data: {
        userId: c.userId,
        campaignId: c.id,
        roleId,
        sourceId: s.id,
        externalId: raw.externalId,
        url: raw.url,
        title: raw.title,
        company: raw.company,
        location: raw.location,
        salary: raw.salary,
        description: raw.description,
        postedAt: raw.postedAt,
        issueKind: thin ? "EXTRACT" : null,
        issueMessage: thin ? `Only part of the description could be read from ${s.name}. Documents may be less tailored.` : null,
        events: { create: { type: "found", message: `Found on ${s.name}` } },
      },
    });
    created++;
    await prepareJob(job.id).catch((e) => console.error("[agent] prepare", job.id, errMsg(e)));
  }
  return created;
}

/** Tailors documents, scores them and moves the job to AWAITING (or SKIPPED below the minimum ATS). */
export async function prepareJob(jobId: string) {
  const job = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { campaign: { include: { keywords: true } }, user: { include: { baseCv: true } }, source: true },
  });
  await db.job.update({ where: { id: jobId }, data: { status: "PREPARING" } });
  try {
    const keywords = job.campaign.keywords.map((k) => k.value);
    const cvText = job.user.baseCv?.text ?? "";
    const docs = await tailor({ job, cvText, keywords, candidateName: job.user.name || job.user.email });
    const jd = jobKeywords(job.description, keywords);
    const base = atsScore(cvText, jd, job.title, job.description);
    const cv = atsScore(docs.cv, jd, job.title, job.description);
    const resume = atsScore(docs.resume, jd, job.title, job.description);
    const name = slug(job.user.name || "Candidate");
    const co = slug(job.company);

    await db.$transaction([
      db.document.deleteMany({ where: { jobId } }),
      db.document.createMany({
        data: [
          { jobId, kind: "CV", fileName: `${name}_CV_${co}.md`, content: docs.cv, atsScore: cv.score },
          { jobId, kind: "RESUME", fileName: `${name}_Resume_${co}.md`, content: docs.resume, atsScore: resume.score },
          { jobId, kind: "COVER_LETTER", fileName: `${name}_CoverLetter_${co}.md`, content: docs.coverLetter },
        ],
      }),
    ]);

    const below = cv.score < job.campaign.minAts;
    await db.job.update({
      where: { id: jobId },
      data: {
        status: below ? "SKIPPED" : "AWAITING",
        atsScore: cv.score,
        baseAtsScore: base.score,
        atsBreakdown: cv.breakdown,
        matchedKeywords: cv.matched,
        missingKeywords: cv.missing,
        events: {
          create: [
            { type: "tailored", message: `Documents tailored · ATS ${base.score} → ${cv.score}` },
            ...(below ? [{ type: "skipped", message: `Skipped: ATS below your minimum of ${job.campaign.minAts}` }] : []),
          ],
        },
      },
    });
    if (below) return;

    if (job.campaign.autoApply && cv.score >= AUTO_APPLY_MIN_ATS && adapters[job.source.kind].apply) {
      await startApply(jobId);
    } else {
      await notifyApplicationReady(jobId);
      await db.jobEvent.create({ data: { jobId, type: "alert", message: "Alert sent" } });
    }
  } catch (e) {
    await db.job.update({
      where: { id: jobId },
      data: { status: "PREPARE_FAILED", events: { create: { type: "prepare_failed", message: `Could not prepare documents: ${errMsg(e)}` } } },
    });
  }
}

/** Marks the job APPLYING and submits in the background via the source adapter. */
export async function startApply(jobId: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId }, include: { source: true, documents: true } });
  const adapter = adapters[job.source.kind];
  if (!adapter.apply) {
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "APPLY_FAILED",
        issueKind: "APPLY",
        issueMessage: `Auto-apply isn't available for ${job.source.name} yet. Open the posting, apply there, then mark it applied.`,
        events: { create: { type: "failed", message: "Auto-apply not supported for this source" } },
      },
    });
    return;
  }
  await db.job.update({ where: { id: jobId }, data: { status: "APPLYING", events: { create: { type: "applying", message: "Submitting application…" } } } });
  void (async () => {
    try {
      await adapter.apply!(job, job.documents);
      await db.job.update({
        where: { id: jobId },
        data: { status: "APPLIED", appliedAt: new Date(), issueKind: null, issueMessage: null, events: { create: { type: "applied", message: `Applied automatically on ${job.source.name}` } } },
      });
    } catch (e) {
      await db.job.update({
        where: { id: jobId },
        data: { status: "APPLY_FAILED", issueKind: "APPLY", issueMessage: errMsg(e), events: { create: { type: "failed", message: `Auto-apply failed: ${errMsg(e)}` } } },
      });
      await db.source.update({ where: { id: job.sourceId }, data: { health: "APPLY_FAILING", lastError: `Apply failing: ${errMsg(e)}` } });
    }
  })();
}

export async function loadCampaignCtx(campaignId: string) {
  return db.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: campaignInclude });
}
