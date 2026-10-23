# V2 single-machine deployment

This stack runs the studio, deployment controller, reverse proxy, and generated applications on one Docker host. It does **not** provision or purchase a VM. It is separate from the legacy local demos on ports 3217/3219.

## Local start

Requirements: Docker Engine/Desktop with Compose, Python 3, and enough disk space for Node images and npm dependencies.

```sh
./infra/scripts/bootstrap.sh --configure-only
# Edit infra/local/stack.env and set your provider key.
./infra/scripts/deploy.sh
```

Open `http://localhost:3000` or `http://ash.localhost:3000`. Modern browsers handle `.localhost` names as loopback; if a particular client does not, use localhost or explicitly configure its hosts file. The default gateway binding is loopback-only. Other existing development servers remain untouched.

The generated controller credential lives only in ignored `infra/local/stack.env` (0600); scripts do not print it. Create your initial studio username/password on the setup screen; account/session state is persisted in the project volume. Copy configuration privately when migrating rather than putting secrets in Git. Docker build contexts exclude `.env*`, databases, local source data, and dependency caches.

The Next.js image runs a production build and starts on its internal port 3000. Only Nginx publishes a host port. The studio and controller share the source-project volume; generated app containers do not receive that volume or the Docker socket.

## Contract with the studio

The studio writes immutable source versions to:

```text
/var/lib/vibekidding/projects/<projectId>/versions/<versionId>/source/
```

It calls the controller on the private network:

```http
POST http://controller:4000/deploy
Authorization: Bearer <VIBEKIDDING_CONTROLLER_TOKEN>
Content-Type: application/json

{"projectId":"...","versionId":"...","sourcePath":"/var/lib/vibekidding/projects/.../versions/.../source"}
```

Response: HTTP 202, `{id, deploymentId, status:"queued", url:"http://<projectId>.apps.localhost:3000/apps/<projectId>/", logs:""}`. Poll `GET /deployments/<id>` with the same bearer token. Statuses are `queued`, `building`, `starting`, `ready`, `failed`. `logs` is a bounded string tail; `error` describes failure. `GET /healthz` is process liveness; authenticated `GET /status` checks the actual Docker engine. Nginx does **not** expose the controller's management endpoints.

Each project must supply `package.json` with an `npm start` command. A trusted Dockerfile installs its dependencies, runs `npm run build --if-present`, and starts it. Generated Dockerfiles are not executed. Node 22 supports the default generated Node/SQLite server. The application must listen on `0.0.0.0:3000`, use `DATA_DIR=/data` for SQLite/uploads, and respect `VITE_BASE` / `BASE_PATH` for browser assets and requests.

Optional per-app server settings live in `projects/<projectId>/environment.json` as a flat string map. The controller injects them through a temporary private env file at runtime only, never into source, build arguments, or deployment metadata. Redeploy after changing settings. System variables such as `PORT`, `DATA_DIR`, `NODE_OPTIONS`, and `VIBEKIDDING_*` are reserved. Settings must be single-line strings; they are included in the private project-volume backup. Code can still intentionally reveal a credential, so integrations should keep credentials on their server routes.

`/apps/<projectId>/...` is proxied with that prefix stripped. WebSocket upgrade connections are supported. A Next.js project configured with a build-time base path can request `preservePrefix:true` so the app receives the full path. A friendly account/slug route can redirect to this stable runtime URL; subdomain hostnames already reach the studio through Nginx.

Builds execute sequentially. Each runtime has configurable memory/CPU limits, a PID limit, bounded container logs, and a dedicated named data volume. A new runtime is checked before switching its route. If build/start fails, the previous route stays live. Database migration compatibility remains the application's responsibility; republishing code never deliberately deletes its database. Old images are retained for recovery; inspect and prune unused images explicitly when disk usage grows. The deployment script requires at least 10 GiB free on its project filesystem before starting a build; Docker's storage device can still have a separate capacity limit.

## Persistent data and updates

| Docker volume | Contents |
| --- | --- |
| `vibekidding-projects` | Project metadata, versioned source, account state, controller deployment registry |
| `vibekidding-data-<projectId>` | That generated application's SQLite database and uploaded files |

`docker compose down` does not remove volumes by default. Never use `down -v` when keeping data. App containers are created dynamically by the controller and therefore remain separate from Compose's service inventory; use `docker ps --filter label=vibekidding.managed=true` to see them. They survive controller/studio updates with restart policies.

Update platform code using Git and run `deploy.sh` again. This rebuilds the platform services, not every generated application. Their deployed containers and volumes remain intact.

## Backup and migration to a VM

```sh
./infra/scripts/backup.sh /private/path/vibekidding-backup
# On a fresh Docker host, clone this repository and configure stack.env:
./infra/scripts/restore.sh /private/path/vibekidding-backup
./infra/scripts/deploy.sh --rebuild-restored-apps
```

Backup temporarily stops this stack and its managed app containers to capture consistent SQLite files. Its exit trap restarts the previously running services/apps. Archives include checksums, app data, and private per-app environment settings; the platform stack.env and Docker images are excluded. Restore validates checksums/archive paths and refuses to overwrite nonempty volumes. It recreates published app images from the restored source, which also supports moving from an ARM Mac to an x86 VM. The controller captures package lockfiles from successful builds separately from immutable source, then reuses them when rebuilding that version. A failed rebuild leaves the restored data intact and reports the specific app.

Backup scripts are for this single stack on a host; they are not cross-host replication or a zero-downtime backup solution. Store backups away from the server and validate restore on a disposable host before depending on them.

For a later VM, set `BIND_ADDRESS=0.0.0.0`, `PUBLIC_PORT=80`, `BASE_DOMAIN=your-domain`, and the actual `PUBLIC_ORIGIN`. Configure DNS/HTTPS separately and set `VIBEKIDDING_PUBLIC_SCHEME=https` when TLS is active. This initial Compose definition serves HTTP and does not claim to provision certificates. A phone on the local network similarly needs an explicit accessible bind address and hostname/IP.

## Verification

```sh
node --test infra/tests/controller.test.mjs
./infra/scripts/bootstrap.sh --configure-only
docker compose --env-file infra/local/stack.env config --quiet
```

Controller unit tests use a fake Docker command adapter and do not establish real image builds or container/network acceptance. Actual Docker smoke verification is recorded separately. The controller needs access to the host Docker socket and is trusted platform code; generated apps must never receive that socket or provider environment variables from the studio automatically.


### Separate studio and per-project runtime origins

Set `PUBLIC_ORIGIN=http://localhost:3000` and `VIBEKIDDING_RUNTIME_ORIGIN=http://apps.localhost:3000` locally (use port 3230 for the current development stack). The latter is a base origin: each project receives `http://<projectId>.apps.localhost:3000/apps/<projectId>/`. Each project therefore has a separate browser origin for storage and service workers. Generated build/runtime base paths remain `/apps/<projectId>/`. Project IDs must be lowercase DNS labels; normal generated UUIDs qualify.

Nginx routes project runtime hostnames only to `/apps/`; other paths, including studio authentication/settings APIs, return 404. The controller independently verifies that HTTP and WebSocket requests match the hostname of the project in the URL. Accessing project B through project A's hostname fails. Bare `apps.localhost` serves no application content. `Origin-Agent-Cluster: ?1` prevents document.domain relaxation in supporting browsers.

For a publicly reachable configuration set `VIBEKIDDING_PUBLIC_MODE=1`, configure distinct studio/runtime base hostnames and HTTPS origins, and set `BASE_DOMAIN` accordingly. The controller refuses public startup without a distinct runtime hostname. Nginx refuses `/apps/` on studio hosts in public mode. Local mode retains direct studio paths for integration tests. Studio cookies must remain host-only, authenticated studio APIs must reject untrusted cross-origin requests, and its frame CSP must allow the configured wildcard project runtime origin. These studio checks belong to the studio implementation.

Production DNS/TLS must cover `*.apps.<BASE_DOMAIN>` as well as the studio; a certificate for `*.<BASE_DOMAIN>` alone does not cover the nested project hosts. App sharing/data authorization and public service operational controls still require acceptance testing. No public deployment has been performed.

Generated runtimes use a dedicated `vibekidding-project-<id>` Docker network per project. Only the controller joins all project networks; apps do not share the studio platform network or each other's network. Existing routes are migrated in place on controller startup in public mode; a migration failure prevents startup rather than serving an incompletely isolated app. Project networks are retained with durable resources; removal is an explicit lifecycle operation.

Optional studio mail settings pass through Compose: `VIBEKIDDING_INVITED_EMAILS`, `RESEND_API_KEY`, and `STUDIO_MAIL_FROM`. `VIBEKIDDING_PROVIDER_ENCRYPTION_KEY` accepts the account-provider store's base64-encoded 32-byte key. If omitted, that store generates its own private persisted key under the shared data volume; preserve it in backups. These values are not forwarded to generated app containers. Live email delivery has not been accepted by the infrastructure tests.

Authenticated controller `POST /unpublish {projectId}` removes a running deployment and its active route while preserving source, image history, and durable data. It rejects an active build. Lifecycle callers must authorize the project owner before calling the trusted controller.

The studio frame CSP is compiled by Next.js. Compose therefore passes the non-secret `VIBEKIDDING_RUNTIME_ORIGIN` as both a studio build argument and runtime environment value. **Rebuild the studio image whenever the runtime domain, scheme, or port changes**, including migration from local Docker to a VM. Provider/mail keys remain runtime-only and are never build arguments.

### Local Docker acceptance recorded 2026-10-23

The stack built and reached healthy status on localhost:3230. `infra/tests/docker-smoke.mjs` passed actual npm image build/start, HTTP and WebSocket proxying, SQLite persistence across a revision, failed-revision retention, and captured dependency locks. This smoke uses the legacy direct local path and must run with local mode, not public mode.

A separately generated multiplayer application passed the full two-Chromium UI flow on its project subdomain: player X/O joins, QR invite decoding, spectator view, synchronized moves, reload, win, rematch, and mobile layout. Actual public-mode HTTP checks rejected studio-origin apps, mismatched project hosts, bare runtime hosts, and studio APIs on runtime hosts. A Docker helper on a different project's network could not connect to the app's container IP.

A consistent backup was created and all services resumed healthy. `node infra/tests/backup-restore-smoke.mjs <backup-directory>` restored both archives into disposable Docker volumes and passed SQLite integrity checks for the account and application databases; it removed only those disposable volumes afterward. `restore.sh` refused to overwrite the running stack. Replacing a production stack or migrating to another machine has not been tested. These checks do not establish public deployment, live email delivery, or acceptance of later source changes.
