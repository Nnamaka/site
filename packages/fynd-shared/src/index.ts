/**
 * Contracts shared by apps/fynd (Next.js) and backend/fynd (Hono).
 * Request schemas are validated on the server; response types are used by both sides.
 */
import { z } from "zod";

/* ---------------- constants ---------------- */

export const MAX_ROLES = 3;
export const DEFAULT_MONTHLY_TARGET = 2000;
export const AUTO_APPLY_MIN_ATS = 90;

export const JOB_STATUSES = [
  "PREPARING",
  "PREPARE_FAILED",
  "AWAITING",
  "APPLYING",
  "APPLIED",
  "APPLIED_MANUALLY",
  "APPLY_FAILED",
  "SKIPPED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_OUTCOMES = ["NONE", "REPLIED", "REJECTED", "INTERVIEW", "OFFER"] as const;
export type JobOutcome = (typeof JOB_OUTCOMES)[number];

export const OUTCOME_LABEL: Record<JobOutcome, string> = {
  NONE: "No reply yet",
  REPLIED: "Heard back",
  REJECTED: "Rejected",
  INTERVIEW: "Interviewing",
  OFFER: "Offer",
};

export type IssueKind = "EXTRACT" | "APPLY";
export type CampaignStatus = "RUNNING" | "PAUSED" | "ENDED";
export type SourceHealth = "HEALTHY" | "EXTRACT_FAILING" | "APPLY_FAILING";
export type DocumentKind = "CV" | "RESUME" | "COVER_LETTER";

export const SOURCE_KINDS = ["GREENHOUSE", "LEVER", "ASHBY", "REMOTEOK", "CAREER_PAGE"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  GREENHOUSE: "ATS boards",
  LEVER: "ATS boards",
  ASHBY: "ATS boards",
  REMOTEOK: "Job board",
  CAREER_PAGE: "Career pages",
};

export const JOB_TABS = ["all", "awaiting", "applied", "issues"] as const;
export type JobTab = (typeof JOB_TABS)[number];

export const LOCATION_OPTIONS = ["Remote · Worldwide", "Remote · EU", "Remote · US", "Lagos, NG", "London, UK", "Berlin, DE"];
export const SENIORITY_OPTIONS = ["Any", "Mid", "Senior", "Staff"];
export const POSTED_WITHIN_OPTIONS = [1, 3, 7, 14, 30];

/* ---------------- request schemas ---------------- */

export const jobsQuerySchema = z.object({
  tab: z.enum(JOB_TABS).default("all"),
  role: z.string().default("all"),
  q: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type JobsQuery = z.infer<typeof jobsQuerySchema>;

export const overviewQuerySchema = z.object({ range: z.enum(["month", "7d"]).default("month") });
export type OverviewRange = z.infer<typeof overviewQuerySchema>["range"];

export const outcomeSchema = z.object({ outcome: z.enum(JOB_OUTCOMES) });

export const campaignPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  status: z.enum(["RUNNING", "PAUSED"]).optional(),
  locations: z.array(z.string().min(1)).max(6).optional(),
  seniority: z.string().optional(),
  minAts: z.number().int().min(0).max(100).optional(),
  postedWithinDays: z.number().int().min(1).max(60).optional(),
  autoApply: z.boolean().optional(),
});

export const titleSchema = z.object({ title: z.string().trim().min(2).max(80) });
export const rolePatchSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  monthlyTarget: z.number().int().min(1).max(100_000).optional(),
});
export const keywordSchema = z.object({ value: z.string().trim().min(1).max(40) });

export const flowNodeSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({ title: z.string(), sub: z.string(), icon: z.string() }),
});
export const flowEdgeSchema = z.object({ id: z.string(), source: z.string(), target: z.string() });
export const flowSchema = z.object({ nodes: z.array(flowNodeSchema).max(60), edges: z.array(flowEdgeSchema).max(200) });
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const sourceConfigSchema = z.object({
  boards: z.array(z.string().trim().min(1)).optional(),
  urls: z.array(z.string().url()).optional(),
});
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export const sourcePatchSchema = z.object({ enabled: z.boolean().optional(), config: sourceConfigSchema.optional() });

export const notificationsPatchSchema = z.object({
  telegramEnabled: z.boolean().optional(),
  telegramShowStats: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

/* ---------------- response DTOs ---------------- */

export type RoleStat = { id: string; title: string; found: number; applied: number; target: number; pct: number };

export type FunnelStage = { key: string; label: string; value: number; caption: string };
export type FunnelBranch = { value: number; label: string; tone: "attention" | "muted" };

export type DailyPoint = { date: string; counts: Record<string, number> };

export type FailingSource = { id: string; name: string; health: SourceHealth; lastError: string | null };

export type OverviewDto = {
  campaign: { id: string; name: string; status: CampaignStatus; dayOfMonth: number; daysInMonth: number };
  roles: RoleStat[];
  awaiting: number;
  awaitingToday: number;
  funnel: { stages: FunnelStage[]; branches: FunnelBranch[][] };
  daily: DailyPoint[];
  failingSources: FailingSource[];
};

export type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  status: JobStatus;
  issueKind: IssueKind | null;
  issueMessage: string | null;
  atsScore: number | null;
  foundAt: string;
  role: { id: string; title: string } | null;
  source: { id: string; name: string; kind: SourceKind };
};

export type JobsPageDto = {
  rows: JobRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: Record<JobTab, number>;
};

export type AtsBreakdown = { keywordCoverage: number; titleAlignment: number; experience: number; formatting: number };
export type DocumentDto = { id: string; kind: DocumentKind; fileName: string; atsScore: number | null; createdAt: string };
export type DocumentContentDto = DocumentDto & { content: string };
export type JobEventDto = { id: string; type: string; message: string; createdAt: string };

export type JobDetailDto = JobRow & {
  url: string;
  description: string;
  postedAt: string | null;
  outcome: JobOutcome;
  baseAtsScore: number | null;
  atsBreakdown: AtsBreakdown | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  appliedAt: string | null;
  canAutoApply: boolean;
  documents: DocumentDto[];
  events: JobEventDto[];
};

export type RoleDto = {
  id: string;
  title: string;
  monthlyTarget: number;
  found: number;
  applied: number;
  variants: { id: string; title: string }[];
  suggestions: { id: string; title: string }[];
};

export type CampaignDto = {
  id: string;
  name: string;
  status: CampaignStatus;
  startedAt: string;
  locations: string[];
  seniority: string;
  minAts: number;
  postedWithinDays: number;
  autoApply: boolean;
  roles: RoleDto[];
  keywords: { id: string; value: string }[];
};

export type SourceDto = {
  id: string;
  kind: SourceKind;
  name: string;
  enabled: boolean;
  health: SourceHealth;
  lastError: string | null;
  lastRunAt: string | null;
  foundThisMonth: number;
  config: SourceConfig;
};

export type NotificationsDto = {
  telegramEnabled: boolean;
  telegramShowStats: boolean;
  emailEnabled: boolean;
  telegram: { configured: boolean; linked: boolean; username: string | null; linkedAt: string | null; botUsername: string };
};

export type AccountDto = {
  email: string;
  name: string;
  accountsUsed: number;
  maxAccounts: number;
  cv: { fileName: string; size: number; uploadedAt: string; atsBaseline: number | null; hasText: boolean } | null;
};

export type FlowDto = { nodes: FlowNode[]; edges: FlowEdge[]; updatedAt: string };

/* ---------------- defaults ---------------- */

export const DEFAULT_FLOW: { nodes: FlowNode[]; edges: FlowEdge[] } = {
  nodes: [
    { id: "sources", position: { x: 0, y: 160 }, data: { title: "Job sources", sub: "Every 30 min", icon: "globe" } },
    { id: "search", position: { x: 230, y: 160 }, data: { title: "Search roles", sub: "Roles + similar titles", icon: "search" } },
    { id: "match", position: { x: 460, y: 160 }, data: { title: "Match & filter", sub: "Exact match · min ATS", icon: "filter" } },
    { id: "tailor", position: { x: 690, y: 160 }, data: { title: "Tailor documents", sub: "CV, resume, cover letter", icon: "file-text" } },
    { id: "telegram", position: { x: 930, y: 60 }, data: { title: "Telegram alert", sub: "Includes x/y per role", icon: "send" } },
    { id: "approval", position: { x: 930, y: 260 }, data: { title: "Wait for approval", sub: "You approve in Fynd", icon: "user-check" } },
    { id: "apply", position: { x: 1170, y: 260 }, data: { title: "Auto-apply", sub: "Submit on the source", icon: "zap" } },
  ],
  edges: [
    { id: "e1", source: "sources", target: "search" },
    { id: "e2", source: "search", target: "match" },
    { id: "e3", source: "match", target: "tailor" },
    { id: "e4", source: "tailor", target: "telegram" },
    { id: "e5", source: "tailor", target: "approval" },
    { id: "e6", source: "approval", target: "apply" },
  ],
};

export const FLOW_PALETTE: { title: string; sub: string; icon: string }[] = [
  { title: "Source", sub: "Job boards or URLs", icon: "globe" },
  { title: "Filter", sub: "Custom rule", icon: "filter" },
  { title: "Tailor", sub: "Generate documents", icon: "file-text" },
  { title: "Telegram alert", sub: "Notify on Telegram", icon: "send" },
  { title: "Email alert", sub: "Notify by email", icon: "mail" },
  { title: "Approval", sub: "Wait for you", icon: "user-check" },
  { title: "Auto-apply", sub: "Submit on the source", icon: "zap" },
  { title: "Delay", sub: "Wait before next step", icon: "clock" },
];
