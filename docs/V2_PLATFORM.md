# V2 implementation scope

The October 23 architecture decision replaces the single-HTML demo as the main product direction. VibeKidding is an open-ended application builder for adults and children building together. Samantha's conversation provides project requirements; generation must not assume every project is a children's game.

## One-machine deployment

Docker Compose runs the studio, Nginx gateway and deployment controller on one machine. Generated applications run as individual containers on the same host. Builds are queued; a second server is not required. See [the deployment guide](../infra/README.md) for bootstrap, backup and restoration commands.

Each project has immutable source versions, its own npm dependencies and a persistent data volume. The default scaffold uses React, Vite, a Node server and SQLite. Uploaded files belong in the data volume; database records can reference them. Replacing a source version must not replace the database or uploads. Other frameworks are not automatically certified by the default scaffold: they must satisfy the controller's start, port, path and data-directory contracts.

The account hostname and project slug provide a friendly entry point. The gateway serves published applications at stable `/apps/<projectId>/` paths on separate per-project runtime hosts, such as `<projectId>.apps.localhost:3230`. The studio origin does not serve generated applications in public mode. Wildcard DNS and production TLS are configured when moving to the VM. Local testing uses `.localhost`; a phone needs a reachable host address rather than its own localhost.

## Studio and accounts

The studio and landing page use HeroUI with VibeBoard's light/dark colors. The initial account is created with a username and password. The same account can be used from a desktop and phone, with separate sessions and shared server-side projects. The initial password account remains available for local setup. Public mode disables first-account password registration and defaults to invite-only email access; previously created password accounts can still sign in. Invite-only email OTP accounts are an additional access path; email delivery and final public acceptance are separate launch checks.

Generation, revisions, source editing, deployment logs and version history are separate operations. Failed deployment should preserve the previous running application. A source rollback cannot undo a destructive database migration; compatible schema changes remain necessary.

Project environment settings are stored separately from versioned source and injected into the app runtime when redeployed. Saved secret values are not returned to the UI or supplied to the code-generation prompt. Provider credentials for the studio remain separate from generated application credentials.

## Acceptance boundaries

Unit tests, live AI output, a local npm build, direct Node execution, Docker execution and browser acceptance are distinct checks. None implies the others. A full acceptance run should create an app through the studio, deploy it, write persistent data, revise and republish it, and verify that data survives. Multiplayer additionally requires two clients exchanging real events.

Local Docker acceptance now covers generated npm builds, persistent SQLite across revisions, WebSockets through Nginx, failed-build rollback, and two-browser multiplayer on a separate runtime host. This does not establish readiness for arbitrary hostile workloads or a public launch. Invite-only email accounts and full multi-family acceptance remain launch gates. Landing-page copy must describe current capabilities rather than promise future controls.

## Family provider settings and exports

OpenAI and Anthropic API credentials are stored encrypted per account. Model choices come from the configured account's provider API; listing a model does not guarantee compatibility with the generation endpoint. Provider subscriptions such as ChatGPT or Claude Code are not API credentials. Owned generation jobs never silently fall back to the operator's key. ElevenLabs voice settings likewise belong to the account. The provider encryption key must be backed up together with the persistent data.

Source downloads include the current version's project files, excluding dependencies, build output, environment secrets, databases and uploads. Native Chrome download acceptance and independent ZIP integrity checks passed. Downloading source is distinct from a complete data backup.

## Comparison logo sources

The landing-page comparison names independent products and does not imply affiliation. Assets were retrieved from their public sites:

- Replit: `https://replit.com/public/icons/favicon-prompt-192.png`
- Lovable: `https://lovable.dev/favicon.ico`
- v0: `https://v0.app/assets/icon.svg`
- Base44: `https://media.base44.com/images/public/marketing-site-assets/branded/favicon-branded-v2.png`
- Bolt: `https://bolt.new/static/favicon.svg`

## Invite-only email access

Set `VIBEKIDDING_INVITED_EMAILS` to a comma-separated list of invited parent email addresses, `RESEND_API_KEY` to a server-side mail key, and `STUDIO_MAIL_FROM` to an authorized sender. Without these settings email sign-in reports that it is unavailable; it never displays an OTP as a substitute for delivery. Codes expire after ten minutes, are single-use, and have persisted request and attempt limits.

One normalized email maps to one account. Signing in on a second device shares that account's server-side projects. The initial username/password account is not automatically merged with a new email account; no email ownership is inferred from a username. Email delivery has not yet been verified with a real sender.

## Local acceptance record — October 23

On Docker port 3230, native Chrome used the configured OpenAI account and selected `gpt-6-sol` to generate Family Counter with eight source files. The controller built and deployed it. A counter and note survived browser refresh, then survived a manual source edit and redeployment. Source ZIP integrity, the revised file content, and sharing controls were checked. Actual ElevenLabs signed-session issuance passed using the account-owned key; microphone audio and conversation quality were not tested. The rebuilt image includes the runtime-origin CSP build argument, and the embedded preview was verified in native Chrome.

Separate Docker multiplayer acceptance verified two clients, spectators, winning moves, rematch, WebSockets, reload persistence and mobile layout. Backup checksums passed; restoring a copy of app data into a disposable volume passed SQLite integrity checks and retained a room. Full replacement of the running installation from backup was not performed.
