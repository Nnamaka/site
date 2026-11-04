"use client";

import { CirclePause, CirclePlay, PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOverview } from "@/lib/queries";
import { cn } from "@/lib/utils";

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Overview"],
  [/^\/jobs\/.+/, "Job details"],
  [/^\/jobs/, "Jobs"],
  [/^\/campaign/, "Campaign"],
  [/^\/flows/, "Flows"],
  [/^\/sources/, "Sources"],
  [/^\/settings/, "Settings"],
];

function SiteHeader({ onToggle }: { onToggle: () => void }) {
  const pathname = usePathname();
  const { data } = useOverview("month");
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Fynd";
  const running = data?.campaign.status === "RUNNING";
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <Button variant="ghost" size="icon-sm" aria-label="Toggle sidebar" onClick={onToggle}>
        <PanelLeft />
      </Button>
      <Separator orientation="vertical" className="!h-4" />
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        {data ? (
          <Badge variant="outline" className="text-muted-foreground">
            {running ? <CirclePlay className="text-green-600" /> : <CirclePause />}
            {running ? "Agent running" : "Agent paused"}
          </Badge>
        ) : null}
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex h-dvh bg-sidebar">
      {!isMobile && !collapsed ? (
        <aside className="w-60 shrink-0">
          <AppSidebar />
        </aside>
      ) : null}
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-60 bg-sidebar">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <AppSidebar />
          </SheetContent>
        </Sheet>
      ) : null}
      <main
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden bg-background",
          !isMobile && "my-2 mr-2 rounded-xl border shadow-xs",
          !isMobile && collapsed && "ml-2",
        )}
      >
        <SiteHeader onToggle={() => (isMobile ? setOpen((o) => !o) : setCollapsed((c) => !c))} />
        <div className="flex-1 overflow-auto">
          <div className="flex w-full max-w-[1400px] flex-col gap-4 p-3 md:p-5">{children}</div>
        </div>
      </main>
    </div>
  );
}
