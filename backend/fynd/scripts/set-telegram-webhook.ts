// Points the Telegram bot at the gateway in production.
// Usage: pnpm --filter @nnamaka/fynd-api telegram:webhook https://<your-gateway>/fynd
import { env } from "../src/env";
import { tg } from "../src/services/telegram";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("Pass the public gateway URL including /fynd, e.g. https://nnamaka-api.onrender.com/fynd");
  process.exit(1);
}
if (!env.TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const url = `${base}/api/telegram/webhook`;
await tg("setWebhook", { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message"] });
await tg("setMyCommands", {
  commands: [
    { command: "start", description: "Link your Fynd account" },
    { command: "stats", description: "Applied / found per role" },
    { command: "unlink", description: "Stop alerts in this chat" },
  ],
});
console.log(`Webhook set: ${url}`);
