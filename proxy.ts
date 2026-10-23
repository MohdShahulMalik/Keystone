import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Fast pre-render gate: only checks for the presence of Better Auth's session
// cookie. Actual session validation happens server-side in the protected
// layout (`app/(protected)/layout.tsx`) and in each Server Action.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return;

  // Browser SSE stream for research lives behind an API route — answer with
  // 401 instead of redirecting an XHR/EventSource to /login.
  if (request.nextUrl.pathname.startsWith("/api/research")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/listings/:path*",
    "/research/:path*",
    "/api/research/:path*",
  ],
};
