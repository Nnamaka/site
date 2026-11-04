# nnamaka monorepo

Personal site, prototypes, and the backends behind them. pnpm workspaces + Turborepo.

```
apps/
  main/            personal site (Next.js)
  fynd/            Fynd web app (Next.js 16 · shadcn · TanStack Query/Table · React Flow)  → fynd.nnamaka.com
backend/
  central/         gateway + supervisor + keep-alive. The only public backend.
    src/gateway.ts     Express + http-proxy-middleware: /{prefix}/* → internal backend
    src/supervisor.ts  starts every backend in services.ts, restarts on crash, then the gateway
    src/keepalive.ts   keeps Render awake and Supabase active (see below)
  fynd/            Fynd API (Hono · better-auth · Prisma · Supabase Postgres) + job-search agent + Telegram bot
  Dockerfile       optional: same backends as one container image (not used by render.yaml)
  start.sh         optional: the Docker image's entrypoint
packages/
  fynd-shared/     zod schemas + DTO types shared by apps/fynd and backend/fynd
```

## How a request flows

```
browser ── fynd.nnamaka.com/api/jobs
            │  Next.js rewrite (server-side, same origin → first-party cookies, no CORS)
            ▼
         gateway  https://<render>/fynd/api/jobs          backend/central  :$PORT (public)
            │  strips /fynd
            ▼
         Fynd API http://127.0.0.1:4001/api/jobs          backend/fynd     (internal)
```

Adding another prototype backend (Python, Go, …): give it an internal port and register `{ prefix, target, run: { cwd, dev, prod } }` in `backend/central/src/services.ts`. The supervisor starts it locally and on Render; add its build step to `buildCommand` in `render.yaml` (and to `backend/Dockerfile` / `start.sh` if you use Docker). Its frontend calls `https://<gateway>/<prefix>/…` (allowed by `CORS_ORIGINS`) or, like Fynd, rewrites `/api/*` to it.

## Local development

Requires Node 22+ and pnpm 9. No Docker needed.

```bash
pnpm install
cp backend/fynd/.env.example backend/fynd/.env        # Supabase URLs + BETTER_AUTH_SECRET (openssl rand -base64 32)
cp backend/central/.env.example backend/central/.env
cp apps/fynd/.env.example apps/fynd/.env.local

pnpm db:migrate --name init      # first time only: creates prisma/migrations — commit it
pnpm db:seed                     # demo account ada@fynd.dev with a month of data

pnpm dev:fynd                    # web :3001 + supervisor → gateway :4000 + Fynd API :4001
pnpm dev:backend                 # backends only (supervisor)
```

Use a separate Supabase project (or `pnpm db:up` for a local Docker Postgres) for development so seeding never touches production data.

Open http://localhost:3001, sign in with `ada@fynd.dev`. Without `RESEND_API_KEY` the 6-digit code is printed in the API's terminal.

Useful:
- `pnpm db:studio` browse the database
- `pnpm --filter @nnamaka/fynd-api agent:once` run one agent pass now (configure boards on the Sources page first)
- `curl localhost:4000/health/all` gateway + backend health
- Telegram locally: create a bot with @BotFather, set `TELEGRAM_BOT_TOKEN`; `TELEGRAM_MODE=polling` needs no public URL
- `pnpm build:backend && pnpm start:backend` run the production supervisor locally
- `pnpm keepalive` run the Render ping + Supabase heartbeat once
- `curl localhost:4000/health/keepalive` last keep-alive results

## Deploy

**Database → Supabase**
1. Create a project. Project Settings → Database → Connection string.
2. Transaction pooler (port 6543, add `?pgbouncer=true&connection_limit=1`) → `DATABASE_URL`. Session pooler or direct (port 5432) → `DIRECT_URL`.

**Backends → Render (one free web service, native Node, no Docker)**
1. New → Blueprint → this repo. `render.yaml` builds with pnpm and starts `pnpm --filter @nnamaka/central start:all`: the supervisor runs `prisma migrate deploy`, starts Fynd on 127.0.0.1:4001, then the gateway on `$PORT`.
2. Fill the `sync: false` secrets: Supabase URLs, `SUPABASE_URL` + `SUPABASE_ANON_KEY` (optional), Resend, Telegram, Anthropic.
3. Point Telegram at the gateway once: `pnpm --filter @nnamaka/fynd-api telegram:webhook https://nnamaka-api.onrender.com/fynd` (with the production token in your env).

**Keeping both alive**
- Render free services sleep after 15 idle minutes; Supabase free projects pause after 7 days without activity.
- In-process (`backend/central/src/keepalive.ts`): every 10 min the gateway requests its own public URL (`RENDER_EXTERNAL_URL`, set by Render); every 12 h it upserts a row in `keepalive.heartbeat` on Supabase (own schema, invisible to Prisma) and optionally hits the Supabase REST API.
- Outside backup (`.github/workflows/keep-alive.yml`): pings the gateway every 10 min (this is what wakes Render if it ever slept, e.g. after a deploy or restart) and writes the heartbeat twice a day straight to Supabase, so the database stays active even if Render is down. Add repo secrets `GATEWAY_URL` and `SUPABASE_DB_URL` (the 5432 URL).
- One always-on service is ~744 h/month, inside Render's 750 free instance hours. A second always-on free service would exceed it.

**Fynd web → Vercel**
1. New project → this repo → Root Directory `apps/fynd`.
2. Env: `FYND_API_URL=https://nnamaka-api.onrender.com/fynd`.
3. Domain `fynd.nnamaka.com`; set the same URL as `APP_URL` on Render (auth cookies and Telegram links use it).

## What's real and what's an extension point

- Real: email-code auth with year-long sessions, invite-only cap (7), session list/revoke, campaigns with up to 3 roles + similar titles + keywords + criteria, Greenhouse/Lever/Ashby/Remote OK/JSON-LD career page sources, matching, ATS scoring, document tailoring (Claude when `ANTHROPIC_API_KEY` is set, templates otherwise), Telegram linking + alerts + `/stats`, funnel and daily analytics, flow editor persistence.
- Extension points: `SourceAdapter.apply` (no source auto-applies yet; jobs show "apply manually" until an adapter implements it), the flow graph is saved but the agent still runs the fixed pipeline, and documents are Markdown (add PDF rendering in `agent/runner.ts` if you need it).
