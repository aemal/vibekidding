# Guardrail evaluation

`npm run guard:evaluate` previews the 23-case synthetic corpus without calling a provider. This mode does not evaluate classification accuracy.

The corpus covers seven languages, benign project requests, ordinary frustration, privacy education, parental-control bypass, hidden contact details/profanity, manipulative assistant output, distress needing support, family restrictions, and malicious instructions in context/rules. Expectations are authored test labels, not externally validated clinical or safety assessments. Have a qualified human review labels and expand coverage before launch.

A live evaluation is opt-in:

```
npm run guard:evaluate -- --live --max-calls=23 --budget-micro-usd=1000000
```

This example permits up to USD 1 based on the configured conservative bound, not measured provider billing. Set a smaller limit as appropriate. `TYPESAFE_API_KEY`, `TYPESAFE_MODEL` and a reviewed `TYPESAFE_MAX_CHECK_MICRO_USD` are required. The runner uses only synthetic fixtures, not children's saved conversations. It sends each eligible case once, sequentially, stops at the explicit call/budget limit, and stops on an unavailable provider result. This is an operator evaluation budget, separate from family credit balances. Configure provider-side spending limits too.

The runner and production code share the provider adapter and probability parser. The adapter uses a fixed endpoint, 15-second timeout, no retries and a 64 KiB response limit. Local guards strip zero-width/bidi formatting characters before email/phone/profanity heuristics. These heuristics are deliberately incomplete and never establish that other text is safe.

Reports are written under ignored `work/guard-evaluations/`. They contain case IDs, languages, source, expected/actual decisions and categories; no credentials or raw child data. A full pass requires every case to be evaluated successfully. Unavailable/malformed/service-error responses are inconclusive, never successful rejection tests. A positive safety-category expectation such as `needs_support` must also match. Truncated runs are incomplete. Benign requests that pause are failures in this corpus, allowing false positives to remain visible.

Local unit tests inject synthetic provider responses to verify failure handling and scoring semantics. They do not prove the real model's accuracy. No live TypeSafe evaluation was performed in this iteration because the required configuration remains absent. Live voice stays disabled and these typed-generation checks are not a universal monitor of generated app activity.

## Stalled provider response containment

The classifier adapter now races the entire attempt against a maximum 15-second deadline, aborts on completion/timeout and uses the shared strict UTF-8, 64-KiB body reader. HTTP errors, oversized responses and cancellation hooks do not block on stream cleanup. A transport ignoring abort or a late successful response cannot convert a timed-out decision into an allow. There is one attempt and no automatic retry; captured safe request IDs remain available for accounting, and uncertain usage stays reserved.

Synthetic regression cases cover stalled bodies, hanging cancellation, ignored abort, malformed UTF-8, oversized streams and late replies. Tests use a shorter bounded deadline; production retains 15 seconds. This verifies failure containment only, not live classifier accuracy or provider billing.
