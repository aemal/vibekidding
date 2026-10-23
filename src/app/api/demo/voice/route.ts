import { createVoiceHandlers, VoiceIssuanceLimit } from "@/lib/demo-server/voice-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const state = globalThis as typeof globalThis & { vibekiddingVoiceUsage?: VoiceIssuanceLimit };
state.vibekiddingVoiceUsage ??= new VoiceIssuanceLimit();
const handlers = createVoiceHandlers({ usage: state.vibekiddingVoiceUsage });
export const GET = handlers.GET;
export const POST = handlers.POST;
