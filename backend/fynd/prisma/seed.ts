/**
 * Local demo data: one account (SEED_EMAIL, default ada@fynd.dev), a running campaign with three roles,
 * five sources (two failing) and ~150 jobs spread over the current month.
 * Sign in with the seeded email; the OTP is printed in the API terminal.
 */
import { DEFAULT_FLOW } from "@nnamaka/fynd-shared";
import type { DocumentKind, IssueKind, JobOutcome, JobStatus, Prisma } from "@prisma/client";
import { db } from "../src/db";
import { seasonName } from "../src/services/campaign";

const email = (process.env.SEED_EMAIL ?? "ada@fynd.dev").toLowerCase();
const COMPANIES = ["Halcyon AI", "Northwind Labs", "Lumen Health", "Arcadia Robotics", "Fieldnote", "Quanta Pay", "Orbital Data", "Kestrel Security", "Mosaic Learning", "Verdant Energy", "Parallax Media", "Tidewater Logistics", "Copperline", "Brightpath", "Nimbus Cloud", "Sable Analytics", "Juniper Bio"];
const LOCATIONS = ["Remote · EU", "Remote · Worldwide", "Remote · US", "Remote · Europe", "Remote · Anywhere"];
const SALARIES = ["€90k–120k", "£85k–110k", "$150k–190k", "€70k–95k", "$130k–165k", "€100k–130k", null];
const KEYWORDS = ["Python", "LangGraph", "RAG", "FastAPI", "PyTorch", "Evals"];
const ROLES = [
  { title: "AI Engineer", variants: ["Applied AI Engineer", "AI Agent Engineer"], suggestions: ["GenAI Engineer", "AI Solutions Engineer"], titles: ["Senior AI Engineer", "AI Engineer", "Applied AI Engineer", "AI Engineer, Agents", "Staff AI Engineer"] },
  { title: "Machine Learning Engineer", variants: ["ML Engineer", "MLOps Engineer"], suggestions: ["ML Platform Engineer", "Applied Scientist"], titles: ["Machine Learning Engineer", "Senior ML Engineer", "ML Engineer, Ranking", "MLOps Engineer"] },
  { title: "LLM Engineer", variants: ["LLM Applications Engineer"], suggestions: ["NLP Engineer", "Conversational AI Engineer"], titles: ["LLM Engineer", "LLM Applications Engineer", "Senior LLM Engineer"] },
];
const SOURCES = [
  { kind: "REMOTEOK", name: "Remote OK", config: {}, health: "HEALTHY", lastError: null },
  { kind: "GREENHOUSE", name: "Greenhouse", config: { boards: ["anthropic", "stripe"] }, health: "HEALTHY", lastError: null },
  { kind: "LEVER", name: "Lever", config: { boards: ["plaid"] }, health: "HEALTHY", lastError: null },
  { kind: "ASHBY", name: "Ashby", config: { boards: ["ramp"] }, health: "APPLY_FAILING", lastError: "Apply failing: the 'Right to work' field could not be mapped." },
  { kind: "CAREER_PAGE", name: "Career pages", config: { urls: ["https://careers.kestrel.example/roles"] }, health: "EXTRACT_FAILING", lastError: "Timed out after 30 s: careers.kestrel.example" },
] satisfies Omit<Prisma.SourceCreateManyInput, "userId">[];

// deterministic pseudo-random so every seed looks the same
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

function statusFor(): { status: JobStatus; outcome: JobOutcome } {
  const r = rnd();
  if (r < 0.03) return { status: "PREPARE_FAILED", outcome: "NONE" };
  if (r < 0.3) return { status: "AWAITING", outcome: "NONE" };
  if (r < 0.62) return { status: "SKIPPED", outcome: "NONE" };
  if (r < 0.65) return { status: "APPLY_FAILED", outcome: "NONE" };
  const o = rnd();
  const outcome: JobOutcome = o < 0.72 ? "NONE" : o < 0.88 ? "REJECTED" : o < 0.92 ? "REPLIED" : o < 0.985 ? "INTERVIEW" : "OFFER";
  return { status: rnd() < 0.8 ? "APPLIED" : "APPLIED_MANUALLY", outcome };
}

const description = (title: string, company: string) =>
  `${company} is hiring a ${title} to design, ship and evaluate LLM-powered agents used by thousands of customers.\n\nYou will own retrieval pipelines (RAG), tool-use orchestration with LangGraph and offline Evals, working closely with product and research.\n\nRequirements\n• 4+ years building production ML or LLM systems in Python\n• Experience serving models behind FastAPI or similar\n• PyTorch experience is a plus\n• Vector search at scale\n\nNice to have: Kubernetes and GPU inference serving.`;

async function main() {
  await db.user.deleteMany({ where: { email } });
  const user = await db.user.create({ data: { email, name: "Ada Obi", emailVerified: true } });
  await db.notificationSettings.create({ data: { userId: user.id } });
  await db.source.createMany({ data: SOURCES.map((x) => ({ ...x, userId: user.id, lastRunAt: new Date() })) });
  const sources = await db.source.findMany({ where: { userId: user.id } });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const campaign = await db.campaign.create({
    data: {
      userId: user.id,
      name: seasonName(now),
      startedAt: monthStart,
      locations: ["Remote · Worldwide"],
      seniority: "Senior",
      keywords: { create: KEYWORDS.map((value) => ({ value })) },
      flow: { create: { nodes: DEFAULT_FLOW.nodes as unknown as Prisma.InputJsonValue, edges: DEFAULT_FLOW.edges as unknown as Prisma.InputJsonValue } },
    },
  });
  const roles = [];
  for (const [i, r] of ROLES.entries()) {
    roles.push(
      await db.role.create({
        data: {
          campaignId: campaign.id,
          title: r.title,
          position: i,
          variants: { create: r.variants.map((title) => ({ title })) },
          suggestions: { create: r.suggestions.map((title) => ({ title })) },
        },
      }),
    );
  }

  const span = Math.max(1, now.getTime() - monthStart.getTime());
  const total = 150;
  for (let i = 0; i < total; i++) {
    const ri = i % 5 < 2 ? 0 : i % 5 < 4 ? 1 : 2;
    const role = roles[ri];
    const source = pick(sources);
    const title = pick(ROLES[ri].titles);
    const company = pick(COMPANIES);
    const foundAt = new Date(monthStart.getTime() + span * Math.pow(rnd(), 0.8));
    const { status, outcome } = statusFor();
    const ats = 72 + Math.floor(rnd() * 26);
    const base = 60 + Math.floor(rnd() * 12);
    let issueKind: IssueKind | null = null;
    let issueMessage: string | null = null;
    if (status === "APPLY_FAILED") {
      issueKind = "APPLY";
      issueMessage = `Auto-apply isn't available for ${source.name} yet. Open the posting, apply there, then mark it applied.`;
    } else if (source.health === "EXTRACT_FAILING" && rnd() < 0.5) {
      issueKind = "EXTRACT";
      issueMessage = "Only part of the description could be read. Documents may be less tailored.";
    }
    const prepared = status !== "PREPARE_FAILED";
    const applied = status === "APPLIED" || status === "APPLIED_MANUALLY";
    const events: Prisma.JobEventCreateWithoutJobInput[] = [{ type: "found", message: `Found on ${source.name}`, createdAt: foundAt }];
    if (prepared) {
      events.push({ type: "tailored", message: `Documents tailored · ATS ${base} → ${ats}`, createdAt: new Date(foundAt.getTime() + 240_000) });
      events.push({ type: "alert", message: "Alert sent", createdAt: new Date(foundAt.getTime() + 300_000) });
    } else events.push({ type: "prepare_failed", message: "Could not prepare documents: tailoring timed out", createdAt: new Date(foundAt.getTime() + 240_000) });
    if (status === "SKIPPED") events.push({ type: "skipped", message: "Skipped by you", createdAt: new Date(foundAt.getTime() + 3_600_000) });
    if (status === "APPLY_FAILED") events.push({ type: "failed", message: "Auto-apply not supported for this source", createdAt: new Date(foundAt.getTime() + 3_600_000) });
    if (applied) events.push({ type: status === "APPLIED" ? "applied" : "manual", message: status === "APPLIED" ? `Applied automatically on ${source.name}` : "Marked as applied manually", createdAt: new Date(foundAt.getTime() + 7_200_000) });
    if (applied && outcome !== "NONE") events.push({ type: "outcome", message: `Outcome: ${outcome.toLowerCase()}`, createdAt: new Date(foundAt.getTime() + 3 * 86_400_000) });

    const slug = company.replace(/[^A-Za-z]/g, "");
    const docs: { kind: DocumentKind; fileName: string; content: string; atsScore: number | null }[] = prepared
      ? [
          { kind: "CV", fileName: `AdaObi_CV_${slug}.md`, content: `# Ada Obi\n\n## Summary\n${title} with production experience in Python, RAG and LangGraph.\n`, atsScore: ats },
          { kind: "RESUME", fileName: `AdaObi_Resume_${slug}.md`, content: `# Ada Obi\n\n**Target role:** ${title} at ${company}\n`, atsScore: ats - 3 },
          { kind: "COVER_LETTER", fileName: `AdaObi_CoverLetter_${slug}.md`, content: `Dear ${company} hiring team,\n\nI'm applying for the ${title} role…\n\nKind regards,\nAda Obi\n`, atsScore: null },
        ]
      : [];

    await db.job.create({
      data: {
        userId: user.id,
        campaignId: campaign.id,
        roleId: role.id,
        sourceId: source.id,
        externalId: `seed-${i}`,
        url: `https://example.com/jobs/${i}`,
        title,
        company,
        location: pick(LOCATIONS),
        salary: pick(SALARIES),
        description: description(title, company),
        postedAt: new Date(foundAt.getTime() - 86_400_000 * Math.floor(rnd() * 3)),
        foundAt,
        status,
        outcome: applied ? outcome : "NONE",
        atsScore: prepared ? ats : null,
        baseAtsScore: prepared ? base : null,
        atsBreakdown: prepared ? { keywordCoverage: Math.min(100, ats + 2), titleAlignment: 96, experience: ats - 4, formatting: 100 } : undefined,
        matchedKeywords: KEYWORDS.filter((_, k) => k !== 4),
        missingKeywords: ["PyTorch"],
        issueKind,
        issueMessage,
        appliedAt: applied ? new Date(foundAt.getTime() + 7_200_000) : null,
        events: { create: events },
        documents: { create: docs },
      },
    });
  }
  console.log(`Seeded ${email}: 1 campaign, ${roles.length} roles, ${sources.length} sources, ${total} jobs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
