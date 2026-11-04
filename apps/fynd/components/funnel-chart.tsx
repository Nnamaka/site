"use client";

import type { FunnelBranch, FunnelStage } from "@nnamaka/fynd-shared";
import { fmt } from "@/lib/format";

const RAMP = ["#8ec5ff", "#51a2ff", "#2b7fff", "#155dfc", "#1447e6", "#193cb8"];
const STEP = 194;
const TOP = 82;
const FIRST_H = 130;
const NODE_W = 10;

const ribbon = (x0: number, a0: number, a1: number, x1: number, b0: number, b1: number) => {
  const xm = (x0 + x1) / 2;
  return `M${x0} ${a0} C${xm} ${a0} ${xm} ${b0} ${x1} ${b0} L${x1} ${b1} C${xm} ${b1} ${xm} ${a1} ${x0} ${a1} Z`;
};

/**
 * Sankey-style funnel: each stage is a bar; ribbons carry what continued, side branches show where the rest stopped.
 * Heights are compressed (ratio^0.35) so small late stages stay visible next to large early ones.
 */
export function FunnelChart({ stages, branches }: { stages: FunnelStage[]; branches: FunnelBranch[][] }) {
  const heights: number[] = [];
  stages.forEach((s, i) => {
    if (i === 0) return heights.push(FIRST_H);
    const prev = stages[i - 1].value;
    const ratio = prev > 0 ? s.value / prev : 0;
    heights.push(Math.max(3, heights[i - 1] * Math.pow(Math.max(ratio, 1e-4), 0.35)));
  });

  const ribbons: React.ReactNode[] = [];
  const bars: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  let maxY = TOP + FIRST_H;

  stages.forEach((s, i) => {
    const x = i * STEP;
    const last = i === stages.length - 1;
    const tx = last ? x + NODE_W : x;
    const anchor = last ? "end" : "start";
    labels.push(
      <g key={`l${i}`} textAnchor={anchor}>
        <text x={tx} y={14} fontSize={12} fontWeight={500} fill="var(--foreground)">{s.label}</text>
        <text x={tx} y={42} fontSize={22} fontWeight={600} fill="var(--foreground)" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{fmt(s.value)}</text>
        <text x={tx} y={60} fontSize={11} fill="var(--muted-foreground)">{s.caption}</text>
      </g>,
    );
    bars.push(<rect key={`n${i}`} x={x} y={TOP} width={NODE_W} height={heights[i]} rx={2} fill={RAMP[i % RAMP.length]} />);
    if (last) return;

    const next = heights[i + 1];
    ribbons.push(<path key={`r${i}`} d={ribbon(x + NODE_W, TOP, TOP + next, x + STEP, TOP, TOP + next)} fill={RAMP[(i + 1) % RAMP.length]} opacity={0.28} />);

    const list = branches[i] ?? [];
    const total = list.reduce((a, b) => a + b.value, 0);
    const remaining = Math.max(0, heights[i] - next);
    let offset = TOP + next;
    let by = TOP + heights[i] + 16;
    list.forEach((b, k) => {
      const h = Math.max(4, total ? (remaining * b.value) / total : 4);
      const bx = x + 96;
      const hot = b.tone === "attention";
      ribbons.push(<path key={`b${i}-${k}`} d={ribbon(x + NODE_W, offset, offset + h, bx, by, by + h)} fill={hot ? "var(--attention)" : "#d4d4d4"} opacity={hot ? 0.3 : 0.55} />);
      bars.push(<rect key={`bn${i}-${k}`} x={bx} y={by} width={8} height={h} rx={2} fill={hot ? "var(--attention)" : "#a3a3a3"} />);
      labels.push(
        <text key={`bt${i}-${k}`} x={bx + 14} y={by + h / 2 + 4} fontSize={11} fontWeight={hot ? 600 : 400} fill="var(--foreground)">
          {fmt(b.value)} {b.label}
        </text>,
      );
      offset += h;
      by += h + 16;
      maxY = Math.max(maxY, by);
    });
  });

  const width = STEP * (stages.length - 1) + NODE_W;
  return (
    <svg viewBox={`0 0 ${width} ${Math.ceil(maxY + 4)}`} className="block w-full min-w-[760px] overflow-visible font-sans" role="img" aria-label="Application funnel">
      {ribbons}
      {bars}
      {labels}
    </svg>
  );
}
