import { resolveVoiceSettings } from './store';
import { validateVoiceSignedUrl, voiceProviderRequest } from '../demo-server/voice-provider';
import { validVoiceAgentId } from '../demo-server/voice-config';

export class FamilyVoiceLimit {
  private entries = new Map<string, { active: boolean; attempts: number; start: number; next: number }>();
  admit(userId: string, now = Date.now()) {
    for (const [id, entry] of this.entries) if (!entry.active && now - entry.start >= 3600000) this.entries.delete(id);
    const entry = this.entries.get(userId) || { active: false, attempts: 0, start: now, next: 0 };
    if (entry.active || entry.attempts >= 20 || now < entry.next) return false;
    entry.active = true; entry.attempts++; entry.next = now + 60000; this.entries.set(userId, entry); return true;
  }
  finish(userId: string) { const entry = this.entries.get(userId); if (entry) entry.active = false; }
}

export function familyVoiceService(options: { settings?: typeof resolveVoiceSettings; fetcher?: typeof fetch; limit?: FamilyVoiceLimit } = {}) {
  const settings = options.settings || resolveVoiceSettings;
  const limit = options.limit || new FamilyVoiceLimit();
  return {
    async readiness(userId: string) {
      let configured = false;
      try { const value = await settings(userId); configured = !!value.apiKey && validVoiceAgentId(value.agentId); } catch { /* Missing credentials remain private. */ }
      return { enabled: true, configured, localOnly: false, maxDurationSeconds: 60,
        message: configured ? 'Voice uses your ElevenLabs account. Its agent configuration and data retention settings apply.' : 'Add your ElevenLabs API key and agent ID in AI settings. You can still type or use device dictation.' };
    },
    async start(userId: string) {
      const { apiKey, agentId } = await settings(userId);
      if (!validVoiceAgentId(agentId)) throw new Error('Configure a valid ElevenLabs agent ID in AI settings.');
      if (!limit.admit(userId)) throw new Error('Please wait a minute before starting voice again. This studio allows 20 starts per hour per account.');
      try {
        const query = new URLSearchParams({ agent_id: agentId, include_conversation_id: 'true', debug_events_request: 'false' });
        const signed = await voiceProviderRequest(`/v1/convai/conversation/get-signed-url?${query}`, apiKey, options.fetcher);
        if (!validateVoiceSignedUrl(signed.signed_url, agentId)) throw new Error('Invalid provider session.');
        return { signedUrl: signed.signed_url, maxDurationSeconds: 60, expiresInSeconds: 900 };
      } catch { throw new Error('ElevenLabs could not start this session. Check your API key, agent access and account credits.'); }
      finally { limit.finish(userId); }
    },
  };
}
