import type { RawJob, SourceAdapter } from "./types";
import { ExtractError } from "./types";
import { fetchText, stripHtml } from "./util";

type Posting = {
  "@type"?: string | string[];
  title?: string;
  url?: string;
  identifier?: { value?: string } | string;
  datePosted?: string;
  description?: string;
  hiringOrganization?: { name?: string };
  jobLocationType?: string;
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string } } | { address?: { addressLocality?: string } }[];
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number } };
};

const isPosting = (x: Posting) => (Array.isArray(x["@type"]) ? x["@type"].includes("JobPosting") : x["@type"] === "JobPosting");

/** Any careers page that publishes schema.org JobPosting JSON-LD. Config: { urls: ["https://…/careers/role", ...] } */
export const careerPage: SourceAdapter = {
  kind: "CAREER_PAGE",
  async fetchJobs(config) {
    const urls = (config as { urls?: string[] })?.urls ?? [];
    const out: RawJob[] = [];
    for (const url of urls) {
      const html = await fetchText(url, 30_000);
      const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
      const postings: Posting[] = [];
      for (const b of blocks) {
        try {
          const parsed = JSON.parse(b.trim());
          const list: Posting[] = Array.isArray(parsed) ? parsed : parsed["@graph"] ?? [parsed];
          postings.push(...list.filter(isPosting));
        } catch {
          /* ignore malformed blocks */
        }
      }
      if (!postings.length) throw new ExtractError(`No JobPosting data found on ${new URL(url).host}`);
      for (const p of postings) {
        const loc = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation;
        const v = p.baseSalary?.value;
        out.push({
          externalId: typeof p.identifier === "string" ? p.identifier : p.identifier?.value ?? p.url ?? url,
          url: p.url ?? url,
          title: p.title ?? "Untitled role",
          company: p.hiringOrganization?.name ?? new URL(url).host,
          location: p.jobLocationType === "TELECOMMUTE" ? "Remote" : loc?.address?.addressLocality,
          salary: v?.minValue && v?.maxValue ? `${p.baseSalary?.currency ?? ""} ${Math.round(v.minValue / 1000)}k–${Math.round(v.maxValue / 1000)}k`.trim() : undefined,
          description: stripHtml(p.description ?? ""),
          postedAt: p.datePosted ? new Date(p.datePosted) : undefined,
        });
      }
    }
    return out;
  },
};
