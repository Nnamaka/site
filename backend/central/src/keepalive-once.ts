// One-shot keep-alive: pings Render and writes the Supabase heartbeat, then exits.
// Usage: pnpm --filter @nnamaka/central keepalive
// Exit code 1 if any configured check fails (useful in cron / CI).
import "dotenv/config";
import { pingDatabase, pingRender, pingSupabaseApi } from "./keepalive";

const results = { render: await pingRender(), database: await pingDatabase(), supabaseApi: await pingSupabaseApi() };
console.log(JSON.stringify(results, null, 2));
const failed = Object.values(results).some((r) => r && !r.ok);
process.exit(failed ? 1 : 0);
