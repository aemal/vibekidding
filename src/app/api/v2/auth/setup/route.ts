import { newSession, sameOriginMutation, sessionCookie, setupAccount } from "@/lib/v2-auth/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.username !== "string" || typeof body.password !== "string") return Response.json({ error: "Enter a username and password." }, { status: 400 });
    const user = await setupAccount(body.username, body.password);
    return Response.json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(request, newSession(user)), "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not set up the account." }, { status: 400 });
  }
}
