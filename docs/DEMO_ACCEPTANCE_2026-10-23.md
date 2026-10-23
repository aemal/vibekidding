# Functional demo handoff, 23 October 2026

The login-free demo is functional for a supervised first session. This is not a declaration that the separate account-based production studio is complete.

## Open the right workshop

- [Local AI workshop](http://127.0.0.1:3219/demo): real OpenAI generation and revision, optional AI replies inside created apps, browser-local saves, and the separately configured local Samantha conversation. The local server must remain running.
- [Public template workshop](https://vibekidding.vercel.app/demo): playable starters, supported preset changes, browser-local saves, backups, and shareable snapshots. Public arbitrary AI generation, app AI replies, and Samantha conversation are disabled.
- [Parent quickstart](DEMO_QUICKSTART.md): restart instructions, controls, backups, and limits.

Use the same browser and exact address to find existing creations. Chrome, the in-app browser, `localhost`, and `127.0.0.1` do not necessarily share the same browser storage. Projects are not cloud accounts. Export project backups and separate saved-app-data backups before changing browsers or clearing browser data.

## What was actually exercised

| Journey | Evidence and boundary |
| --- | --- |
| Generate, play, revise, save | Real local OpenAI generation of a dinosaur game and a purple revision; version history preserved. |
| Build in another language | Real German space quiz generated and played to 3/3 locally; a shared hosted-reader copy was played separately. This is one example, not certification of every language. |
| Play a generated game | Real generated robot maze completed in the browser in 12 moves. |
| Remember data | Real generated robot notebook first had a non-working form action. A real AI revision replaced it with a native button; the saved note survived reload. Generated code still needs review. |
| AI inside an app | Real Idea Buddy response, then a real generated Robot Drawing Ideas app called the optional AI SDK. Its favorite response saved through the storage SDK and returned after reload. |
| Draft recovery | Manual local and deployed-browser reloads restored unfinished ideas. Automated checks cover per-project switching, new ideas, starters, duplicates, cancellation, failures, unchanged results, and storage failure. Drafts are tab-local and excluded from exports/shares. |
| Custom-code fallback | Synthetic provider-failure and template-only tests preserve modified HTML exactly, including retained preset markers. Browser checks preserve history and draft on an unchanged response. No claim that the synthetic failure was a live provider failure. |
| Backup, import, share, remix | Browser checks cover independent project identities, exact history/source, separate app data, explicit import, and snapshot playback. Shared links are copies, not realtime multiplayer or revocable publications. |
| Mobile and keyboard | Short-screen tests keep a playable viewport and reachable controls; data-dialog keyboard close/restore returns focus. Bundled Chromium was tested, not every browser or physical phone. |
| Samantha | Dedicated local agent returned two text replies and audio events in a live synthetic-text WebSocket check and closed at 60.629 seconds. Actual microphone recognition and audible speaker quality remain unverified. |

## Verification and merged work

The combined code suite passed 317 tests, zero-warning lint, TypeScript, and a production build. Browser suites distinguish real UI interactions from synthetic generation responses. Relevant local reports are under the ignored `tests/demo-browser-artifacts/` directory; they are evidence, not deployed/provider acceptance by themselves.

- [PR 14: optional app AI](https://github.com/aemal/vibekidding/pull/14), merged `d7ccb8c`. Both correctness runs passed. Actual local provider/browser examples are described above.
- [PR 15: draft and custom-code preservation](https://github.com/aemal/vibekidding/pull/15), merged `1eeb12f`. Correctness run `39900357060` passed. A duplicate push run was still pending at merge. The deployed draft recovery was checked manually afterward.
- [PR 16: keyboard focus return](https://github.com/aemal/vibekidding/pull/16), merged `9774a5f`. Correctness run `39900899558` passed. A duplicate run was still pending at merge. Six focus checks and nine data-backup regression checks passed locally; manual computer use confirmed Escape focus return.

Known dependency-audit failures were explicitly left unresolved under the user's request to prioritize functionality. A passing correctness run does not mean all CI jobs were green.

Task Master tasks 11 through 37 cover the implemented demo work; their statuses and evidence were managed through the actual Task Master MCP client. The original production tasks 3 through 10 remain separate and are not silently marked complete by these demo features.

## Still separate from this demo

The latest informational configuration check found no configured Supabase account/database integration, administrator IDs, mail provider/webhook, or production notification scheduler. The original production voice environment is also incomplete; the dedicated demo Samantha configuration uses different variables and is not proof of that production integration.

Google/OTP accounts, reviewed parent approval, cloud persistence and multiplayer, production voice relay/accounting, provider billing reconciliation, email delivery, and the deferred safety/compliance work still require their own implementation/configuration and live acceptance. No credentials, consent, delivery, billing records, physical-device results, or production acceptance have been fabricated.

## Authorized one-hour extension

The user extended work until 06:58:13 UTC and confirmed that the requested login-free entry is the game-building studio. The local AI studio now opens directly at [http://127.0.0.1:3219/](http://127.0.0.1:3219/). Its banner explains browser-local storage; the separate account studio remains available at `/account-studio`. Public and production authentication was not disabled.

Game generation and revisions now use GPT-6 Sol with medium reasoning and a 6,000-token total completion budget. The user's replacement `.env` key was tested successfully; a stale `.env.local` override was removed without changing the replacement key. Optional short in-app AI replies retain their separate lightweight model.

Native Google Chrome computer use verified an actual generated Moon Rabbit carrot game: collect three carrots, win, replay, request a title and win-message revision, reload with two versions retained, and win with the revised message. These were two real game-generation requests, not mocked responses. The same saved game appeared at the new login-free root. This is one end-to-end example, not a guarantee that every generated game works.

Additional completed fixes:

- PR18 (`619adad`): retry a failed browser save explicitly while refusing to overwrite a changed external shelf. Five browser flows use injected storage failures; both GitHub correctness checks passed.
- PR19 (`86c0e18`): confirm before suggestions replace a different unfinished idea. Six browser flows passed; native Chrome also verified that **Keep my idea** retained the typed draft. Samantha insertion coverage used a synthetic callback, not microphone acceptance.
- PR20 (`85b08a0`): local login-free studio entry. Six browser flows, four account-studio regressions, and two unit tests passed. GitHub correctness run `39910018771` passed.

The assembled extension passed 319 tests and a production webpack build. The rebuilt public-template server remains available at [http://127.0.0.1:3217/demo](http://127.0.0.1:3217/demo). Task Master records tasks 39–41 as done through MCP, with task 38 awaiting the model-upgrade merge.

PR21's first correctness run encountered an intermittent shared-counter pointer test failure. PR22 adds real hover acknowledgment before a single click, asserts the trusted pointer event sequence and unchanged counter result, and captures the actual failing page. It does not change application behavior or retry clicks. The revised 12-check sharing suite passed against the assembled production server. PR22 merged as `5ecca96` after correctness run `39910983338` passed. The assembled PR21 correctness run `39911100192` passed, but duplicate run `39911105984` failed at the new hover acknowledgment before clicking. The original input-routing cause remains inferred, and the additional failure is being investigated rather than ignored. Final CI/merge results are recorded below when available.

PR23 (`9023972`) makes the pointer enter from outside a replacement iframe, retaining the single-click and trusted-event assertions. Both correctness runs `39911662810` and `39911684994` passed. Another combined run then passed sharing but exposed an intermittent app-AI test interaction failure; PR25 adds equivalent input evidence without changing application handlers or expected results. A deliberately broken handler still failed the original status assertion. Its eight checks passed locally in Chromium and Chrome with synthetic AI transport and no paid calls.

PR24 (`2050e5b`) fixes external-link entry to the local studio. A real Chrome anchor from another origin opened the workshop; browser network metadata confirmed a cross-site, user-followed document navigation. The same navigation to the production root retained sign-in. API mutation rules were unchanged, and an actual cross-site generation POST returned 403. Both correctness runs `39912435967` and `39912443439` passed. Task 42 is recorded done via MCP. The assembled suite now passes 321 tests.

The model upgrade PR21 merged as `5d99429` after the combined correctness run `39912840205` passed. Task38 is now done with live Chrome evidence and merge details. The duplicate run `39912845376` failed in a separate saved-data browser click test (the status remained “Unsaved changes”); this remains tracked for investigation. PR25 merged as `565ddf9` after both correctness runs `39912709016` and `39912736420` passed. No claim is made that all CI jobs were green: dependency audits remain deferred and the saved-data test failure is recorded explicitly.
