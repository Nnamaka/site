import pg from "pg";

/**
 * Keep-alive jobs, run inside the always-on gateway process.
 *
 * 1. Render: free web services sleep after 15 min without inbound traffic. Every 10 min we request our
 *    own public URL (RENDER_EXTERNAL_URL is set by Render automatically). The request goes out through
 *    Render's edge and back in, so it counts as traffic. It can't wake a service that is already asleep;
 *    .github/workflows/keep-alive.yml is the outside backup for that.
 * 2. Supabase: free projects pause after 7 days of inactivity. Every 12 h we connect to Postgres and upsert
 *    a heartbeat row (a real write, not just SELECT 1), and optionally hit the Supabase REST API.
 *    The heartbeat lives in its own `keepalive` schema so Prisma (public schema) never sees it.
 */

type Result = { ok: boolean; at: string; ms: number; detail?: string };
export const keepaliveStatus: { render: Result | null; database: Result | null; supabaseApi: Result | null; config: Record<string, unknown> } = {
  render: null,
  database: null,
  supabaseApi: null,
  config: {},
};

const minutes = (v: string | undefined, d: number) => Math.max(1, Number(v ?? d)) * 60_000;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

const selfUrl = () => (process.env.KEEPALIVE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
/** Prefer the direct/session connection: the transaction pooler is fine too, but direct is the most "real" activity. */
const dbUrl = () => process.env.KEEPALIVE_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";

async function timed(fn: () => Promise<string | void>): Promise<Result> {
  const t = Date.now();
  try {
    const detail = (await fn()) ?? undefined;
    return { ok: true, at: new Date().toISOString(), ms: Date.now() - t, detail };
  } catch (e) {
    return { ok: false, at: new Date().toISOString(), ms: Date.now() - t, detail: errMsg(e) };
  }
}

export async function pingRender(): Promise<Result | null> {
  const url = selfUrl();
  if (!url) return null;
  const r = await timed(async () => {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "nnamaka-keepalive" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return `${url}/health`;
  });
  keepaliveStatus.render = r;
  if (!r.ok) console.warn(`[keepalive] render ping failed: ${r.detail}`);
  return r;
}

export async function pingDatabase(): Promise<Result | null> {
  const url = dbUrl();
  if (!url) return null;
  const r = await timed(async () => {
    const needsSsl = !/localhost|127\.0\.0\.1/.test(url);
    const client = new pg.Client({
      connectionString: url.replace(/[?&]pgbouncer=true/, ""),
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 15_000,
      statement_timeout: 15_000,
      application_name: "nnamaka-keepalive",
    });
    await client.connect();
    try {
      await client.query("CREATE SCHEMA IF NOT EXISTS keepalive");
      await client.query("CREATE TABLE IF NOT EXISTS keepalive.heartbeat (id text PRIMARY KEY, pinged_at timestamptz NOT NULL, count bigint NOT NULL DEFAULT 1)");
      const { rows } = await client.query<{ count: string }>(
        `INSERT INTO keepalive.heartbeat (id, pinged_at) VALUES ($1, now())
         ON CONFLICT (id) DO UPDATE SET pinged_at = now(), count = keepalive.heartbeat.count + 1
         RETURNING count`,
        [process.env.KEEPALIVE_ID ?? "central"],
      );
      return `heartbeat #${rows[0]?.count}`;
    } finally {
      await client.end().catch(() => {});
    }
  });
  keepaliveStatus.database = r;
  console[r.ok ? "log" : "warn"](`[keepalive] database ${r.ok ? r.detail : `failed: ${r.detail}`}`);
  return r;
}

/** Optional: also touch the Supabase REST API (set SUPABASE_URL + SUPABASE_ANON_KEY). */
export async function pingSupabaseApi(): Promise<Result | null> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const r = await timed(async () => {
    const res = await fetch(`${base}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  });
  keepaliveStatus.supabaseApi = r;
  if (!r.ok) console.warn(`[keepalive] supabase api failed: ${r.detail}`);
  return r;
}

const timers: NodeJS.Timeout[] = [];

export function startKeepalive() {
  if (process.env.KEEPALIVE_ENABLED === "false") return;
  const renderEvery = minutes(process.env.KEEPALIVE_RENDER_MINUTES, 10);
  const dbEvery = minutes(process.env.KEEPALIVE_DB_MINUTES, 12 * 60);
  keepaliveStatus.config = {
    renderUrl: selfUrl() || null,
    renderEveryMin: renderEvery / 60_000,
    database: dbUrl() ? "configured" : null,
    dbEveryMin: dbEvery / 60_000,
    supabaseApi: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  };

  if (selfUrl()) {
    timers.push(setInterval(() => void pingRender(), renderEvery));
    setTimeout(() => void pingRender(), 30_000).unref();
    console.log(`[keepalive] render: ${selfUrl()}/health every ${renderEvery / 60_000} min`);
  } else {
    console.log("[keepalive] render: off (no RENDER_EXTERNAL_URL / KEEPALIVE_URL, normal for local dev)");
  }

  if (dbUrl()) {
    const db = () => {
      void pingDatabase();
      void pingSupabaseApi();
    };
    timers.push(setInterval(db, dbEvery));
    setTimeout(db, 10_000).unref();
    console.log(`[keepalive] database: heartbeat every ${dbEvery / 3_600_000} h`);
  } else {
    console.log("[keepalive] database: off (no DIRECT_URL / DATABASE_URL)");
  }
}

export function stopKeepalive() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
