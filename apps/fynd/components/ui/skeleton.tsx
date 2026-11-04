import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

/** 4px progress track with the chart-3 fill. */
function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-neutral-200", className)}>
      <div className="h-full rounded-full bg-chart-3 transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export { Skeleton, Progress };
