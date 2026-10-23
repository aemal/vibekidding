# Reviewed provider billing import

The local operator tool previews and applies normalized, per-request evidence. It does not download provider invoices, authenticate an export or invent per-request amounts from aggregate charges. Provider-specific acquisition and live billing acceptance remain unfinished.

Prepare a JSON array with exactly these fields per record:

```json
[
  {
    "usageId": "10000000-0000-4000-8000-000000000001",
    "provider": "openai",
    "requestId": "provider-request-id-from-the-source",
    "chargeMicroUsd": 40
  }
]
```

This example is synthetic. Amounts are integer micro-USD (1,000,000 = $1), not tokens or estimated costs. Obtain actual per-request cost evidence independently. If only aggregate totals or token counts exist, do not use this tool to label an estimate as a verified charge. Do not include prompts, transcripts, keys or personal information. Maximum 100 records and 100 KB; unknown fields, duplicate records and fractional amounts are rejected.

With the reviewed migration chain through 021 applied to the intended Supabase project, run from the repository:

```sh
npm run billing:import -- /absolute/path/reviewed-records.json ADMINISTRATOR_UUID
```

This is a read-only preview. It requires configured Supabase service credentials and an actor present in `STUDIO_ADMIN_USER_IDS`. This is a trusted local operator command, not a public endpoint. Check the intended target environment before applying. The preview checks stored provider/request identity, unsettled reservation age (at least one hour), recorded reservation ceiling and duplicate evidence. It prints a file SHA-256 and counts, not record content.

After reviewing the original provider evidence, apply the exact same file:

```sh
npm run billing:import -- /absolute/path/reviewed-records.json ADMINISTRATOR_UUID --apply-reviewed
```

All rows are processed in one database transaction. Any invalid row rolls back the entire batch. Each applied record stores the source-file digest, provider/request identity, amount and operator; the existing reconciliation audit and settlement refund apply once. Identical repeated imports are idempotent, while conflicting evidence fails. The same provider request cannot pay for two reservations through this import path. A missing recorded provider ID requires separate manual investigation.

If a request times out, the commit outcome is unknown. Inspect the audit or rerun the identical file; do not change the file to force a second reconciliation. An unchanged retry is safe. Preserve the reviewed source securely for audit. This feature does not erase accounting records, authorize account deletion or prove live provider integration.

The CLI now validates database confirmation before reporting success: exact apply mode, nonnegative integer counts, the expected batch total and only the documented response fields. Missing, malformed or mismatched confirmation is ambiguous for an applied import. The submission has a ten-second deadline even if transport ignores cancellation; late success cannot change the result and no automatic retry or refund occurs. Transport exceptions are replaced with a fixed diagnostic rather than exposing request details. Existing digest-based replay and audit inspection remain the recovery path.

Verification: four confirmation tests cover both modes, malformed counts/fields, stalled transport, late success, redacted exceptions and invalid limits. All 151 local tests, TypeScript and full zero-warning lint passed. No provider evidence was fetched, live credits changed or live settlement verified.
