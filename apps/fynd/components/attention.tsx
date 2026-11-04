"use client";

import type { OverviewDto } from "@nnamaka/fynd-shared";
import { Clock, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { fmt } from "@/lib/format";

const KEY = "fynd:attention-dismissed";

/** Shown once per browser session when something needs the user: a dialog on desktop, a banner on mobile. */
export function AttentionPrompt({ data }: { data: OverviewDto }) {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => setDismissed(sessionStorage.getItem(KEY) === "1"), []);

  const failing = data.failingSources;
  const needs = failing.length > 0 || data.awaiting > 0;
  if (!needs || dismissed) return null;
  const dismiss = () => {
    sessionStorage.setItem(KEY, "1");
    setDismissed(true);
  };

  if (isMobile) {
    return (
      <div className="-mx-3 -mt-3 flex items-center gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <TriangleAlert className="size-3.5 shrink-0" />
        <span className="flex-1">
          {failing.length ? `${failing.length} ${failing.length === 1 ? "source is" : "sources are"} failing · ` : ""}
          {fmt(data.awaiting)} applications await you
        </span>
        <Link href={failing.length ? "/sources" : "/jobs"} onClick={dismiss} className="font-medium text-amber-900">
          Review →
        </Link>
        <button aria-label="Dismiss" onClick={dismiss} className="cursor-pointer">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fynd needs your attention</DialogTitle>
          <DialogDescription>While you were away the agent kept working.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col text-[13px]">
          {data.awaiting > 0 ? (
            <div className="flex gap-2.5 border-t py-2.5">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <div className="font-medium">{fmt(data.awaiting)} applications await your approval</div>
                <div className="text-xs text-muted-foreground">{fmt(data.awaitingToday)} new today. Tailored documents are ready.</div>
              </div>
            </div>
          ) : null}
          {failing.length > 0 ? (
            <div className="flex gap-2.5 border-t py-2.5 text-red-600">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <div className="font-medium">
                  {failing.length} {failing.length === 1 ? "source is" : "sources are"} failing
                </div>
                <div className="text-xs text-muted-foreground">{failing.map((s) => `${s.name} (${s.health === "APPLY_FAILING" ? "apply" : "extraction"})`).join(", ")}</div>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          {failing.length > 0 ? (
            <Button variant="outline" asChild onClick={dismiss}>
              <Link href="/sources" className="no-underline">Check sources</Link>
            </Button>
          ) : null}
          <Button asChild onClick={dismiss}>
            <Link href="/jobs?tab=awaiting" className="text-primary-foreground no-underline hover:text-primary-foreground">Review applications</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
