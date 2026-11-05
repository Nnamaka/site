import { errMsg } from "../lib/util";
import { completeJson } from "./llm";

export type TailorInput = {
  job: { title: string; company: string; description: string; location?: string | null };
  cvText: string;
  keywords: string[];
  candidateName: string;
};
export type Tailored = { cv: string; resume: string; coverLetter: string };

/** Tailors the base CV to one job with whichever AI provider is configured (see llm.ts), otherwise a template. */
export async function tailor(input: TailorInput): Promise<Tailored> {
  try {
    const out = await completeJson<Partial<Tailored>>(
      { system: SYSTEM, user: userPrompt(input), maxTokens: 6000 },
      (v) => Boolean(v.cv && v.coverLetter),
    );
    if (out) return { cv: out.value.cv!, resume: out.value.resume ?? out.value.cv!, coverLetter: out.value.coverLetter! };
  } catch (e) {
    console.warn("[tailor] AI failed, using template:", errMsg(e));
  }
  return tailorTemplate(input);
}

const SYSTEM = `You tailor job application documents.
Rules:
- Only use facts from the candidate's base CV. Never invent employers, titles, dates, degrees or metrics.
- Reorder, rephrase and emphasise to match the job description and the listed keywords where truthful.
- Output Markdown. CV: full, ATS-friendly, single column. Resume: one page summary. Cover letter: under 350 words, specific to the company.
- Respond with JSON only: {"cv": string, "resume": string, "coverLetter": string}`;

const userPrompt = (i: TailorInput) =>
  `Candidate: ${i.candidateName}\n\nKeywords: ${i.keywords.join(", ")}\n\nJob: ${i.job.title} at ${i.job.company}${i.job.location ? ` (${i.job.location})` : ""}\n\n<job_description>\n${i.job.description.slice(0, 12_000)}\n</job_description>\n\n<base_cv>\n${i.cvText.slice(0, 12_000) || "(no CV uploaded)"}\n</base_cv>`;

function tailorTemplate({ job, cvText, keywords, candidateName }: TailorInput): Tailored {
  const relevant = keywords.filter((k) => job.description.toLowerCase().includes(k.toLowerCase()));
  const summary = `${job.title} candidate with hands-on experience in ${relevant.slice(0, 5).join(", ") || "the core skills this role needs"}.`;
  const cv = `# ${candidateName}\n\n## Summary\n${summary}\n\n## Key skills\n${relevant.map((k) => `- ${k}`).join("\n") || "- See experience below"}\n\n${cvText.trim() || "## Experience\n_Upload your base CV in Settings → Account so Fynd can tailor it._"}\n`;
  const resume = `# ${candidateName}\n\n**Target role:** ${job.title} at ${job.company}\n\n${summary}\n\n**Skills:** ${relevant.join(" · ") || "—"}\n`;
  const coverLetter = `Dear ${job.company} hiring team,\n\nI'm applying for the ${job.title} role${job.location ? ` (${job.location})` : ""}. ${summary}\n\nWhat draws me to ${job.company} is the chance to apply ${relevant[0] ?? "my experience"} to problems your team is solving today. I'd welcome the chance to discuss how I can contribute.\n\nKind regards,\n${candidateName}\n`;
  return { cv, resume, coverLetter };
}
