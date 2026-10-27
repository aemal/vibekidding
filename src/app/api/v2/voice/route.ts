import { authorize, requestJson } from '@/lib/v2/http';
import { FamilyVoiceLimit, familyVoiceService } from '@/lib/v2-providers/voice';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const state = globalThis as typeof globalThis & { v2FamilyVoiceLimit?: FamilyVoiceLimit };
state.v2FamilyVoiceLimit ??= new FamilyVoiceLimit();
const voice = familyVoiceService({ limit: state.v2FamilyVoiceLimit });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const auth = await authorize(request); if (auth.response) return auth.response;
  return json(await voice.readiness(auth.session!.userId));
}
export async function POST(request: Request) {
  const auth = await authorize(request, true); if (auth.response) return auth.response;
  try {
    const body = await requestJson(request, 1024);
    if (Object.keys(body).length) return json({ error: 'Voice start accepts an empty object.' }, 400);
    return json(await voice.start(auth.session!.userId));
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Voice could not start.' }, 400); }
}
