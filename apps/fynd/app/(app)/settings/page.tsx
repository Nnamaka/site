"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Check, ExternalLink, FileText, Laptop, LogOut, Monitor, Send, Smartphone, Tablet, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient, useSession } from "@/lib/auth-client";
import { describeDevice, relative, shortDate } from "@/lib/format";
import { useAccount, useNotifications, useNotificationsMutation, useUnlinkTelegram, useUploadCv } from "@/lib/queries";
import { cn } from "@/lib/utils";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <Switch checked={checked} onCheckedChange={onChange} />
        {label}
      </label>
      {hint ? <span className="pl-10 text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/* ───────── Notifications ───────── */

function Notifications() {
  const { data } = useNotifications(true);
  const patch = useNotificationsMutation();
  const unlink = useUnlinkTelegram();
  const { data: session } = useSession();
  if (!data) return <Skeleton className="h-72 rounded-xl" />;
  const tgLink = `https://t.me/${data.telegram.botUsername}?start=link`;
  const steps = [
    { t: `Open @${data.telegram.botUsername} in Telegram`, d: "Tap Start in the chat.", done: false },
    { t: "Send your Fynd email", d: `Type ${session?.user.email ?? "your email"} in the chat.`, done: false },
    { t: "Send the code from your inbox", d: "Fynd emails you a 6-digit code. Paste it in the chat to turn alerts on.", done: false },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Telegram bot</CardTitle>
          <CardDescription>An alert for every application Fynd prepares.</CardDescription>
          <CardAction>
            <Badge variant="outline" className="text-muted-foreground">
              {data.telegram.linked ? <Check className="text-green-600" /> : null}
              {data.telegram.linked ? "Connected" : "Not connected"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!data.telegram.configured ? (
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              The server has no TELEGRAM_BOT_TOKEN yet. Create a bot with @BotFather and set it in backend/fynd/.env.
            </p>
          ) : null}
          {data.telegram.linked ? (
            <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5">
                  <Send className="size-4" />
                  <div className="flex-1 leading-snug">
                    <div className="text-[13px] font-medium">{data.telegram.username ? `@${data.telegram.username}` : "Telegram chat"}</div>
                    <div className="text-[11px] text-muted-foreground">Linked {data.telegram.linkedAt ? shortDate(data.telegram.linkedAt) : ""}</div>
                  </div>
                  <Button variant="ghost" size="sm" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
                    Disconnect
                  </Button>
                </div>
                <Toggle checked={data.telegramEnabled} onChange={(v) => patch.mutate({ telegramEnabled: v })} label="Send Telegram alerts" />
                <Toggle checked={data.telegramShowStats} onChange={(v) => patch.mutate({ telegramShowStats: v })} label="Show applied/found (x/y) in every alert" hint="Send /stats to the bot any time for the breakdown per role." />
              </div>
              <div className="flex flex-col gap-1.5 rounded-[10px] bg-muted p-3">
                <span className="text-[11px] text-muted-foreground">Alert preview</span>
                <div className="flex flex-col gap-0.5 rounded-[10px] border bg-background px-3 py-2.5 text-xs leading-relaxed">
                  <b className="font-semibold">Application ready · AI Engineer</b>
                  <span>Senior AI Engineer at Halcyon AI</span>
                  <span className="text-muted-foreground">Remote · EU · €90k–120k · ATS 91</span>
                  {data.telegramShowStats ? <span className="font-mono text-[11px]">AI Engineer 212/1,284 · ML Engineer 168/1,047</span> : null}
                  <span className="mt-1.5 border-t pt-1.5 text-center font-medium">Review in Fynd</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <ol className="flex flex-col">
                {steps.map((s, i) => (
                  <li key={s.t} className="flex gap-3 border-t py-2.5">
                    <span className={cn("grid size-[22px] shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold")}>{i + 1}</span>
                    <div className="flex flex-col gap-0.5 leading-snug">
                      <span className="text-[13px] font-medium">{s.t}</span>
                      <span className="text-xs text-muted-foreground">{s.d}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild disabled={!data.telegram.configured}>
                  <a href={tgLink} target="_blank" rel="noreferrer" className="text-primary-foreground no-underline hover:text-primary-foreground">
                    <Send />
                    Open Telegram
                    <ExternalLink />
                  </a>
                </Button>
                <span className="text-[11px] text-muted-foreground">This page updates by itself once the bot links your account.</span>
              </div>
              <span className="text-[11px] text-muted-foreground">The code goes to your email, not Telegram, so only you can link this account.</span>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email alerts</CardTitle>
          <CardDescription>Real-time emails for each prepared application. Off by default.</CardDescription>
        </CardHeader>
        <CardContent>
          <Toggle checked={data.emailEnabled} onChange={(v) => patch.mutate({ emailEnabled: v })} label="Email me every new application" hint="At ~40 a day this can be a lot. Telegram is recommended." />
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────── Sessions ───────── */

const DEVICE_ICON = { laptop: Laptop, phone: Smartphone, tablet: Tablet, desktop: Monitor } as const;

function Sessions() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: current } = useSession();
  const [confirm, setConfirm] = useState(false);
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const r = await authClient.listSessions();
      if (r.error) throw new Error(r.error.message);
      return [...r.data].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    },
  });
  const revoke = useMutation({
    mutationFn: async (token: string) => {
      const r = await authClient.revokeSession({ token });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Device signed out");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const signOutAll = async () => {
    await authClient.revokeSessions();
    router.replace("/login");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Every device signed in to Fynd. Sessions last until you log out.</CardDescription>
        <CardAction>
          <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
            <LogOut />
            Sign out all devices
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {sessions.isPending ? <Skeleton className="h-40" /> : null}
        {sessions.data?.map((s) => {
          const d = describeDevice(s.userAgent);
          const Icon = DEVICE_ICON[d.kind];
          const isCurrent = s.token === current?.session.token;
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 border-t py-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                <Icon className="size-4" />
              </div>
              <div className="min-w-[180px] flex-1 leading-snug">
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  {d.name}
                  {isCurrent ? <Badge variant="secondary">This device</Badge> : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {s.ipAddress ?? "Unknown IP"} · {isCurrent ? "Active now" : `Active ${relative(new Date(s.updatedAt).toISOString()).toLowerCase()}`} · signed in {shortDate(new Date(s.createdAt).toISOString())}
                </div>
              </div>
              {!isCurrent ? (
                <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(s.token)}>
                  Revoke
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out all devices?</DialogTitle>
            <DialogDescription>Every session, including this one, ends immediately. You'll need a new email code to sign back in.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={signOutAll}>
              <LogOut />
              Sign out everywhere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ───────── Account ───────── */

function Account() {
  const router = useRouter();
  const { data } = useAccount();
  const upload = useUploadCv();
  const input = useRef<HTMLInputElement>(null);
  if (!data) return <Skeleton className="h-72 rounded-xl" />;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Base CV</CardTitle>
          <CardDescription>Every tailored CV, resume and cover letter starts from this file. PDF, Markdown or plain text.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-[10px] border px-3 py-2.5">
            <FileText className="size-4" />
            <div className="min-w-0 flex-1 leading-snug">
              <div className="truncate text-[13px] font-medium">{data.cv?.fileName ?? "No CV uploaded"}</div>
              <div className="text-[11px] text-muted-foreground">
                {data.cv
                  ? `Uploaded ${shortDate(data.cv.uploadedAt)} · ${Math.round(data.cv.size / 1024)} KB${data.cv.atsBaseline != null ? ` · keyword coverage ${data.cv.atsBaseline}%` : ""}${data.cv.hasText ? "" : " · text not readable"}`
                  : "Fynd uses templates until you upload one."}
              </div>
            </div>
            <input
              ref={input}
              type="file"
              accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
              <Upload />
              {data.cv ? "Replace" : "Upload"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>Fynd is invite-only. Registration closes at {data.maxAccounts} accounts.</CardDescription>
          <CardAction>
            <Badge variant="outline">
              {data.accountsUsed} / {data.maxAccounts}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${data.maxAccounts}, 1fr)` }}>
            {Array.from({ length: data.maxAccounts }, (_, i) => (
              <span key={i} className={cn("h-1.5 rounded-[3px]", i < data.accountsUsed ? "bg-chart-3" : "bg-neutral-200")} />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">Each account has its own campaigns, roles, documents and Telegram link.</span>
        </CardContent>
      </Card>

      <div>
        <Button
          variant="outline"
          onClick={async () => {
            await authClient.signOut();
            router.replace("/login");
          }}
        >
          <LogOut />
          Log out
        </Button>
      </div>
    </div>
  );
}

function Settings() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "notifications";
  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`/settings?tab=${v}`, { scroll: false })} className="max-w-[880px]">
      <TabsList>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="sessions">Sessions</TabsTrigger>
        <TabsTrigger value="account">Account</TabsTrigger>
      </TabsList>
      <TabsContent value="notifications">
        <Notifications />
      </TabsContent>
      <TabsContent value="sessions">
        <Sessions />
      </TabsContent>
      <TabsContent value="account">
        <Account />
      </TabsContent>
    </Tabs>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
