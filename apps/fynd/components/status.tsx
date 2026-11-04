import type { IssueKind, JobStatus } from "@nnamaka/fynd-shared";
import { CircleCheck, CircleMinus, CircleX, Clock, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STATUS: Record<JobStatus, { label: string; icon: LucideIcon; iconClass?: string }> = {
  PREPARING: { label: "Preparing", icon: LoaderCircle, iconClass: "animate-spin" },
  PREPARE_FAILED: { label: "Prepare failed", icon: CircleX, iconClass: "text-red-600" },
  AWAITING: { label: "Awaiting you", icon: Clock, iconClass: "text-amber-500" },
  APPLYING: { label: "Applying…", icon: LoaderCircle, iconClass: "animate-spin" },
  APPLIED: { label: "Applied", icon: CircleCheck, iconClass: "text-green-600" },
  APPLIED_MANUALLY: { label: "Applied manually", icon: CircleCheck, iconClass: "text-green-600" },
  APPLY_FAILED: { label: "Apply failed", icon: CircleX, iconClass: "text-red-600" },
  SKIPPED: { label: "Skipped", icon: CircleMinus },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Icon className={cn(s.iconClass)} />
      {s.label}
    </Badge>
  );
}

/** Red chip shown next to a source or status when extraction or apply is failing. */
export function IssueChip({ kind, message }: { kind: IssueKind | "EXTRACT_FAILING" | "APPLY_FAILING"; message: string | null }) {
  const label = kind === "APPLY" || kind === "APPLY_FAILING" ? "Apply failing" : "Extraction failing";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className="inline-grid size-5 shrink-0 place-items-center rounded-full border border-red-200 bg-red-50 text-red-600"
          onClick={(e) => e.stopPropagation()}
        >
          <TriangleAlert className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <b className="font-medium">{label}.</b> {message}
      </TooltipContent>
    </Tooltip>
  );
}
