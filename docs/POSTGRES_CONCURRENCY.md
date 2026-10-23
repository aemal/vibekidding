# Local PostgreSQL concurrency checks

Run `npm run test:postgres-concurrency` with `initdb`, `pg_ctl` and PostgreSQL available on PATH. The script creates a fresh synthetic cluster in a private temporary directory. It accepts connections only over that directory's Unix socket, never TCP, and does not read application database credentials. All migrations are applied to this disposable cluster. Its three clients use five-second statement timeouts.

The runner observes the second connection's lock wait through `pg_stat_activity` before releasing the first transaction. It verifies:

- Two overlapping reservations cannot debit more than the available family balance.
- A request waiting on the profile lock is rejected when supervision expires during the wait.
- A consent change committed while an administrator review waits invalidates that stale approval and produces no approval audit entry.

- Identical concurrent reconciliations refund only once and write one audit record.
- Different families cannot race past the shared daily spending cap.
- Overlapping moves from one player cannot consume two turns.

- Overlapping duplicate build claims admit only one request before paid checks.

- Competing notification workers cannot acquire the same email lease.
- Delivery callbacks committed before send acknowledgement are recovered by reconciliation.
- Deletion racing send completion does not recreate notification metadata.

- Content changed during a publication lock wait invalidates the reviewed HTML.
- Consent revoked during publication prevents sharing.
- Overlapping publication consumes the review once and produces one audit entry.
- Consent withdrawal during OTP verification prevents a stale parent unlock.

- Concurrent parent email-code requests cannot exceed the per-account window limit.

- Conflicting concurrent settlements cannot overwrite the recorded charge or refund twice.

October 20: all sixteen checks passed with PostgreSQL 14.17 (Homebrew). The server was stopped in cleanup; synthetic diagnostics were retained in the printed temporary directory. This uses actual independent PostgreSQL connections, unlike the embedded SQL unit fixtures.

This is not deployed Supabase acceptance. Supabase's target PostgreSQL version, Auth roles/triggers, realtime subscriptions, two-device multiplayer, broader failure/retry contention and deployment configuration still require verification. The installed local server version is used only as an isolated fixture, not recommended as a production version.

Migration 019 adds a seventeenth independent-connection scenario: simultaneous claims of the same reserved voice admission admit only the first connection. Local fixture only; no provider connection is created.

Migration 020 adds an eighteenth race: a parental consent revocation commits ahead of a waiting voice authorization check. Authorization returns false, records permanent session end, and retains the reservation for reconciliation.

Migration021 adds a nineteenth race: simultaneous identical reviewed billing imports settle once and store one evidence row. Synthetic records only.

Migration022 adds a twentieth race: a deletion request prevents a concurrent administrator approval from reopening access. Local synthetic database only.

Migration023 adds a twenty-first race: a pending deletion request beats a waiting notification claim; no mail job or send attempt is created.

Migration024 adds a twenty-second race: local erasure completes before a waiting assistant-history insertion, which is rejected without recreating content.
