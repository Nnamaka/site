import {
  REPO_ROOT,
  services,
  startGateway
} from "./chunk-XRN6QHVN.js";
import {
  startKeepalive,
  stopKeepalive
} from "./chunk-TSBBDGI5.js";

// src/supervisor.ts
import "dotenv/config";
import { spawn } from "child_process";
import path from "path";
var MODE = process.argv.includes("--prod") || process.env.SUPERVISOR_MODE === "prod" || process.env.NODE_ENV === "production" ? "prod" : "dev";
var ONLY = (process.env.SUPERVISOR_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
var COLORS = [36, 35, 33, 32, 34, 31];
var tag = (name, i) => process.stdout.isTTY ? `\x1B[${COLORS[i % COLORS.length]}m[${name}]\x1B[0m` : `[${name}]`;
var stopping = false;
var children = /* @__PURE__ */ new Set();
function pipe(stream, prefix, out) {
  if (!stream) return;
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) out.write(`${prefix} ${line}
`);
  });
  stream.on("end", () => buf && out.write(`${prefix} ${buf}
`));
}
function runStep(s, step, prefix) {
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      cwd: path.join(REPO_ROOT, s.run.cwd),
      env: { ...process.env, ...s.run.env, FORCE_COLOR: process.stdout.isTTY ? "1" : "0" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && !path.isAbsolute(step.cmd)
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
async function supervise(s, i) {
  const prefix = tag(s.name, i);
  const steps = s.run[MODE];
  let backoff = 1e3;
  while (!stopping) {
    const started = Date.now();
    let code = 0;
    for (const step of steps) {
      code = await runStep(s, step, prefix);
      if (code !== 0 || stopping) break;
    }
    if (stopping) return;
    if (Date.now() - started > 6e4) backoff = 1e3;
    console.error(`${prefix} exited with code ${code}; restarting in ${backoff / 1e3}s`);
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 3e4);
  }
}
var managed = services.filter((s) => s.run && (!ONLY.length || ONLY.includes(s.name)));
console.log(`[central] supervisor (${MODE}) starting ${managed.map((s) => s.name).join(", ") || "no backends"}`);
managed.forEach((s, i) => void supervise(s, i));
var server = startGateway();
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
  }, 1e4);
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
