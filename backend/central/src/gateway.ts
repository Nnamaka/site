import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Server, ServerResponse } from "node:http";
import cors from "cors";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { keepaliveStatus } from "./keepalive";
import { services } from "./services";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

// Comma-separated; "*" matches one subdomain label, e.g. https://*.nnamaka.com
const allowed = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$", "i"));

export function createGateway() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.use((req, res, next) => {
    const id = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    req.headers["x-request-id"] = id;
    res.setHeader("x-request-id", id);
    const started = Date.now();
    res.on("finish", () => {
      if (req.path !== "/health") console.log(`[central] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  // Only matters for browsers calling the gateway directly. Fynd's web app proxies
  // through its own origin (Next.js rewrites), so its requests never need CORS.
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowed.some((r) => r.test(origin))), credentials: true }));

  app.get("/", (_req, res) => {
    res.json({ name: "nnamaka central gateway", services: services.map(({ name, prefix, description }) => ({ name, prefix, description })) });
  });

  // Liveness for Render's health check and the keep-alive pings: the gateway itself is up.
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Readiness of every backend behind the gateway.
  app.get("/health/all", async (_req, res) => {
    const results = await Promise.all(
      services.map(async (s) => {
        const t = Date.now();
        try {
          const r = await fetch(s.target + s.health, { signal: AbortSignal.timeout(3000) });
          return { name: s.name, ok: r.ok, status: r.status, ms: Date.now() - t };
        } catch (e) {
          return { name: s.name, ok: false, error: (e as Error).message, ms: Date.now() - t };
        }
      }),
    );
    const ok = results.every((r) => r.ok);
    res.status(ok ? 200 : 503).json({ ok, services: results });
  });

  // Last result of the Render and Supabase keep-alive jobs.
  app.get("/health/keepalive", (_req, res) => res.json(keepaliveStatus));

  // Express strips the mount path, so /fynd/api/jobs reaches the target as /api/jobs.
  // No body parser runs before these, so request bodies stream through untouched.
  for (const s of services) {
    app.use(
      s.prefix,
      createProxyMiddleware({
        target: s.target,
        changeOrigin: true,
        xfwd: true,
        proxyTimeout: s.timeoutMs ?? 60_000,
        on: {
          error: (err, _req, res) => {
            console.error(`[proxy:${s.name}]`, err.message);
            const out = res as ServerResponse;
            if (typeof out.writeHead === "function" && !out.headersSent) {
              out.writeHead(502, { "content-type": "application/json" });
              out.end(JSON.stringify({ error: "bad_gateway", service: s.name }));
            }
          },
        },
      }),
    );
  }

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  return app;
}

export function startGateway(): Server {
  return createGateway().listen(PORT, HOST, () => {
    console.log(`[central] gateway on http://${HOST}:${PORT}`);
    for (const s of services) console.log(`[central]   ${s.prefix.padEnd(12)} → ${s.target}`);
  });
}
