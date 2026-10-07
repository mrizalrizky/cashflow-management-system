# Fase 6: Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the application installable on one server from a clean checkout by following the README: production images for the API and the web, one Compose file that runs everything behind a Cloudflare Tunnel, nightly backups, and a smoke test that proves a from-zero deployment works.

**Architecture (revised with the owner on 7 October 2026):** The database is managed PostgreSQL (Neon), reached through `DATABASE_URL`; there is no database container in production. The server opens no ports. Four long-running containers share one private Docker network: `cloudflared` makes an outbound tunnel to Cloudflare, which terminates HTTPS and hides the server's address; `web` is Caddy, serving the built Vue files with compression and forwarding `/api/*` to `api` over plain HTTP inside the network, so web and API share one origin (no CORS); `api` is a slim Node image running the compiled NestJS app as a non-root user, with the proof files on a named volume; `backup` runs the Fase 5a backup script every night, dumping the Neon database over the network and archiving the proof volume. A one-shot `migrate` container applies migrations and the idempotent seed before `api` starts, on every deploy. All configuration, including every secret, comes from one env file that is not in the repository; Compose refuses to start when a required value is missing.

**Tech Stack:** Docker (multi-stage builds), Docker Compose v2, Node 24 (Debian slim), Caddy 2, cloudflared, PostgreSQL 17 client tools, Bash.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` (section 2.4, last line; section 7 Fase 6) and base document `implementation-plan-cashflow-mvp.md` (section 11 Fase 6, section 13). Carried-over notes: `docs/decisions.md` (every "Untuk Fase 6" line), `docs/security-checklist.md` ("Yang masih terbuka"), `docs/backup-restore.md`. Deviations from the spec's Compose line (no `postgres`, no nginx, a tunnel instead of public HTTPS in Caddy) are the owner's decisions and are recorded in `docs/decisions.md` in Task 5.

## Global Constraints

- No secret in the repository or in an image layer. Secrets reach containers only through the env file at run time; nothing secret is a build argument or copied into an image. `.dockerignore` keeps `.env*`, `node_modules`, test output and the proof folder out of the build context.
- Compose must refuse to start, naming the variable, when a required value is unset. There is no default database URL, JWT secret, admin password or tunnel token.
- `NODE_ENV=production` is set by the Compose file itself: API docs stay closed and the refresh cookie stays `Secure`.
- **No service publishes a port.** The only way in is the tunnel. (The smoke test adds a loopback-only port to `web` in its own override file.)
- Data lives in the Neon database, the `storage` named volume, and the backup folder on the host. Recreating or updating containers must never lose data.
- Containers run as non-root where the base image allows it, restart `unless-stopped`, and have health checks; `api` starts only after `migrate` has finished successfully.
- Images are built from the lockfile (`npm ci`) with the Node major version the project declares.
- Do not write `apps/api/dist` on the host: images build inside Docker.
- **The smoke test never touches the owner's Neon database, `.env`, tunnel, the development database container, or any other project's containers.** It uses its own Compose project name, a throwaway PostgreSQL container standing in for Neon, a generated env file, and removes everything it created.
- User-facing documentation is in Indonesian, as the rest of the README.
- Out of scope: CI/CD pipelines, Kubernetes, monitoring stacks, off-site backup transport (documented as the operator's step), creating the Cloudflare tunnel itself (a dashboard step, documented).

## Review Focus

- **A secret or the wrong file ends up in an image:** `.env`, `apps/api/storage`, tests or dev dependencies in the runtime image; a secret visible in `docker history`. Pinned in Tasks 1 and 2.
- **Behind two proxies things behave differently:** the refresh cookie is `Secure` and still works; the login rate limit sees the visitor's address, not Cloudflare's or Caddy's (two hops); a 10 MB proof passes and an 11 MB one gets the API's own Indonesian message rather than a proxy error page; a deep link such as `/transaksi/<id>` loads the app; `/api/docs` is not served; responses are compressed but a large streamed CSV export still arrives whole. Pinned in Tasks 2 and 4.
- **Starting in the wrong order or with missing configuration:** the API starting before migrations, a short `JWT_ACCESS_SECRET`, a missing tunnel token, the admin password left empty. The stack fails clearly and early. Pinned in Tasks 3 and 4.
- **Updating and restarting lose nothing:** `up -d --build` after a code change and a restart of every container keep transactions and proof files; migrations run again without harm. Pinned in Task 4.
- **Backups that silently stop:** a failing nightly run must show in the container's log and health, and a backup made in the container must restore with the documented command. Pinned in Tasks 3 and 4.

## File Structure

```
.dockerignore
apps/api/Dockerfile                 stages: build (also used by `migrate`), runtime
apps/web/Dockerfile                 stages: build (Vite), runtime (Caddy + built files)
deploy/
├─ Caddyfile                        /api proxy, SPA fallback, compression, headers, caching, upload limit
├─ backup.Dockerfile                PostgreSQL client tools + Bash + the backup scripts
├─ backup-loop.sh                   run backup.sh once a day at BACKUP_AT; report failures
├─ env.example                      every variable, documented; secrets empty
├─ compose.smoke.yml                smoke-test override: stand-in database, loopback port
└─ smoke.sh                         from-zero deployment test
docker-compose.prod.yml
apps/api/src/app.setup.ts           (modify) HSTS left to Cloudflare
docs/deployment.md                  the full guide
README.md, docs/security-checklist.md, docs/backup-restore.md, docs/decisions.md   (modify)
```

## Shared interfaces

```
# deploy/env.example (names are the contract between the env file, Compose and the docs)
DATABASE_URL=            # required; the Neon connection string (with sslmode=require)
JWT_ACCESS_SECRET=       # required, at least 32 characters
TUNNEL_TOKEN=            # required; from the Cloudflare dashboard
SEED_ADMIN_NAME=Administrator
SEED_ADMIN_EMAIL=        # required
SEED_ADMIN_PASSWORD=     # required; temporary, must be changed at first login
LOGIN_RATE_LIMIT=5
BACKUP_HOST_DIR=         # required; folder on the host that receives backups
BACKUP_AT=01:30          # 24-hour, in TZ
BACKUP_KEEP_DAYS=14
TZ=Asia/Jakarta

# Compose services: migrate (one-shot), api, web, cloudflared, backup
# Set by Compose, not by the operator: NODE_ENV=production, PORT=3000, TRUST_PROXY_HOPS=2
#   (Cloudflare, then Caddy), STORAGE_DIR=/data/storage, CORS_ORIGINS empty
# Cloudflare dashboard: the tunnel's public hostname points at http://web:80

# deploy/smoke.sh  (no arguments)  exit 0 when a from-zero deployment passes every check
```

---

### Task 1: API image

**Files:** Create `.dockerignore`, `apps/api/Dockerfile`, the first section of `deploy/smoke.sh`. Modify `apps/api/src/app.setup.ts`, `apps/api/test/security-headers.e2e-spec.ts`.

- [ ] **Step 1: Failing checks.** `deploy/smoke.sh` builds the `runtime` target and asserts:
  - the image runs as a non-root user and its default command starts the compiled app;
  - it contains `dist/main.js` and does **not** contain `.env`, `src/`, `test/`, `storage/`, `typescript`, `vitest` or the Nest CLI;
  - `docker history` shows no build argument and nothing that looks like a secret;
  - started with no `JWT_ACCESS_SECRET` it exits non-zero and prints the environment validation message naming the variable.
  Add an e2e test: API responses carry no `Strict-Transport-Security` header (HTTPS policy belongs to Cloudflare, which knows the host name).
- [ ] **Step 2: Run** `bash deploy/smoke.sh` and the e2e spec. Expected: fail (no Dockerfile; HSTS present).
- [ ] **Step 3: Implement.**
  - `build` stage: `npm ci` for the API workspace (install scripts as allowed by the root `package.json`), `prisma generate`, `nest build`. It keeps dev dependencies and the Prisma CLI, so the `migrate` service uses it for `prisma migrate deploy` and the seed.
  - `runtime` stage: Node 24 slim, production dependencies only (installed without running install scripts, so the `postinstall` that needs the Prisma CLI does not run), `dist`, the `node` user, `/data/storage` owned by it, a `HEALTHCHECK` on `/api/v1/health`, `CMD ["node", "dist/main.js"]`.
  - Turn off helmet's HSTS header in `app.setup.ts`.
- [ ] **Step 4: Run** the smoke section, `npm run lint -w api`, and the security-headers spec. Expected: pass.
- [ ] **Step 5: Commit** `feat(deploy): add the API production image`.

---

### Task 2: Web image and reverse proxy

**Files:** Create `apps/web/Dockerfile`, `deploy/Caddyfile`. Extend `deploy/smoke.sh`.

- [ ] **Step 1: Failing checks** (the web container started alone, with a stub upstream for `/api`):
  - `/` and deep links (`/transaksi/abc`, `/audit-log`) return the app's `index.html`; a missing file under `/assets/` returns 404, not `index.html`.
  - `index.html` is sent with `Cache-Control: no-cache`; files under `/assets/` with a long `immutable` lifetime.
  - **Compression:** with `Accept-Encoding: gzip` the main script and `index.html` come back `Content-Encoding: gzip`; without it they do not.
  - `/api/v1/health` is forwarded to the upstream, keeping the `X-Forwarded-For` it received and adding its own hop; an 11 MB request body to `/api/` reaches the upstream (the proxy's limit is above the API's, so the API's message is what the user gets) and a 50 MB one is refused by the proxy.
  - Responses for the app carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a `Content-Security-Policy` that allows only the app's own scripts and connections, inline styles (PrimeVue), and `blob:`/`data:` images (proof previews). API responses keep the API's own headers. No `Server` header.
  - The image contains only Caddy, the Caddyfile and the built files.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Caddy listens on plain HTTP port 80 only (`auto_https off`, admin endpoint off) and trusts forwarded headers from private addresses (the tunnel container). The web build stage runs `npm ci` and `vite build` for the web workspace.
- [ ] **Step 4: Run** the smoke sections so far. Expected: pass.
- [ ] **Step 5: Commit** `feat(deploy): add the web image with reverse proxy and compression`.

---

### Task 3: Compose file, configuration and backups

**Files:** Create `docker-compose.prod.yml`, `deploy/env.example`, `deploy/compose.smoke.yml`, `deploy/backup.Dockerfile`, `deploy/backup-loop.sh`. Modify `.gitignore` if needed so `deploy/env.example` is tracked and a real `deploy/.env` is not. Extend `deploy/smoke.sh`.

- [ ] **Step 1: Failing checks.**
  - `docker compose config` with an env file missing `DATABASE_URL`, `JWT_ACCESS_SECRET`, `TUNNEL_TOKEN`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` or `BACKUP_HOST_DIR` fails and names the missing variable, each in turn.
  - With a complete env file, the rendered production configuration shows: **no service publishes a port**; `NODE_ENV=production` and `TRUST_PROXY_HOPS=2` on `api`; `api` depends on `migrate` having completed successfully; every long-running service has `restart: unless-stopped`; the `storage` volume is mounted read-write in `api` and read-only in `backup`; no secret value is written in the Compose file.
  - `deploy/env.example` lists every variable the Compose file reads, and the Compose file reads no variable the example does not list.
  - `backup-loop.sh --seconds-until HH:MM <now>` returns the right wait for a time later today and for one already past (tomorrow); a failed backup leaves the container unhealthy with the reason in the log, and a later success clears it.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** The `backup` image has PostgreSQL 17 client tools (able to dump a version 16 or 17 server) and the scripts from `scripts/`; it mounts the proof volume read-only and `BACKUP_HOST_DIR` read-write. A manual backup is `docker compose run --rm backup scripts/backup.sh`; restoring is `docker compose run --rm backup scripts/restore.sh …`, both documented.
- [ ] **Step 4: Run** the smoke sections so far. Expected: pass.
- [ ] **Step 5: Commit** `feat(deploy): add the production Compose file and nightly backups`.

---

### Task 4: From-zero smoke test

**Files:** Extend `deploy/smoke.sh` to its final form. Modify `package.json` (`deploy:smoke`).

- [ ] **Step 1: Write the remaining checks first.** The script generates an env file with random secrets, starts the stack under its own project name with the smoke override (a throwaway PostgreSQL container as the database, `web` on a loopback port, `cloudflared` not started), and talks to `web` the way the tunnel would (forwarded headers set):
  1. `migrate` exits 0 and `api` and `web` become healthy; the app's page loads; `/api/v1/health` answers; `/api/docs` is not found.
  2. The seeded admin logs in with the temporary password; the refresh cookie is `HttpOnly`, `Secure`, `SameSite=Strict`; the session refreshes with it; changing the password works.
  3. Recording an expense, uploading a small proof, approving it, exporting CSV (compressed in transit, complete on arrival) and reading the audit log all work; an 11 MB upload is refused with the API's Indonesian message as JSON.
  4. Six wrong logins from one forwarded address are rate-limited while another address is not, proving the two-hop setting reads the visitor's address.
  5. **Update and restart:** `up -d --build` again and a restart of every container keep the transaction and its proof downloadable; `migrate` runs again without error.
  6. **Backup and restore:** a backup run in the `backup` container appears in the host folder with its three files; restoring it into a second empty database and folder reproduces the transaction and the proof.
  7. **Missing configuration:** `api` started with a 10-character `JWT_ACCESS_SECRET` exits with the reason in its output.
  It always removes its own project (containers, network, volumes, temporary files) at the end, also on failure, and touches nothing else.
- [ ] **Step 2: Run.** Expected: fail on the first missing piece; fix forward until every check passes. A defect in the application found here is fixed test-first in the owning suite, not in the script.
- [ ] **Step 3: Run** the script a second time to prove it cleans up after itself, then `npm run lint && npm test && npm run test:e2e`. Expected: pass.
- [ ] **Step 4: Commit** `test(deploy): add a from-zero deployment smoke test`.

---

### Task 5: Documentation

**Files:** Create `docs/deployment.md`. Modify `README.md`, `docs/security-checklist.md`, `docs/backup-restore.md`, `docs/decisions.md`.

- [ ] **Step 1: Write `docs/deployment.md`** as numbered steps a person who has never seen the project can follow on a fresh Linux server: what is needed (Docker with Compose, a domain on Cloudflare, a Neon database); creating the tunnel in the Cloudflare dashboard and pointing its public hostname at `http://web:80`; recommended Cloudflare settings (Always Use HTTPS, HSTS without subdomains, upload size note); getting the code; copying `deploy/env.example` and filling each value, with how to generate the secrets; starting; first login and the forced password change; where the data lives; updating to a new version; viewing logs; stopping; the nightly backup, where files land, and keeping copies off the server; restoring; and a short "if something goes wrong" list (a required variable missing, tunnel not connecting, API unhealthy, database unreachable, disk full).
- [ ] **Step 2: Verify the guide** by following every local step literally on this machine with throwaway values (the path the smoke test automates). The two steps that need the owner's real accounts (creating the tunnel, connecting to Neon) are marked in the guide as verified by the owner on first deployment. Record the date and versions.
- [ ] **Step 3: Update** the README (short "Menjalankan di server" section linking to the guide; install, migrate, seed, backup and restore each named with their command), the security checklist (scheduling and `NODE_ENV=production` now met, with evidence), the backup guide (the container commands; Neon as the database), and this phase's rulings in `docs/decisions.md`.
- [ ] **Step 4: Commit** `docs: add the deployment guide`.

---

## Fase 6 acceptance

- [ ] A clean deployment from zero by following the README works (base document, Fase 6 exit criterion), proven by `deploy/smoke.sh`; the tunnel and Neon connection are confirmed by the owner on the real server.
- [ ] Every item of the security checklist is met or explicitly listed as the operator's responsibility.
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` and `npm run deploy:smoke` pass.
