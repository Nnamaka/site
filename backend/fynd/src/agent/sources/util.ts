import { z } from "zod";
import { ExtractError } from "./types";

const UA = "FyndBot/1.0 (+https://fynd.nnamaka.com)";

export async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json,text/html;q=0.9" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as Error).name;
    throw new ExtractError(name === "TimeoutError" ? `Timed out after ${timeoutMs / 1000} s: ${url}` : `Network error: ${url}`);
  }
  if (res.status === 403 || res.status === 429) throw new ExtractError(`Blocked (${res.status}) by ${new URL(url).host}`);
  if (!res.ok) throw new ExtractError(`${res.status} from ${new URL(url).host}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ExtractError(`Unexpected response from ${new URL(url).host}`);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });

export const stripHtml = (html: string) =>
  decodeEntities(
    decodeEntities(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const boardsOf = (config: unknown) =>
  z.object({ boards: z.array(z.string()).default([]) }).catch({ boards: [] }).parse(config).boards;
export const urlsOf = (config: unknown) =>
  z.object({ urls: z.array(z.string()).default([]) }).catch({ urls: [] }).parse(config).urls;
