# VibeKidding rollout progress

Task Master: `.taskmaster/tasks/tasks.json`. Run `task-master list` from this checkout. The task count is a backlog count, not a percentage of product readiness. The two-minute Codex follow-up resumes this chat; it is separate from the application's notification scheduler.

## Configuration

Run `npm run setup:check`. It reads the same local environment files as Next.js and prints only configuration status, never values. It makes no provider calls. The admin panel has the same checklist after verified admin sign-in. Configuration presence does not establish valid credentials or live acceptance.

Required migration order: 001 studio, 002 parent guard, 003 notification jobs, 004 delivery events, 005 reviewed usage reconciliation, 006 supervised mutations and publishing, 007 privacy maintenance, 008 safety revision, 009 guarded reservations, 010 guardian identity invalidation, 011 atomic account review, 012 guardian consent withdrawal, 013 generation claims, 014 schema preflight, 015 atomic parent unlock, 016 parent attempt limits, 017 privacy inventory, 018 strict settlement. All migrations are local until explicitly applied to the chosen Supabase project. Local checks use synthetic embedded PostgreSQL fixtures, not the legacy production database.

## Reviewed usage reconciliation

Migration 005 and the admin ledger add a manual reconciliation flow. Only the server-verified administrator can invoke it. It requires a verified charge, an evidence-reference string, a provider record reference and explicit confirmation. The app records the administrator and evidence reference atomically with settlement. It cannot independently prove the administrator's evidence is correct; review the actual provider records outside the app.

Reservations must be at least one hour old. Duplicate identical submissions do not refund twice; conflicting submissions and charges above the reserved amount are rejected for investigation. Never interpret a timeout as a zero-cost call. Provider request identifiers are captured when available, but failures before receiving an identifier may need provider support or invoice reconciliation. No automated provider billing import exists yet, and live reconciliation remains unverified.

## Current external blockers

Supabase configuration/admin UUID, TypeSafe configuration and reviewed cost bound, mail sender/key/webhook secret, worker secret and ElevenLabs configuration are missing in this checkout. An OpenAI key is present but has not been revalidated. Child privacy/consent review remains required. Keep the gate closed pending real approval evidence. Live voice and generated-app AI remain disabled until their enforcement mechanisms and acceptance tests are finished.

No provider credentials were copied from other projects. No live migration, deployment, message, provider generation, or voice call was performed in this iteration.

Verification on October 20: 54 local tests, production build and targeted lint passed. Unauthenticated worker requests return 401; unconfigured webhook returns 503. These are local checks only.

Guardrail validation now has a shared bounded provider adapter, 23 synthetic multilingual cases and an explicitly budgeted live evaluation runner. See GUARD_EVALUATION.md. Dry-run only; no live classifier accuracy claim.

Supervision and publishing checks now run inside database transactions for project, fixed-schema storage and multiplayer operations. Both players need active supervised sessions; room reads are restricted when either session is paused. Publishing verifies the exact reviewed content and current owner eligibility. All six migrations were tested together in embedded PostgreSQL. Real concurrent connections, live Supabase realtime and two-device acceptance remain unverified. See SUPERVISED_MUTATIONS.md.

Privacy maintenance now has a separate authenticated endpoint and a proposed 30-day conversation-history policy. All seven migrations pass together locally, including cascading email metadata deletion and bounded cleanup. No live schedule is installed; account/provider deletion and human retention review remain outstanding. See PRIVACY_MAINTENANCE.md.

Migration 008 invalidates in-flight generated results after safety-relevant profile changes, including pause/resume and restoring previous family rules. All eight migrations pass together in synthetic fixtures. This does not cancel or refund provider calls already in flight. See SUPERVISED_MUTATIONS.md.

Migration 009 applies the same safety revision to paid reservations before credit deduction. Local fixtures verify stale requests do not debit credits and service callers cannot invoke the unchecked helper. All nine migrations pass together locally; live multi-connection verification remains outstanding.

Full-schema access regression suite: 58 local tests and targeted lint pass. Checks cover RLS, browser write denial, security-definer search paths/execute grants, guardian-only reads and separate family ledgers. This iteration changed tests only; the preceding production build passed. Live Supabase and concurrent connection checks remain outstanding.

All three current generated-code previews now share a fixed sandbox component with explicit browser-feature restrictions. Targeted lint and production build pass. No generated-app AI/storage bridge is enabled; see GENERATED_APP_BOUNDARIES.md for the remaining isolated-origin and browser acceptance work.

Local Chrome preview checks now run with npm run test:preview-browser. Chrome 155.0.8059.85 passed the synthetic isolation checks with zero probe requests. This does not validate deployment headers, authenticated flows, other browsers or CPU containment. Dependency audit/engine warnings remain unresolved.

Dependency review upgraded Prisma/client together to 6.19.3. Production build and 58 local tests pass; audit high-severity entries decreased from nine to eight. Remaining audit chains and Node engine compatibility still block production readiness; see DEPENDENCY_REVIEW.md.

Guardian identity changes now invalidate stale approval and publication through migration 010. All ten migrations and 61 local tests pass. Real Supabase Auth email/Google changes still require acceptance; see GUARDIAN_IDENTITY_CHANGES.md.

Administrator approval now checks the reviewed safety revision and records its audit entry atomically. Suspension clears supervision, unlock sessions and publication. All eleven migrations and 63 local tests pass; real concurrent Auth/admin testing remains outstanding.

Three actual local PostgreSQL multi-connection checks now pass: concurrent balance reservations, expiry during lock wait and stale consent review. The isolated temporary cluster was stopped after each run. This advances local concurrency evidence but does not verify Supabase, realtime or two-device behavior. See POSTGRES_CONCURRENCY.md.

Local PostgreSQL concurrency suite expanded to six passing scenarios, including shared daily cap contention, duplicate reconciliation refund protection and competing multiplayer moves. These are database behavior checks, not Supabase realtime or provider-billing acceptance.

Continuous-check workflow added locally for correctness and dependency audit. YAML parsed; local Chrome, lint and type checks pass. No GitHub run/push or branch protection configuration occurred. See CONTINUOUS_CHECKS.md.

Guardians can now explicitly withdraw consent through freshly unlocked parent controls. Migration 012 stops access/publication atomically while preserving projects and credits. All twelve migrations and 64 local tests pass. Live OTP-to-withdrawal acceptance remains outstanding.

Build request UUIDs are now claimed before any paid safety check, preventing repeat billing work on duplicate retries. All thirteen migrations and 65 local tests pass; see GENERATION_RETRIES.md. Configuration was rechecked and remains blocked by the same missing provider setup.

Ten local PostgreSQL concurrency scenarios now pass, adding notification lease contention, callback-before-acknowledgement reconciliation and deletion versus completion. No email was sent; live delivery remains unverified.

Structural database preflight now gates approved studio requests. A read-only setup:database command is available for deployment verification. All fourteen migrations and 66 local tests pass; simulated permission/trigger drift fails closed. Missing local configuration prevented a live check. See DATABASE_PREFLIGHT.md.

Compatible Node 22.23.3 is now installed and pinned for this checkout, resolving the previously recorded machina engine mismatch for new processes. All 66 tests, ten independent PostgreSQL concurrency scenarios, Chrome preview isolation, production build and typecheck pass with it. The running development server was not restarted and live voice remains unverified. Dependency advisories and external service acceptance remain open.

Bundled Chromium 156.0.8078.4 now passes preview isolation and parent history clearing against a separate local production server with mocked account responses. The continuous-check workflow includes the parent browser fixture, bounded readiness checks and server cleanup. Targeted lint, types and workflow YAML pass. No hosted Linux workflow, real OTP or live provider acceptance is implied.

Broad Task Master tasks now contain implementation and live-acceptance milestones so completed local work is visible without claiming launch readiness. Migration 015 finalizes parent unlock under the profile lock using the email and safety revision captured before OTP verification. Stale identity/consent/policy checks cannot create a new unlock after changes. Schema preflight now requires revision 15. All 67 local tests, fourteen independent PostgreSQL race scenarios, targeted lint, typecheck and production build pass. No live OTP or migration acceptance.

Studio and parent request ingestion now has a ten-second total read deadline, a 120000-byte cap and strict UTF-8/JSON-object validation. Aborted, stalled, broken and oversized streams produce controlled errors; cancellation cannot hold the response open. The full 72-test suite and production build passed, followed by a sixth focused request test for exact-byte and multibyte boundaries. Targeted lint and typecheck pass. This is application-level ingestion protection, not deployment-level request-rate or denial-of-service acceptance.

Signed notification callback ingestion now shares the bounded stream reader, preserving exact valid UTF-8 text for signature verification. Stalled callback bodies time out without waiting for cancellation. All 75 tests, targeted lint, typecheck and production build pass; no real provider callback or email delivery acceptance.

Parent verification now consumes a database-backed attempt before provider calls: three code sends and ten unlock attempts per account per fifteen-minute window, in independent counters. Migration 016 stores only two reusable counters per account, cascades on profile deletion and denies browser access. Database failure closes verification; rejected/provider-failed attempts are not refunded. All 76 tests, fifteen PostgreSQL concurrency scenarios, targeted lint, types and production build pass. Live OTP and gateway-wide abuse controls remain unverified.

Parent controls now show a family data inventory, unsettled billing and active mail leases, with a manual account-deletion review email draft. Migration 017 is read-only and service-only; no erasure or email was executed. All 77 tests, lint/types/build and Chromium parent inventory/expiry fixture pass. Full erasure remains an explicit unfinished milestone.

Prisma merge-helper dependency now uses a scoped reviewed 8.0.2 override, with actual configuration-loader coverage and production generation/build verified. Audit decreased from eight to five high entries. Remaining findings are in the unpatched Next lint dependency chain; dependency readiness stays incomplete.

Outbound mail now uses a bounded one-attempt adapter with stable idempotency keys and strict callback-compatible IDs. Malformed successful responses remain ambiguous. All 81 local tests, targeted lint, types and production build pass. No real email or provider acceptance was claimed.

Model grant/pricing/catalog validation now precedes paid generation safety checks. Strict price/output/review-date validation fails closed, and unusable pricing is omitted from the model list. All 83 local tests, targeted lint, types and production build pass. Local setup was rechecked; missing service configuration is unchanged and no provider calls were made.

Migration 018 rejects conflicting settlement evidence instead of silently accepting a replay. Invalid charge/token values preserve reservations; identical replays remain idempotent. All 85 tests and sixteen independent PostgreSQL races pass; targeted lint, corrected test types and production build pass. No live billing acceptance.

Voice relay work has begun with a strict server-side browser-message policy and bounded audio/session controls. All 90 local tests, targeted lint and typecheck pass. This is an inert foundation, not an enabled relay: admission, actual sockets/timers, metering, input/output moderation and live acceptance remain unfinished. See VOICE_RELAY.md.

Voice lifecycle watchdog added: initial authorization gate, deadline timer, bounded authorization polling, abort and independent transport-cleanup attempts. Revocation/errors/timeouts permanently stop the controller. 93 local tests plus focused cleanup checks, lint and types pass. Real sockets, database authorization and billing remain unwired; live voice stays disabled.

### Voice admission foundation, 2026-10-20

Added migration 019: service-only, hashed, account-bound, single-use voice admission with atomic credit reservation and 30-second expiry. Claim checks current supervision, safety revision, owned project and unresolved reservation. Failed admission insertion rolls back credit changes. Required schema revision is now 19; no live migration applied and voice remains disabled.

Evidence: 96 local tests pass; 17 independent PostgreSQL race scenarios pass, including simultaneous admission claims. Targeted changed-file lint and typecheck pass. Repository-wide lint still reports 13 errors and 7 warnings in legacy UI; it is not a clean full lint acceptance. Admission adapters, ongoing durable authorization, retention cleanup, actual transports, output safety and provider reconciliation remain unfinished.

### Durable voice authorization, 2026-10-20

Migration 020 adds current parental authorization, claim-time duration enforcement and permanent session end. Account locking serializes against consent changes and billing settlement. Closing does not release uncertain reservations. Required schema revision is 20; no live migration applied. Runtime watchdog/database wiring and real transports remain unfinished, so voice stays disabled.

Evidence: 99 local tests, 18 PostgreSQL independent-connection races, changed-file lint and typecheck pass. The new race confirms consent revocation denies a waiting authorization check and retains the reserve. No live provider, microphone, termination or billing acceptance is claimed. Legacy full-project lint findings from the previous run remain unresolved.

### Database/watchdog adapter, 2026-10-20

Added trusted-context adapter to compose database authorization with the voice watchdog. Copies authenticated binding, propagates cancellation, rejects non-boolean/error responses, independently records session end with a two-second deadline and exposes persistence success/failure. 103 local tests, changed-file lint and typecheck pass. Database responses in these adapter tests are fixtures; real sockets, speech safety, provider billing and endpoint integration remain unfinished.

Setup rechecked without provider calls: Supabase/admin, TypeSafe, Resend/worker and ElevenLabs configuration missing; child consent gate closed. Top-level completion still 2/10 because remaining tasks include live acceptance. No statuses were inflated for infrastructure increments. Updated stale concurrency/advisory descriptions in the backlog.

### Reviewed billing import workflow, 2026-10-20

Implemented operator CLI (`billing:import`) with read-only preview and explicit reviewed apply, strict normalized input, file SHA-256, provider/request matching and all-or-nothing database batch reconciliation. Migration021 records source evidence and prevents reuse of provider requests in the import path. Identical retries are idempotent; uncertain network outcomes require identical retry or audit inspection. Required schema revision21. No live migrations or provider evidence imported.

107 local tests, 19 independent PostgreSQL race scenarios, changed-file lint and typecheck pass. New tests cover read-only preview, audited apply, replay, mismatches, overruns, duplicate input and batch rollback. Real connection race confirms duplicate imports charge once. Marked the bounded normalized-import milestone complete; provider-specific evidence acquisition/authenticity and live acceptance remain in progress.

### Parental deletion-review request, 2026-10-20

Added confirmed, freshly parent-unlocked deletion request, parent request status, admin review queue and database deletion hold. Migration022 stops access/publication and removes parent unlocks. Concurrent approval cannot reopen a pending request; accounting remains available. No erasure occurs and no email is sent by this flow. Required schema revision22; no live migration applied.

Evidence: 109 local tests, 20 PostgreSQL independent-connection races, targeted lint/typecheck, production build, and Chrome155 mocked parent confirmation/expiry/rejection flow pass. Actual Supabase OTP/request recording is not verified. Full account deletion remains in progress because provider handling, retention review, identity deletion and receipts are unfinished.

### Full-project lint gate repaired, 2026-10-20

Resolved the previously reported 13 errors and 7 warnings without disabling lint rules. Legacy data loading is declared inside effects or uses asynchronous callbacks; obsolete fetch results are ignored/cancelled. Modal hydration uses external-store snapshots, language search resets through remounting, editor drafts reset conditionally when source changes, archive context is separate from live initialization, and internal navigation uses Next links/router. Existing V1 API and route safety gates remain in place.

Full lint (zero errors/warnings), typecheck and production build pass. Added a zero-warning lint step to the workflow. Chrome smoke verifies /v1 and /v1/original render without runtime errors and /leaderboard still redirects to /v1. The initial tab-click smoke timed out because the legacy route is intentionally redirected; corrected smoke verifies that boundary instead. Browser APIs were mocked, not live acceptance. Dependency advisories and hosted CI remain outstanding.

### Deletion notification hold, 2026-10-20

Closed a privacy gap: migration023 prevents new notification attempts and retries for a pending deletion request. Queue discovery excludes held families and claim acquisition serializes with deletion under the account lock. In-flight outcomes remain recordable; no email recall or provider deletion is claimed. Required schema revision23; no live migration applied.

111 local tests, 21 independent PostgreSQL race scenarios, full zero-warning lint and typecheck pass. Added cases for new claims, retry suppression, in-flight completion and a real deletion-versus-claim lock race. Full account erasure remains unfinished.

### Reviewed local-content erasure, 2026-10-20

Migration024 and admin/parent interfaces now implement reviewed local-content erasure with exact request binding, unresolved-charge and active-mail blockers, idempotent receipts and late-write prevention. Other-family projects remain. Identity/profile, billing/audit, provider, email, logs and backups remain explicitly outside the receipt. No live migration or real data deletion occurred.

114 local tests, 22 PostgreSQL independent-connection races, full zero-warning lint, typecheck, production build and a mocked Chrome admin confirmation/receipt flow pass. Added a completed local-content milestone while keeping full account/provider deletion in progress.
