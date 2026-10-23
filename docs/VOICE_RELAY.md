# Voice relay implementation boundary

Live voice remains disabled. `voice-policy.ts` is a tested protocol foundation only: no WebSocket endpoint, provider connection, microphone access or billing reservation is created by this module.

The policy permits one empty initialization, canonical whole-sample PCM16 audio chunks and replies to server-recorded ping IDs. It rejects browser prompt/configuration overrides, dynamic variables, text/context messages, tool results, metadata and unknown fields. It bounds frame bytes, cumulative audio, message count and outstanding pings, and becomes permanently closed after any violation, deadline or explicit close. Trusted server code supplies the duration (at most three minutes) and monotonic clock. The proposed audio format is mono PCM16 at 16 kHz; the eventual relay must enforce provider negotiation to match.

The constructor and parser do not schedule timers or stop network sockets. A relay must invoke deadline checks from a server timer, close both sockets, observe durable guardian revocation and reserve conservative cost before connecting. It also needs one-use authenticated admission, connection/message rate limits, bounded socket backpressure and verified usage reconciliation. These are unfinished requirements. SDK initialization metadata may need an explicit server-owned replacement; do not broaden the browser allowlist merely to make a connection work.

`voice-watchdog.ts` now supplies the server timer/authorization lifecycle foundation. It starts inactive, requires an initial successful authorization check, checks the policy deadline every 100 ms by default, and polls the supplied authorization callback every second with a two-second failure deadline. Revocation is therefore polling-based, not instantaneous. Failure closes the policy, clears timers, aborts the current check and independently attempts both transport shutdown callbacks. Synchronous throws or asynchronous cleanup rejection cannot reactivate the session or prevent the other callback attempt; a late authorization response cannot reopen it. Real transport adapters must implement force-close/fallback and verify provider termination. A callback being invoked is not proof a socket or provider billing stopped. No database authorization callback or real sockets are wired yet.

Provider audio must never be passed straight through while waiting for a safety verdict. ElevenLabs documents response text events that can arrive after audio has started. The relay still needs an established text/audio association and bounded output buffering or a reviewed turn-based generation path, with input/output moderation before playback. On uncertainty or buffer overflow, stop the session and retain uncertain charges for reconciliation. Tool execution must be server-owned and separately approved, not inferred from a client tool result.

Local tests exercise allowed messages, injection fields, malformed/oversized audio, duplicate initialization/pongs, cumulative limits, deadline, revocation, clock rollback and pending-ping bounds. They do not establish actual SDK interoperability, provider-side termination, metering, speech moderation, pronunciation or child-safety acceptance.

Protocol sources inspected October 20:

- [ElevenLabs Agent WebSockets](https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket)
- [ElevenLabs client events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events)

Use the private agent only from the eventual trusted server relay. Never expose provider API keys or reusable signed provider URLs to the browser.

## Durable admission foundation (migration 019)

Service-only `studio_voice_admit` atomically reserves a trusted server-supplied maximum cost and creates a 30-second admission bound to the authenticated account, owned project and safety revision. Only a SHA-256 digest belongs in the database; the future server adapter must generate a cryptographically random secret, keep it out of logs/URLs and authenticate the connection independently. This migration does not generate or expose tokens.

`studio_voice_claim` locks the account and admission, rejects expiry/replay, settled reservations and changed safety settings, then consumes the admission once. A lost response cannot be retried to open another connection. Failed or unused admissions do not automatically refund potentially uncertain usage. Reserve and duration values require reviewed provider pricing in the future adapter. Ongoing authorization, admission retention cleanup, transport integration and provider reconciliation remain unfinished. No live route calls these procedures; voice remains disabled.

Verified locally: three admission tests plus a real PostgreSQL two-connection claim race. Full local suite: 96 passing tests; concurrency suite: 17 passing scenarios. This is not live voice acceptance.

## Durable authorization foundation (migration 020)

`studio_voice_authorized` checks a claimed session under the same account lock used by parental changes and settlement. It requires current approval, verified guardian email, consent, unexpired supervision, the original safety revision, project ownership and a reserved usage record. The database deadline starts at claim time, so later relay startup cannot extend it. An unclaimed, expired, settled or revoked session is permanently marked ended. `studio_voice_end` provides idempotent server-only closure without releasing uncertain charges. Neither function returns tokens or transcript content.

These procedures are not wired to the watchdog or a live endpoint yet. The future adapter must pass its authenticated account/session identity, call authorization with the watchdog timeout and stop both transports when authorization returns false or fails. A database end marker alone does not stop a provider socket. Admission cleanup and actual provider reconciliation remain outstanding.

## Database/watchdog adapter

`voice-database-watchdog.ts` now composes the protocol policy and watchdog with the service client's `studio_voice_authorized` and `studio_voice_end` procedures. It copies account/session identifiers from trusted server context and accepts only a literal successful boolean authorization. Each authorization request receives the watchdog's abort signal. Shutdown attempts both transport callbacks and the database end write independently; repeated stop calls do not duplicate writes. `endRecorded` reports whether persistence succeeded, with a two-second timeout even when a faulty transport ignores cancellation. A failed end write must be surfaced/reconciled by the eventual host; it never reopens the local policy or refunds credits.

The adapter is not called by a public endpoint. The future relay host must validate sign-in and claim first, wait for `ready`, check `isActive()` before accepting/forwarding each frame, stop on policy violations and gate all generated audio on safety review. Policy parsing alone does not grant authorization. No real sockets, provider calls, microphone sessions or usage reconciliation were exercised by adapter fixtures.

## Bounded output review foundation

`voice-output-gate.ts` now holds one trusted server-assigned turn in copied PCM16 buffers. It permits at most 256 chunks, 32,768 bytes per chunk and 256,000 bytes total (eight seconds at the proposed 16 kHz mono format). Collection plus moderation has one deadline of at most 15 seconds. A complete, nonblank transcript of at most 16,000 UTF-8 bytes must receive a literal `true` from the server reviewer before the buffer can be returned once. Denial, uncertainty, failure, timeout, explicit closure, mismatched turns, repeated finish, overflow or audio arriving during review permanently discard the buffer. Closing clears retained PCM and aborts review; a reviewer ignoring abort cannot delay closure or restore late output.

This is an inert component, not an ElevenLabs event adapter. A caller must establish complete transcript/audio correspondence independently, use a fresh instance for each trusted turn, moderate input as well as output, and attach session shutdown to `close()`. It must recheck current durable authorization before delivery and enforce socket backpressure and session-wide limits. Returned audio cannot be recalled. No provider protocol currently establishes this association in the application, so live voice remains disabled. No usage is settled or refunded by this component.

Verification: six output-gate tests cover held output, copy isolation, one-use release, unsafe/uncertain/error verdicts, hanging reviewers, late success, explicit revocation, concurrent completion, invalid/mismatched/oversized input and whole-turn expiry. Full local suite: 147 tests passed; TypeScript and full zero-warning lint passed. No live audio, provider moderation, deployed relay or child-safety acceptance is implied.

Admission retention is now implemented in migration 028 and invoked by the existing privacy worker: only admissions older than 30 days whose usage is settled are eligible, with a bounded batch and skipped locks. Unresolved reservations and billing evidence remain. See `PRIVACY_MAINTENANCE.md`. This closes the local retention implementation milestone, not live relay or accounting acceptance.
