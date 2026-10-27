import { localTestAccessEnabled, localTestAccount, newSession, sessionCookie } from "@/lib/v2-auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!localTestAccessEnabled(request)) return Response.json({ error: "Local test access is not enabled for this address." }, { status: 403 });
  try {
    const user = localTestAccount(request);
    return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(request, newSession(user)), "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not open the local studio." }, { status: 409 });
  }
}
