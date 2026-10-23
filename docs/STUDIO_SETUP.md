> Latest rollout: migrations 004 (signed delivery events) and 005 (reviewed credit reconciliation) are now required too. See [ROLLOUT_PROGRESS.md](ROLLOUT_PROGRESS.md) for current acceptance and blockers.

> October 20 update: notification retries now require migration 003. See [NOTIFICATION_WORKER.md](NOTIFICATION_WORKER.md). The worker is implemented locally; deployment scheduling and delivery webhooks remain outstanding.

> Update: parent supervision and GuardLoop now add a second migration and additional required configuration. Read [PARENT_GUARD_SETUP.md](PARENT_GUARD_SETUP.md) before enabling the studio.

# VibeKidding studio - implementation and rollout

Status: local implementation, not production-ready. No deployment or live database migration was performed.

## What changed

The root route now provides a generic project studio for art, science, stories, helpful apps and games. Guardian Google/email-code sign-in, enrollment, pending approval, balance display, approved model picker, creation/editing, sandbox preview and sharing-review controls are implemented. `/admin` provides account approval/suspension, consent references, positive/negative credit adjustments, model discovery/rates/grants, publishing review, email retries and a usage ledger. `/play` provides a two-player tic-tac-toe template with a locally generated QR invite and Supabase Realtime subscription plus polling recovery. Public reviewed projects resolve at `/{username}/{project-slug}`.

The original root dashboard source is copied to `/v1`. Old routes and source remain in the repository. **V1 is an archive, not a working legacy editor:** its insecure APIs return 410, and old editor/preview/profile routes redirect there. The original implementation accepted browser-provided identities, had no real auth and used Neon/Prisma, not Supabase. Leaving it enabled would bypass the new gates. Existing data was not copied or deleted. A reviewed identity/data migration is outstanding. The previously empty `src/app/project/[id]/page.tsx` now redirects to V1 so the app builds.

Uncommitted user edits present at task start were preserved. Source and the initial diff were backed up in the task workspace's `work/baseline/` directory before app changes. Next.js generated the new AGENTS.md when starting development.

## Configuration

1. Use a dedicated Supabase project; do not run this SQL against the existing Neon schema. Review and apply `supabase/migrations/202610190001_studio.sql`. No arbitrary end-user DDL is supported. The migration is one-time, not rerunnable.
2. Configure values from `.env.studio.example`. The public URL and anon key are public client configuration. The service role, OpenAI, mail and ElevenLabs credentials must remain server-side. Do not prefix secrets with `NEXT_PUBLIC_`.
3. Enable Google in Supabase, configure Google's OAuth redirect URI from Supabase, and allow only the actual studio origins in Supabase redirect settings. Configure production SMTP, email rate limits and CAPTCHA/abuse protection. Use `{{ .Token }}` in the Supabase email template so the user receives a code rather than only a magic link. Keep email confirmation enabled.
4. Sign in as the administrator. Put the verified account's immutable Supabase UUID in `STUDIO_ADMIN_USER_IDS`. Email addresses, URL parameters and user-editable metadata do not confer admin access. Initial admin access does not require a studio profile.
5. Guardian enrollment creates a pending profile. A fresh email OTP after enrollment is required, including for Google accounts. Admin approval requires an email-verification timestamp and a reference to an independently reviewed guardian-consent record. **Email OTP proves mailbox access; it is not independent-factor MFA, proof of age, or verified parental consent.** If independent-factor MFA is required, implement Supabase TOTP and enforce AAL2; that is not included.
6. Complete child eligibility/age-band, guardian authority, provider terms, privacy, retention/deletion, geographic requirements and safeguarding review before setting `STUDIO_CHILD_SAFETY_APPROVED=true`. The default gate blocks approved studio APIs and public project rendering. The UI asks for the guardian's account and discourages children's personal data; it does not implement a legally verified consent service. Do not collect children's personal information to test it.
7. Configure Resend with a verified `STUDIO_MAIL_FROM`. Signup and credit requests are stored in `studio_outbox` and addressed to **a@aemalsayer.com**. A missing provider or failed delivery remains pending. Admin can retry; add a scheduled outbox worker and delivery-webhook reconciliation for production. Repeated requests are deduplicated per user/kind/UTC day. Provider idempotency retention is finite, so late retry after an ambiguous delivery needs review.
8. With a valid OpenAI key, refresh the admin model catalog. Choose only a model that supports the Responses API and review current pricing. No model ID, including any ChatGPT-branded Astra name, is pre-enabled. Model listing proves visibility to the key, not successful inference or endpoint compatibility. Grant models per account. Prices must be refreshed within 30 days.
9. Enable the migration's `studio_rooms` realtime publication in the Supabase environment and verify RLS with separate authenticated clients. Room participants must be approved accounts. An invite is a random room UUID, not an authorization token. Rooms expire after one hour and allow exactly two members. No anonymous chat or open lobby exists.

At inspection, Supabase public/service configuration, ElevenLabs and Resend were missing. The existing OpenAI key returned HTTP 401 from `/v1/models`; no working API model inventory was obtained. No real email, paid generation or voice session was triggered.

## Credit and cost boundary

Credits are integer micro-USD: 1,000,000 = USD 1 of configured-price usage. Admin enters rates in micro-USD per million tokens. Example arithmetic only: a provider price of USD 2 per million input tokens means `input_rate = 2000000`.

`studio_reserve` locks the user profile, enforces approved status/verified email/consent, checks model grant, reserves a conservative byte-based input bound plus framing allowance and the maximum output, and updates a shared daily budget atomically. Default per-user daily cap is USD 1; global daily cap USD 5; maximum single reservation USD 1. These are database limits, not promises about upstream bills. Set provider-side project budgets and review actual prices; any price drift or unexpected billing unit needs reconciliation.

Generation uses server-only OpenAI credentials, no automatic SDK retries, 3,000-character prompt limits, bounded existing context, model output limits, and moderation before generation and before saving. Responses use `store:false`; this is **not** a guarantee of zero retention. Provider child-use requirements and data processing remain a launch blocker.

Settlement refunds unused reserve exactly once using actual reported input/output token counts and configured rates. Network ambiguity, missing usage or an interrupted process keeps the reservation held. Do not release it automatically: upstream may have billed it. Manual investigation is needed; a provider reconciliation worker and user-visible request recovery are outstanding. Admin credit adjustments have idempotency keys and audit rows. In-flight calls may finish after account suspension; suspension blocks new calls and public rendering, not cancellation of an already-running provider request.

Database procedures are executable only by service_role. Browser RLS permits own profile/project/usage/record reads and room-member reads. Browsers cannot approve, grant credits, alter balances, write arbitrary tables or execute privileged RPCs. Server routes verify the Supabase token on every request. Records use a fixed `(project_id,user_id,key,value)` table with an 8 KiB value and 100-record quota. Projects are limited to 50 per owner and rooms to five active per host.

## Voice: prepared, deliberately blocked

Inspected Project 208's Uptime Harness `src/app/api/voice/session/route.ts` and `src/components/voice-panel.tsx`, plus the location of the newer VibeBox pattern. The working pattern uses the ElevenLabs conversation SDK and a server-generated signed URL.

`StudioVoice.tsx` implements the conversation SDK and a proposed `propose_project` client tool that places a short idea into the editor for review; it never starts generation or publishing itself. `docs/elevenlabs-agent.json` is a proposed gentle adult-narrator agent configuration, not a provisioned or provider-validated agent. No child voice is cloned.

The `/voice` endpoint always returns 503 after access checks. A reusable provider signed URL plus a browser timer cannot enforce the studio's credit cap. Still required: server-owned single-use WebSocket relay; reviewed private agent and voice; provider-enforced duration plus independent server termination; worst-case voice/LLM reservation; replay/race tests; provider-authenticated usage reconciliation; retention/recording review; microphone and end-to-end testing. Adding environment variables alone does not enable voice. Do not remove the gate to demo paid voice.

## Publishing and generated apps

Public sharing requires admin review of the exact HTML. Regeneration makes the draft private again. Publishing uses an HTML equality precondition so concurrent generation cannot replace reviewed content unnoticed. Suspended accounts are not publicly served.

Generated content is placed in an opaque-origin iframe with only `allow-scripts`, restrictive inner CSP, no forms/popups/top navigation, no provider keys, and no network fetch. The parent frame policy limits frame navigation to the studio origin. All pages deny external embedding. This is defense in depth, not a claim of exhaustive sandbox penetration testing. Use a separate registrable domain for untrusted apps before production, and test hostile redirects, storage, downloads, resource exhaustion and browser edge cases.

**AI-powered published-app execution and a general generated-app database bridge are not implemented.** Public viewers cannot consume the owner's credits. The fixed-schema owner storage API exists at `/api/studio/records`, but is not injected into generated HTML. A reviewed parent/iframe bridge with source binding, authenticated viewers, approved operations/prompts/models, per-app and per-viewer budgets and abuse controls is required. The tic-tac-toe template is trusted first-party UI using the fixed room schema, not an arbitrary generated migration.

## Verification

- Production build and TypeScript checks passed after adding the studio.
- Eleven embedded PostgreSQL/PGlite tests passed: reservations, idempotent settlement and grants, insufficient funds, model/status/verification/consent gates, daily caps, RLS and forbidden RPCs, room turn/win/membership/expiry, sandbox policy, record ownership/size and creation quotas.
- Requests dispatched together in the tests are serialized by PGlite. This is not evidence of multi-connection production PostgreSQL stress testing. Perform real concurrent database tests before launch.
- HTTP checks: main/V1/admin/play render; legacy project/generation/preview APIs return 410; unauthenticated studio me/admin/models/generation return 401; foreign-origin verification returns 403; parent frame CSP present.
- Browser inspected the logged-out studio and a starter-card interaction. Authenticated UI, Google/SMTP delivery, model inference, live Supabase RLS/realtime, two-device multiplayer, public publication and microphone behavior remain unverified.
- Next.js updated from 16.1.1 to 16.4.2 and compatible dependency fixes applied. The critical advisory is gone. npm audit still reports nine high-severity transitive findings in the legacy Prisma/config and lint dependency trees. Do not force the suggested breaking/downgrade fixes; review dependency removal/migration separately.
- Node 22.16.0 built successfully but an ElevenLabs transitive dependency (`machina`) declares Node >=22.22. Use a supported Node release satisfying that before live voice testing.

Run `npm run test:studio`, `npm run typecheck`, and `npm run build` with the supported Node runtime. Local preview uses port 3217.

## Sources consulted

- https://developers.openai.com/api/reference/resources/models/methods/list
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
- Installed Next.js 16.4.2 proxy and headers documentation.
