import type { NextRequest } from "next/server";

/**
 * Same-origin proxy: /api/*  →  {FYND_API_URL}/api/*  (central gateway → backend/fynd).
 * Read at request time (a next.config rewrite is frozen at build time, so a missing or changed
 * FYND_API_URL silently pointed production at localhost). Cookies pass through both ways, so
 * auth stays first-party on this domain. If the backend can't be reached, the response says so.
 */
const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length", "content-encoding"];

function apiBase() {
  return (process.env.FYND_API_URL ?? "http://127.0.0.1:4000/fynd").replace(/\/$/, "");
}

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${apiBase()}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set("x-forwarded-host", req.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
      // @ts-expect-error Node fetch needs duplex for streamed request bodies
      duplex: "half",
    });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const reason = err.name === "TimeoutError" ? "timed out" : err.cause?.code ?? err.message;
    console.error(`[fynd-proxy] ${req.method} ${target} failed: ${reason}`);
    return Response.json(
      { error: `Can't reach the Fynd API (${reason}). Check that the backend is running and FYND_API_URL is ${apiBase()}.` },
      { status: 502 },
    );
  }

  const out = new Headers(upstream.headers);
  for (const h of HOP_BY_HOP) out.delete(h);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE, forward as OPTIONS };
