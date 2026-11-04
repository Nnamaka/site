import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { requireUser, type AppEnv } from "./middleware";
import { account } from "./routes/account";
import { campaign } from "./routes/campaign";
import { flows } from "./routes/flows";
import { jobs } from "./routes/jobs";
import { overview } from "./routes/overview";
import { settings } from "./routes/settings";
import { sources } from "./routes/sources";
import { telegramWebhook } from "./services/telegram";

export const app = new Hono<AppEnv>();

app.use(logger());

// Public routes. Registered first: they return before requireUser runs.
app.get("/api/health", (c) => c.json({ ok: true, service: "fynd", time: new Date().toISOString() }));
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.post("/api/telegram/webhook", telegramWebhook);

// Everything else under /api needs a session.
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
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error("[fynd]", err);
  return c.json({ error: "Something went wrong" }, 500);
});
