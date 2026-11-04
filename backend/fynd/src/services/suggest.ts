/** Similar-title suggestions for a role. Deterministic and offline; swap in an LLM call if you want broader coverage. */
const FAMILIES: string[][] = [
  ["AI Engineer", "Applied AI Engineer", "AI Agent Engineer", "GenAI Engineer", "AI Solutions Engineer"],
  ["Machine Learning Engineer", "ML Engineer", "MLOps Engineer", "ML Platform Engineer", "Applied Scientist"],
  ["LLM Engineer", "LLM Applications Engineer", "NLP Engineer", "Conversational AI Engineer"],
  ["Data Scientist", "Applied Scientist", "Machine Learning Scientist", "Decision Scientist", "Data Analyst"],
  ["Data Engineer", "Analytics Engineer", "Big Data Engineer", "Data Platform Engineer"],
  ["Software Engineer", "Software Developer", "Backend Engineer", "Full Stack Engineer"],
  ["Frontend Engineer", "Front-end Developer", "UI Engineer", "React Developer"],
  ["Backend Engineer", "Platform Engineer", "API Engineer", "Server Engineer"],
  ["Full Stack Engineer", "Full Stack Developer", "Software Engineer", "Product Engineer"],
  ["DevOps Engineer", "Site Reliability Engineer", "Platform Engineer", "Cloud Engineer"],
  ["Product Designer", "UX Designer", "UI/UX Designer", "Interaction Designer"],
  ["Product Manager", "Technical Product Manager", "Product Owner", "Group Product Manager"],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function suggestTitles(title: string, exclude: string[] = []): string[] {
  const t = norm(title);
  const skip = new Set([t, ...exclude.map(norm)]);
  const out = new Set<string>();
  for (const family of FAMILIES) {
    if (family.some((f) => norm(f) === t || ` ${t} `.includes(` ${norm(f)} `))) {
      for (const f of family) if (!skip.has(norm(f))) out.add(f);
    }
  }
  if (out.size === 0) {
    out.add(`Senior ${title}`);
    out.add(`Lead ${title}`);
  }
  return [...out].slice(0, 4);
}
