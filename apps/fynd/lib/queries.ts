"use client";

import type {
  AccountDto,
  CampaignDto,
  DocumentContentDto,
  FlowDto,
  JobDetailDto,
  JobOutcome,
  JobsPageDto,
  JobsQuery,
  NotificationsDto,
  OverviewDto,
  OverviewRange,
  SourceConfig,
  SourceDto,
} from "@nnamaka/fynd-shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";

export const qk = {
  overview: (range: OverviewRange) => ["overview", range] as const,
  jobs: (q: JobsQuery) => ["jobs", q] as const,
  job: (id: string) => ["job", id] as const,
  doc: (jobId: string, docId: string) => ["doc", jobId, docId] as const,
  campaign: ["campaign"] as const,
  flow: ["flow"] as const,
  sources: ["sources"] as const,
  notifications: ["notifications"] as const,
  account: ["account"] as const,
};

const onError = (e: Error) => toast.error(e.message);

/* overview */
export const useOverview = (range: OverviewRange = "month") =>
  useQuery({ queryKey: qk.overview(range), queryFn: () => api<OverviewDto>(`/overview?range=${range}`), refetchInterval: 60_000 });

/* jobs */
export const useJobs = (q: JobsQuery) =>
  useQuery({
    queryKey: qk.jobs(q),
    queryFn: () => api<JobsPageDto>(`/jobs?${new URLSearchParams({ ...q, page: String(q.page), pageSize: String(q.pageSize) })}`),
    placeholderData: keepPreviousData,
  });

export const jobQueryOptions = (id: string) => ({ queryKey: qk.job(id), queryFn: () => api<JobDetailDto>(`/jobs/${id}`) });

export const useJob = (id: string) =>
  useQuery({
    ...jobQueryOptions(id),
    refetchInterval: (q) => (q.state.data && ["PREPARING", "APPLYING"].includes(q.state.data.status) ? 2000 : false),
  });

export const useDocument = (jobId: string, docId: string | null) =>
  useQuery({ queryKey: qk.doc(jobId, docId ?? ""), queryFn: () => api<DocumentContentDto>(`/jobs/${jobId}/documents/${docId}`), enabled: Boolean(docId) });

type JobAction = { action: "apply" | "skip" | "mark-applied" | "retry" } | { action: "outcome"; outcome: JobOutcome };

export function useJobAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: JobAction) =>
      a.action === "outcome"
        ? api<JobDetailDto>(`/jobs/${id}/outcome`, { method: "PATCH", json: { outcome: a.outcome } })
        : api<JobDetailDto>(`/jobs/${id}/${a.action}`, { method: "POST" }),
    onSuccess: (job) => {
      qc.setQueryData(qk.job(id), job);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError,
  });
}

/* campaign: every mutation returns the full campaign */
export const useCampaign = () => useQuery({ queryKey: qk.campaign, queryFn: () => api<CampaignDto>("/campaign") });

export function useCampaignMutation<V>(fn: (v: V) => Promise<CampaignDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.setQueryData(qk.campaign, data);
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError,
  });
}

export const campaignApi = {
  patch: (body: Partial<Pick<CampaignDto, "status" | "locations" | "seniority" | "minAts" | "postedWithinDays" | "autoApply" | "name">>) =>
    api<CampaignDto>("/campaign", { method: "PATCH", json: body }),
  addRole: (title: string) => api<CampaignDto>("/campaign/roles", { method: "POST", json: { title } }),
  patchRole: (id: string, body: { title?: string; monthlyTarget?: number }) => api<CampaignDto>(`/campaign/roles/${id}`, { method: "PATCH", json: body }),
  removeRole: (id: string) => api<CampaignDto>(`/campaign/roles/${id}`, { method: "DELETE" }),
  addVariant: (roleId: string, title: string) => api<CampaignDto>(`/campaign/roles/${roleId}/variants`, { method: "POST", json: { title } }),
  removeVariant: (roleId: string, id: string) => api<CampaignDto>(`/campaign/roles/${roleId}/variants/${id}`, { method: "DELETE" }),
  acceptSuggestion: (roleId: string, id: string) => api<CampaignDto>(`/campaign/roles/${roleId}/suggestions/${id}/accept`, { method: "POST" }),
  dismissSuggestion: (roleId: string, id: string) => api<CampaignDto>(`/campaign/roles/${roleId}/suggestions/${id}`, { method: "DELETE" }),
  acceptAll: (roleId: string) => api<CampaignDto>(`/campaign/roles/${roleId}/suggestions/accept-all`, { method: "POST" }),
  addKeyword: (value: string) => api<CampaignDto>("/campaign/keywords", { method: "POST", json: { value } }),
  removeKeyword: (id: string) => api<CampaignDto>(`/campaign/keywords/${id}`, { method: "DELETE" }),
};

/* flows */
export const useFlow = () => useQuery({ queryKey: qk.flow, queryFn: () => api<FlowDto>("/flows"), staleTime: Infinity });
export function useSaveFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<FlowDto, "nodes" | "edges">) => api<FlowDto>("/flows", { method: "PUT", json: body }),
    onSuccess: (data) => {
      qc.setQueryData(qk.flow, data);
      toast.success("Flow saved. The agent uses it from the next run.");
    },
    onError,
  });
}

/* sources */
export const useSources = () => useQuery({ queryKey: qk.sources, queryFn: () => api<SourceDto[]>("/sources") });
export function useSourceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; enabled?: boolean; config?: SourceConfig }) => api<SourceDto>(`/sources/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sources });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError,
  });
}
export function useRetrySource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ source: SourceDto; created: number }>(`/sources/${id}/retry`, { method: "POST" }),
    onSuccess: ({ source, created }) => {
      qc.invalidateQueries({ queryKey: qk.sources });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      if (source.health === "HEALTHY") toast.success(`${source.name} is healthy · ${created} new ${created === 1 ? "job" : "jobs"}`);
      else toast.error(`${source.name} is still failing: ${source.lastError ?? "unknown error"}`);
    },
    onError,
  });
}

/* settings */
export const useNotifications = (pollWhileUnlinked = false) =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<NotificationsDto>("/settings/notifications"),
    refetchInterval: (q) => (pollWhileUnlinked && q.state.data && !q.state.data.telegram.linked ? 3000 : false),
  });

export function useNotificationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<NotificationsDto, "telegramEnabled" | "telegramShowStats" | "emailEnabled">>) =>
      api<NotificationsDto>("/settings/notifications", { method: "PATCH", json: body }),
    onSuccess: (d) => qc.setQueryData(qk.notifications, d),
    onError,
  });
}

export function useUnlinkTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<NotificationsDto>("/settings/telegram", { method: "DELETE" }),
    onSuccess: (d) => qc.setQueryData(qk.notifications, d),
    onError,
  });
}

export const useAccount = () => useQuery({ queryKey: qk.account, queryFn: () => api<AccountDto>("/account") });
export function useUploadCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<AccountDto>("/account/cv", { method: "PUT", body: form });
    },
    onSuccess: (d) => {
      qc.setQueryData(qk.account, d);
      toast.success(d.cv?.hasText ? "Base CV updated" : "CV saved, but its text couldn't be read. Upload a PDF, .md or .txt.");
    },
    onError,
  });
}
