"use client";

import { JOB_TABS, type JobRow, type JobTab } from "@nnamaka/fynd-shared";
import { useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IssueChip, StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabCount, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounced } from "@/hooks/use-mobile";
import { fmt, formatFound } from "@/lib/format";
import { jobQueryOptions, useCampaign, useJobs } from "@/lib/queries";

const TAB_LABEL: Record<JobTab, string> = { all: "All", awaiting: "Awaiting you", applied: "Applied", issues: "Issues" };

const columns: ColumnDef<JobRow>[] = [
  {
    id: "job",
    header: "Job",
    cell: ({ row: { original: j } }) => (
      <div className="flex max-w-[340px] flex-col gap-0.5 leading-tight">
        <span className="truncate font-medium">{j.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {j.company}
          {j.location ? ` · ${j.location}` : ""}
        </span>
      </div>
    ),
  },
  { id: "role", header: "Role", cell: ({ row: { original: j } }) => (j.role ? <Badge variant="outline">{j.role.title}</Badge> : <span className="text-muted-foreground">—</span>) },
  {
    id: "source",
    header: "Source",
    cell: ({ row: { original: j } }) => (
      <div className="flex items-center gap-1.5">
        <span>{j.source.name}</span>
        {j.issueKind === "EXTRACT" ? <IssueChip kind="EXTRACT" message={j.issueMessage} /> : null}
      </div>
    ),
  },
  { id: "ats", header: () => <div className="text-right">ATS</div>, cell: ({ row: { original: j } }) => <div className="text-right font-mono text-xs">{j.atsScore ?? "—"}</div> },
  { id: "found", header: "Found", cell: ({ row: { original: j } }) => <span className="text-xs text-muted-foreground">{formatFound(j.foundAt)}</span> },
  {
    id: "status",
    header: "Status",
    cell: ({ row: { original: j } }) => (
      <div className="flex items-center gap-1.5">
        <StatusBadge status={j.status} />
        {j.issueKind === "APPLY" ? <IssueChip kind="APPLY" message={j.issueMessage} /> : null}
      </div>
    ),
  },
];

export function JobsTable({ pageSize = 10, initialTab = "all" }: { pageSize?: number; initialTab?: JobTab }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<JobTab>(initialTab);
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());
  const { data: campaign } = useCampaign();
  const { data, isPending, isPlaceholderData } = useJobs({ tab, role, q, page, pageSize });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id, manualPagination: true, pageCount: data?.pageCount ?? 1 });
  const reset = () => setPage(1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => (setTab(v as JobTab), reset())}>
          <TabsList>
            {JOB_TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {TAB_LABEL[t]}
                {data ? <TabCount>{fmt(data.counts[t])}</TabCount> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-7 w-52 pl-8 text-xs" placeholder="Search company or title" value={search} onChange={(e) => (setSearch(e.target.value), reset())} />
          </div>
          <Select value={role} onValueChange={(v) => (setRole(v), reset())}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {campaign?.roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table className={isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
        <TableHeader>
          {table.getHeaderGroups().map((g) => (
            <TableRow key={g.id} className="hover:bg-transparent">
              {g.headers.map((h) => (
                <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            : table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/jobs/${row.id}`)}
                  onMouseEnter={() => qc.prefetchQuery({ ...jobQueryOptions(row.id), staleTime: 30_000 })}
                >
                  {row.getVisibleCells().map((c) => (
                    <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
          {!isPending && rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No jobs match these filters.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Zap className="size-3" />
          Hover a row to preload it. {data ? `${fmt(data.total)} jobs` : ""}
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular">
            Page {data?.page ?? page} of {data?.pageCount ?? 1}
          </span>
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!data || page >= data.pageCount} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
