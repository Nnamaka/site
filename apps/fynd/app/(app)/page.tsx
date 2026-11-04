"use client";

import type { OverviewRange } from "@nnamaka/fynd-shared";
import { ChevronDown, ChevronRight, Info, TrendingUp } from "lucide-react";
import { useState } from "react";
import { AttentionPrompt } from "@/components/attention";
import { FunnelChart } from "@/components/funnel-chart";
import { JobsTable } from "@/components/jobs-table";
import { MatchesChart } from "@/components/matches-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmt } from "@/lib/format";
import { useOverview } from "@/lib/queries";

function StatCard({ label, value, badge, headline, caption, progress }: { label: string; value: React.ReactNode; badge?: string; headline: string; caption: string; progress?: number }) {
  return (
    <Card className="gap-3 bg-gradient-to-t from-primary/[0.03] to-card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular">{value}</CardTitle>
        {badge ? (
          <CardAction>
            <Badge variant="outline">
              <TrendingUp />
              {badge}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {progress !== undefined ? <Progress value={progress} className="mb-1" /> : null}
        <span className="text-[13px] font-medium">{headline}</span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const [range, setRange] = useState<OverviewRange>("month");
  const [showNumbers, setShowNumbers] = useState(false);
  const { data } = useOverview(range);

  if (!data) {
    return (
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
        <Skeleton className="col-span-full h-80 rounded-xl" />
      </div>
    );
  }

  const { campaign, roles, funnel } = data;
  const found = funnel.stages[0]?.value ?? 0;
  const applied = funnel.stages[2]?.value ?? 0;
  const heard = funnel.stages[3]?.value ?? 0;

  return (
    <>
      <AttentionPrompt data={data} />

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Info className="size-3" />
        {campaign.name} · day {campaign.dayOfMonth} of {campaign.daysInMonth} · each role has its own monthly target of exact matches.
      </p>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {roles.map((r) => (
          <StatCard
            key={r.id}
            label={r.title}
            value={`${fmt(r.applied)}/${fmt(r.found)}`}
            badge={`${r.pct}%`}
            headline="Applied / found this month"
            caption={`${fmt(r.found)} of ${fmt(r.target)} exact matches`}
            progress={r.pct}
          />
        ))}
        <StatCard label="Awaiting your approval" value={fmt(data.awaiting)} badge={`+${fmt(data.awaitingToday)} today`} headline="Documents ready to send" caption="Open a job to review and apply" />
      </div>

      <Card className="gap-0">
        <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1">
            <CardTitle>Your funnel</CardTitle>
            <CardDescription>How far each job Fynd found this month has made it, and where the ones that stopped are now.</CardDescription>
          </div>
          <div className="flex gap-6">
            {[
              [fmt(found), "found"],
              [fmt(applied), "applied"],
              [`${applied ? Math.round((heard / applied) * 100) : 0}%`, "heard back"],
            ].map(([v, l]) => (
              <div key={l} className="flex flex-col gap-0.5">
                <span className="text-2xl font-semibold leading-tight tracking-tight tabular">{v}</span>
                <span className="text-[11px] text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <div className="overflow-x-auto p-5">
          <FunnelChart stages={funnel.stages} branches={funnel.branches} />
        </div>
        <CardContent className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setShowNumbers((s) => !s)} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600">
              {showNumbers ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {showNumbers ? "Hide the numbers" : "Show the numbers"}
            </button>
            <span className="text-[11px] text-muted-foreground">Ribbon widths are compressed so small stages stay visible.</span>
          </div>
          {showNumbers ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Conversion</TableHead>
                  <TableHead>Stopped here</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funnel.stages.map((s, i) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">{s.label}</TableCell>
                    <TableCell className="text-right tabular">{fmt(s.value)}</TableCell>
                    <TableCell className="text-muted-foreground">{s.caption}</TableCell>
                    <TableCell className="text-muted-foreground">{funnel.branches[i]?.map((b) => `${fmt(b.value)} ${b.label}`).join(" · ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exact matches per day</CardTitle>
          <CardDescription>{range === "7d" ? "Last 7 days" : "This month"} · stacked by role</CardDescription>
          <CardAction>
            <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as OverviewRange)}>
              <ToggleGroupItem value="month">This month</ToggleGroupItem>
              <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
            </ToggleGroup>
          </CardAction>
        </CardHeader>
        <CardContent>
          {roles.length ? <MatchesChart daily={data.daily} roles={roles} /> : <p className="py-10 text-center text-xs text-muted-foreground">Add a role to start finding jobs.</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">Found jobs</h2>
        <p className="text-xs text-muted-foreground">Click a row to see the tailored documents, ATS score and actions.</p>
      </div>
      <JobsTable pageSize={8} />
    </>
  );
}
