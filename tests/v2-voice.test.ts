import test from 'node:test';
import assert from 'node:assert/strict';
import { FamilyVoiceLimit, familyVoiceService } from '../src/lib/v2-providers/voice';

test('voice sessions use the authenticated family key and agent only', async () => {
  const seen: { id: string | null; key: string | null }[] = [];
  const voice = familyVoiceService({
    settings: async owner => ({ apiKey: `fixture-${owner}`, agentId: `agent_${owner}` }),
    fetcher: async (input, init) => {
      const url = new URL(String(input)); const id = url.searchParams.get('agent_id');
      seen.push({ id, key: new Headers(init?.headers).get('xi-api-key') });
      return Response.json({ signed_url: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${id}&conversation_signature=fixture&conversation_id=fixture` });
    },
  });
  assert.equal((await voice.readiness('alice')).configured, true);
  assert.match((await voice.start('alice')).signedUrl, /agent_alice/);
  assert.match((await voice.start('bob')).signedUrl, /agent_bob/);
  assert.deepEqual(seen, [{ id: 'agent_alice', key: 'fixture-alice' }, { id: 'agent_bob', key: 'fixture-bob' }]);
  await assert.rejects(voice.start('alice'), /wait a minute/);
});

test('missing credentials never fall back and provider errors never echo credentials', async () => {
  let called = false;
  const unavailable = familyVoiceService({ settings: async () => { throw new Error('Configure your account.'); }, fetcher: async () => { called = true; return Response.json({}); } });
  assert.equal((await unavailable.readiness('alice')).configured, false);
  await assert.rejects(unavailable.start('alice'), /Configure/);
  assert.equal(called, false);
  const bad = familyVoiceService({ settings: async () => ({ apiKey: 'fixture-secret', agentId: 'agent_alice' }), fetcher: async () => { throw new Error('fixture-secret'); } });
  await assert.rejects(bad.start('alice'), error => error instanceof Error && !error.message.includes('fixture-secret'));
});

test('voice limiter recovers with time and isolates families', () => {
  const limit = new FamilyVoiceLimit();
  assert.equal(limit.admit('a', 0), true);
  assert.equal(limit.admit('a', 1000), false);
  assert.equal(limit.admit('b', 1000), true);
  limit.finish('a'); assert.equal(limit.admit('a', 60000), true);
  limit.finish('a'); assert.equal(limit.admit('a', 3600001), true);
});
