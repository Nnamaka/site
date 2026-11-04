import { createHash, randomInt } from "node:crypto";
import type { Context } from "hono";
import { db } from "../db";
import { env } from "../env";
import { sendMail } from "../lib/mail";
import { errMsg, startOfMonthUTC } from "../lib/util";
import { APPLIED_STATUSES, getActiveCampaign } from "./campaign";

/* ───────── Bot API ───────── */

export const telegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN);

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === "getUpdates" ? 40_000 : 10_000),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const say = (chatId: string | number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

/* ───────── Alerts ───────── */

export async function roleStatsLine(userId: string) {
  const campaign = await getActiveCampaign(userId);
  const roles = await db.role.findMany({ where: { campaignId: campaign.id }, orderBy: { position: "asc" } });
  const counts = await db.job.groupBy({
    by: ["roleId", "status"],
    where: { campaignId: campaign.id, foundAt: { gte: startOfMonthUTC() } },
    _count: { _all: true },
  });
  const fmt = (n: number) => n.toLocaleString("en-US");
  return roles
    .map((r) => {
      const mine = counts.filter((c) => c.roleId === r.id);
      const found = mine.reduce((a, c) => a + c._count._all, 0);
      const applied = mine.filter((c) => APPLIED_STATUSES.includes(c.status)).reduce((a, c) => a + c._count._all, 0);
      return `${r.title} ${fmt(applied)}/${fmt(found)}`;
    })
    .join(" · ");
}

/** One alert per prepared application. Telegram first; email only if the user opted in. */
export async function notifyApplicationReady(jobId: string) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { role: true, user: { include: { notifications: true, telegram: true } } },
  });
  if (!job) return;
  const prefs = job.user.notifications;
  const link = `${env.APP_URL}/jobs/${job.id}`;
  const meta = [job.location, job.salary, job.atsScore != null ? `ATS ${job.atsScore}` : null].filter(Boolean).join(" · ");
  const stats = prefs?.telegramShowStats ? await roleStatsLine(job.userId) : "";

  if (job.user.telegram && prefs?.telegramEnabled !== false) {
    const text = [
      `<b>Application ready · ${esc(job.role?.title ?? "Job")}</b>`,
      `${esc(job.title)} at ${esc(job.company)}`,
      meta && `<i>${esc(meta)}</i>`,
      stats && `<code>${esc(stats)}</code>`,
    ].filter(Boolean).join("\n");
    await say(job.user.telegram.chatId, text, { reply_markup: { inline_keyboard: [[{ text: "Review in Fynd", url: link }]] } }).catch((e) =>
      console.warn("[telegram] alert failed:", errMsg(e)),
    );
  }
  if (prefs?.emailEnabled) {
    await sendMail({
      to: job.user.email,
      subject: `Application ready: ${job.title} at ${job.company}`,
      text: `${job.title} at ${job.company}\n${meta}\n\nReview and approve: ${link}${stats ? `\n\n${stats}` : ""}`,
    }).catch((e) => console.warn("[mail] alert failed:", errMsg(e)));
  }
}

/* ───────── Linking: /start → email → 6-digit code sent by email → paste code in chat ───────── */

type Update = { update_id: number; message?: { chat: { id: number }; from?: { username?: string }; text?: string } };

const hash = (code: string, chatId: string) => createHash("sha256").update(`${chatId}:${code}`).digest("hex");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleUpdate(update: Update) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const link = await db.telegramLink.findUnique({ where: { chatId }, include: { user: true } });

  if (text.startsWith("/stats")) {
    if (!link) return say(chatId, "Link your Fynd account first: send /start.");
    return say(chatId, `<b>Applied / found this month</b>\n<code>${esc((await roleStatsLine(link.userId)) || "No roles yet")}</code>`);
  }
  if (text.startsWith("/unlink")) {
    if (!link) return say(chatId, "This chat isn't linked to a Fynd account.");
    await db.telegramLink.delete({ where: { chatId } });
    return say(chatId, "Unlinked. You won't get alerts here any more.");
  }
  if (text.startsWith("/start")) {
    if (link) return say(chatId, `Linked to <b>${esc(link.user.email)}</b>.\n/stats shows applied/found per role. /unlink stops alerts.`);
    await db.telegramPending.upsert({ where: { chatId }, update: { email: null, codeHash: null, attempts: 0 }, create: { chatId } });
    return say(chatId, "Hi, I'm the Fynd bot. Send the email address you use for Fynd.");
  }
  if (link) return say(chatId, "You're linked. /stats shows applied/found per role.");

  const pending = await db.telegramPending.findUnique({ where: { chatId } });
  if (EMAIL_RE.test(text)) {
    const email = text.toLowerCase();
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return say(chatId, "No Fynd account uses that email. Check it and send it again.");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.telegramPending.upsert({
      where: { chatId },
      update: { email, codeHash: hash(code, chatId), expiresAt: new Date(Date.now() + 600_000), attempts: 0 },
      create: { chatId, email, codeHash: hash(code, chatId), expiresAt: new Date(Date.now() + 600_000) },
    });
    await sendMail({ to: email, subject: `${code} links Telegram to Fynd`, text: `Send ${code} to the Fynd bot in Telegram to turn on alerts.\nIt expires in 10 minutes.` });
    return say(chatId, `I emailed a 6-digit code to <b>${esc(email)}</b>. Send it here.`);
  }
  if (/^\d{6}$/.test(text)) {
    if (!pending?.email || !pending.codeHash || !pending.expiresAt) return say(chatId, "Send your Fynd email first.");
    if (pending.expiresAt < new Date() || pending.attempts >= 5) {
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
      db.telegramPending.delete({ where: { chatId } }),
    ]);
    return say(chatId, "Linked. You'll get an alert for every application Fynd prepares.\n/stats shows applied/found per role.");
  }
  return say(chatId, pending?.email ? "Send the 6-digit code from your email." : "Send /start to link your Fynd account.");
}

/* ───────── Transport ───────── */

export async function telegramWebhook(c: Context) {
  if (env.TELEGRAM_WEBHOOK_SECRET && c.req.header("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ ok: false }, 401);
  }
  const update = (await c.req.json()) as Update;
  handleUpdate(update).catch((e) => console.error("[telegram]", errMsg(e)));
  return c.json({ ok: true });
}

let polling = false;
export function startTelegram() {
  if (!telegramConfigured() || env.TELEGRAM_MODE !== "polling") return;
  polling = true;
  (async () => {
    await tg("deleteWebhook", {}).catch(() => {});
    let offset = 0;
    while (polling) {
      try {
        const updates = (await tg<Update[]>("getUpdates", { offset, timeout: 30 })) ?? [];
        for (const u of updates) {
          offset = u.update_id + 1;
          await handleUpdate(u).catch((e) => console.error("[telegram]", errMsg(e)));
        }
      } catch (e) {
        console.warn("[telegram] poll:", errMsg(e));
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
export const stopTelegram = () => {
  polling = false;
};
