import { createMiddleware } from "hono/factory";
import { auth, type AuthSession, type AuthUser } from "./auth";

export type AppEnv = { Variables: { user: AuthUser; session: AuthSession } };

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) return c.json({ error: "unauthorized" }, 401);
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});
