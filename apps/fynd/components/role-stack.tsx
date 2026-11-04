"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/skeleton";
import { fmt } from "@/lib/format";
import { useOverview } from "@/lib/queries";

/** Stacked card in the sidebar: applied/found (x/y) for one role at a time. Swipe or use the arrows. */
export function RoleStack() {
  const { data } = useOverview("month");
  const roles = data?.roles ?? [];
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);

  if (!roles.length) {
    return (
      <Link href="/campaign" className="rounded-[10px] border border-dashed p-3 text-xs text-muted-foreground no-underline hover:bg-sidebar-accent">
        Add a role to start tracking applied / found.
      </Link>
    );
  }

  const i = index % roles.length;
  const r = roles[i];
  const go = (d: number) => setIndex((v) => (v + d + roles.length) % roles.length);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-neutral-600">Applied / found</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Previous role" onClick={() => go(-1)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-7 text-center text-[11px] text-muted-foreground tabular">
            {i + 1} / {roles.length}
          </span>
          <Button variant="ghost" size="icon-xs" aria-label="Next role" onClick={() => go(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="relative pb-2">
        {roles.length > 2 ? <div className="absolute inset-x-2.5 bottom-0 h-5 rounded-[10px] border bg-neutral-100" /> : null}
        {roles.length > 1 ? <div className="absolute inset-x-1.5 bottom-1 h-5 rounded-[10px] border bg-neutral-50" /> : null}
        <Link
          href="/campaign"
          draggable={false}
          onPointerDown={(e) => {
            startX.current = e.clientX;
            swiped.current = false;
          }}
          onPointerUp={(e) => {
            const dx = e.clientX - (startX.current ?? e.clientX);
            if (Math.abs(dx) > 30) {
              swiped.current = true;
              go(dx < 0 ? 1 : -1);
            }
          }}
          onClick={(e) => swiped.current && e.preventDefault()}
          className="relative flex touch-pan-y select-none flex-col gap-1.5 rounded-[10px] border bg-card p-3 text-foreground no-underline shadow-xs hover:text-foreground"
        >
          <span className="truncate text-xs font-medium">{r.title}</span>
          <span className="flex items-baseline gap-0.5 tabular">
            <span className="text-[22px] font-semibold tracking-tight">{fmt(r.applied)}</span>
            <span className="text-[13px] text-muted-foreground">/{fmt(r.found)}</span>
          </span>
          <Progress value={r.pct} />
          <span className="text-[11px] text-muted-foreground">
            {fmt(r.found)} of {fmt(r.target)} target · {r.pct}%
          </span>
        </Link>
      </div>
      {roles.length > 1 ? <span className="px-1 text-[10.5px] text-muted-foreground">Swipe or use the arrows to switch roles.</span> : null}
    </div>
  );
}
