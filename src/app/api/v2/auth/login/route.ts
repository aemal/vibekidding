import { checkPassword, newSession, sameOriginMutation, sessionCookie } from "@/lib/v2-auth/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.username !== "string" || typeof body.password !== "string") return Response.json({ error: "Enter your username and password." }, { status: 400 });
    const user = await checkPassword(body.username, body.password);
    if (!user) return Response.json({ error: "Username or password is incorrect." }, { status: 401 });
    return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(request, newSession(user)), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not sign in. Please try again." }, { status: 400 });
  }
}
