import { serve } from "@hono/node-server";
import { describeAi } from "./agent/llm";
import { startAgent, stopAgent } from "./agent/runner";
import { app } from "./app";
import { db } from "./db";
import { env } from "./env";
import { startTelegram, stopTelegram } from "./services/telegram";

const server = serve({ fetch: app.fetch, port: env.FYND_PORT, hostname: env.FYND_HOST }, (info) => {
  console.log(`[fynd] http://${env.FYND_HOST}:${info.port}  (agent ${env.AGENT_ENABLED ? "on" : "off"}, telegram ${env.TELEGRAM_BOT_TOKEN ? env.TELEGRAM_MODE : "not configured"}, ai ${describeAi()})`);
});

startAgent();
startTelegram();

const shutdown = () => {
  stopAgent();
  stopTelegram();
  server.close();
  db.$disconnect().finally(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
