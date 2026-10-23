import { NextRequest, NextResponse } from "next/server";
// Legacy endpoints trust client IDs and cannot safely share the new authenticated platform.
// Preserve their source, but close every old API route, including raw HTML preview endpoints.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (
    path.startsWith("/api/") &&
    !path.startsWith("/api/studio/") &&
    !path.startsWith("/api/published/") &&
    path !== "/api/demo/generate" &&
    path !== "/api/demo/voice" &&
    path !== "/api/parents"
  )
    return NextResponse.json(
      { error: "V1 API is archived. Use the authenticated studio." },
      { status: 410 },
    );
  if (/^\/(project|builder|preview|leaderboard)(\/|$)/.test(path))
    return NextResponse.redirect(new URL("/v1", req.url));
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/api/:path*",
    "/project/:path*",
    "/builder/:path*",
    "/preview/:path*",
    "/leaderboard/:path*",
  ],
};
