import type { AtsBreakdown } from "@nnamaka/fynd-shared";
import type { RawJob } from "./sources";

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();

type RoleLike = { id: string; title: string; variants: { title: string }[] };

/** Exact title match against a role or one of its similar titles (word-boundary contains). */
export function matchRole(title: string, roles: RoleLike[]): string | null {
  const t = ` ${norm(title)} `;
  for (const r of roles) {
    for (const q of [r.title, ...r.variants.map((v) => v.title)]) {
      if (t.includes(` ${norm(q)} `)) return r.id;
    }
  }
  return null;
}

const JUNIOR = /\b(intern|internship|junior|jr|graduate|entry[- ]level|working student|apprentice)\b/i;

function locationMatches(pref: string, loc: string) {
  const p = pref.toLowerCase();
  const l = loc.toLowerCase();
  if (p.startsWith("remote")) {
    if (!/remote|anywhere|worldwide|distributed/.test(l)) return false;
    const region = p.split("·")[1]?.trim();
    if (!region || region === "worldwide") return true;
    return l.includes(region) || /worldwide|anywhere/.test(l) || (region === "eu" && /europe|emea/.test(l));
  }
  return l.includes(p.split(",")[0].trim());
}

/** Returns a reason when the job fails the campaign criteria, or null when it passes. */
export function rejectReason(job: RawJob, c: { locations: string[]; seniority: string; postedWithinDays: number }): string | null {
  if (job.postedAt && Date.now() - job.postedAt.getTime() > c.postedWithinDays * 86_400_000) return "too old";
  if (c.seniority !== "Any" && JUNIOR.test(job.title)) return "seniority";
  if (c.locations.length && !c.locations.some((l) => locationMatches(l, job.location ?? ""))) return "location";
  return null;
}

/** Campaign keywords that the job description mentions. These are what the ATS will look for. */
export const jobKeywords = (description: string, keywords: string[]) => {
  const d = description.toLowerCase();
  return keywords.filter((k) => d.includes(k.toLowerCase()));
};

/**
 * Heuristic ATS score for a document against a job: keyword coverage, title alignment,
 * experience overlap and formatting. Deterministic so scores are stable between runs.
 */
export function atsScore(doc: string, jdKeywords: string[], jobTitle: string, jobDescription: string): { score: number; breakdown: AtsBreakdown; matched: string[]; missing: string[] } {
  const d = doc.toLowerCase();
  const matched = jdKeywords.filter((k) => d.includes(k.toLowerCase()));
  const missing = jdKeywords.filter((k) => !matched.includes(k));
  const keywordCoverage = jdKeywords.length ? Math.round((matched.length / jdKeywords.length) * 100) : 70;

  const titleWords = norm(jobTitle).split(" ").filter((w) => w.length > 2);
  const titleAlignment = titleWords.length ? Math.round((titleWords.filter((w) => d.includes(w)).length / titleWords.length) * 100) : 70;

  const jdWords = new Set(norm(jobDescription).split(" ").filter((w) => w.length > 5));
  const docWords = new Set(norm(doc).split(" "));
  const overlap = [...jdWords].filter((w) => docWords.has(w)).length;
  const experience = jdWords.size ? Math.min(100, Math.round((overlap / Math.min(jdWords.size, 60)) * 100)) : 60;

  const formatting = doc.length < 200 ? 40 : /^#|\n#/.test(doc) ? 100 : 85;

  const score = Math.round(keywordCoverage * 0.45 + titleAlignment * 0.2 + experience * 0.25 + formatting * 0.1);
  return { score: Math.max(0, Math.min(100, score)), breakdown: { keywordCoverage, titleAlignment, experience, formatting }, matched, missing };
}
