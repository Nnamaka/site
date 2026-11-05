// src/index.ts
import { serve } from "@hono/node-server";

// src/env.ts
import "dotenv/config";
import { z } from "zod";
var flag = (fallback) => z.enum(["true", "false"]).default(fallback).transform((v) => v === "true");
var schema = z.object({
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
  AI_MODEL: z.string().optional().transform((v) => v || process.env.TAILOR_MODEL || void 0),
  AI_MIN_INTERVAL_MS: z.coerce.number().int().min(0).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  GEMINI_API_KEY: z.string().optional(),
  AGENT_ENABLED: flag("false"),
  AGENT_INTERVAL_MINUTES: z.coerce.number().min(1).default(30),
  AGENT_MAX_NEW_PER_RUN: z.coerce.number().min(1).default(25)
});
var parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("[fynd] invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
var env = parsed.data;
var isProd = env.NODE_ENV === "production";
var csv = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

// src/lib/util.ts
var DAY = 864e5;
var startOfDayUTC = (d = /* @__PURE__ */ new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
var startOfMonthUTC = (d = /* @__PURE__ */ new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
var daysInMonthUTC = (d = /* @__PURE__ */ new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
var addDays = (d, n) => new Date(d.getTime() + n * DAY);
var isoDay = (d) => d.toISOString().slice(0, 10);
var errMsg = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

// src/agent/llm.ts
var DEFAULT_MODEL = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash"
};
var DEFAULT_MIN_INTERVAL_MS = { anthropic: 0, openai: 0, gemini: 7e3 };
var keyFor = (p) => ({ anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY })[p];
function configuredProviders() {
  const all = ["anthropic", "openai", "gemini"];
  const withKey = all.filter((p) => keyFor(p));
  if (env.AI_PROVIDER === "template") return [];
  if (env.AI_PROVIDER === "auto") return withKey;
  return [env.AI_PROVIDER, ...withKey.filter((p) => p !== env.AI_PROVIDER)].filter((p) => keyFor(p));
}
var modelFor = (p, isPrimary) => isPrimary && env.AI_MODEL ? env.AI_MODEL : DEFAULT_MODEL[p];
var lastCall = {};
async function pace(p) {
  const gap = env.AI_MIN_INTERVAL_MS ?? DEFAULT_MIN_INTERVAL_MS[p];
  const wait = (lastCall[p] ?? 0) + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall[p] = Date.now();
}
var RetryableError = class extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
  retryAfterMs;
};
async function post(url, headers, body, label) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12e4)
  });
  if (res.status === 429 || res.status === 503 || res.status === 529) {
    const ra = Number(res.headers.get("retry-after"));
    throw new RetryableError(`${label} ${res.status}`, Number.isFinite(ra) && ra > 0 ? ra * 1e3 : 2e4);
  }
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function anthropic(model, i) {
  const data = await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    { model, max_tokens: i.maxTokens ?? 6e3, system: i.system, messages: [{ role: "user", content: i.user }] },
    "Anthropic"
  );
  return data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}
async function openai(model, i) {
  const data = await post(
    `${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`,
    { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    {
      model,
      max_completion_tokens: i.maxTokens ?? 6e3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: i.system },
        { role: "user", content: i.user }
      ]
    },
    "OpenAI"
  );
  return data.choices[0]?.message.content ?? "";
}
async function gemini(model, i) {
  const data = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": env.GEMINI_API_KEY },
    {
      systemInstruction: { parts: [{ text: i.system }] },
      contents: [{ role: "user", parts: [{ text: i.user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: i.maxTokens ?? 8192, temperature: 0.4 }
    },
    "Gemini"
  );
  if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}
var CALL = { anthropic, openai, gemini };
function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}
async function completeJson(input, validate = () => true) {
  const providers = configuredProviders();
  if (!providers.length) return null;
  const errors = [];
  for (const [idx, p] of providers.entries()) {
    const model = modelFor(p, idx === 0);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await pace(p);
        const value = parseJson(await CALL[p](model, input));
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
function describeAi() {
  const p = configuredProviders();
  return p.length ? `${p[0]} (${modelFor(p[0], true)})${p.length > 1 ? `, fallback ${p.slice(1).join(", ")}` : ""}` : "templates (no AI key)";
}

// ../../packages/fynd-shared/src/index.ts
import { z as z2 } from "zod";
var MAX_ROLES = 3;
var AUTO_APPLY_MIN_ATS = 90;
var JOB_OUTCOMES = ["NONE", "REPLIED", "REJECTED", "INTERVIEW", "OFFER"];
var OUTCOME_LABEL = {
  NONE: "No reply yet",
  REPLIED: "Heard back",
  REJECTED: "Rejected",
  INTERVIEW: "Interviewing",
  OFFER: "Offer"
};
var JOB_TABS = ["all", "awaiting", "applied", "issues"];
var jobsQuerySchema = z2.object({
  tab: z2.enum(JOB_TABS).default("all"),
  role: z2.string().default("all"),
  q: z2.string().trim().default(""),
  page: z2.coerce.number().int().min(1).default(1),
  pageSize: z2.coerce.number().int().min(1).max(100).default(10)
});
var overviewQuerySchema = z2.object({ range: z2.enum(["month", "7d"]).default("month") });
var outcomeSchema = z2.object({ outcome: z2.enum(JOB_OUTCOMES) });
var campaignPatchSchema = z2.object({
  name: z2.string().trim().min(1).max(60).optional(),
  status: z2.enum(["RUNNING", "PAUSED"]).optional(),
  locations: z2.array(z2.string().min(1)).max(6).optional(),
  seniority: z2.string().optional(),
  minAts: z2.number().int().min(0).max(100).optional(),
  postedWithinDays: z2.number().int().min(1).max(60).optional(),
  autoApply: z2.boolean().optional()
});
var titleSchema = z2.object({ title: z2.string().trim().min(2).max(80) });
var rolePatchSchema = z2.object({
  title: z2.string().trim().min(2).max(80).optional(),
  monthlyTarget: z2.number().int().min(1).max(1e5).optional()
});
var keywordSchema = z2.object({ value: z2.string().trim().min(1).max(40) });
var flowNodeSchema = z2.object({
  id: z2.string(),
  position: z2.object({ x: z2.number(), y: z2.number() }),
  data: z2.object({ title: z2.string(), sub: z2.string(), icon: z2.string() })
});
var flowEdgeSchema = z2.object({ id: z2.string(), source: z2.string(), target: z2.string() });
var flowSchema = z2.object({ nodes: z2.array(flowNodeSchema).max(60), edges: z2.array(flowEdgeSchema).max(200) });
var sourceConfigSchema = z2.object({
  boards: z2.array(z2.string().trim().min(1)).optional(),
  urls: z2.array(z2.string().url()).optional()
});
var sourcePatchSchema = z2.object({ enabled: z2.boolean().optional(), config: sourceConfigSchema.optional() });
var notificationsPatchSchema = z2.object({
  telegramEnabled: z2.boolean().optional(),
  telegramShowStats: z2.boolean().optional(),
  emailEnabled: z2.boolean().optional()
});
var DEFAULT_FLOW = {
  nodes: [
    { id: "sources", position: { x: 0, y: 160 }, data: { title: "Job sources", sub: "Every 30 min", icon: "globe" } },
    { id: "search", position: { x: 230, y: 160 }, data: { title: "Search roles", sub: "Roles + similar titles", icon: "search" } },
    { id: "match", position: { x: 460, y: 160 }, data: { title: "Match & filter", sub: "Exact match \xB7 min ATS", icon: "filter" } },
    { id: "tailor", position: { x: 690, y: 160 }, data: { title: "Tailor documents", sub: "CV, resume, cover letter", icon: "file-text" } },
    { id: "telegram", position: { x: 930, y: 60 }, data: { title: "Telegram alert", sub: "Includes x/y per role", icon: "send" } },
    { id: "approval", position: { x: 930, y: 260 }, data: { title: "Wait for approval", sub: "You approve in Fynd", icon: "user-check" } },
    { id: "apply", position: { x: 1170, y: 260 }, data: { title: "Auto-apply", sub: "Submit on the source", icon: "zap" } }
  ],
  edges: [
    { id: "e1", source: "sources", target: "search" },
    { id: "e2", source: "search", target: "match" },
    { id: "e3", source: "match", target: "tailor" },
    { id: "e4", source: "tailor", target: "telegram" },
    { id: "e5", source: "tailor", target: "approval" },
    { id: "e6", source: "approval", target: "apply" }
  ]
};

// src/db.ts
import { PrismaClient } from "@prisma/client";
var globalForPrisma = globalThis;
var db = globalForPrisma.prisma ?? new PrismaClient({ log: isProd ? ["error"] : ["warn", "error"] });
if (!isProd) globalForPrisma.prisma = db;

// src/services/telegram.ts
import { createHash, randomInt } from "crypto";

// src/lib/mail.ts
async function sendMail({ to, subject, text }) {
  if (!env.RESEND_API_KEY) {
    console.log(`
\u250C\u2500 [mail:dev] to ${to}
\u2502  ${subject}
\u2502  ${text.replace(/\n/g, "\n\u2502  ")}
\u2514\u2500
`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text })
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text()}`);
}

// src/services/campaign.ts
var APPLIED_STATUSES = ["APPLIED", "APPLIED_MANUALLY"];
function seasonName(d = /* @__PURE__ */ new Date()) {
  const m = d.getUTCMonth();
  const season = m === 11 || m < 2 ? "Winter" : m < 5 ? "Spring" : m < 8 ? "Summer" : "Autumn";
  return `${season} search`;
}
var defaultFlowData = () => ({
  nodes: DEFAULT_FLOW.nodes,
  edges: DEFAULT_FLOW.edges
});
async function getActiveCampaign(userId) {
  const existing = await db.campaign.findFirst({
    where: { userId, status: { not: "ENDED" } },
    orderBy: { startedAt: "desc" }
  });
  if (existing) return existing;
  return db.campaign.create({ data: { userId, name: seasonName(), flow: { create: defaultFlowData() } } });
}

// src/services/telegram.ts
var telegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN);
async function tg(method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === "getUpdates" ? 4e4 : 1e4)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var say = (chatId, text, extra = {}) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
async function roleStatsLine(userId) {
  const campaign2 = await getActiveCampaign(userId);
  const roles = await db.role.findMany({ where: { campaignId: campaign2.id }, orderBy: { position: "asc" } });
  const counts = await db.job.groupBy({
    by: ["roleId", "status"],
    where: { campaignId: campaign2.id, foundAt: { gte: startOfMonthUTC() } },
    _count: { _all: true }
  });
  const fmt = (n) => n.toLocaleString("en-US");
  return roles.map((r) => {
    const mine = counts.filter((c) => c.roleId === r.id);
    const found = mine.reduce((a, c) => a + c._count._all, 0);
    const applied = mine.filter((c) => APPLIED_STATUSES.includes(c.status)).reduce((a, c) => a + c._count._all, 0);
    return `${r.title} ${fmt(applied)}/${fmt(found)}`;
  }).join(" \xB7 ");
}
async function notifyApplicationReady(jobId) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { role: true, user: { include: { notifications: true, telegram: true } } }
  });
  if (!job) return;
  const prefs = job.user.notifications;
  const link = `${env.APP_URL}/jobs/${job.id}`;
  const meta = [job.location, job.salary, job.atsScore != null ? `ATS ${job.atsScore}` : null].filter(Boolean).join(" \xB7 ");
  const stats = prefs?.telegramShowStats ? await roleStatsLine(job.userId) : "";
  if (job.user.telegram && prefs?.telegramEnabled !== false) {
    const text = [
      `<b>Application ready \xB7 ${esc(job.role?.title ?? "Job")}</b>`,
      `${esc(job.title)} at ${esc(job.company)}`,
      meta && `<i>${esc(meta)}</i>`,
      stats && `<code>${esc(stats)}</code>`
    ].filter(Boolean).join("\n");
    await say(job.user.telegram.chatId, text, { reply_markup: { inline_keyboard: [[{ text: "Review in Fynd", url: link }]] } }).catch(
      (e) => console.warn("[telegram] alert failed:", errMsg(e))
    );
  }
  if (prefs?.emailEnabled) {
    await sendMail({
      to: job.user.email,
      subject: `Application ready: ${job.title} at ${job.company}`,
      text: `${job.title} at ${job.company}
${meta}

Review and approve: ${link}${stats ? `

${stats}` : ""}`
    }).catch((e) => console.warn("[mail] alert failed:", errMsg(e)));
  }
}
var hash = (code, chatId) => createHash("sha256").update(`${chatId}:${code}`).digest("hex");
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const link = await db.telegramLink.findUnique({ where: { chatId }, include: { user: true } });
  if (text.startsWith("/stats")) {
    if (!link) return say(chatId, "Link your Fynd account first: send /start.");
    return say(chatId, `<b>Applied / found this month</b>
<code>${esc(await roleStatsLine(link.userId) || "No roles yet")}</code>`);
  }
  if (text.startsWith("/unlink")) {
    if (!link) return say(chatId, "This chat isn't linked to a Fynd account.");
    await db.telegramLink.delete({ where: { chatId } });
    return say(chatId, "Unlinked. You won't get alerts here any more.");
  }
  if (text.startsWith("/start")) {
    if (link) return say(chatId, `Linked to <b>${esc(link.user.email)}</b>.
/stats shows applied/found per role. /unlink stops alerts.`);
    await db.telegramPending.upsert({ where: { chatId }, update: { email: null, codeHash: null, attempts: 0 }, create: { chatId } });
    return say(chatId, "Hi, I'm the Fynd bot. Send the email address you use for Fynd.");
  }
  if (link) return say(chatId, "You're linked. /stats shows applied/found per role.");
  const pending = await db.telegramPending.findUnique({ where: { chatId } });
  if (EMAIL_RE.test(text)) {
    const email = text.toLowerCase();
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return say(chatId, "No Fynd account uses that email. Check it and send it again.");
    const code = String(randomInt(0, 1e6)).padStart(6, "0");
    await db.telegramPending.upsert({
      where: { chatId },
      update: { email, codeHash: hash(code, chatId), expiresAt: new Date(Date.now() + 6e5), attempts: 0 },
      create: { chatId, email, codeHash: hash(code, chatId), expiresAt: new Date(Date.now() + 6e5) }
    });
    await sendMail({ to: email, subject: `${code} links Telegram to Fynd`, text: `Send ${code} to the Fynd bot in Telegram to turn on alerts.
It expires in 10 minutes.` });
    return say(chatId, `I emailed a 6-digit code to <b>${esc(email)}</b>. Send it here.`);
  }
  if (/^\d{6}$/.test(text)) {
    if (!pending?.email || !pending.codeHash || !pending.expiresAt) return say(chatId, "Send your Fynd email first.");
    if (pending.expiresAt < /* @__PURE__ */ new Date() || pending.attempts >= 5) {
      await db.telegramPending.update({ where: { chatId }, data: { codeHash: null, expiresAt: null } });
      return say(chatId, "That code expired. Send your email again for a new one.");
    }
    if (hash(text, chatId) !== pending.codeHash) {
      await db.telegramPending.update({ where: { chatId }, data: { attempts: { increment: 1 } } });
      return say(chatId, "That code doesn't match. Try again.");
    }
    const user = await db.user.findUniqueOrThrow({ where: { email: pending.email } });
    await db.$transaction([
      db.telegramLink.deleteMany({ where: { OR: [{ userId: user.id }, { chatId }] } }),
      db.telegramLink.create({ data: { userId: user.id, chatId, username: msg.from?.username ?? null } }),
      db.telegramPending.delete({ where: { chatId } })
    ]);
    return say(chatId, "Linked. You'll get an alert for every application Fynd prepares.\n/stats shows applied/found per role.");
  }
  return say(chatId, pending?.email ? "Send the 6-digit code from your email." : "Send /start to link your Fynd account.");
}
async function telegramWebhook(c) {
  if (env.TELEGRAM_WEBHOOK_SECRET && c.req.header("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ ok: false }, 401);
  }
  const update = await c.req.json();
  handleUpdate(update).catch((e) => console.error("[telegram]", errMsg(e)));
  return c.json({ ok: true });
}
var polling = false;
function startTelegram() {
  if (!telegramConfigured() || env.TELEGRAM_MODE !== "polling") return;
  polling = true;
  (async () => {
    await tg("deleteWebhook", {}).catch(() => {
    });
    let offset = 0;
    while (polling) {
      try {
        const updates = await tg("getUpdates", { offset, timeout: 30 }) ?? [];
        for (const u of updates) {
          offset = u.update_id + 1;
          await handleUpdate(u).catch((e) => console.error("[telegram]", errMsg(e)));
        }
      } catch (e) {
        console.warn("[telegram] poll:", errMsg(e));
        await new Promise((r) => setTimeout(r, 5e3));
      }
    }
  })();
}
var stopTelegram = () => {
  polling = false;
};

// src/agent/match.ts
var norm = (s) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
function matchRole(title, roles) {
  const t = ` ${norm(title)} `;
  for (const r of roles) {
    for (const q of [r.title, ...r.variants.map((v) => v.title)]) {
      if (t.includes(` ${norm(q)} `)) return r.id;
    }
  }
  return null;
}
var JUNIOR = /\b(intern|internship|junior|jr|graduate|entry[- ]level|working student|apprentice)\b/i;
function locationMatches(pref, loc) {
  const p = pref.toLowerCase();
  const l = loc.toLowerCase();
  if (p.startsWith("remote")) {
    if (!/remote|anywhere|worldwide|distributed/.test(l)) return false;
    const region = p.split("\xB7")[1]?.trim();
    if (!region || region === "worldwide") return true;
    return l.includes(region) || /worldwide|anywhere/.test(l) || region === "eu" && /europe|emea/.test(l);
  }
  return l.includes(p.split(",")[0].trim());
}
function rejectReason(job, c) {
  if (job.postedAt && Date.now() - job.postedAt.getTime() > c.postedWithinDays * 864e5) return "too old";
  if (c.seniority !== "Any" && JUNIOR.test(job.title)) return "seniority";
  if (c.locations.length && !c.locations.some((l) => locationMatches(l, job.location ?? ""))) return "location";
  return null;
}
var jobKeywords = (description, keywords) => {
  const d = description.toLowerCase();
  return keywords.filter((k) => d.includes(k.toLowerCase()));
};
function atsScore(doc, jdKeywords, jobTitle, jobDescription) {
  const d = doc.toLowerCase();
  const matched = jdKeywords.filter((k) => d.includes(k.toLowerCase()));
  const missing = jdKeywords.filter((k) => !matched.includes(k));
  const keywordCoverage = jdKeywords.length ? Math.round(matched.length / jdKeywords.length * 100) : 70;
  const titleWords = norm(jobTitle).split(" ").filter((w) => w.length > 2);
  const titleAlignment = titleWords.length ? Math.round(titleWords.filter((w) => d.includes(w)).length / titleWords.length * 100) : 70;
  const jdWords = new Set(norm(jobDescription).split(" ").filter((w) => w.length > 5));
  const docWords = new Set(norm(doc).split(" "));
  const overlap = [...jdWords].filter((w) => docWords.has(w)).length;
  const experience = jdWords.size ? Math.min(100, Math.round(overlap / Math.min(jdWords.size, 60) * 100)) : 60;
  const formatting = doc.length < 200 ? 40 : /^#|\n#/.test(doc) ? 100 : 85;
  const score = Math.round(keywordCoverage * 0.45 + titleAlignment * 0.2 + experience * 0.25 + formatting * 0.1);
  return { score: Math.max(0, Math.min(100, score)), breakdown: { keywordCoverage, titleAlignment, experience, formatting }, matched, missing };
}

// src/agent/sources/util.ts
import { z as z3 } from "zod";

// src/agent/sources/types.ts
var ExtractError = class extends Error {
};

// src/agent/sources/util.ts
var UA = "FyndBot/1.0 (+https://fynd.nnamaka.com)";
async function fetchText(url, timeoutMs = 2e4) {
  let res;
  try {
    res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json,text/html;q=0.9" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = e.name;
    throw new ExtractError(name === "TimeoutError" ? `Timed out after ${timeoutMs / 1e3} s: ${url}` : `Network error: ${url}`);
  }
  if (res.status === 403 || res.status === 429) throw new ExtractError(`Blocked (${res.status}) by ${new URL(url).host}`);
  if (!res.ok) throw new ExtractError(`${res.status} from ${new URL(url).host}`);
  return res.text();
}
async function fetchJson(url) {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new ExtractError(`Unexpected response from ${new URL(url).host}`);
  }
}
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
var decodeEntities = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? m;
});
var stripHtml = (html) => decodeEntities(
  decodeEntities(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "\u2022 ").replace(/<[^>]+>/g, "")
).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
var titleCase = (s) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
var boardsOf = (config) => z3.object({ boards: z3.array(z3.string()).default([]) }).catch({ boards: [] }).parse(config).boards;

// src/agent/sources/ashby.ts
var ashby = {
  kind: "ASHBY",
  async fetchJobs(config) {
    const out = [];
    for (const org of boardsOf(config)) {
      const data = await fetchJson(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`
      );
      for (const j of data.jobs ?? []) {
        out.push({
          externalId: `${org}:${j.id}`,
          url: j.jobUrl,
          title: j.title,
          company: titleCase(org),
          location: [j.isRemote ? "Remote" : null, j.location].filter(Boolean).join(" \xB7 ") || void 0,
          salary: j.compensation?.compensationTierSummary,
          description: j.descriptionPlain ?? "",
          postedAt: j.publishedAt ? new Date(j.publishedAt) : void 0
        });
      }
    }
    return out;
  }
};

// src/agent/sources/career-page.ts
var isPosting = (x) => Array.isArray(x["@type"]) ? x["@type"].includes("JobPosting") : x["@type"] === "JobPosting";
var careerPage = {
  kind: "CAREER_PAGE",
  async fetchJobs(config) {
    const urls = config?.urls ?? [];
    const out = [];
    for (const url of urls) {
      const html = await fetchText(url, 3e4);
      const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
      const postings = [];
      for (const b of blocks) {
        try {
          const parsed2 = JSON.parse(b.trim());
          const list = Array.isArray(parsed2) ? parsed2 : parsed2["@graph"] ?? [parsed2];
          postings.push(...list.filter(isPosting));
        } catch {
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
          salary: v?.minValue && v?.maxValue ? `${p.baseSalary?.currency ?? ""} ${Math.round(v.minValue / 1e3)}k\u2013${Math.round(v.maxValue / 1e3)}k`.trim() : void 0,
          description: stripHtml(p.description ?? ""),
          postedAt: p.datePosted ? new Date(p.datePosted) : void 0
        });
      }
    }
    return out;
  }
};

// src/agent/sources/greenhouse.ts
var greenhouse = {
  kind: "GREENHOUSE",
  async fetchJobs(config) {
    const out = [];
    for (const board of boardsOf(config)) {
      const data = await fetchJson(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`
      );
      for (const j of data.jobs ?? []) {
        out.push({
          externalId: `${board}:${j.id}`,
          url: j.absolute_url,
          title: j.title,
          company: j.company_name ?? titleCase(board),
          location: j.location?.name,
          description: stripHtml(j.content ?? ""),
          postedAt: new Date(j.first_published ?? j.updated_at ?? Date.now())
        });
      }
    }
    return out;
  }
};

// src/agent/sources/lever.ts
var lever = {
  kind: "LEVER",
  async fetchJobs(config) {
    const out = [];
    for (const company of boardsOf(config)) {
      const postings = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
      for (const p of postings) {
        const s = p.salaryRange;
        out.push({
          externalId: `${company}:${p.id}`,
          url: p.hostedUrl,
          title: p.text,
          company: titleCase(company),
          location: p.categories?.location,
          salary: s?.min && s?.max ? `${s.currency ?? ""} ${Math.round(s.min / 1e3)}k\u2013${Math.round(s.max / 1e3)}k`.trim() : void 0,
          description: [p.descriptionPlain, ...(p.lists ?? []).map((l) => `${l.text}
${l.content.replace(/<[^>]+>/g, " ")}`), p.additionalPlain].filter(Boolean).join("\n\n"),
          postedAt: p.createdAt ? new Date(p.createdAt) : void 0
        });
      }
    }
    return out;
  }
};

// src/agent/sources/remoteok.ts
var remoteok = {
  kind: "REMOTEOK",
  async fetchJobs() {
    const items = await fetchJson("https://remoteok.com/api");
    return items.filter((i) => Boolean(i.id && i.position && i.url)).map((i) => ({
      externalId: String(i.id),
      url: i.url,
      title: i.position,
      company: i.company ?? "Unknown",
      location: `Remote${i.location ? ` \xB7 ${i.location}` : ""}`,
      salary: i.salary_min && i.salary_max ? `$${Math.round(i.salary_min / 1e3)}k\u2013${Math.round(i.salary_max / 1e3)}k` : void 0,
      description: stripHtml(i.description ?? ""),
      postedAt: i.date ? new Date(i.date) : void 0
    }));
  }
};

// src/agent/sources/index.ts
var adapters = {
  GREENHOUSE: greenhouse,
  LEVER: lever,
  ASHBY: ashby,
  REMOTEOK: remoteok,
  CAREER_PAGE: careerPage
};

// src/agent/tailor.ts
async function tailor(input) {
  try {
    const out = await completeJson(
      { system: SYSTEM, user: userPrompt(input), maxTokens: 6e3 },
      (v) => Boolean(v.cv && v.coverLetter)
    );
    if (out) return { cv: out.value.cv, resume: out.value.resume ?? out.value.cv, coverLetter: out.value.coverLetter };
  } catch (e) {
    console.warn("[tailor] AI failed, using template:", errMsg(e));
  }
  return tailorTemplate(input);
}
var SYSTEM = `You tailor job application documents.
Rules:
- Only use facts from the candidate's base CV. Never invent employers, titles, dates, degrees or metrics.
- Reorder, rephrase and emphasise to match the job description and the listed keywords where truthful.
- Output Markdown. CV: full, ATS-friendly, single column. Resume: one page summary. Cover letter: under 350 words, specific to the company.
- Respond with JSON only: {"cv": string, "resume": string, "coverLetter": string}`;
var userPrompt = (i) => `Candidate: ${i.candidateName}

Keywords: ${i.keywords.join(", ")}

Job: ${i.job.title} at ${i.job.company}${i.job.location ? ` (${i.job.location})` : ""}

<job_description>
${i.job.description.slice(0, 12e3)}
</job_description>

<base_cv>
${i.cvText.slice(0, 12e3) || "(no CV uploaded)"}
</base_cv>`;
function tailorTemplate({ job, cvText, keywords, candidateName }) {
  const relevant = keywords.filter((k) => job.description.toLowerCase().includes(k.toLowerCase()));
  const summary = `${job.title} candidate with hands-on experience in ${relevant.slice(0, 5).join(", ") || "the core skills this role needs"}.`;
  const cv = `# ${candidateName}

## Summary
${summary}

## Key skills
${relevant.map((k) => `- ${k}`).join("\n") || "- See experience below"}

${cvText.trim() || "## Experience\n_Upload your base CV in Settings \u2192 Account so Fynd can tailor it._"}
`;
  const resume = `# ${candidateName}

**Target role:** ${job.title} at ${job.company}

${summary}

**Skills:** ${relevant.join(" \xB7 ") || "\u2014"}
`;
  const coverLetter = `Dear ${job.company} hiring team,

I'm applying for the ${job.title} role${job.location ? ` (${job.location})` : ""}. ${summary}

What draws me to ${job.company} is the chance to apply ${relevant[0] ?? "my experience"} to problems your team is solving today. I'd welcome the chance to discuss how I can contribute.

Kind regards,
${candidateName}
`;
  return { cv, resume, coverLetter };
}

// src/agent/runner.ts
var campaignInclude = { roles: { include: { variants: true } }, keywords: true };
var slug = (s) => s.replace(/[^A-Za-z0-9]+/g, "");
var timer;
var running = false;
function startAgent() {
  if (!env.AGENT_ENABLED) return;
  const tick = () => runOnce().catch((e) => console.error("[agent]", errMsg(e)));
  setTimeout(tick, 15e3);
  timer = setInterval(tick, env.AGENT_INTERVAL_MINUTES * 6e4);
}
var stopAgent = () => timer && clearInterval(timer);
async function runOnce() {
  if (running) return;
  running = true;
  const started = Date.now();
  let created = 0;
  try {
    const campaigns = await db.campaign.findMany({ where: { status: "RUNNING" }, include: campaignInclude });
    for (const c of campaigns) {
      if (!c.roles.length) continue;
      const sources2 = await db.source.findMany({ where: { userId: c.userId, enabled: true } });
      let budget = env.AGENT_MAX_NEW_PER_RUN;
      for (const s of sources2) {
        if (budget <= 0) break;
        const n = await runSource(c, s, budget);
        budget -= n;
        created += n;
      }
    }
  } finally {
    running = false;
    console.log(`[agent] run finished: ${created} new jobs in ${Math.round((Date.now() - started) / 1e3)}s`);
  }
}
async function runSource(c, s, budget = env.AGENT_MAX_NEW_PER_RUN) {
  const queries = c.roles.flatMap((r) => [r.title, ...r.variants.map((v) => v.title)]);
  let raws;
  try {
    raws = await adapters[s.kind].fetchJobs(s.config, { queries });
  } catch (e) {
    await db.source.update({ where: { id: s.id }, data: { health: "EXTRACT_FAILING", lastError: errMsg(e), lastRunAt: /* @__PURE__ */ new Date() } });
    return 0;
  }
  const keepApplyIssue = s.health === "APPLY_FAILING";
  await db.source.update({
    where: { id: s.id },
    data: { health: keepApplyIssue ? "APPLY_FAILING" : "HEALTHY", lastError: keepApplyIssue ? s.lastError : null, lastRunAt: /* @__PURE__ */ new Date() }
  });
  let created = 0;
  for (const raw of raws) {
    if (created >= budget) break;
    const roleId = matchRole(raw.title, c.roles);
    if (!roleId || rejectReason(raw, c)) continue;
    const exists = await db.job.findUnique({
      where: { userId_sourceId_externalId: { userId: c.userId, sourceId: s.id, externalId: raw.externalId } },
      select: { id: true }
    });
    if (exists) continue;
    const thin = raw.description.length < 300;
    const job = await db.job.create({
      data: {
        userId: c.userId,
        campaignId: c.id,
        roleId,
        sourceId: s.id,
        externalId: raw.externalId,
        url: raw.url,
        title: raw.title,
        company: raw.company,
        location: raw.location,
        salary: raw.salary,
        description: raw.description,
        postedAt: raw.postedAt,
        issueKind: thin ? "EXTRACT" : null,
        issueMessage: thin ? `Only part of the description could be read from ${s.name}. Documents may be less tailored.` : null,
        events: { create: { type: "found", message: `Found on ${s.name}` } }
      }
    });
    created++;
    await prepareJob(job.id).catch((e) => console.error("[agent] prepare", job.id, errMsg(e)));
  }
  return created;
}
async function prepareJob(jobId) {
  const job = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { campaign: { include: { keywords: true } }, user: { include: { baseCv: true } }, source: true }
  });
  await db.job.update({ where: { id: jobId }, data: { status: "PREPARING" } });
  try {
    const keywords = job.campaign.keywords.map((k) => k.value);
    const cvText = job.user.baseCv?.text ?? "";
    const docs = await tailor({ job, cvText, keywords, candidateName: job.user.name || job.user.email });
    const jd = jobKeywords(job.description, keywords);
    const base = atsScore(cvText, jd, job.title, job.description);
    const cv = atsScore(docs.cv, jd, job.title, job.description);
    const resume = atsScore(docs.resume, jd, job.title, job.description);
    const name = slug(job.user.name || "Candidate");
    const co = slug(job.company);
    await db.$transaction([
      db.document.deleteMany({ where: { jobId } }),
      db.document.createMany({
        data: [
          { jobId, kind: "CV", fileName: `${name}_CV_${co}.md`, content: docs.cv, atsScore: cv.score },
          { jobId, kind: "RESUME", fileName: `${name}_Resume_${co}.md`, content: docs.resume, atsScore: resume.score },
          { jobId, kind: "COVER_LETTER", fileName: `${name}_CoverLetter_${co}.md`, content: docs.coverLetter }
        ]
      })
    ]);
    const below = cv.score < job.campaign.minAts;
    await db.job.update({
      where: { id: jobId },
      data: {
        status: below ? "SKIPPED" : "AWAITING",
        atsScore: cv.score,
        baseAtsScore: base.score,
        atsBreakdown: cv.breakdown,
        matchedKeywords: cv.matched,
        missingKeywords: cv.missing,
        events: {
          create: [
            { type: "tailored", message: `Documents tailored \xB7 ATS ${base.score} \u2192 ${cv.score}` },
            ...below ? [{ type: "skipped", message: `Skipped: ATS below your minimum of ${job.campaign.minAts}` }] : []
          ]
        }
      }
    });
    if (below) return;
    if (job.campaign.autoApply && cv.score >= AUTO_APPLY_MIN_ATS && adapters[job.source.kind].apply) {
      await startApply(jobId);
    } else {
      await notifyApplicationReady(jobId);
      await db.jobEvent.create({ data: { jobId, type: "alert", message: "Alert sent" } });
    }
  } catch (e) {
    await db.job.update({
      where: { id: jobId },
      data: { status: "PREPARE_FAILED", events: { create: { type: "prepare_failed", message: `Could not prepare documents: ${errMsg(e)}` } } }
    });
  }
}
async function startApply(jobId) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId }, include: { source: true, documents: true } });
  const adapter = adapters[job.source.kind];
  if (!adapter.apply) {
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "APPLY_FAILED",
        issueKind: "APPLY",
        issueMessage: `Auto-apply isn't available for ${job.source.name} yet. Open the posting, apply there, then mark it applied.`,
        events: { create: { type: "failed", message: "Auto-apply not supported for this source" } }
      }
    });
    return;
  }
  await db.job.update({ where: { id: jobId }, data: { status: "APPLYING", events: { create: { type: "applying", message: "Submitting application\u2026" } } } });
  void (async () => {
    try {
      await adapter.apply(job, job.documents);
      await db.job.update({
        where: { id: jobId },
        data: { status: "APPLIED", appliedAt: /* @__PURE__ */ new Date(), issueKind: null, issueMessage: null, events: { create: { type: "applied", message: `Applied automatically on ${job.source.name}` } } }
      });
    } catch (e) {
      await db.job.update({
        where: { id: jobId },
        data: { status: "APPLY_FAILED", issueKind: "APPLY", issueMessage: errMsg(e), events: { create: { type: "failed", message: `Auto-apply failed: ${errMsg(e)}` } } }
      });
      await db.source.update({ where: { id: job.sourceId }, data: { health: "APPLY_FAILING", lastError: `Apply failing: ${errMsg(e)}` } });
    }
  })();
}
async function loadCampaignCtx(campaignId) {
  return db.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: campaignInclude });
}

// src/app.ts
import { Hono as Hono8 } from "hono";
import { HTTPException as HTTPException5 } from "hono/http-exception";
import { logger } from "hono/logger";

// src/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";

// src/services/bootstrap.ts
var DEFAULT_SOURCES = [
  { kind: "REMOTEOK", name: "Remote OK", enabled: true, config: {} },
  { kind: "GREENHOUSE", name: "Greenhouse", enabled: false, config: { boards: [] } },
  { kind: "LEVER", name: "Lever", enabled: false, config: { boards: [] } },
  { kind: "ASHBY", name: "Ashby", enabled: false, config: { boards: [] } },
  { kind: "CAREER_PAGE", name: "Career pages", enabled: false, config: { urls: [] } }
];
async function bootstrapUser(userId) {
  await db.notificationSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  if (await db.source.count({ where: { userId } }) === 0) {
    await db.source.createMany({ data: DEFAULT_SOURCES.map((s) => ({ ...s, userId })) });
  }
  await getActiveCampaign(userId);
}

// src/auth.ts
async function assertCanRegister(rawEmail) {
  const email = rawEmail.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return;
  const invites = csv(env.INVITE_EMAILS).map((e) => e.toLowerCase());
  if (invites.length && !invites.includes(email)) {
    throw new APIError("FORBIDDEN", { message: "Fynd is invite-only. Ask for an invite to sign in." });
  }
  if (await db.user.count() >= env.MAX_ACCOUNTS) {
    throw new APIError("FORBIDDEN", { message: `Registration is closed: all ${env.MAX_ACCOUNTS} accounts are in use.` });
  }
}
var auth = betterAuth({
  appName: "Fynd",
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [env.APP_URL, ...csv(env.TRUSTED_ORIGINS)],
  // "Stay signed in until you log out": a year, refreshed daily while in use.
  // No cookie cache, so revoking a session takes effect on the next request.
  session: { expiresIn: 60 * 60 * 24 * 365, updateAge: 60 * 60 * 24 },
  advanced: { cookiePrefix: "fynd" },
  rateLimit: { enabled: true, window: 60, max: 30 },
  // Log every auth failure with its cause; a bare 500 in the browser is otherwise undiagnosable.
  logger: { level: isProd ? "error" : "debug" },
  onAPIError: {
    onError: (error) => console.error("[auth]", error)
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      async sendVerificationOTP({ email, otp }) {
        await assertCanRegister(email);
        try {
          await sendMail({
            to: email,
            subject: `${otp} is your Fynd code`,
            text: `Your Fynd sign-in code is ${otp}.

It expires in 10 minutes. If you didn't request it, ignore this email.`
          });
        } catch (e) {
          console.error("[auth] sending the sign-in code failed:", e);
          throw new APIError("BAD_GATEWAY", { message: `Couldn't send the code email: ${e.message}` });
        }
      }
    })
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          await assertCanRegister(user.email);
          return { data: { ...user, name: user.name || user.email.split("@")[0] } };
        },
        after: async (user) => {
          await bootstrapUser(user.id);
        }
      }
    }
  }
});

// src/middleware.ts
import { createMiddleware } from "hono/factory";
var requireUser = createMiddleware(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) return c.json({ error: "unauthorized" }, 401);
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});

// src/routes/account.ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
var MAX_BYTES = 5 * 1024 * 1024;
async function extractText(file, bytes) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { extractText: pdfText } = await import("unpdf");
    const { text } = await pdfText(bytes, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (file.type.startsWith("text/") || /\.(md|txt)$/i.test(file.name)) return new TextDecoder().decode(bytes);
  return "";
}
async function accountDto(userId) {
  const [user, accountsUsed, cv] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.user.count(),
    db.baseCv.findUnique({ where: { userId }, select: { fileName: true, size: true, uploadedAt: true, atsBaseline: true, text: true } })
  ]);
  return {
    email: user.email,
    name: user.name,
    accountsUsed,
    maxAccounts: env.MAX_ACCOUNTS,
    cv: cv ? { fileName: cv.fileName, size: cv.size, uploadedAt: cv.uploadedAt.toISOString(), atsBaseline: cv.atsBaseline, hasText: cv.text.length > 0 } : null
  };
}
var account = new Hono().get("/", async (c) => c.json(await accountDto(c.get("user").id))).put("/cv", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new HTTPException(400, { message: "Attach a file named 'file'." });
  if (file.size > MAX_BYTES) throw new HTTPException(413, { message: "CV must be under 5 MB." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try {
    text = await extractText(file, bytes);
  } catch (e) {
    console.warn("[cv] text extraction failed:", errMsg(e));
  }
  const campaign2 = await getActiveCampaign(user.id);
  const keywords = (await db.keyword.findMany({ where: { campaignId: campaign2.id } })).map((k) => k.value);
  const atsBaseline = text ? atsScore(text, keywords, "", "").breakdown.keywordCoverage : null;
  const data = { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data: Buffer.from(bytes), text, atsBaseline };
  await db.baseCv.upsert({ where: { userId: user.id }, update: { ...data, uploadedAt: /* @__PURE__ */ new Date() }, create: { userId: user.id, ...data } });
  return c.json(await accountDto(user.id));
}).patch("/", async (c) => {
  const user = c.get("user");
  const { name } = await c.req.json();
  if (typeof name === "string" && name.trim()) await db.user.update({ where: { id: user.id }, data: { name: name.trim().slice(0, 80) } });
  return c.json(await accountDto(user.id));
});

// src/routes/campaign.ts
import { zValidator } from "@hono/zod-validator";
import { Hono as Hono2 } from "hono";
import { HTTPException as HTTPException2 } from "hono/http-exception";

// src/services/dto.ts
var rowInclude = {
  role: { select: { id: true, title: true } },
  source: { select: { id: true, name: true, kind: true } }
};
var detailInclude = {
  ...rowInclude,
  documents: { select: { id: true, kind: true, fileName: true, atsScore: true, createdAt: true }, orderBy: { kind: "asc" } },
  events: { orderBy: { createdAt: "asc" } }
};
var toRow = (j) => ({
  id: j.id,
  title: j.title,
  company: j.company,
  location: j.location,
  salary: j.salary,
  status: j.status,
  issueKind: j.issueKind,
  issueMessage: j.issueMessage,
  atsScore: j.atsScore,
  foundAt: j.foundAt.toISOString(),
  role: j.role,
  source: j.source
});
var toDetail = (j) => ({
  ...toRow(j),
  url: j.url,
  description: j.description,
  postedAt: j.postedAt?.toISOString() ?? null,
  outcome: j.outcome,
  baseAtsScore: j.baseAtsScore,
  atsBreakdown: j.atsBreakdown ?? null,
  matchedKeywords: j.matchedKeywords,
  missingKeywords: j.missingKeywords,
  appliedAt: j.appliedAt?.toISOString() ?? null,
  canAutoApply: Boolean(adapters[j.source.kind].apply),
  documents: j.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  events: j.events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() }))
});
async function jobDetail(userId, id) {
  const job = await db.job.findFirst({ where: { id, userId }, include: detailInclude });
  return job ? toDetail(job) : null;
}
async function campaignDto(userId) {
  const active = await getActiveCampaign(userId);
  const c = await db.campaign.findUniqueOrThrow({
    where: { id: active.id },
    include: {
      roles: {
        orderBy: { position: "asc" },
        include: { variants: { orderBy: { title: "asc" } }, suggestions: { orderBy: { title: "asc" } } }
      },
      keywords: { orderBy: { createdAt: "asc" } }
    }
  });
  const counts = await db.job.groupBy({
    by: ["roleId", "status"],
    where: { campaignId: c.id, foundAt: { gte: startOfMonthUTC() } },
    _count: { _all: true }
  });
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    startedAt: c.startedAt.toISOString(),
    locations: c.locations,
    seniority: c.seniority,
    minAts: c.minAts,
    postedWithinDays: c.postedWithinDays,
    autoApply: c.autoApply,
    keywords: c.keywords.map((k) => ({ id: k.id, value: k.value })),
    roles: c.roles.map((r) => {
      const mine = counts.filter((x) => x.roleId === r.id);
      return {
        id: r.id,
        title: r.title,
        monthlyTarget: r.monthlyTarget,
        found: mine.reduce((a, x) => a + x._count._all, 0),
        applied: mine.filter((x) => APPLIED_STATUSES.includes(x.status)).reduce((a, x) => a + x._count._all, 0),
        variants: r.variants.map((v) => ({ id: v.id, title: v.title })),
        suggestions: r.suggestions.map((s) => ({ id: s.id, title: s.title }))
      };
    })
  };
}

// src/services/suggest.ts
var FAMILIES = [
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
  ["Product Manager", "Technical Product Manager", "Product Owner", "Group Product Manager"]
];
var norm2 = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function suggestTitles(title, exclude = []) {
  const t = norm2(title);
  const skip = /* @__PURE__ */ new Set([t, ...exclude.map(norm2)]);
  const out = /* @__PURE__ */ new Set();
  for (const family of FAMILIES) {
    if (family.some((f) => norm2(f) === t || ` ${t} `.includes(` ${norm2(f)} `))) {
      for (const f of family) if (!skip.has(norm2(f))) out.add(f);
    }
  }
  if (out.size === 0) {
    out.add(`Senior ${title}`);
    out.add(`Lead ${title}`);
  }
  return [...out].slice(0, 4);
}

// src/routes/campaign.ts
async function ownRole(userId, roleId) {
  const role = await db.role.findFirst({ where: { id: roleId, campaign: { userId } }, include: { variants: true } });
  if (!role) throw new HTTPException2(404, { message: "Role not found" });
  return role;
}
var ignoreDuplicate = (e) => {
  if (e.code === "P2002") return;
  throw e;
};
var campaign = new Hono2().get("/", async (c) => c.json(await campaignDto(c.get("user").id))).patch("/", zValidator("json", campaignPatchSchema), async (c) => {
  const user = c.get("user");
  const active = await getActiveCampaign(user.id);
  await db.campaign.update({ where: { id: active.id }, data: c.req.valid("json") });
  return c.json(await campaignDto(user.id));
}).post("/roles", zValidator("json", titleSchema), async (c) => {
  const user = c.get("user");
  const { title } = c.req.valid("json");
  const active = await getActiveCampaign(user.id);
  const count = await db.role.count({ where: { campaignId: active.id } });
  if (count >= MAX_ROLES) throw new HTTPException2(409, { message: `A campaign can have up to ${MAX_ROLES} roles.` });
  await db.role.create({
    data: {
      campaignId: active.id,
      title,
      position: count,
      suggestions: { create: suggestTitles(title).map((t) => ({ title: t })) }
    }
  });
  return c.json(await campaignDto(user.id), 201);
}).patch("/roles/:id", zValidator("json", rolePatchSchema), async (c) => {
  const user = c.get("user");
  const role = await ownRole(user.id, c.req.param("id"));
  await db.role.update({ where: { id: role.id }, data: c.req.valid("json") });
  return c.json(await campaignDto(user.id));
}).delete("/roles/:id", async (c) => {
  const user = c.get("user");
  const role = await ownRole(user.id, c.req.param("id"));
  if (await db.role.count({ where: { campaignId: role.campaignId } }) <= 1) {
    throw new HTTPException2(409, { message: "A campaign needs at least one role." });
  }
  await db.role.delete({ where: { id: role.id } });
  return c.json(await campaignDto(user.id));
}).post("/roles/:id/variants", zValidator("json", titleSchema), async (c) => {
  const user = c.get("user");
  const role = await ownRole(user.id, c.req.param("id"));
  const { title } = c.req.valid("json");
  await db.roleVariant.create({ data: { roleId: role.id, title } }).catch(ignoreDuplicate);
  await db.roleSuggestion.deleteMany({ where: { roleId: role.id, title } });
  return c.json(await campaignDto(user.id));
}).delete("/roles/:id/variants/:variantId", async (c) => {
  const user = c.get("user");
  const role = await ownRole(user.id, c.req.param("id"));
  await db.roleVariant.deleteMany({ where: { id: c.req.param("variantId"), roleId: role.id } });
  return c.json(await campaignDto(user.id));
}).post("/roles/:id/suggestions/accept-all", async (c) => {
  const user = c.get("user");
  const role = await ownRole(user.id, c.req.param("id"));
  const suggestions = await db.roleSuggestion.findMany({ where: { roleId: role.id } });
  await db.$transaction([
    db.roleVariant.createMany({ data: suggestions.map((s) => ({ roleId: role.id, title: s.title })), skipDuplicates: true }),
    db.roleSuggestion.deleteMany({ where: { roleId: role.id } })
  ]);
  return c.json(await campaignDto(user.id));
}).post("/roles/:id/suggestions/:suggestionId/accept", async (c) => {
  const user = c.get("user");
  const role = await ownRole(user.id, c.req.param("id"));
  const s = await db.roleSuggestion.findFirst({ where: { id: c.req.param("suggestionId"), roleId: role.id } });
  if (s) {
    await db.$transaction([
      db.roleVariant.createMany({ data: [{ roleId: role.id, title: s.title }], skipDuplicates: true }),
      db.roleSuggestion.delete({ where: { id: s.id } })
    ]);
  }
  return c.json(await campaignDto(user.id));
}).delete("/roles/:id/suggestions/:suggestionId", async (c) => {
  const user = c.get("user");
  const role = await ownRole(user.id, c.req.param("id"));
  await db.roleSuggestion.deleteMany({ where: { id: c.req.param("suggestionId"), roleId: role.id } });
  return c.json(await campaignDto(user.id));
}).post("/keywords", zValidator("json", keywordSchema), async (c) => {
  const user = c.get("user");
  const active = await getActiveCampaign(user.id);
  await db.keyword.create({ data: { campaignId: active.id, value: c.req.valid("json").value } }).catch(ignoreDuplicate);
  return c.json(await campaignDto(user.id));
}).delete("/keywords/:id", async (c) => {
  const user = c.get("user");
  await db.keyword.deleteMany({ where: { id: c.req.param("id"), campaign: { userId: user.id } } });
  return c.json(await campaignDto(user.id));
});

// src/routes/flows.ts
import { zValidator as zValidator2 } from "@hono/zod-validator";
import { Hono as Hono3 } from "hono";
async function flowFor(userId) {
  const campaign2 = await getActiveCampaign(userId);
  return db.flow.upsert({ where: { campaignId: campaign2.id }, update: {}, create: { campaignId: campaign2.id, ...defaultFlowData() } });
}
var toDto = (f) => ({
  nodes: f.nodes,
  edges: f.edges,
  updatedAt: f.updatedAt.toISOString()
});
var flows = new Hono3().get("/", async (c) => c.json(toDto(await flowFor(c.get("user").id)))).put("/", zValidator2("json", flowSchema), async (c) => {
  const flow = await flowFor(c.get("user").id);
  const { nodes, edges } = c.req.valid("json");
  const ids = new Set(nodes.map((n) => n.id));
  const saved = await db.flow.update({
    where: { id: flow.id },
    data: {
      nodes,
      edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    }
  });
  return c.json(toDto(saved));
});

// src/routes/jobs.ts
import { zValidator as zValidator3 } from "@hono/zod-validator";
import { Hono as Hono4 } from "hono";
import { HTTPException as HTTPException3 } from "hono/http-exception";
var tabWhere = {
  all: {},
  awaiting: { status: "AWAITING" },
  applied: { status: { in: ["APPLIED", "APPLIED_MANUALLY"] } },
  issues: { issueKind: { not: null } }
};
async function ownJob(userId, id) {
  const job = await db.job.findFirst({ where: { id, userId }, include: { source: true } });
  if (!job) throw new HTTPException3(404, { message: "Job not found" });
  return job;
}
async function detailOr404(userId, id) {
  const d = await jobDetail(userId, id);
  if (!d) throw new HTTPException3(404, { message: "Job not found" });
  return d;
}
var jobs = new Hono4().get("/", zValidator3("query", jobsQuerySchema), async (c) => {
  const user = c.get("user");
  const { tab, role, q, page, pageSize } = c.req.valid("query");
  const base = {
    userId: user.id,
    ...role !== "all" ? { roleId: role } : {},
    ...q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : {}
  };
  const where = { ...base, ...tabWhere[tab] };
  const [total, rows, ...counts] = await Promise.all([
    db.job.count({ where }),
    db.job.findMany({ where, include: rowInclude, orderBy: { foundAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ...JOB_TABS.map((t) => db.job.count({ where: { ...base, ...tabWhere[t] } }))
  ]);
  const body = {
    rows: rows.map(toRow),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(JOB_TABS.map((t, i) => [t, counts[i]]))
  };
  return c.json(body);
}).get("/:id", async (c) => c.json(await detailOr404(c.get("user").id, c.req.param("id")))).post("/:id/apply", async (c) => {
  const user = c.get("user");
  const job = await ownJob(user.id, c.req.param("id"));
  if (!["AWAITING", "APPLY_FAILED"].includes(job.status)) throw new HTTPException3(409, { message: "This job can't be applied to right now." });
  await startApply(job.id);
  return c.json(await detailOr404(user.id, job.id));
}).post("/:id/skip", async (c) => {
  const user = c.get("user");
  const job = await ownJob(user.id, c.req.param("id"));
  await db.job.update({ where: { id: job.id }, data: { status: "SKIPPED", events: { create: { type: "skipped", message: "Skipped by you" } } } });
  return c.json(await detailOr404(user.id, job.id));
}).post("/:id/mark-applied", async (c) => {
  const user = c.get("user");
  const job = await ownJob(user.id, c.req.param("id"));
  await db.job.update({
    where: { id: job.id },
    data: {
      status: "APPLIED_MANUALLY",
      appliedAt: /* @__PURE__ */ new Date(),
      ...job.issueKind === "APPLY" ? { issueKind: null, issueMessage: null } : {},
      events: { create: { type: "manual", message: "Marked as applied manually" } }
    }
  });
  return c.json(await detailOr404(user.id, job.id));
}).patch("/:id/outcome", zValidator3("json", outcomeSchema), async (c) => {
  const user = c.get("user");
  const job = await ownJob(user.id, c.req.param("id"));
  const { outcome } = c.req.valid("json");
  await db.job.update({ where: { id: job.id }, data: { outcome, events: { create: { type: "outcome", message: `Outcome: ${OUTCOME_LABEL[outcome]}` } } } });
  return c.json(await detailOr404(user.id, job.id));
}).post("/:id/retry", async (c) => {
  const user = c.get("user");
  const job = await ownJob(user.id, c.req.param("id"));
  if (job.issueKind === "APPLY" || job.status === "APPLY_FAILED") await startApply(job.id);
  else await prepareJob(job.id);
  return c.json(await detailOr404(user.id, job.id));
}).get("/:id/documents/:docId", async (c) => {
  const user = c.get("user");
  const doc = await db.document.findFirst({ where: { id: c.req.param("docId"), jobId: c.req.param("id"), job: { userId: user.id } } });
  if (!doc) throw new HTTPException3(404, { message: "Document not found" });
  if (c.req.query("download") !== void 0) {
    return c.body(doc.content, 200, {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`
    });
  }
  return c.json({ id: doc.id, kind: doc.kind, fileName: doc.fileName, atsScore: doc.atsScore, createdAt: doc.createdAt.toISOString(), content: doc.content });
});

// src/routes/overview.ts
import { zValidator as zValidator4 } from "@hono/zod-validator";
import { Hono as Hono5 } from "hono";

// src/services/funnel.ts
var pct = (a, b) => b ? Math.round(a / b * 100) : 0;
function buildFunnel(rows) {
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r._count._all, 0);
  const isApplied = (r) => r.status === "APPLIED" || r.status === "APPLIED_MANUALLY";
  const found = sum(() => true);
  const preparing = sum((r) => r.status === "PREPARING");
  const prepareFailed = sum((r) => r.status === "PREPARE_FAILED");
  const prepared = found - preparing - prepareFailed;
  const awaiting = sum((r) => r.status === "AWAITING");
  const skipped = sum((r) => r.status === "SKIPPED");
  const applyStuck = sum((r) => r.status === "APPLYING" || r.status === "APPLY_FAILED");
  const applied = sum(isApplied);
  const heard = sum((r) => isApplied(r) && r.outcome !== "NONE");
  const rejected = sum((r) => isApplied(r) && r.outcome === "REJECTED");
  const interview = sum((r) => isApplied(r) && (r.outcome === "INTERVIEW" || r.outcome === "OFFER"));
  const offer = sum((r) => isApplied(r) && r.outcome === "OFFER");
  const talking = heard - rejected - interview;
  const stages = [
    { key: "found", label: "Found", value: found, caption: "Exact matches" },
    { key: "prepared", label: "Prepared", value: prepared, caption: `${pct(prepared, found)}% of found` },
    { key: "applied", label: "Applied", value: applied, caption: `${pct(applied, prepared)}% of prepared` },
    { key: "heard", label: "Heard back", value: heard, caption: `${pct(heard, applied)}% of applied` },
    { key: "interview", label: "Interview", value: interview, caption: `${pct(interview, heard)}% of heard back` },
    { key: "offer", label: "Offer", value: offer, caption: offer ? `${pct(offer, interview)}% of interviews` : "None yet" }
  ];
  const b = (value, label, tone = "muted") => ({ value, label, tone });
  const branches = [
    [b(prepareFailed, "failed to prepare"), b(preparing, "still preparing")],
    [b(awaiting, "awaiting you", "attention"), b(skipped, "skipped"), b(applyStuck, "apply failed or pending")],
    [b(applied - heard, "no reply yet")],
    [b(rejected, "rejected"), b(talking, "in conversation")],
    [b(interview - offer, "interviewing")],
    []
  ].map((list) => list.filter((x) => x.value > 0));
  return { stages, branches };
}

// src/routes/overview.ts
var overview = new Hono5().get("/", zValidator4("query", overviewQuerySchema), async (c) => {
  const user = c.get("user");
  const { range } = c.req.valid("query");
  const now = /* @__PURE__ */ new Date();
  const monthStart = startOfMonthUTC(now);
  const dailySince = range === "7d" ? addDays(startOfDayUTC(now), -6) : monthStart;
  const campaign2 = await getActiveCampaign(user.id);
  const [roles, grouped, awaiting, awaitingToday, failingSources, dailyRows] = await Promise.all([
    db.role.findMany({ where: { campaignId: campaign2.id }, orderBy: { position: "asc" } }),
    db.job.groupBy({ by: ["roleId", "status", "outcome"], where: { campaignId: campaign2.id, foundAt: { gte: monthStart } }, _count: { _all: true } }),
    db.job.count({ where: { userId: user.id, status: "AWAITING" } }),
    db.job.count({ where: { userId: user.id, status: "AWAITING", foundAt: { gte: startOfDayUTC(now) } } }),
    db.source.findMany({ where: { userId: user.id, enabled: true, health: { not: "HEALTHY" } }, select: { id: true, name: true, health: true, lastError: true } }),
    db.$queryRaw`
      SELECT date_trunc('day', "foundAt" AT TIME ZONE 'UTC') AS day, "roleId", COUNT(*)::int AS n
      FROM "Job"
      WHERE "campaignId" = ${campaign2.id} AND "foundAt" >= ${dailySince}
      GROUP BY 1, 2 ORDER BY 1`
  ]);
  const roleStats = roles.map((r) => {
    const mine = grouped.filter((g) => g.roleId === r.id);
    const found = mine.reduce((a, g) => a + g._count._all, 0);
    const applied = mine.filter((g) => APPLIED_STATUSES.includes(g.status)).reduce((a, g) => a + g._count._all, 0);
    return { id: r.id, title: r.title, found, applied, target: r.monthlyTarget, pct: r.monthlyTarget ? Math.min(100, Math.round(found / r.monthlyTarget * 100)) : 0 };
  });
  const daily = [];
  for (let d = dailySince; d <= now; d = addDays(d, 1)) daily.push({ date: isoDay(d), counts: Object.fromEntries(roles.map((r) => [r.id, 0])) });
  const index = new Map(daily.map((p, i) => [p.date, i]));
  for (const row of dailyRows) {
    const i = index.get(isoDay(new Date(row.day)));
    if (i !== void 0 && row.roleId) daily[i].counts[row.roleId] = (daily[i].counts[row.roleId] ?? 0) + row.n;
  }
  const body = {
    campaign: { id: campaign2.id, name: campaign2.name, status: campaign2.status, dayOfMonth: now.getUTCDate(), daysInMonth: daysInMonthUTC(now) },
    roles: roleStats,
    awaiting,
    awaitingToday,
    funnel: buildFunnel(grouped),
    daily,
    failingSources
  };
  return c.json(body);
});

// src/routes/settings.ts
import { zValidator as zValidator5 } from "@hono/zod-validator";
import { Hono as Hono6 } from "hono";
async function notificationsDto(userId) {
  const [prefs, link] = await Promise.all([
    db.notificationSettings.upsert({ where: { userId }, update: {}, create: { userId } }),
    db.telegramLink.findUnique({ where: { userId } })
  ]);
  return {
    telegramEnabled: prefs.telegramEnabled,
    telegramShowStats: prefs.telegramShowStats,
    emailEnabled: prefs.emailEnabled,
    telegram: {
      configured: telegramConfigured(),
      linked: Boolean(link),
      username: link?.username ?? null,
      linkedAt: link?.linkedAt.toISOString() ?? null,
      botUsername: env.TELEGRAM_BOT_USERNAME
    }
  };
}
var settings = new Hono6().get("/notifications", async (c) => c.json(await notificationsDto(c.get("user").id))).patch("/notifications", zValidator5("json", notificationsPatchSchema), async (c) => {
  const user = c.get("user");
  await db.notificationSettings.upsert({ where: { userId: user.id }, update: c.req.valid("json"), create: { userId: user.id, ...c.req.valid("json") } });
  return c.json(await notificationsDto(user.id));
}).delete("/telegram", async (c) => {
  const user = c.get("user");
  await db.telegramLink.deleteMany({ where: { userId: user.id } });
  return c.json(await notificationsDto(user.id));
});

// src/routes/sources.ts
import { zValidator as zValidator6 } from "@hono/zod-validator";
import { Hono as Hono7 } from "hono";
import { HTTPException as HTTPException4 } from "hono/http-exception";
var toDto2 = (s, found) => ({
  id: s.id,
  kind: s.kind,
  name: s.name,
  enabled: s.enabled,
  health: s.health,
  lastError: s.lastError,
  lastRunAt: s.lastRunAt?.toISOString() ?? null,
  foundThisMonth: found,
  config: s.config ?? {}
});
async function foundCounts(userId) {
  const rows = await db.job.groupBy({ by: ["sourceId"], where: { userId, foundAt: { gte: startOfMonthUTC() } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.sourceId, r._count._all]));
}
async function ownSource(userId, id) {
  const s = await db.source.findFirst({ where: { id, userId } });
  if (!s) throw new HTTPException4(404, { message: "Source not found" });
  return s;
}
var sources = new Hono7().get("/", async (c) => {
  const user = c.get("user");
  const [list, counts] = await Promise.all([db.source.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }), foundCounts(user.id)]);
  return c.json(list.map((s) => toDto2(s, counts.get(s.id) ?? 0)));
}).patch("/:id", zValidator6("json", sourcePatchSchema), async (c) => {
  const user = c.get("user");
  const s = await ownSource(user.id, c.req.param("id"));
  const { enabled, config } = c.req.valid("json");
  const updated = await db.source.update({
    where: { id: s.id },
    data: { enabled, ...config ? { config, health: "HEALTHY", lastError: null } : {} }
  });
  return c.json(toDto2(updated, (await foundCounts(user.id)).get(s.id) ?? 0));
}).post("/:id/retry", async (c) => {
  const user = c.get("user");
  const s = await ownSource(user.id, c.req.param("id"));
  const active = await getActiveCampaign(user.id);
  const ctx = await loadCampaignCtx(active.id);
  if (!ctx.roles.length) throw new HTTPException4(409, { message: "Add a role to your campaign first." });
  const created = await runSource(ctx, s);
  const fresh = await db.source.findUniqueOrThrow({ where: { id: s.id } });
  return c.json({ source: toDto2(fresh, (await foundCounts(user.id)).get(s.id) ?? 0), created });
});

// src/app.ts
var app = new Hono8();
app.use(logger());
app.get("/api/health", (c) => c.json({ ok: true, service: "fynd", time: (/* @__PURE__ */ new Date()).toISOString() }));
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.post("/api/telegram/webhook", telegramWebhook);
app.use("/api/*", requireUser);
app.route("/api/overview", overview);
app.route("/api/jobs", jobs);
app.route("/api/campaign", campaign);
app.route("/api/flows", flows);
app.route("/api/sources", sources);
app.route("/api/settings", settings);
app.route("/api/account", account);
app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException5) return c.json({ error: err.message }, err.status);
  console.error("[fynd]", err);
  return c.json({ error: "Something went wrong" }, 500);
});

// src/index.ts
var server = serve({ fetch: app.fetch, port: env.FYND_PORT, hostname: env.FYND_HOST }, (info) => {
  console.log(`[fynd] http://${env.FYND_HOST}:${info.port}  (agent ${env.AGENT_ENABLED ? "on" : "off"}, telegram ${env.TELEGRAM_BOT_TOKEN ? env.TELEGRAM_MODE : "not configured"}, ai ${describeAi()})`);
});
startAgent();
startTelegram();
var shutdown = () => {
  stopAgent();
  stopTelegram();
  server.close();
  db.$disconnect().finally(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
//# sourceMappingURL=index.js.map