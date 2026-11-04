import type { RawJob, SourceAdapter } from "./types";
import { boardsOf, fetchJson, stripHtml, titleCase } from "./util";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  location?: { name?: string };
  content?: string;
};

/** Public Greenhouse job boards. Config: { boards: ["companytoken", ...] } */
export const greenhouse: SourceAdapter = {
  kind: "GREENHOUSE",
  async fetchJobs(config) {
    const out: RawJob[] = [];
    for (const board of boardsOf(config)) {
      const data = await fetchJson<{ jobs?: GreenhouseJob[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
      );
      for (const j of data.jobs ?? []) {
        out.push({
          externalId: `${board}:${j.id}`,
          url: j.absolute_url,
          title: j.title,
          company: j.company_name ?? titleCase(board),
          location: j.location?.name,
          description: stripHtml(j.content ?? ""),
          postedAt: new Date(j.first_published ?? j.updated_at ?? Date.now()),
        });
      }
    }
    return out;
  },
};
