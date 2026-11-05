import "dotenv/config";
import { z } from "zod";

const flag = (fallback: "true" | "false") =>
  z.enum(["true", "false"]).default(fallback).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FYND_HOST: z.string().default("127.0.0.1"),
  FYND_PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  TRUSTED_ORIGINS: z.string().default(""),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  MAX_ACCOUNTS: z.coerce.number().int().min(1).default(7),
  INVITE_EMAILS: z.string().default(""),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("Fynd <fynd@example.com>"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().default("FyndJobsBot"),
  TELEGRAM_MODE: z.enum(["polling", "webhook", "off"]).default("polling"),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  // AI provider for document tailoring. auto = first key set (Anthropic → OpenAI → Gemini), others are fallbacks.
  AI_PROVIDER: z.enum(["auto", "anthropic", "openai", "gemini", "template"]).default("auto"),
  // Model for the primary provider. Empty = provider default (see agent/llm.ts). TAILOR_MODEL is the old name.
  AI_MODEL: z.string().optional().transform((v) => v || process.env.TAILOR_MODEL || undefined),
  AI_MIN_INTERVAL_MS: z.coerce.number().int().min(0).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  GEMINI_API_KEY: z.string().optional(),
  AGENT_ENABLED: flag("false"),
  AGENT_INTERVAL_MINUTES: z.coerce.number().min(1).default(30),
  AGENT_MAX_NEW_PER_RUN: z.coerce.number().min(1).default(25),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("[fynd] invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
