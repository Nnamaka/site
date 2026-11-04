"use client";

import { Briefcase, CirclePlus, Globe, LayoutDashboard, LifeBuoy, LogOut, Radar, Send, Settings, Target, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RoleStack } from "@/components/role-stack";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";
import { fmt, initials } from "@/lib/format";
import { useOverview } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; trailing?: React.ReactNode; match?: (p: string) => boolean };

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-[30px] items-center gap-2 rounded-sm px-2 text-[13px] text-foreground no-underline hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-sidebar-accent font-medium",
      )}
    >
      <Icon className="size-3.5" />
      <span className="flex-1">{item.label}</span>
      {item.trailing}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { data } = useOverview("month");

  const main: Item[] = [
    { href: "/", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/" },
    { href: "/jobs", label: "Jobs", icon: Briefcase, trailing: data?.awaiting ? <Badge variant="count">{fmt(data.awaiting)}</Badge> : null },
    { href: "/campaign", label: "Campaign", icon: Target },
    { href: "/flows", label: "Flows", icon: Workflow },
    { href: "/sources", label: "Sources", icon: Globe, trailing: data?.failingSources.length ? <Badge variant="destructive">{data.failingSources.length}</Badge> : null },
  ];
  const isActive = (i: Item) => (i.match ? i.match(pathname) : pathname.startsWith(i.href));
  const user = session?.user;

  return (
    <nav className="flex h-full flex-col gap-4 bg-sidebar p-2">
      <div className="flex h-8 items-center gap-2 px-2 text-sm font-semibold">
        <Radar className="size-4" />
        Fynd
        <span className="ml-auto truncate text-[11px] font-normal text-muted-foreground">{data?.campaign.name}</span>
      </div>

      <div className="flex gap-1.5">
        <Button className="flex-1 justify-start" asChild>
          <Link href="/campaign#add-role" className="text-primary-foreground no-underline hover:text-primary-foreground">
            <CirclePlus />
            New Role
          </Link>
        </Button>
        <Button variant="outline" size="icon" aria-label="Telegram alerts" asChild>
          <Link href="/settings?tab=notifications">
            <Send />
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-0.5">
        {main.map((i) => (
          <NavItem key={i.href} item={i} active={isActive(i)} />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-0.5">
        <NavItem item={{ href: "/settings", label: "Settings", icon: Settings }} active={pathname.startsWith("/settings")} />
        <a href="mailto:hello@nnamaka.com" className="flex h-[30px] items-center gap-2 rounded-sm px-2 text-[13px] text-muted-foreground no-underline hover:bg-sidebar-accent">
          <LifeBuoy className="size-3.5" />
          Get Help
        </a>
      </div>

      <RoleStack />

      <div className="flex items-center gap-2 rounded-lg p-1.5">
        <Link href="/settings?tab=account" className="flex min-w-0 flex-1 items-center gap-2 text-foreground no-underline hover:text-foreground">
          <Avatar>
            <AvatarFallback>{initials(user?.name || user?.email || "")}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium">{user?.name || "—"}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{user?.email}</span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Log out"
          onClick={async () => {
            await authClient.signOut();
            router.replace("/login");
          }}
        >
          <LogOut />
        </Button>
      </div>
    </nav>
  );
}
