import type { RawJob, SourceAdapter } from "./types";
import { boardsOf, fetchJson, titleCase } from "./util";

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text: string; content: string }[];
  categories?: { location?: string; commitment?: string };
  salaryRange?: { min?: number; max?: number; currency?: string };
};

/** Public Lever postings. Config: { boards: ["company", ...] } */
export const lever: SourceAdapter = {
  kind: "LEVER",
  async fetchJobs(config) {
    const out: RawJob[] = [];
    for (const company of boardsOf(config)) {
      const postings = await fetchJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
      for (const p of postings) {
        const s = p.salaryRange;
        out.push({
          externalId: `${company}:${p.id}`,
          url: p.hostedUrl,
          title: p.text,
          company: titleCase(company),
          location: p.categories?.location,
          salary: s?.min && s?.max ? `${s.currency ?? ""} ${Math.round(s.min / 1000)}k–${Math.round(s.max / 1000)}k`.trim() : undefined,
          description: [p.descriptionPlain, ...(p.lists ?? []).map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, " ")}`), p.additionalPlain]
            .filter(Boolean)
            .join("\n\n"),
          postedAt: p.createdAt ? new Date(p.createdAt) : undefined,
        });
      }
    }
    return out;
  },
};
