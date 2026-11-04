import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { startGateway } from "./gateway";
import { startKeepalive, stopKeepalive } from "./keepalive";
import { REPO_ROOT, services, type Service, type Step } from "./services";

/**
 * Starts every registered backend as a child process, then the public gateway, then the keep-alive jobs.
 * No Docker needed: `pnpm dev` locally, `pnpm start:all` on Render.
 *   - A backend that exits is restarted with backoff (1 s → 30 s). The gateway answers 502 for it meanwhile.
 *   - SIGTERM/SIGINT stop the gateway, then every child, then exit.
 */
const MODE: "dev" | "prod" =
  process.argv.includes("--prod") || process.env.SUPERVISOR_MODE === "prod" || process.env.NODE_ENV === "production" ? "prod" : "dev";
const ONLY = (process.env.SUPERVISOR_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const COLORS = [36, 35, 33, 32, 34, 31];
const tag = (name: string, i: number) => (process.stdout.isTTY ? `\x1b[${COLORS[i % COLORS.length]}m[${name}]\x1b[0m` : `[${name}]`);

let stopping = false;
const children = new Set<ChildProcess>();

function pipe(stream: NodeJS.ReadableStream | null, prefix: string, out: NodeJS.WriteStream) {
  if (!stream) return;
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) out.write(`${prefix} ${line}\n`);
  });
  stream.on("end", () => buf && out.write(`${prefix} ${buf}\n`));
}

function runStep(s: Service, step: Step, prefix: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      cwd: path.join(REPO_ROOT, s.run!.cwd),
      env: { ...process.env, ...s.run!.env, FORCE_COLOR: process.stdout.isTTY ? "1" : "0" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && !path.isAbsolute(step.cmd),
    });
    children.add(child);
    pipe(child.stdout, prefix, process.stdout);
    pipe(child.stderr, prefix, process.stderr);
    child.on("error", (e) => console.error(`${prefix} failed to start: ${e.message}`));
    child.on("exit", (code, signal) => {
      children.delete(child);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function supervise(s: Service, i: number) {
  const prefix = tag(s.name, i);
  const steps = s.run![MODE];
  let backoff = 1000;
  while (!stopping) {
    const started = Date.now();
    let code = 0;
    for (const step of steps) {
      code = await runStep(s, step, prefix);
      if (code !== 0 || stopping) break;
    }
    if (stopping) return;
    if (Date.now() - started > 60_000) backoff = 1000; // it ran fine for a while: reset backoff
    console.error(`${prefix} exited with code ${code}; restarting in ${backoff / 1000}s`);
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 30_000);
  }
}

const managed = services.filter((s) => s.run && (!ONLY.length || ONLY.includes(s.name)));
console.log(`[central] supervisor (${MODE}) starting ${managed.map((s) => s.name).join(", ") || "no backends"}`);
managed.forEach((s, i) => void supervise(s, i));

const server = startGateway();
startKeepalive();

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("[central] shutting down");
  stopKeepalive();
  server.close();
  for (const c of children) c.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const c of children) c.kill("SIGKILL");
    process.exit(0);
  }, 10_000);
  force.unref();
  const wait = setInterval(() => {
    if (children.size === 0) {
      clearInterval(wait);
      process.exit(0);
    }
  }, 100);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
