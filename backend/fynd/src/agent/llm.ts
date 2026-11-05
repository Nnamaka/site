import { env } from "../env";
import { errMsg } from "../lib/util";

/**
 * One interface over Claude, OpenAI and Gemini. Plain fetch, no SDKs.
 * AI_PROVIDER=auto picks the first key that is set (Anthropic → OpenAI → Gemini) and falls back
 * to the next configured provider if a call fails. Set AI_PROVIDER to force one.
 */
export type Provider = "anthropic" | "openai" | "gemini";
export type CompleteJsonInput = { system: string; user: string; maxTokens?: number };

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
};

// Free-tier Gemini allows only a few requests per minute, so space calls out by default.
const DEFAULT_MIN_INTERVAL_MS: Record<Provider, number> = { anthropic: 0, openai: 0, gemini: 7000 };

const keyFor = (p: Provider) => ({ anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY })[p];

export function configuredProviders(): Provider[] {
  const all: Provider[] = ["anthropic", "openai", "gemini"];
  const withKey = all.filter((p) => keyFor(p));
  if (env.AI_PROVIDER === "template") return [];
  if (env.AI_PROVIDER === "auto") return withKey;
  // forced provider first, the rest as fallbacks
  return [env.AI_PROVIDER, ...withKey.filter((p) => p !== env.AI_PROVIDER)].filter((p) => keyFor(p));
}

const modelFor = (p: Provider, isPrimary: boolean) => (isPrimary && env.AI_MODEL ? env.AI_MODEL : DEFAULT_MODEL[p]);

/* ───────── pacing + retry ───────── */

const lastCall: Partial<Record<Provider, number>> = {};
async function pace(p: Provider) {
  const gap = env.AI_MIN_INTERVAL_MS ?? DEFAULT_MIN_INTERVAL_MS[p];
  const wait = (lastCall[p] ?? 0) + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall[p] = Date.now();
}

class RetryableError extends Error {
  constructor(message: string, public retryAfterMs: number) {
    super(message);
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, label: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 429 || res.status === 503 || res.status === 529) {
    const ra = Number(res.headers.get("retry-after"));
    throw new RetryableError(`${label} ${res.status}`, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 20_000);
  }
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/* ───────── providers ───────── */

async function anthropic(model: string, i: CompleteJsonInput): Promise<string> {
  const data = (await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    { model, max_tokens: i.maxTokens ?? 6000, system: i.system, messages: [{ role: "user", content: i.user }] },
    "Anthropic",
  )) as { content: { type: string; text?: string }[] };
  return data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

async function openai(model: string, i: CompleteJsonInput): Promise<string> {
  const data = (await post(
    `${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`,
    { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    {
      model,
      max_completion_tokens: i.maxTokens ?? 6000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: i.system },
        { role: "user", content: i.user },
      ],
    },
    "OpenAI",
  )) as { choices: { message: { content: string | null } }[] };
  return data.choices[0]?.message.content ?? "";
}

async function gemini(model: string, i: CompleteJsonInput): Promise<string> {
  const data = (await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": env.GEMINI_API_KEY! },
    {
      systemInstruction: { parts: [{ text: i.system }] },
      contents: [{ role: "user", parts: [{ text: i.user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: i.maxTokens ?? 8192, temperature: 0.4 },
    },
    "Gemini",
  )) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

const CALL: Record<Provider, (model: string, i: CompleteJsonInput) => Promise<string>> = { anthropic, openai, gemini };

function parseJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in response");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/**
 * Sends one system+user prompt and parses a JSON object from the reply.
 * Tries each configured provider in order; each gets up to 3 attempts on rate limits.
 * Returns null when no provider is configured (caller uses its non-AI fallback).
 */
export async function completeJson<T>(input: CompleteJsonInput, validate: (v: T) => boolean = () => true): Promise<{ value: T; provider: Provider; model: string } | null> {
  const providers = configuredProviders();
  if (!providers.length) return null;
  const errors: string[] = [];
  for (const [idx, p] of providers.entries()) {
    const model = modelFor(p, idx === 0);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await pace(p);
        const value = parseJson<T>(await CALL[p](model, input));
        if (!validate(value)) throw new Error("Incomplete response");
        return { value, provider: p, model };
      } catch (e) {
        if (e instanceof RetryableError && attempt < 3) {
          await new Promise((r) => setTimeout(r, e.retryAfterMs));
          continue;
        }
        errors.push(`${p}: ${errMsg(e)}`);
        break;
      }
    }
  }
  throw new Error(errors.join(" | "));
}

export function describeAi() {
  const p = configuredProviders();
  return p.length ? `${p[0]} (${modelFor(p[0], true)})${p.length > 1 ? `, fallback ${p.slice(1).join(", ")}` : ""}` : "templates (no AI key)";
}
