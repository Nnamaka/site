"use client";

import { JOB_OUTCOMES, OUTCOME_LABEL, type JobOutcome } from "@nnamaka/fynd-shared";
import { ArrowLeft, Check, CircleCheck, Download, ExternalLink, Eye, FileCheck, FileText, Info, Mail, RefreshCw, Send, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DocPreview, downloadUrl } from "@/components/doc-preview";
import { StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress, Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFound } from "@/lib/format";
import { useJob, useJobAction } from "@/lib/queries";

const DOC_ICON = { CV: FileCheck, RESUME: FileText, COVER_LETTER: Mail } as const;
const DOC_NAME = { CV: "Tailored CV", RESUME: "Resume", COVER_LETTER: "Cover letter" } as const;
const EVENT_DOT: Record<string, string> = {
  found: "var(--chart-1)",
  tailored: "var(--chart-3)",
  alert: "var(--chart-5)",
  applied: "#16a34a",
  manual: "#16a34a",
  outcome: "#16a34a",
  applying: "var(--attention)",
  failed: "#dc2626",
  prepare_failed: "#dc2626",
  skipped: "#a3a3a3",
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isPending } = useJob(id);
  const action = useJobAction(id);
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  if (isPending || !job) return <Skeleton className="h-96 rounded-xl" />;

  const actionable = job.status === "AWAITING" || job.status === "APPLY_FAILED";
  const applied = job.status === "APPLIED" || job.status === "APPLIED_MANUALLY";
  const b = job.atsBreakdown;

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/jobs" className="no-underline">
            <ArrowLeft />
            All jobs
          </Link>
        </Button>
      </div>

      {job.issueKind ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">{job.issueKind === "APPLY" ? `Auto-apply failed on ${job.source.name}` : `Extraction incomplete on ${job.source.name}`}</div>
            <div className="text-xs">{job.issueMessage}</div>
          </div>
          <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: "retry" })}>
            <RefreshCw />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={job.status} />
            {job.role ? <Badge variant="outline">{job.role.title}</Badge> : null}
          </div>
          <h2 className="text-xl font-semibold leading-snug tracking-tight">{job.title}</h2>
          <div className="flex flex-wrap gap-2.5 text-[13px] text-muted-foreground">
            <span>{job.company}</span>
            {job.location ? <span>· {job.location}</span> : null}
            {job.salary ? <span>· {job.salary}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actionable ? (
            job.canAutoApply ? (
              <Button onClick={() => setConfirm(true)} disabled={action.isPending}>
                <Send />
                Apply automatically
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button disabled>
                      <Send />
                      Apply automatically
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Auto-apply isn't available for {job.source.name} yet.</TooltipContent>
              </Tooltip>
            )
          ) : null}
          <Button variant="outline" asChild>
            <a href={job.url} target="_blank" rel="noreferrer" className="no-underline">
              <ExternalLink />
              Open job posting
            </a>
          </Button>
          {actionable ? (
            <>
              <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: "mark-applied" })}>
                <CircleCheck />
                Mark as applied
              </Button>
              <Button variant="ghost" disabled={action.isPending} onClick={() => action.mutate({ action: "skip" })}>
                Skip
              </Button>
            </>
          ) : null}
          {applied ? (
            <Select value={job.outcome} onValueChange={(v) => action.mutate({ action: "outcome", outcome: v as JobOutcome })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {OUTCOME_LABEL[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Info className="size-3" />
        Applying yourself? Download the documents, apply on the posting, then mark it applied so your x/y stays accurate.
      </p>

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Tailored documents</CardTitle>
              <CardDescription>Written by Fynd from your base CV for this job description.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {job.documents.length === 0 ? <p className="text-xs text-muted-foreground">No documents yet.</p> : null}
              {job.documents.map((d) => {
                const Icon = DOC_ICON[d.kind];
                return (
                  <div key={d.id} className="flex items-center gap-3 border-t py-2.5">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 leading-snug">
                      <div className="text-[13px] font-medium">{DOC_NAME[d.kind]}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{d.fileName}</div>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{d.atsScore != null ? `ATS ${d.atsScore}` : "—"}</span>
                    <Button variant="ghost" size="icon-sm" aria-label="Preview" onClick={() => setPreview(d.id)}>
                      <Eye />
                    </Button>
                    <Button variant="outline" size="icon-sm" aria-label="Download" asChild>
                      <a href={downloadUrl(job.id, d.id)}>
                        <Download />
                      </a>
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About the job</CardTitle>
              <CardDescription>
                {job.postedAt ? `Posted ${formatFound(job.postedAt)} · ` : ""}found on {job.source.name} {formatFound(job.foundAt).toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] overflow-auto whitespace-pre-line text-[13px] leading-relaxed text-pretty">{job.description || "No description was extracted."}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="bg-gradient-to-t from-primary/[0.03] to-card">
            <CardHeader>
              <CardTitle>ATS score</CardTitle>
              <CardDescription>Tailored CV against this job description</CardDescription>
              {job.atsScore != null && job.baseAtsScore != null ? (
                <CardAction>
                  <Badge variant="outline">
                    <TrendingUp />+{job.atsScore - job.baseAtsScore}
                  </Badge>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight tabular">{job.atsScore ?? "—"}</span>
                <span className="text-[13px] text-muted-foreground">/ 100</span>
                {job.baseAtsScore != null ? <span className="ml-auto text-[11px] text-muted-foreground">Base CV scored {job.baseAtsScore}</span> : null}
              </div>
              {b
                ? ([
                    ["Keyword coverage", b.keywordCoverage],
                    ["Experience match", b.experience],
                    ["Title alignment", b.titleAlignment],
                    ["Formatting", b.formatting],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span>{l}</span>
                        <span className="font-mono text-muted-foreground">{v}</span>
                      </div>
                      <Progress value={v} />
                    </div>
                  ))
                : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Keywords</CardTitle>
              <CardDescription>Your campaign keywords found in this posting</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {job.matchedKeywords.map((k) => (
                <Badge key={k} variant="secondary">
                  <Check />
                  {k}
                </Badge>
              ))}
              {job.missingKeywords.map((k) => (
                <Badge key={k} variant="outline" className="text-muted-foreground">
                  <X />
                  {k}
                </Badge>
              ))}
              {!job.matchedKeywords.length && !job.missingKeywords.length ? <span className="text-xs text-muted-foreground">None of your keywords appear.</span> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>What Fynd did with this job</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {job.events.map((e, i) => (
                <div key={e.id} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 size-2 rounded-full" style={{ background: EVENT_DOT[e.type] ?? "var(--ring)" }} />
                    {i < job.events.length - 1 ? <span className="min-h-4 w-px flex-1 bg-border" /> : null}
                  </div>
                  <div className="pb-3 leading-snug">
                    <div className="text-[13px]">{e.message}</div>
                    <div className="text-[11px] text-muted-foreground">{formatFound(e.createdAt)}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this application?</DialogTitle>
            <DialogDescription>
              Fynd will apply to {job.title} at {job.company} on {job.source.name} with the tailored CV and cover letter.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirm(false);
                action.mutate({ action: "apply" });
              }}
            >
              <Send />
              Apply now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DocPreview jobId={job.id} docId={preview} onClose={() => setPreview(null)} />
    </>
  );
}
