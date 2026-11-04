import path from "node:path";

/**
 * Registry of every backend behind the gateway.
 *
 * Routing: a request to  {prefix}/anything  is forwarded to  {target}/anything  (prefix stripped).
 * Process: when `run` is set, the supervisor (src/supervisor.ts) starts it — `dev` steps locally,
 * `prod` steps on Render. Steps run in order; the last one is the long-running server.
 * Each backend reads its own .env from its folder; on Render all vars come from the service env.
 */
export type Step = { cmd: string; args: string[] };
export type Service = {
  name: string;
  prefix: `/${string}`;
  target: string;
  health: string;
  description: string;
  timeoutMs?: number;
  run?: { cwd: string; dev: Step[]; prod: Step[]; env?: Record<string, string> };
};

/** Repo root. pnpm runs package scripts inside backend/central. */
export const REPO_ROOT = process.env.REPO_ROOT ?? path.resolve(process.cwd(), "../..");

// Run package binaries through the current Node so it works the same on macOS, Linux, Windows and Render.
const node = process.execPath;
const bin = (pkg: string, entry: string) => `node_modules/${pkg}/${entry}`;

export const services: Service[] = [
  {
    name: "fynd",
    prefix: "/fynd",
    target: process.env.FYND_URL ?? "http://127.0.0.1:4001",
    health: "/api/health",
    description: "Fynd job-search agent (TypeScript · Hono · Prisma)",
    timeoutMs: 120_000,
    run: {
      cwd: "backend/fynd",
      dev: [{ cmd: node, args: [bin("tsx", "dist/cli.mjs"), "watch", "src/index.ts"] }],
      prod: [
        { cmd: node, args: [bin("prisma", "build/index.js"), "migrate", "deploy"] },
        { cmd: node, args: ["dist/index.js"] },
      ],
      env: { FYND_HOST: "127.0.0.1", FYND_PORT: "4001" },
    },
  },
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
