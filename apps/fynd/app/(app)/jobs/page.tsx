"use client";

import type { JobTab } from "@nnamaka/fynd-shared";
import { JOB_TABS } from "@nnamaka/fynd-shared";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { JobsTable } from "@/components/jobs-table";

function Jobs() {
  const t = useSearchParams().get("tab");
  const initialTab: JobTab = (JOB_TABS as readonly string[]).includes(t ?? "") ? (t as JobTab) : "all";
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">Found jobs</h2>
        <p className="text-xs text-muted-foreground">Every exact match Fynd found, newest first. Click a row to review and apply.</p>
      </div>
      <JobsTable key={initialTab} initialTab={initialTab} pageSize={15} />
    </>
  );
}

export default function JobsPage() {
  return (
    <Suspense>
      <Jobs />
    </Suspense>
  );
}
