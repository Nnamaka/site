"use client";

import { LOCATION_OPTIONS, MAX_ROLES, POSTED_WITHIN_OPTIONS, SENIORITY_OPTIONS, type RoleDto } from "@nnamaka/fynd-shared";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress, Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fmt, shortDate } from "@/lib/format";
import { campaignApi, useCampaign, useCampaignMutation } from "@/lib/queries";

/** Text input that saves on Enter or blur, not on every keystroke. */
function useDraft(initial: string) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  return [v, setV] as const;
}

function RoleCard({ role, index }: { role: RoleDto; index: number }) {
  const m = useCampaignMutation((fn: () => Promise<Awaited<ReturnType<typeof campaignApi.patch>>>) => fn());
  const [target, setTarget] = useDraft(String(role.monthlyTarget));
  const [draft, setDraft] = useState("");
  const pct = role.monthlyTarget ? Math.min(100, Math.round((role.found / role.monthlyTarget) * 100)) : 0;

  const saveTarget = () => {
    const n = parseInt(target, 10);
    if (n > 0 && n !== role.monthlyTarget) m.mutate(() => campaignApi.patchRole(role.id, { monthlyTarget: n }));
    else setTarget(String(role.monthlyTarget));
  };
  const addVariant = () => {
    const t = draft.trim();
    if (t.length < 2) return;
    m.mutate(() => campaignApi.addVariant(role.id, t));
    setDraft("");
  };

  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-[11px]">
          Role {index + 1} of {MAX_ROLES}
        </CardDescription>
        <CardTitle>{role.title}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Remove role" onClick={() => m.mutate(() => campaignApi.removeRole(role.id))}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs tabular">
            <span>
              <b className="font-semibold">{fmt(role.applied)}</b>
              <span className="text-muted-foreground">/{fmt(role.found)} applied</span>
            </span>
            <span className="text-muted-foreground">{pct}% of target</span>
          </div>
          <Progress value={pct} />
        </div>

        <Field label="Monthly target" hint="Exact matches Fynd should find for this role each month.">
          <Input type="number" min={1} className="h-7" value={target} onChange={(e) => setTarget(e.target.value)} onBlur={saveTarget} onKeyDown={(e) => e.key === "Enter" && saveTarget()} />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Also searching</span>
          <div className="flex flex-wrap gap-1.5">
            {role.variants.length === 0 ? <span className="text-xs text-muted-foreground">Only the exact title.</span> : null}
            {role.variants.map((v) => (
              <Badge key={v.id} variant="secondary" className="pr-1">
                {v.title}
                <button aria-label={`Remove ${v.title}`} className="cursor-pointer rounded-full hover:bg-black/5" onClick={() => m.mutate(() => campaignApi.removeVariant(role.id, v.id))}>
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        {role.suggestions.length ? (
          <div className="flex flex-col gap-2 rounded-[10px] border border-dashed p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                <Sparkles className="size-3.5" />
                Suggested by Fynd
              </span>
              <Button variant="link" className="text-xs" onClick={() => m.mutate(() => campaignApi.acceptAll(role.id))}>
                Accept all
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {role.suggestions.map((s) => (
                <span key={s.id} className="inline-flex h-[22px] items-center gap-1 rounded-full border bg-background pl-2 pr-1 text-[11px] font-medium">
                  {s.title}
                  <button aria-label="Add" className="grid size-4 cursor-pointer place-items-center rounded-full bg-muted" onClick={() => m.mutate(() => campaignApi.acceptSuggestion(role.id, s.id))}>
                    <Plus className="size-3" />
                  </button>
                  <button aria-label="Dismiss" className="grid size-4 cursor-pointer place-items-center text-muted-foreground" onClick={() => m.mutate(() => campaignApi.dismissSuggestion(role.id, s.id))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground text-pretty">Titles companies often hire alongside {role.title}.</span>
          </div>
        ) : null}

        <div className="flex gap-1.5">
          <Input className="h-7" placeholder="Add a similar title" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVariant()} />
          <Button variant="outline" size="sm" onClick={addVariant}>
            <Plus />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignPage() {
  const { data: c } = useCampaign();
  const m = useCampaignMutation((fn: () => ReturnType<typeof campaignApi.patch>) => fn());
  const [newRole, setNewRole] = useState("");
  const [newKw, setNewKw] = useState("");
  const [minAts, setMinAts] = useDraft(String(c?.minAts ?? 75));

  if (!c) return <Skeleton className="h-96 rounded-xl" />;

  const addRole = () => {
    const t = newRole.trim();
    if (t.length < 2) return;
    m.mutate(() => campaignApi.addRole(t), { onSuccess: () => setNewRole("") });
  };
  const addKw = () => {
    const v = newKw.trim();
    if (!v) return;
    m.mutate(() => campaignApi.addKeyword(v), { onSuccess: () => setNewKw("") });
  };
  const saveMinAts = () => {
    const n = parseInt(minAts, 10);
    if (n >= 0 && n <= 100 && n !== c.minAts) m.mutate(() => campaignApi.patch({ minAts: n }));
  };
  const running = c.status === "RUNNING";

  return (
    <>
      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{c.name}</h2>
              <Badge variant={running ? "outline" : "secondary"}>{running ? "Running" : "Paused"}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              Started {shortDate(c.startedAt)} · runs until you stop it · {c.roles.length} of {MAX_ROLES} roles
            </span>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Switch checked={running} onCheckedChange={(on) => m.mutate(() => campaignApi.patch({ status: on ? "RUNNING" : "PAUSED" }))} />
            Agent running
          </label>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        {c.roles.map((r, i) => (
          <RoleCard key={r.id} role={r} index={i} />
        ))}
        {c.roles.length < MAX_ROLES ? (
          <div id="add-role" className="flex scroll-mt-20 flex-col gap-3 rounded-xl border border-dashed p-5">
            <div>
              <h3 className="text-sm font-semibold">Add a role</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Up to {MAX_ROLES} roles per campaign. Fynd suggests similar titles once you add one.</p>
            </div>
            <div className="flex gap-1.5">
              <Input placeholder="e.g. Data Scientist" value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRole()} />
              <Button onClick={addRole} disabled={m.isPending}>
                <Plus />
                Add role
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <Card>
          <CardHeader>
            <CardTitle>Keywords</CardTitle>
            <CardDescription>Considered alongside the job title, across every role.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {c.keywords.map((k) => (
                <Badge key={k.id} variant="secondary" className="pr-1">
                  {k.value}
                  <button aria-label={`Remove ${k.value}`} className="cursor-pointer rounded-full hover:bg-black/5" onClick={() => m.mutate(() => campaignApi.removeKeyword(k.id))}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input className="h-7" placeholder="e.g. PyTorch" value={newKw} onChange={(e) => setNewKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKw()} />
              <Button variant="outline" size="sm" onClick={addKw}>
                <Plus />
                Add
              </Button>
            </div>
            <span className="text-[11px] text-muted-foreground">Press Enter to add. They drive the ATS score and what the tailored CV emphasises.</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Criteria</CardTitle>
            <CardDescription>A job must pass all of these to count as an exact match.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <Field label="Location">
              <Select value={c.locations[0] ?? LOCATION_OPTIONS[0]} onValueChange={(v) => m.mutate(() => campaignApi.patch({ locations: [v] }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Seniority">
              <Select value={c.seniority} onValueChange={(v) => m.mutate(() => campaignApi.patch({ seniority: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Minimum ATS score" hint="Below this, Fynd skips the job.">
              <Input type="number" min={0} max={100} value={minAts} onChange={(e) => setMinAts(e.target.value)} onBlur={saveMinAts} onKeyDown={(e) => e.key === "Enter" && saveMinAts()} />
            </Field>
            <Field label="Posted within">
              <Select value={String(c.postedWithinDays)} onValueChange={(v) => m.mutate(() => campaignApi.patch({ postedWithinDays: Number(v) }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSTED_WITHIN_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d === 1 ? "24 hours" : `${d} days`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="col-span-full flex flex-col gap-1 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Switch checked={c.autoApply} onCheckedChange={(v) => m.mutate(() => campaignApi.patch({ autoApply: v }))} />
                Apply without asking when ATS is 90 or higher
              </label>
              <span className="pl-10 text-[11px] text-muted-foreground">Off: every application waits for your approval. Only sources that support auto-apply.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
