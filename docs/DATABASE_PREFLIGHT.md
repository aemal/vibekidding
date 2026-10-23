# Database preflight

Migration 014 provides a service-only read-only schema check. Migration 018 updates it to report revision 24 and require the atomic parent-unlock and attempt-limit procedures, plus the privacy inventory. It verifies key current procedure signatures, enabled identity/safety triggers, RLS on studio tables and denial of browser INSERT/UPDATE/DELETE/TRUNCATE privileges. Approved studio requests require this preflight before proceeding; missing/incompatible status fails closed with a setup message. This requires migrations through 018 alongside the updated server. The check is intentionally not cached.

`npm run setup:database` reads the usual local environment and makes a single read-only RPC, bounded by a ten-second timeout. It never prints keys, database URLs, user records or raw provider errors. Without Supabase URL/service-role configuration it exits nonzero without making a request. It does not apply migrations. Run it after applying the reviewed migration chain to the dedicated Supabase project.

This verifies selected structural invariants, not SQL implementation checksums, all RLS policy semantics, provider credentials, real Auth behavior, consent eligibility or realtime. The independent permission/unit/concurrency tests remain necessary. Administrator and parent setup routes remain available for diagnosis; do not treat this as a universal access-control firewall or a replacement for reviewing the database.

Local evidence: all eighteen migrations pass in embedded PostgreSQL; deliberately disabling RLS, granting browser update access or disabling the identity trigger makes the check fail. Production build/targeted lint pass. The local CLI was blocked by missing configuration and sent no network request. No live preflight was performed.
