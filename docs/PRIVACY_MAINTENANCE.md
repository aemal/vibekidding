# Privacy maintenance

Local implementation only. Apply migration 007 after migrations 001 through 006. Configure a deployment scheduler to POST `/api/studio/maintenance/run` hourly with `Authorization: Bearer <STUDIO_WORKER_SECRET>` (the same private, random, at-least-32-character worker credential used for notification processing). No scheduler or live migration has been installed. This endpoint does not require mail-provider configuration and makes no external provider calls.

The proposed retention policy removes conversation/safety activity older than 30 days. Deletion cascades through its parent alerts, frozen notification payloads and associated delivery events. It also removes expired parent unlock sessions, expired multiplayer rooms and orphan delivery events older than 30 days. A pass processes at most 1,000 primary rows per category; related rows cascade, so these do not count toward that primary-row limit. Locked rows are skipped and retried by a later pass. For a large backlog, schedule additional passes and monitor counts; the threshold is not a guarantee of immediate physical deletion.

Responses contain counts only. Unauthorized requests receive 401. Missing database configuration or a failed database operation returns a generic 503. All deletions in a pass are transactional. Browser roles cannot call the procedure. Existing manual guardian history deletion remains available immediately after fresh parent verification.

This is not full account deletion: projects, fixed-schema records, account profiles, billing reservations and audit evidence are retained. Provider-side records, already-sent or in-flight emails, database backups and logs are outside this cleanup. Do not claim these are erased. Retention for those systems, an account-deletion workflow and human privacy/consent review remain launch requirements. Review the proposed 30-day policy before deploying it for real families.

Verification uses synthetic embedded PostgreSQL fixtures with all seven migrations: old/recent records, cascading mail metadata, expired/live sessions and rooms, repeated cleanup, batch limits and denied browser access. It does not establish multi-connection concurrency, production scheduling or provider deletion acceptance.

Migration 017 adds a service-only, read-only family data inventory shown after fresh parent unlock. It counts projects/publication, activity, saved app records, rooms, notification jobs/active leases and billing/unsettled usage. No child content or provider identifiers are returned by the inventory. The API supplies the authenticated parent identity, never a browser-selected user ID. Counts are an informational snapshot, not deletion authorization. The parent screen offers an email draft requesting an account-deletion review; the guardian must review/send it themselves. No message is sent automatically and no account-erasure executor is enabled. Billing/room/outbox foreign keys, unresolved usage, provider retention and backups still need a reviewed erasure workflow.

## Verified-parent deletion-review request

Migration 022 and parental controls now support a durable deletion-review request. A freshly OTP-unlocked parent must confirm the action. The transaction stops supervision, withdraws consent, unpublishes projects, removes parent unlocks and stores one request per account. Retries do not duplicate requests or audit events. No projects, billing, provider, backup or identity records are erased by this action.

The admin panel lists requests for review. A database trigger blocks renewed consent, approval and supervision while a request exists, including concurrent approval. Billing settlement remains possible to resolve outstanding usage. There is no automatic cancellation or erasure endpoint: a reviewed retention plan, provider deletion handling, identity deletion ordering and an erasure receipt are still required. This is not a completed account-deletion feature. The existing contact link remains available for follow-up; no deletion email is automatically sent.

Parents can unlock again to see the request status, but cannot restart building. The live OTP/service path remains unverified. Browser fixture checks use mocked API responses and do not prove actual requests were saved in Supabase.

Migration023 holds new mail claims and retries for families with pending deletion requests. Queue discovery excludes them, and the claim procedure rechecks under the same account lock as deletion. The prior unchecked claim procedure is not executable by the service role. Already acquired leases may represent an in-flight send; finish/callback recording remains enabled for honest accounting and review. This is not email recall or provider deletion.

## Reviewed local-content erasure (migration 024)

This adds a limited erasure operation after the request step described above. A verified administrator must confirm the specific request in the admin panel. The server passes the exact request timestamp, checked again while holding the family account lock. The operation refuses unresolved reserved usage or a current mail lease. Repeating the same completed request returns its original receipt without another deletion or audit event.

The transaction removes the family's projects (including project-scoped records and claims), conversations/alerts, saved app records, shared game rooms in which they participate, queued notification metadata, parent unlocks, model grants and family rules. Shared games end for the other participant too. A deletion hold prevents late content writes and new notifications from recreating removed data. Other families' unrelated projects are not removed. The timestamp and reviewing actor are retained in the deletion request; parents and administrators see a clearly scoped local-content receipt.

Identity/profile details, authentication account, billing/audit evidence, provider records, delivered email, backups and logs are NOT erased by this operation. There is no full-account completion claim. Provider/identity retention decisions and corresponding erasure receipts remain separate unfinished work. No automatic refund is issued. Real deletion requires a configured target and reviewed migration deployment; current verification uses synthetic data only.

## Settled voice admission retention (migration 028)

The same worker now includes service-only `studio_voice_retention()`. It deletes at most 1,000 admission records per pass only when the admission expired more than 30 days ago, any claimed session's duration ended more than 30 days ago, and the matching account's usage record is settled. Locked admissions are skipped for a later pass. The response adds a `voice_admissions` count. Schema preflight now requires revision 28 and denies browser execution of this procedure.

Billing usage, provider evidence, audit entries and credits are unchanged. Unresolved reservations and their admission records are retained for reconciliation, even when expired; cleanup is never proof of zero provider cost and never refunds credits. This extends the proposed retention policy, which still needs human review before deployment. It does not stop sockets or erase provider-held records.

Verification: 154 local tests pass, including settled/unresolved/recent/claimed records, service-only access, repeated cleanup and the 1,000-row limit. All 26 independent PostgreSQL scenarios pass, including a locked admission skipped by one connection and removed after release while the billing record remains. TypeScript and zero-warning full lint pass. No live migration, scheduler or provider session was used.
