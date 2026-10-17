import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "ql_uid";
const VALID = /^u_[a-z0-9-]{16,40}$/;

/**
 * Issues an anonymous guest id cookie so progress can be saved without
 * collecting any personal information. Also sets basic security headers.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(COOKIE)?.value;
  let res: NextResponse;
  if (existing && VALID.test(existing)) {
    res = NextResponse.next();
  } else {
    const uid = `u_${crypto.randomUUID()}`;
    // Make the cookie visible to this same request's server components / route handlers.
    request.cookies.set(COOKIE, uid);
    const headers = new Headers(request.headers);
    headers.set("cookie", request.cookies.toString());
    res = NextResponse.next({ request: { headers } });
    res.cookies.set(COOKIE, uid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
