import type { RawJob, SourceAdapter } from "./types";
import { fetchJson, stripHtml } from "./util";

type RemoteOkItem = {
  id?: string;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  date?: string;
  salary_min?: number;
  salary_max?: number;
};

/** Remote OK public feed (latest remote jobs). No config needed. */
export const remoteok: SourceAdapter = {
  kind: "REMOTEOK",
  async fetchJobs() {
    const items = await fetchJson<RemoteOkItem[]>("https://remoteok.com/api");
    return items
      .filter((i): i is Required<Pick<RemoteOkItem, "id" | "position" | "url">> & RemoteOkItem => Boolean(i.id && i.position && i.url))
      .map<RawJob>((i) => ({
        externalId: String(i.id),
        url: i.url,
        title: i.position,
        company: i.company ?? "Unknown",
        location: `Remote${i.location ? ` · ${i.location}` : ""}`,
        salary: i.salary_min && i.salary_max ? `$${Math.round(i.salary_min / 1000)}k–${Math.round(i.salary_max / 1000)}k` : undefined,
        description: stripHtml(i.description ?? ""),
        postedAt: i.date ? new Date(i.date) : undefined,
      }));
  },
};
