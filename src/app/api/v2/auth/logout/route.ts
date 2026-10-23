import { endSession, sameOriginMutation, sessionCookie } from "@/lib/v2-auth/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  endSession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, "", true) } });
}
