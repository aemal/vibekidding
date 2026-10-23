# Notification worker

Local implementation, not a deployed email service.

Apply migrations 001, 002, then `202610200003_notification_jobs.sql` before using the updated notification functions. Configure Resend, a verified sender, and a separate random `STUDIO_WORKER_SECRET` of at least 32 characters. Never put this secret in a browser or a public-prefixed environment variable.

Configure a deployment scheduler to POST `/api/studio/notifications/run` every minute with `Authorization: Bearer <STUDIO_WORKER_SECRET>`. No schedule is installed by this change. The endpoint examines at most five jobs, sends sequentially with ten-second provider timeouts, and returns counts only. The deployment must support the declared 120-second request budget. Immediate and manual notification paths use the same leased queue.

Each job has a two-minute lease, an immutable original payload and a stable provider idempotency key. Failures back off exponentially up to one hour. A crashed worker's lease expires and a replacement can retry. Stale workers cannot overwrite a newer lease's result. Database state changes and marking the source notification accepted happen atomically.

Retries stop after ten attempts or 23 hours from the first attempt, whichever comes first. Resend documents a 24-hour idempotency window: https://resend.com/docs/dashboard/emails/idempotency-keys . The shorter cutoff leaves a margin; no system can guarantee exactly-once delivery across every network/provider failure. Provider timeouts and malformed success responses are treated as uncertain. Changing a recipient or payload sends the job to manual review instead of risking a duplicate or stale-recipient retry. Unverified guardian recipients also require review.

The admin panel displays job state, attempts and non-sensitive error codes. It never returns frozen email payloads. Review jobs require an operator to check provider records; this implementation intentionally provides no “force resend” button. `accepted` and the legacy `sent_at` field mean the provider accepted the request, not that it reached an inbox. Signed delivery/bounce webhooks remain outstanding.

Deleting parent history deletes related alerts and queue metadata. It cannot recall an in-flight email or delete provider records. Email bodies contain no raw project conversation. All queue tables and procedures are service-only. Existing deployments with prior uncertain send attempts must reconcile their old pending notifications before switching to this worker, since the earlier implementation did not record first-attempt timestamps.

Tests use embedded PostgreSQL with synthetic data; they are not live multi-connection concurrency or inbox delivery acceptance. Provider configuration, migrations, a deployed scheduler and live verification are still required.

## Delivery callback implementation (October 20)

Apply migration 004 after 003. Signed callbacks are now implemented at POST `/api/studio/notifications/webhook`. Configure `RESEND_WEBHOOK_SECRET` and subscribe to delivered, delivery_delayed, bounced, complained, failed and suppressed email events in the provider dashboard. Verification uses the Svix library with the exact bounded raw request body; invalid signatures and stale signed timestamps are rejected. No provider webhook or remote configuration has been created by this change.

The database deduplicates callback IDs, stores only provider/message identifiers, event types and timestamps, and keeps adverse outcomes visible when older delivery events arrive. Callback events are retained for 30 days; the scheduler prunes older events. Queue summaries persist with the source notification. The admin panel and parent alert history display known outcomes. “Delivered” means the recipient mail server accepted the email, not proof a parent read it. Open/click tracking is ignored.

Events may arrive before the send response is recorded; each worker pass reconciles them again. This also repairs an overlapping commit race. Until the deployed scheduler and signed callbacks are tested against real messages, delivery remains unverified. The above statement that webhooks remain outstanding refers to deployment/live acceptance; local implementation now exists.

Reference: https://resend.com/docs/webhooks/verify-webhooks-requests and https://resend.com/docs/webhooks/event-types .

The callback reader now shares the bounded stream implementation with studio requests: a ten-second total read deadline, a 65536-byte webhook cap, strict UTF-8 decoding and prompt failure on cancellation or stream errors. It preserves whitespace, Unicode and any BOM instead of normalizing the signed representation. JSON parsing still happens after signature verification. Synthetic signed Unicode/chunked payloads and stalled streams are covered by tests; this does not replace deployment-level rate limiting or live provider callback acceptance.

Outbound mail now uses a separately testable provider adapter. Each invocation submits the frozen payload once with the durable notification ID as its idempotency key. The response body is capped at 65536 bytes and shares the request's ten-second abort signal. Successful HTTP replies with malformed JSON, missing/invalid message IDs or unreadable bodies are recorded as ambiguous, not confirmed sends or refunds. Accepted IDs use the same character/length rules as callback correlation. HTTP errors cancel unread response bodies without waiting for cancellation hooks. Synthetic transport tests verify payload/key preservation, one-attempt behavior, oversized/malformed responses, HTTP rejection and network failures; no actual email was sent.

Migration023 holds new mail claims and retries for families with pending deletion requests. Queue discovery excludes them, and the claim procedure rechecks under the same account lock as deletion. The prior unchecked claim procedure is not executable by the service role. Already acquired leases may represent an in-flight send; finish/callback recording remains enabled for honest accounting and review. This is not email recall or provider deletion.

## Whole-attempt delivery deadline

Mail submission is now bounded by a ten-second deadline spanning transport and response consumption. It aborts when finished, does not await a stalled cancellation hook, and never retries inside the adapter. A timeout before response headers is recorded as `network_or_timeout`; after successful headers it is `ambiguous_response`. Neither means the message definitely was not sent. Late responses cannot replace the recorded result. Durable job state, frozen payloads and idempotency keys remain responsible for reconciliation and retries.

Synthetic tests cover ignored abort, a stalled successful response, hanging cancellation, late success, malformed UTF-8 and invalid test deadlines. No provider call, email delivery or duplicate-send acceptance is established by these fixtures.
