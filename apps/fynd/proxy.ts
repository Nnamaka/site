import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Next 16 proxy (formerly middleware). Cheap cookie presence check only; the API validates
// the session on every call, and a stale cookie gets a 401 there (see lib/api.ts).
export function proxy(req: NextRequest) {
  const hasSession = Boolean(getSessionCookie(req, { cookiePrefix: "fynd" }));
  if (!hasSession && !req.nextUrl.pathname.startsWith("/login")) {
    const url = new URL("/login", req.url);
    if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
