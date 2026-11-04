export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Init = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit };

/** fetch wrapper for /api/*. Sends cookies, parses JSON, signs out on 401. */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    const { authClient } = await import("./auth-client");
    await authClient.signOut().catch(() => {});
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    throw new ApiError(401, "Signed out");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    const msg = res.status === 502 || res.status === 504 ? "The server is waking up. Try again in a moment." : body.error ?? body.message ?? res.statusText;
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
