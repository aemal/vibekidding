# VibeKidding: parent morning quickstart

Open the workshop at `/demo` and stay with your child while trying projects. Start with a ready-to-play card; no account is needed for this demo. Leave names, school details and other private information out of prompts and shared projects.

## Choose the right workshop

| Where | What it can do | What it does not provide |
| --- | --- | --- |
| [Public workshop](https://vibekidding.vercel.app/demo) | Play starters, change supported template settings, save projects in this browser, share snapshots and use Remembering notes | Arbitrary AI code generation, AI replies inside apps, Samantha voice, account or cloud sync |
| [Local template workshop](http://127.0.0.1:3217/demo) | Template features without AI credentials | Arbitrary AI revisions; it needs a running local server |
| [Local AI workshop](http://127.0.0.1:3219/demo) | Generate and revise code through the configured provider; optional app AI and Samantha require their separate settings | Guaranteed working generated code, cloud storage, production approval or billing acceptance |

The local links work on this computer while their server is running. A phone opening `127.0.0.1` reaches the phone itself, not this computer. The public deployment can lag the latest local work; check the controls actually present on the page.

## Start locally if needed

Use **Node 22.22 or newer within Node 22**; Node 23 or later is outside this project's declared range. From the repository:

```sh
cd /Users/aemalsayer/vb101/ash-games/vibekidding
node --version
npm ci
```

For templates, run:

```sh
npm run dev:demo
```

Open [the template workshop](http://127.0.0.1:3217/demo). This command selects template mode and needs no AI key or database. Keep the terminal running; Ctrl-C stops that server. If the address already works, use the existing server instead of starting another on the same port.

For actual local OpenAI generation, keep a working `OPENAI_API_KEY` server-side in the ignored `.env` or `.env.local` (the latter takes precedence), then run:

```sh
npm run dev:demo-ai
```

Open [the AI workshop](http://127.0.0.1:3219/demo). Game creation and revisions use GPT-6 Sol with medium reasoning and a bounded 6,000-token completion budget (including reasoning). Short optional in-app AI replies retain their separate lightweight model. This script selects OpenAI, disables public-template mode, binds to loopback, and uses `.next-demo-ai` separately from `.next`. Do not run a build against the same output directory as an active development server. Restart the relevant server after changing environment settings. Never paste keys into the browser, prompts, screenshots or shared files.

Read the workshop status: **AI mode configured** describes configuration, not a guarantee that a request will succeed. Provider failures can fall back to labeled templates. Customized HTML is kept unchanged when a preset cannot safely revise it. **Template build** means preset code, not an AI-generated result.

## A first session

1. Choose a starter, then try its controls. **Play large** gives the project more room; Escape returns to the workshop.
2. For an unmodified template, try a supported change such as “Make it blue ocean.” Renaming a canonical template does not remove its revision capability.
3. In template mode, notes and custom projects explain that code changes need AI mode. You can still play, save notes, manage backups, or choose **New idea**.
4. In local AI mode, describe one small change, choose **Make this change**, then test it. **Cancel build** preserves the idea and previous version, but does not promise a refund for provider work already started.
5. **History** can restore an earlier version. A reported runtime problem offers recovery guidance; in AI mode, **Prepare repair** only prepares text. Review it and explicitly choose **Make this change** to submit it. No error notice automatically calls AI.

Some generated apps still need correction. A preview without an error notice is not proof that every feature works. Tic-tac-toe is two-player on one device, not online multiplayer. Music starts after a note is selected; checklist entries and ordinary play progress last for that preview visit unless the app explicitly saves them.

## Keep both kinds of work

Projects and saved app data belong to this browser profile and site origin. The public site, local port 3217 and local port 3219 have separate shelves. Private browsing, browser clearing or another device can leave you without the saved work.

- **Export backup** saves project code, title and version history. **Import backup** creates an independent project. It does not include saved notes or other runtime app data.
- **Saved app data → Export app data JSON** saves the selected project's runtime records separately. Keep this file private; it can contain the actual note text.
- To restore on another browser or into a fresh copy, first import the project backup, open that project, then use **Saved app data → Import app data JSON**. Review the destination, keys and size before choosing **Replace saved app data**. This replaces the destination's data, including clearing it if the imported file is empty.
- Export current data before replacing it. Copy any unsaved text first: restoring restarts the preview. A conflict or unconfirmed save is not a successful restore; keep your text and reopen to check.

**Remembering notes** requires its explicit **Save note** button. Saved data is separate from code and version history. Duplicates and shared copies start with fresh app data. Deleting a project also removes its saved app data when deletion succeeds. None of this is a cloud database or account backup.

## Share a playable snapshot

Choose **Share playable link**, then **Create playable link**. Exact canonical templates can offer **Show QR code**; custom or renamed snapshots may use a longer link instead. A recipient confirms before playing and can choose **Save a copy in workshop** to make an independent project.

A snapshot does not update with later edits. It excludes prompt history and runtime notes, but any personal text embedded in the code itself travels with the link. Shared and exported previews do not have the workshop's persistent storage or app-AI permission; notes explain their memory-only fallback there.

When sharing from localhost, use **Hosted play page** only if that option is configured for the deployed reader. Otherwise the link points to this computer's local address. QR decoding has been browser-tested; physical phone scanning still needs a hands-on check.

## Optional AI replies inside a project

This is separate from generating project code. In `.env.local`, a grown-up can set `VIBEKIDDING_DEMO_APP_AI_ENABLED=1` alongside the working OpenAI key, then restart `npm run dev:demo-ai`. The feature also requires local AI readiness; it is unavailable in public/template/production mode.

Open **Idea Buddy**, review the warning, and explicitly choose **Enable AI replies for this play session** above the preview. Only an explicit app question sends a request. Replies are short text, can be wrong, and should be read together. **Disable AI replies** cancels pending work; changing projects also cancels it.

There is one pending question at a time and at most three attempts per preview, including failures. Disable/re-enable does not refill that allowance. App questions and code generation also share a server limit. If unavailable or limited, stop and review the status; do not repeatedly retry or restart to evade the limits. The browser acceptance tests simulate app-AI transport and do not by themselves prove a live provider reply.

## Optional Samantha conversation

**Dictate text** uses the browser's speech service to fill the idea box; it is not Samantha and does not automatically build. **Talk with Samantha** is a separate, explicitly started ElevenLabs conversation available only in local development with dedicated configuration.

A grown-up must configure the dedicated Samantha key and agent ID server-side and set `VIBEKIDDING_SAMANTHA_DEMO_ENABLED=1`. Follow the [reviewed setup instructions](../README.md#optional-local-samantha-conversation); do not reuse or alter a business agent casually. Once available, review the consent checkbox and choose **Start Samantha conversation**. **Use this idea** moves a suggestion into the editor for review; it does not generate a project. **End Samantha conversation** stops the session.

Sessions stop after 60 seconds. Provider settings limit them to three calls daily and one conversation at a time; the local server additionally limits start attempts and requires spacing between them. Configuration alone is not microphone acceptance. A prior live test used synthetic text and received text/audio events; actual microphone recognition and speaker playback remain unverified hands-on.

## If something is unavailable

Keep typing or use a starter when voice or AI is unavailable. Check that you opened the intended public/template/local-AI URL, that its terminal is running, and that the page reports the expected mode. Save both kinds of backups before clearing browser data or moving browsers. No demo success establishes Google sign-in, parent approval, email delivery, credit reconciliation, cloud multiplayer, or readiness of the separate account-based studio. Those remain separate release checks in [studio setup](STUDIO_SETUP.md).

Unsent ideas stay with each project in the same tab, including reloads when session storage is available. Switching projects or choosing a starter keeps the other drafts. Successful submissions clear only the submitted draft; cancellation, failure and unchanged results keep it. Closing the tab can remove drafts, and project exports and shared links do not include them. Copy unfinished words elsewhere before closing the tab. A storage warning means reload recovery is unavailable.
