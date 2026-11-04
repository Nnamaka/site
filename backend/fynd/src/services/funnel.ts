import type { FunnelBranch, FunnelStage } from "@nnamaka/fynd-shared";
import type { JobOutcome, JobStatus } from "@prisma/client";

type Row = { status: JobStatus; outcome: JobOutcome; _count: { _all: number } };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Turns status/outcome counts for the month into funnel stages and the branches that stopped at each. */
export function buildFunnel(rows: Row[]) {
  const sum = (f: (r: Row) => boolean) => rows.filter(f).reduce((a, r) => a + r._count._all, 0);
  const isApplied = (r: Row) => r.status === "APPLIED" || r.status === "APPLIED_MANUALLY";

  const found = sum(() => true);
  const preparing = sum((r) => r.status === "PREPARING");
  const prepareFailed = sum((r) => r.status === "PREPARE_FAILED");
  const prepared = found - preparing - prepareFailed;
  const awaiting = sum((r) => r.status === "AWAITING");
  const skipped = sum((r) => r.status === "SKIPPED");
  const applyStuck = sum((r) => r.status === "APPLYING" || r.status === "APPLY_FAILED");
  const applied = sum(isApplied);
  const heard = sum((r) => isApplied(r) && r.outcome !== "NONE");
  const rejected = sum((r) => isApplied(r) && r.outcome === "REJECTED");
  const interview = sum((r) => isApplied(r) && (r.outcome === "INTERVIEW" || r.outcome === "OFFER"));
  const offer = sum((r) => isApplied(r) && r.outcome === "OFFER");
  const talking = heard - rejected - interview;

  const stages: FunnelStage[] = [
    { key: "found", label: "Found", value: found, caption: "Exact matches" },
    { key: "prepared", label: "Prepared", value: prepared, caption: `${pct(prepared, found)}% of found` },
    { key: "applied", label: "Applied", value: applied, caption: `${pct(applied, prepared)}% of prepared` },
    { key: "heard", label: "Heard back", value: heard, caption: `${pct(heard, applied)}% of applied` },
    { key: "interview", label: "Interview", value: interview, caption: `${pct(interview, heard)}% of heard back` },
    { key: "offer", label: "Offer", value: offer, caption: offer ? `${pct(offer, interview)}% of interviews` : "None yet" },
  ];

  const b = (value: number, label: string, tone: FunnelBranch["tone"] = "muted"): FunnelBranch => ({ value, label, tone });
  const branches: FunnelBranch[][] = [
    [b(prepareFailed, "failed to prepare"), b(preparing, "still preparing")],
    [b(awaiting, "awaiting you", "attention"), b(skipped, "skipped"), b(applyStuck, "apply failed or pending")],
    [b(applied - heard, "no reply yet")],
    [b(rejected, "rejected"), b(talking, "in conversation")],
    [b(interview - offer, "interviewing")],
    [],
  ].map((list) => list.filter((x) => x.value > 0));

  return { stages, branches };
}
