import {
  pingDatabase,
  pingRender,
  pingSupabaseApi
} from "./chunk-TSBBDGI5.js";

// src/keepalive-once.ts
import "dotenv/config";
var results = { render: await pingRender(), database: await pingDatabase(), supabaseApi: await pingSupabaseApi() };
console.log(JSON.stringify(results, null, 2));
var failed = Object.values(results).some((r) => r && !r.ok);
process.exit(failed ? 1 : 0);
