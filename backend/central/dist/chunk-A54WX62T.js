import {
  keepaliveStatus
} from "./chunk-TSBBDGI5.js";

// src/services.ts
import path from "path";
var REPO_ROOT = process.env.REPO_ROOT ?? path.resolve(process.cwd(), "../..");
var node = process.execPath;
var bin = (pkg, entry) => `node_modules/${pkg}/${entry}`;
var services = [
  {
    name: "fynd",
    prefix: "/fynd",
    target: process.env.FYND_URL ?? "http://127.0.0.1:4001",
    health: "/api/health",
    description: "Fynd job-search agent (TypeScript \xB7 Hono \xB7 Prisma)",
    timeoutMs: 12e4,
    run: {
      cwd: "backend/fynd",
      dev: [{ cmd: node, args: [bin("tsx", "dist/cli.mjs"), "watch", "src/index.ts"] }],
      prod: [
        { cmd: node, args: [bin("prisma", "build/index.js"), "migrate", "deploy"] },
        { cmd: node, args: ["dist/index.js"] }
      ],
      env: { FYND_HOST: "127.0.0.1", FYND_PORT: "4001" }
    }
  }
  // Python prototype (FastAPI on 5001):
  // {
  //   name: "py-proto", prefix: "/py-proto", target: "http://127.0.0.1:5001", health: "/health", description: "Python prototype",
  //   run: {
  //     cwd: "backend/py-proto",
  //     dev:  [{ cmd: "uvicorn", args: ["main:app", "--reload", "--host", "127.0.0.1", "--port", "5001"] }],
  //     prod: [{ cmd: "uvicorn", args: ["main:app", "--host", "127.0.0.1", "--port", "5001"] }],
  //   },
  // },
  // Go prototype (net/http on 5002):
  // {
  //   name: "go-proto", prefix: "/go-proto", target: "http://127.0.0.1:5002", health: "/health", description: "Go prototype",
  //   run: { cwd: "backend/go-proto", dev: [{ cmd: "go", args: ["run", "."] }], prod: [{ cmd: "./bin/app", args: [] }], env: { PORT: "5002" } },
  // },
];

// src/gateway.ts
import "dotenv/config";
import { randomUUID } from "crypto";
import cors from "cors";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
var PORT = Number(process.env.PORT ?? 4e3);
var HOST = process.env.HOST || void 0;
var allowed = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001").split(",").map((s) => s.trim()).filter(Boolean).map((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$", "i"));
function createGateway() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    const id = req.headers["x-request-id"] ?? randomUUID();
    req.headers["x-request-id"] = id;
    res.setHeader("x-request-id", id);
    const started = Date.now();
    res.on("finish", () => {
      if (req.path !== "/health") console.log(`[central] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowed.some((r) => r.test(origin))), credentials: true }));
  app.get("/", (_req, res) => {
    res.json({ name: "nnamaka central gateway", services: services.map(({ name, prefix, description }) => ({ name, prefix, description })) });
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/health/all", async (_req, res) => {
    const results = await Promise.all(
      services.map(async (s) => {
        const t = Date.now();
        try {
          const r = await fetch(s.target + s.health, { signal: AbortSignal.timeout(3e3) });
          return { name: s.name, ok: r.ok, status: r.status, ms: Date.now() - t };
        } catch (e) {
          return { name: s.name, ok: false, error: e.message, ms: Date.now() - t };
        }
      })
    );
    const ok = results.every((r) => r.ok);
    res.status(ok ? 200 : 503).json({ ok, services: results });
  });
  app.get("/health/keepalive", (_req, res) => res.json(keepaliveStatus));
  for (const s of services) {
    app.use(
      s.prefix,
      createProxyMiddleware({
        target: s.target,
        changeOrigin: true,
        xfwd: true,
        proxyTimeout: s.timeoutMs ?? 6e4,
        on: {
          error: (err, _req, res) => {
            console.error(`[proxy:${s.name}]`, err.message);
            const out = res;
            if (typeof out.writeHead === "function" && !out.headersSent) {
              out.writeHead(502, { "content-type": "application/json" });
              out.end(JSON.stringify({ error: "bad_gateway", service: s.name }));
            }
          }
        }
      })
    );
  }
  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  return app;
}
function startGateway() {
  return createGateway().listen(PORT, HOST, () => {
    console.log(`[central] gateway on http://${HOST ?? "localhost"}:${PORT}`);
    for (const s of services) console.log(`[central]   ${s.prefix.padEnd(12)} \u2192 ${s.target}`);
  });
}

export {
  REPO_ROOT,
  services,
  startGateway
};
