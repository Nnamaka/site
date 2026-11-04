// Gateway only. Use this when each backend is started by something else
// (backend/start.sh inside Docker, or your own terminals).
// To start the gateway AND every backend in one process, use supervisor.ts (pnpm dev / pnpm start:all).
import { startGateway } from "./gateway";

const server = startGateway();
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
