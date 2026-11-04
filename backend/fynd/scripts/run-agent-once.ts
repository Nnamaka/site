// Runs one agent pass now (all running campaigns, all enabled sources), regardless of AGENT_ENABLED.
import { runOnce } from "../src/agent/runner";
import { db } from "../src/db";

runOnce()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
