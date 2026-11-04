"use client";

import { SOURCE_KIND_LABEL, type SourceDto } from "@nnamaka/fynd-shared";
import { Pencil, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { IssueChip } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt, relative } from "@/lib/format";
import { useRetrySource, useSourceMutation, useSources } from "@/lib/queries";

const usesUrls = (s: SourceDto) => s.kind === "CAREER_PAGE";
const needsConfig = (s: SourceDto) => s.kind !== "REMOTEOK";
const configList = (s: SourceDto) => (usesUrls(s) ? s.config.urls : s.config.boards) ?? [];

function ConfigDialog({ source, onClose }: { source: SourceDto | null; onClose: () => void }) {
  const update = useSourceMutation();
  const [value, setValue] = useState("");
  const open = Boolean(source);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o && source) setValue(configList(source).join(", "));
        if (!o) onClose();
      }}
    >
      {source ? (
        <DialogContent onOpenAutoFocus={() => setValue(configList(source).join(", "))}>
          <DialogHeader>
            <DialogTitle>Configure {source.name}</DialogTitle>
            <DialogDescription>
              {usesUrls(source)
                ? "Careers page URLs that publish JobPosting structured data."
                : `Company board names, as in boards.greenhouse.io/<name>, jobs.lever.co/<name> or jobs.ashbyhq.com/<name>.`}
            </DialogDescription>
          </DialogHeader>
          <Field label={usesUrls(source) ? "URLs" : "Boards"} hint="Separate with commas.">
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={usesUrls(source) ? "https://example.com/careers/ml-engineer" : "stripe, airbnb"} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={update.isPending}
              onClick={() => {
                const list = value.split(",").map((x) => x.trim()).filter(Boolean);
                update.mutate({ id: source.id, enabled: list.length > 0 || source.enabled, config: usesUrls(source) ? { urls: list } : { boards: list } }, { onSuccess: onClose });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export default function SourcesPage() {
  const { data } = useSources();
  const update = useSourceMutation();
  const retry = useRetrySource();
  const [editing, setEditing] = useState<SourceDto | null>(null);

  if (!data) return <Skeleton className="h-96 rounded-xl" />;
  const failing = data.filter((s) => s.enabled && s.health !== "HEALTHY");

  return (
    <>
      {failing.length ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <div className="text-[13px] font-medium">
              {failing.length} {failing.length === 1 ? "source needs" : "sources need"} attention
            </div>
            <div className="text-xs">Jobs from failing sources show a red chip in the jobs table. Fynd retries on every run.</div>
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Source</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Found this month</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>Boards / URLs</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((s) => {
            const list = configList(s);
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{s.name}</span>
                    {s.health !== "HEALTHY" ? <IssueChip kind={s.health} message={s.lastError} /> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{SOURCE_KIND_LABEL[s.kind]}</Badge>
                </TableCell>
                <TableCell className="max-w-[280px] whitespace-normal">
                  {s.health === "HEALTHY" ? (
                    <span className="text-xs text-muted-foreground">Healthy</span>
                  ) : (
                    <span className="text-xs text-red-600">{s.lastError ?? (s.health === "APPLY_FAILING" ? "Apply failing" : "Extraction failing")}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular">{fmt(s.foundThisMonth)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{relative(s.lastRunAt)}</TableCell>
                <TableCell>
                  {needsConfig(s) ? (
                    <button className="inline-flex max-w-[220px] cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditing(s)}>
                      <span className="truncate">{list.length ? list.join(", ") : "Not configured"}</span>
                      <Pencil className="size-3 shrink-0" />
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Public feed</span>
                  )}
                </TableCell>
                <TableCell>
                  <Switch checked={s.enabled} onCheckedChange={(enabled) => update.mutate({ id: s.id, enabled })} disabled={needsConfig(s) && !list.length} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" disabled={!s.enabled || (retry.isPending && retry.variables === s.id)} onClick={() => retry.mutate(s.id)}>
                    <RefreshCw className={retry.isPending && retry.variables === s.id ? "animate-spin" : undefined} />
                    {s.health === "HEALTHY" ? "Run now" : "Retry"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-[11px] text-muted-foreground">Extraction is reading listings. Apply is submitting forms. Either can fail on its own.</p>
      <ConfigDialog source={editing} onClose={() => setEditing(null)} />
    </>
  );
}
