import type { RawJob, SourceAdapter } from "./types";
import { boardsOf, fetchJson, titleCase } from "./util";

type AshbyJob = {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  jobUrl: string;
  publishedAt?: string;
  descriptionPlain?: string;
  compensation?: { compensationTierSummary?: string };
};

/** Public Ashby job boards. Config: { boards: ["org", ...] } */
export const ashby: SourceAdapter = {
  kind: "ASHBY",
  async fetchJobs(config) {
    const out: RawJob[] = [];
    for (const org of boardsOf(config)) {
      const data = await fetchJson<{ jobs?: AshbyJob[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
      );
      for (const j of data.jobs ?? []) {
        out.push({
          externalId: `${org}:${j.id}`,
          url: j.jobUrl,
          title: j.title,
          company: titleCase(org),
          location: [j.isRemote ? "Remote" : null, j.location].filter(Boolean).join(" · ") || undefined,
          salary: j.compensation?.compensationTierSummary,
          description: j.descriptionPlain ?? "",
          postedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
        });
      }
    }
    return out;
  },
};
