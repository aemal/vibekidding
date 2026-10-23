> Latest rollout: migrations 004 (signed delivery events) and 005 (reviewed credit reconciliation) are now required too. See [ROLLOUT_PROGRESS.md](ROLLOUT_PROGRESS.md) for current acceptance and blockers.

> October 20 update: notification retries now require migration 003. See [NOTIFICATION_WORKER.md](NOTIFICATION_WORKER.md). The worker is implemented locally; deployment scheduling and delivery webhooks remain outstanding.

# Ash's family studio: parent controls and GuardLoop

This is a local implementation. Apply both Supabase migrations in order before using the new controls. No remote schema change, live TypeSafe evaluation, actual parent email, or authenticated parent session was tested during this change.

## Parent workflow

- `/parents` is the control room. The guardian first signs in normally, then requests a fresh Supabase email OTP. The verify result must belong to that same account.
- Successful verification creates a random 256-bit parent token. Only its SHA-256 hash is stored in a service-only database table. The token is an HttpOnly, SameSite=Strict cookie, Secure and host-only in production, bound to the verified user and valid for 15 minutes.
- Parent controls can start a 30-minute supervised session, pause building, add up to ten additional rules, review the latest 100 activity entries, delete saved activity and retry pending email alerts. A parent should lock controls before returning to the child view and keep their mailbox inaccessible to the child.
- A child can pause a session but cannot restart it or read history through the normal browser Supabase client. RLS denies all browser access to the parent-token, history and alert tables. Server routes scope every operation to the authenticated guardian's UUID.
- This is one guardian account supervising a shared builder session, not separate child identities or multiple guardians. Email OTP is a mailbox-access check, not proof of adulthood, parental authority, or independent-factor MFA. A child with the guardian's mailbox or an unlocked parent session can act as that guardian. Physical adult presence cannot be detected.
- Admin approval remains the invitation gate. There is no public auto-approval and no invitation-code system added in this change.

## Blocking before generation and display

Reference: GuardLoop's `lib/guard.ts`, `app/api/guard/route.ts` and `components/conversation-lab.tsx`. The source conversation demo sends typed text before its observational safety result. The family studio awaits a decision before calling OpenAI, and independently evaluates generated HTML before saving/returning it. It does not reuse the observational ordering.

The immutable baseline covers age-inappropriate content, abusive language, dangerous activity, private identifying information, manipulation/secrecy, bypass attempts and supportive escalation for distress. Harmless crosswords and ordinary frustration are not inherently prohibited. Parent-defined restrictions are a separate question; they cannot replace the baseline question. Do not claim classifier immunity to adversarial instructions.

TypeSafe uses its documented `/v1/systemone` endpoint and `noul` probabilities. The adapter validates all six expected categories, answer type and finite 0–1 values. All scores must be <=0.3 to proceed. Any score >=0.7 blocks; intermediate results pause as uncertain. Malformed answers, missing configuration, failed provider responses and timeouts block rather than fall back to generation. Simple local email/phone/profanity checks avoid sending obvious matches to providers; these are deliberately limited heuristics, not comprehensive multilingual detection.

Every completed safety check saves a user request or AI result and its decision. A non-clear event, supervision pause and parent-alert outbox insert occur in one SQL transaction. If writing the safety record fails, the request cannot proceed. Parent notifications contain no raw conversation; the parent unlocks history to see what was discussed. Safety flags should prompt support and discussion, not punishment.

The final project-save RPC locks the profile and rechecks approval, supervision expiry and the exact family rules against the request snapshot. It also checks the original project HTML to reject stale concurrent writes. Already-running provider calls are not cancelled by a parent pause; their output is withheld if the session or policy has changed before save. Parent unlock/session expiry does not recall content already displayed on a device.

The review covers typed project building. It is not a generic monitor of everything a child does in the browser or inside a generated project. Voice remains disabled. The trusted tic-tac-toe and owner record API require a supervised studio session, but do not run text-classification on every database value. Generated-app AI/database bridges remain unimplemented and inaccessible.

## Required setup

1. Apply `202610190001_studio.sql`, then `202610190002_parent_guard.sql` in a reviewed Supabase environment. Existing local tests also exercise both migrations in embedded PostgreSQL.
2. Keep the existing child privacy gate disabled until provider eligibility, guardian consent, data handling, retention and production validation are complete.
3. Set `TYPESAFE_API_KEY` and a model verified with TypeSafe's `/v1/models` discovery endpoint in `TYPESAFE_MODEL`. Do not assume a default model is available. API contract: https://api.typesafe.ai/docs .
4. Set `TYPESAFE_MAX_CHECK_MICRO_USD` to a reviewed conservative bound for one evaluation with up to 24,000 target characters, six context snippets of up to 1,200 characters, six questions and up to ten family rules. A value must be a positive integer <=1,000,000. No key or cost assumption was copied from another project.
5. Safety evaluations reserve this maximum from the same user/global daily budget before calling TypeSafe. Reservations remain held pending provider cost reconciliation; automatic TypeSafe settlement/refunds are not implemented. This is conservative reservation accounting, not verified exact provider billing. Configure upstream provider spending caps and validate the bound/prices before use.
6. Configure Supabase email OTP delivery and Resend with a verified sender. Alerts resolve the current verified guardian address through Supabase admin lookup; clients cannot nominate a recipient. Pending alerts can be retried from Parent controls. A background retry scheduler and delivery-webhook reconciliation are still needed for production; a missing sender/key means no email is delivered.
7. Validate with separate authenticated accounts, real concurrent Postgres connections, replay/expiry tests, multilingual/obfuscated harmful inputs, benign education and help-seeking prompts, false positives, provider failures and email failures. Local fixture scores test control flow and validation, not Jev's classification accuracy.

## Privacy and retention

History is explicit and guardian-visible, not hidden monitoring. It can contain sensitive information, so browser RLS blocks it entirely and parent OTP controls server access. Only the latest 100 entries are returned to the page; older entries remain stored until the parent deletes activity. Clearing activity also deletes associated alert rows. It does not delete projects, accounting records or copies held by providers. A production retention schedule, data export/deletion process and provider agreements remain to be set up. Do not promise zero retention.

The founder story uses the user's supplied experience and describes an invite-only, non-commercial, API-cost-funded project; it does not claim registered nonprofit status. Ash's first name and age are included at the user's explicit request. The illustration is a lightweight CSS-animated mascot with reduced-motion support, not an imported hackathon GIF or proof that monitoring is live.
