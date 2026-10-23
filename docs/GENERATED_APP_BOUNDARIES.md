# Generated app boundaries

Current studio, administrator review and published-project views share `GeneratedPreview`. It accepts content, title and presentation props only, so callers cannot override sandbox flags or delegate browser capabilities accidentally. The frame allows scripts but not same-origin access, popups, forms, downloads or top-level navigation. It uses no-referrer and explicitly denies camera, microphone, geolocation, clipboard read/write, screen capture, payment, USB and fullscreen where supported by the browser.

The generated document CSP blocks external resource loads and connections. The parent application's CSP restricts frame destinations to self. These are defense-in-depth controls, not a general network isolation guarantee: iframe navigation, same-site requests, browser differences and denial-of-service behavior require real browser acceptance. Do not place secrets or reusable credentials in generated content. No generated-app AI/storage bridge is enabled.

Before enabling capabilities, implement a separate isolated execution origin, authenticated and scoped viewer operations, per-app/viewer budgets and a reviewed message protocol. Verify parent-DOM isolation, storage denial, network and navigation behavior, device-feature restrictions, popup/download blocking and CPU/loop handling in supported browsers. The legacy V1 UI is archived separately and is not evidence of current sandbox acceptance.

Local verification: shared component wired into all three current preview surfaces; targeted lint and production build. This does not establish browser enforcement or production security acceptance.

Browser references: [iframe sandbox and permissions](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) and [Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy).

## Local Chrome fixture evidence

Run `npm run test:preview-browser` with Google Chrome installed. The runner opens a fresh headless browser profile against an ephemeral loopback server, renders the real shared component with the current application response headers, and attempts synthetic parent-DOM access, local storage, fetch, image loading, form submission, popup creation and top navigation. It checks the browser's feature-policy denial for the listed sensitive APIs. No credentials, child content or external provider calls are used. The temporary server/browser close after completion.

October 20 result: passed in Chrome 155.0.8059.85, with zero probe requests received. This establishes these checks only in the local fixture. It does not establish deployed headers, authenticated flows, all navigation variants, cross-browser behavior or CPU/denial-of-service containment. The dependency installation retained nine high-severity audit findings and the existing Node >=22.22 engine warning from machina; these remain production-readiness work.

## Capability protocol foundation (not enabled)

`AppCapabilityPolicy` validates a future parent-side message boundary. It installs no event listener and enables no operations in `GeneratedPreview`. Current opaque-origin previews are intentionally rejected. Deployment must first provide a separate HTTPS execution origin, with no studio cookies/secrets, reviewed CSP/navigation containment and browser acceptance.

Trusted host code supplies the exact execution origin, expected iframe `WindowProxy`, freshly generated session identifier, operation allowlist and lifetime (maximum five minutes). It must close the policy on navigation/unmount, revoke it on account/supervision changes and never accept these bindings from generated content. Wire messages are bounded JSON strings. Only record.read (key), record.write (key/string value) and ai.generate (prompt) are recognized; extra authority fields such as user, project, model, price or URL are rejected. Request IDs are single use, accepted requests are capped at 100 per policy, and invalid/regressing clocks fail closed. Host code must handle unrelated rejected messages without dispatching them.

This transport policy is not an authorization token, a financial budget, a content moderator or a durable replay defense. Before dispatch, the server must independently bind the authenticated viewer and approved project, verify fresh supervision/consent, apply family and output safety checks, reserve bounded spending atomically, and enforce per-viewer/app limits and durable request idempotency. Storage must remain in the tenant-safe fixed schema; a message cannot select an owner, SQL or table. No server dispatcher, separate origin deployment, response channel or generated AI/storage access is implemented by this milestone.

Local synthetic tests cover exact source/origin/session, replay, expiry, clock regression, quotas, permission copying, unknown operations/authority fields, byte limits and invalid origins. These tests do not establish browser or live capability acceptance.

## Shared-page read gate

Every new shared-page request checks the required database safety revision before reading publication state. The existing `studio_published` function excludes unapproved owners, missing verified email/consent and unpublished projects. The page now rejects mismatched/unready schemas, provider errors, malformed/oversized content and reads exceeding ten seconds; late schema responses cannot start content reads. Invalid routes and the disabled child-safety gate perform no database calls. Successful results expose only title and HTML through the restricted preview.

Local fixtures verify fresh reads after simulated unpublishing, schema drift and stalled/late responses. This is request-time enforcement. It cannot recall HTML already delivered or saved by a viewer, and an already-open preview does not yet receive live revocation. No production database or provider acceptance is claimed.

## Open shared-page publication checks

Shared pages now mount `PublishedPreview`, which checks a no-store public status endpoint before executing the iframe and every 30 seconds while visible. The endpoint uses the same current schema, child-safety enablement and publication lookup as the page, and returns only a SHA-256 digest of the current public title/HTML. A missing publication, changed digest, failed request or 12-second client deadline permanently removes that mounted preview until reload. Hiding the document removes the iframe and cancels pending checks; foregrounding requires a new check. Stale responses cannot restore a stopped preview. Existing sandbox restrictions remain unchanged.

This is best-effort browser revocation, not recall or immediate termination: a responsive foreground tab can continue until its next check (30 seconds) plus the request deadline (12 seconds). Browser timer suspension, modified clients, saved HTML, screenshots and content already delivered are outside this control. The public status lookup adds database reads and still requires deployment-level rate limiting and load review. It grants no generated-app capabilities or private-data access.

Verified with the actual React component in bundled Chromium using synthetic status responses: withdrawal, changed content, hanging checks, no automatic reopening, hidden removal and foreground revalidation. TypeScript, full zero-warning lint and production build pass. `test:publication-browser` is included in local CI configuration; deployed endpoints, hosted CI and real administrator revocation remain unverified.

## Published viewer storage backend (migration 029)

Dedicated fixed-schema storage now isolates each authenticated viewer's records by project. Tables have RLS and no browser grants. The server derives viewer identity; operations require current supervision, owner approval/consent, no deletion hold, publication and administrator permission matching the exact reviewed HTML. Publishing review now includes approve/revoke storage controls. The parent inventory and local erasure include viewer records in other people's projects.

Limits are 4,096 UTF-8 bytes/value, 100 keys/viewer/project, 10,000 keys/project, 200 accepted operations/viewer/project/UTC day and 10,000 operations/project/UTC day. Consistent profile locks followed by the project lock serialize authorization and quotas. Request UUIDs are retained per viewer/project and replay is rejected. A timed-out write remains ambiguous; inspect with a new read rather than assuming rollback or automatically retrying a new write. Storage makes no AI calls or credit debits. Request identifiers contain no values and remain until family/project erasure; timed retention needs launch review.

`STUDIO_PUBLISHED_STORAGE_ENABLED` defaults false. Keep it disabled until the separate execution origin and authenticated browser bridge are accepted. The backend is wired, but generated frames have no storage dispatcher yet; AI dispatch and monetary per-app/viewer budgets also remain unfinished. Enabling the setting adds a release-review blocker.

Verification: 163 local tests and 29 independent PostgreSQL scenarios pass, including cross-viewer isolation, replay, quotas, consent/publication/code changes, roles, erasure, concurrent replay/daily limits/revocation. Actual admin approval/revocation controls and account privacy fixtures pass in Chromium. Types, zero-warning lint and production build pass. No live database migration or provider acceptance is claimed.

## Parent storage dispatcher (local milestone)

`AppStorageDispatcher` now connects validated storage messages to an injected trusted-parent transport. It fixes the project at construction, accepts only storage operations and UUID request IDs, limits concurrent calls to four, bounds requests to ten seconds and closes sessions after at most five minutes. Close aborts pending work and suppresses late replies. Replies use the exact execution origin and expose only a bounded string/null value or a generic error. Failed writes report `outcome_unknown` and are never retried automatically. The host must close on account/supervision changes, navigation and hiding. The server still authorizes each operation independently.

This adapter is not mounted in published pages. The trusted runtime shell, inner opaque sandbox, real authenticated transport and lifecycle wiring remain to be implemented. Storage remains disabled by default; generated AI is not granted.

Verification: 168 local tests pass. The two-origin browser fixture passes in installed Chrome with synthetic HTTPS routes and synthetic storage responses; it checks parent DOM denial, replay/authority rejection, response filtering and closure with late results. Bundled Chromium was unavailable on this machine. Typecheck and targeted zero-warning lint pass. The fixture is included in CI configuration, but hosted CI and deployment were not run.

## Trusted runtime shell (not mounted in published pages)

`mountAppRuntime` is intended for fixed trusted code served from the separate execution origin. It puts generated HTML in an opaque `allow-scripts` inner frame using the existing restrictive document CSP. The inner SDK exposes `vibeStorage.read(key)` and `write(key, string)` without credentials. The shell validates inner source/null origin and bounded protocol, forwards only storage operations to the exact parent origin, and accepts only matched bounded parent replies. The wildcard reply target is necessary for the opaque inner origin and is bound to the exact inner WindowProxy. Four pending calls, request deadlines and a five-minute shell lifetime bound retained work. Closing removes the inner frame and listeners.

This does not yet include a trusted bootstrap handshake, authenticated published-page integration, hosting, deployed headers or live storage acceptance. No production preview uses the shell yet. The host must supply reviewed HTML and parent binding, enforce account/publication/supervision lifecycle and keep secrets off the execution origin. The sandbox remains defense in depth, not CPU containment or a universal browser network guarantee.

`test:runtime-shell-browser` passes with installed Chrome, using the actual shell and dispatcher across two synthetic HTTPS origins. Checks cover SDK read/write with synthetic responses, inner DOM/storage/fetch denial, direct-parent bypass rejection and teardown. Typecheck and targeted zero-warning lint also pass. Added to CI configuration; hosted CI was not run.

## Runtime bootstrap handshake

`installAppRuntimeBootstrap` takes a fixed deployment-configured parent origin (never from a message, referrer or query). It validates distinct HTTPS origins, announces readiness to that exact parent and accepts one bounded `runtime.init` containing version, session and reviewed HTML from the parent WindowProxy. Duplicate initialization cannot replace running content. A matching `runtime.close` removes the inner frame and permanently closes the bootstrap. Uninitialized shells expire after ten seconds, including a monotonic deadline check when messages arrive. The session is only a channel binding; server authorization remains mandatory.

The actual two-origin Chrome fixture now checks forged-source/invalid initialization, replacement rejection, invalid/valid closure, no reopening and initialization expiry in addition to storage and sandbox behavior. Typecheck and targeted lint pass. The production entrypoint, hosting and authenticated parent-page lifecycle remain outstanding.
