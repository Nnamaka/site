// src/keepalive.ts
import pg from "pg";
var keepaliveStatus = {
  render: null,
  database: null,
  supabaseApi: null,
  config: {}
};
var minutes = (v, d) => Math.max(1, Number(v ?? d)) * 6e4;
var errMsg = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
var selfUrl = () => (process.env.KEEPALIVE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
var dbUrl = () => process.env.KEEPALIVE_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
async function timed(fn) {
  const t = Date.now();
  try {
    const detail = await fn() ?? void 0;
    return { ok: true, at: (/* @__PURE__ */ new Date()).toISOString(), ms: Date.now() - t, detail };
  } catch (e) {
    return { ok: false, at: (/* @__PURE__ */ new Date()).toISOString(), ms: Date.now() - t, detail: errMsg(e) };
  }
}
async function pingRender() {
  const url = selfUrl();
  if (!url) return null;
  const r = await timed(async () => {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3e4), headers: { "user-agent": "nnamaka-keepalive" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return `${url}/health`;
  });
  keepaliveStatus.render = r;
  if (!r.ok) console.warn(`[keepalive] render ping failed: ${r.detail}`);
  return r;
}
async function pingDatabase() {
  const url = dbUrl();
  if (!url) return null;
  const r = await timed(async () => {
    const needsSsl = !/localhost|127\.0\.0\.1/.test(url);
    const client = new pg.Client({
      connectionString: url.replace(/[?&]pgbouncer=true/, ""),
      ssl: needsSsl ? { rejectUnauthorized: false } : void 0,
      connectionTimeoutMillis: 15e3,
      statement_timeout: 15e3,
      application_name: "nnamaka-keepalive"
    });
    await client.connect();
    try {
      await client.query("CREATE SCHEMA IF NOT EXISTS keepalive");
      await client.query("CREATE TABLE IF NOT EXISTS keepalive.heartbeat (id text PRIMARY KEY, pinged_at timestamptz NOT NULL, count bigint NOT NULL DEFAULT 1)");
      const { rows } = await client.query(
        `INSERT INTO keepalive.heartbeat (id, pinged_at) VALUES ($1, now())
         ON CONFLICT (id) DO UPDATE SET pinged_at = now(), count = keepalive.heartbeat.count + 1
         RETURNING count`,
        [process.env.KEEPALIVE_ID ?? "central"]
      );
      return `heartbeat #${rows[0]?.count}`;
    } finally {
      await client.end().catch(() => {
      });
    }
  });
  keepaliveStatus.database = r;
  console[r.ok ? "log" : "warn"](`[keepalive] database ${r.ok ? r.detail : `failed: ${r.detail}`}`);
  return r;
}
async function pingSupabaseApi() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const r = await timed(async () => {
    const res = await fetch(`${base}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2e4) });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  });
  keepaliveStatus.supabaseApi = r;
  if (!r.ok) console.warn(`[keepalive] supabase api failed: ${r.detail}`);
  return r;
}
var timers = [];
function startKeepalive() {
  if (process.env.KEEPALIVE_ENABLED === "false") return;
  const renderEvery = minutes(process.env.KEEPALIVE_RENDER_MINUTES, 10);
  const dbEvery = minutes(process.env.KEEPALIVE_DB_MINUTES, 12 * 60);
  keepaliveStatus.config = {
    renderUrl: selfUrl() || null,
    renderEveryMin: renderEvery / 6e4,
    database: dbUrl() ? "configured" : null,
    dbEveryMin: dbEvery / 6e4,
    supabaseApi: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  };
  if (selfUrl()) {
    timers.push(setInterval(() => void pingRender(), renderEvery));
    setTimeout(() => void pingRender(), 3e4).unref();
    console.log(`[keepalive] render: ${selfUrl()}/health every ${renderEvery / 6e4} min`);
  } else {
    console.log("[keepalive] render: off (no RENDER_EXTERNAL_URL / KEEPALIVE_URL, normal for local dev)");
  }
  if (dbUrl()) {
    const db = () => {
      void pingDatabase();
      void pingSupabaseApi();
    };
    timers.push(setInterval(db, dbEvery));
    setTimeout(db, 1e4).unref();
    console.log(`[keepalive] database: heartbeat every ${dbEvery / 36e5} h`);
  } else {
    console.log("[keepalive] database: off (no DIRECT_URL / DATABASE_URL)");
  }
}
function stopKeepalive() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}

export {
  keepaliveStatus,
  pingRender,
  pingDatabase,
  pingSupabaseApi,
  startKeepalive,
  stopKeepalive
};
