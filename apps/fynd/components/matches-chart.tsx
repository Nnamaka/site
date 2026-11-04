"use client";

import type { DailyPoint, RoleStat } from "@nnamaka/fynd-shared";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)"];

type TipItem = { dataKey?: string | number; name?: string; value?: number; color?: string };

function ChartTip({ active, payload, label }: { active?: boolean; payload?: TipItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-background px-2.5 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-[2px]" style={{ background: p.color }} />
          <span className="flex-1 text-muted-foreground">{p.name}</span>
          <span className="font-mono tabular">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MatchesChart({ daily, roles, height = 230 }: { daily: DailyPoint[]; roles: RoleStat[]; height?: number }) {
  const data = daily.map((d) => ({
    label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    ...d.counts,
  }));
  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, left: 4, right: 4, bottom: 0 }}>
          <defs>
            {roles.map((r, i) => (
              <linearGradient key={r.id} id={`fill-${r.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.7} />
                <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            content={(p) => <ChartTip active={p.active} payload={p.payload as unknown as TipItem[]} label={p.label != null ? String(p.label) : undefined} />}
          />
          {roles.map((r, i) => (
            <Area key={r.id} dataKey={r.id} name={r.title} type="natural" stackId="roles" stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} fill={`url(#fill-${r.id})`} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-4 text-[11px] text-muted-foreground">
        {roles.map((r, i) => (
          <span key={r.id} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: COLORS[i % COLORS.length] }} />
            {r.title}
          </span>
        ))}
      </div>
    </div>
  );
}
