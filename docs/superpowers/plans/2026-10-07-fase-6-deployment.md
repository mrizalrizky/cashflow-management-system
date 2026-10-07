# Fase 6: Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the application installable on one server from a clean checkout by following the README: production images for the API and the web, one Compose file that runs everything behind HTTPS, nightly backups, and a smoke test that proves a from-zero deployment works.

**Architecture:** Four long-running containers on one private network. `postgres` holds the data on a named volume and publishes no port. `api` is a slim Node image running the compiled NestJS app as a non-root user, with the proof files on a second named volume. `web` is Caddy: it serves the built Vue files, forwards `/api/*` to `api`, and terminates HTTPS, so there is exactly one public entry point and web and API share one origin (no CORS). `backup` runs the Fase 5a backup script every night against the same database and proof volume. A one-shot `migrate` container applies database migrations and the idempotent seed before `api` starts, on every deploy. All configuration, including every secret, comes from one env file that is not in the repository; Compose refuses to start when a required secret is missing.

**Tech Stack:** Docker (multi-stage builds), Docker Compose v2, Node 24 (Debian slim), Caddy 2, PostgreSQL 16, Bash.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` (section 2.4, last line; section 7 Fase 6) and base document `implementation-plan-cashflow-mvp.md` (section 11 Fase 6, section 13). Carried-over notes: `docs/decisions.md` (every "Untuk Fase 6" line), `docs/security-checklist.md` ("Yang masih terbuka"), `docs/backup-restore.md`.

## Global Constraints

- No secret in the repository or in an image layer. Secrets reach containers only through the env file at run time; nothing secret is passed as a build argument or copied into an image. `.dockerignore` keeps `.env*`, `node_modules`, test output and the proof folder out of the build context.
- Compose must refuse to start, naming the variable, when a required secret is unset or still the example value. There is no default database password and no default JWT secret in production.
- `NODE_ENV=production` is set by the Compose file itself, not left to the operator: API docs stay closed and the refresh cookie stays `Secure`.
- Only the `web` container publishes ports. `postgres` and `api` are reachable only on the internal network.
- Data lives only in named volumes (`postgres_data`, `storage`, Caddy's certificate data) and in the backup folder on the host. Recreating or updating containers must never lose data; nothing in this phase runs `down -v` outside the smoke test's own throwaway project.
- Containers run as non-root where the base image allows it, restart `unless-stopped`, and have health checks; `api` starts only after the database is healthy and migrations have finished successfully.
- The images are built from the lockfile (`npm ci`), with the same Node major version the project declares.
- Do not write `apps/api/dist` on the host: images build inside Docker. The smoke test uses its own Compose project name, its own ports and its own volumes, and removes them when it ends; it must not touch the development database container, the owner's `.env`, or any other project's containers.
- User-facing documentation is in Indonesian, as the rest of the README.
- Out of scope: CI/CD pipelines, Kubernetes, multi-server setups, monitoring stacks, off-site backup transport (documented as the operator's step), an external managed database as the default.

## Review Focus

- **A secret or the wrong file ends up in an image:** `.env`, `apps/api/storage`, test fixtures or dev dependencies in the runtime image; a secret visible in `docker history`. The build context and each runtime image contain only what runs. Pinned in Tasks 1 and 2.
- **Behind the proxy things behave differently:** the refresh cookie is `Secure` and still works; the login rate limit sees the client's address, not Caddy's; a 10 MB proof passes and an 11 MB one gets the API's own Indonesian message rather than a proxy error page; a deep link such as `/transaksi/<id>` loads the app; `/api/docs` is not served. Pinned in Tasks 2 and 4.
- **Starting in the wrong order or with missing configuration:** the API starting before migrations, an empty `JWT_ACCESS_SECRET` or database password, the seed's admin password left at the example value. The stack fails clearly and early. Pinned in Tasks 3 and 4.
- **Updating and restarting lose nothing:** `up -d --build` after a code change, a container restart, and a host reboot keep transactions, proof files and certificates; migrations added since the last deploy are applied once. Pinned in Task 4.
- **Backups that silently stop:** the nightly job failing (database down, disk full) must be visible in the container's log and health, and a backup made in the container must restore with the documented command. Pinned in Tasks 3 and 4.

## File Structure

```
.dockerignore
apps/api/Dockerfile                 stages: deps, build (also used by `migrate`), runtime
apps/web/Dockerfile                 stages: build (Vite), runtime (Caddy + built files)
deploy/
├─ Caddyfile                        HTTPS, /api proxy, SPA fallback, headers, caching, upload limit
├─ backup.Dockerfile                PostgreSQL 16 client tools + Bash + the backup scripts
├─ backup-loop.sh                   run backup.sh once a day at BACKUP_AT; exit non-zero on failure
├─ env.example                      every variable, documented; secrets empty
└─ smoke.sh                         from-zero deployment test
docker-compose.prod.yml
apps/api/src/app.setup.ts           (modify) HSTS left to the proxy
docs/deployment.md                  the full guide
README.md, docs/security-checklist.md, docs/backup-restore.md, docs/decisions.md   (modify)
```

## Shared interfaces

```
# deploy/env.example (names are the contract between the env file, Compose and the docs)
SITE_ADDRESS=            # public host name, e.g. kas.example.com
TLS_MODE=internal        # `internal` = Caddy's own certificate (LAN); an e-mail address = Let's Encrypt
HTTP_PORT=80
HTTPS_PORT=443
POSTGRES_PASSWORD=       # required
JWT_ACCESS_SECRET=       # required, at least 32 characters
SEED_ADMIN_NAME=Administrator
SEED_ADMIN_EMAIL=        # required
SEED_ADMIN_PASSWORD=     # required; temporary, must be changed at first login
LOGIN_RATE_LIMIT=5
BACKUP_HOST_DIR=         # required; folder on the host that receives backups
BACKUP_AT=01:30          # server time, 24-hour
BACKUP_KEEP_DAYS=14

# Compose services: postgres, migrate (one-shot), api, web, backup
# Set by Compose, not by the operator: NODE_ENV=production, PORT=3000, TRUST_PROXY_HOPS=1,
#   DATABASE_URL (built from POSTGRES_PASSWORD), STORAGE_DIR=/data/storage, CORS_ORIGINS empty

# deploy/smoke.sh  (no arguments)  exit 0 when a from-zero deployment passes every check
```

---

### Task 1: API image

**Files:** Create `.dockerignore`, `apps/api/Dockerfile`. Modify `apps/api/src/app.setup.ts`, `apps/api/test/security-headers.e2e-spec.ts`.

- [ ] **Step 1: Failing checks.** Start `deploy/smoke.sh` with its first section only (it grows in later tasks). After `docker build` of the `runtime` target it asserts:
  - the image runs as a non-root user and its default command starts the compiled app;
  - the image contains `dist/main.js` and the Prisma client, and does **not** contain `.env`, `src/`, `test/`, `storage/`, `node_modules/.bin/nest`, `vitest` or `typescript`;
  - `docker history` shows no secret-looking value and no build argument;
  - with a bogus `DATABASE_URL` and no `JWT_ACCESS_SECRET` the container exits non-zero and prints the environment validation message naming the variable.
  Add an e2e test: API responses carry no `Strict-Transport-Security` header (HTTPS policy belongs to the proxy, which knows the host name).
- [ ] **Step 2: Run** `bash deploy/smoke.sh` and the e2e spec. Expected: fail (no Dockerfile; HSTS present).
- [ ] **Step 3: Implement.**
  - `deps` stage: `npm ci` for the workspace (install scripts allowed exactly as `allowScripts` in the root `package.json` lists).
  - `build` stage: `prisma generate` and `nest build`. This stage keeps dev dependencies and the Prisma CLI, so the `migrate` service uses it to run `prisma migrate deploy` and the seed.
  - `runtime` stage: Node 24 slim, production dependencies only (pruned without running install scripts, so the `postinstall` that needs the Prisma CLI does not run), `dist`, a non-root user, `STORAGE_DIR` owned by that user, a `HEALTHCHECK` on `/api/v1/health`, `CMD ["node", "dist/main.js"]`.
  - Turn off helmet's HSTS header in `app.setup.ts`.
- [ ] **Step 4: Run** the smoke section, `npm run lint -w api`, and the security-headers spec. Expected: pass.
- [ ] **Step 5: Commit** `feat(deploy): add the API production image`.

---

### Task 2: Web image and reverse proxy

**Files:** Create `apps/web/Dockerfile`, `deploy/Caddyfile`. Extend `deploy/smoke.sh`.

- [ ] **Step 1: Failing checks** (the web container is started alone, with a stub upstream for `/api`):
  - `/` and a deep link (`/transaksi/abc`, `/audit-log`) return the app's `index.html`; a missing asset under `/assets/` returns 404, not `index.html`.
  - `index.html` is sent with `Cache-Control: no-cache`; files under `/assets/` with a long `immutable` lifetime.
  - `/api/v1/health` is forwarded to the upstream with `X-Forwarded-For` set; a request body of 11 MB to `/api/` is not cut off by the proxy below the API's own 10 MB limit (the proxy's limit is higher than the API's, so the API's message is what the user gets), and one far above it (50 MB) is refused by the proxy.
  - Responses for the app carry `X-Content-Type-Options: nosniff`, a `Content-Security-Policy` that allows only the app's own scripts and connections (plus what PrimeVue needs for styles and `blob:`/`data:` images for proof previews), `frame-ancestors 'none'`, `Referrer-Policy`, and, over HTTPS, `Strict-Transport-Security` without `includeSubDomains`.
  - Plain HTTP redirects to HTTPS. With `TLS_MODE=internal` Caddy serves its own certificate; the server header does not reveal a version.
  - The image contains only Caddy, the Caddyfile and the built files: no `node_modules`, no source.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** The Caddyfile reads `SITE_ADDRESS` and `TLS_MODE` from the environment. The web build stage runs `npm ci` and `vite build` for the web workspace only.
- [ ] **Step 4: Run** the smoke sections so far. Expected: pass.
- [ ] **Step 5: Commit** `feat(deploy): add the web image with HTTPS reverse proxy`.

---

### Task 3: Compose file, configuration and backups

**Files:** Create `docker-compose.prod.yml`, `deploy/env.example`, `deploy/backup.Dockerfile`, `deploy/backup-loop.sh`. Modify `.gitignore` if needed so `deploy/env.example` is tracked and a real `deploy/.env` is not. Extend `deploy/smoke.sh`.

- [ ] **Step 1: Failing checks.**
  - `docker compose -f docker-compose.prod.yml config` with an env file missing `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SITE_ADDRESS` or `BACKUP_HOST_DIR` fails and names the missing variable, each in turn.
  - With a complete env file, the rendered configuration shows: only `web` publishes ports; `postgres` and `api` publish none; `NODE_ENV=production` and `TRUST_PROXY_HOPS=1` on `api`; `api` depends on `postgres` being healthy and on `migrate` having completed successfully; every long-running service has `restart: unless-stopped`; the three named volumes exist; no secret value appears in the Compose file itself.
  - `deploy/env.example` lists every variable the Compose file reads, and the Compose file reads no variable the example does not list.
  - `backup-loop.sh` (run with a fake clock hook): runs the backup at `BACKUP_AT` and not before; a failing backup makes the container unhealthy and is logged with the reason; the next day it tries again.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** The `backup` image is PostgreSQL 16 (Debian) with the scripts from `scripts/`, mounting the proof volume read-only and `BACKUP_HOST_DIR` read-write; restoring is done with `docker compose run --rm backup scripts/restore.sh …` and documented.
- [ ] **Step 4: Run** the smoke sections so far. Expected: pass.
- [ ] **Step 5: Commit** `feat(deploy): add the production Compose file and nightly backups`.

---

### Task 4: From-zero smoke test

**Files:** Extend `deploy/smoke.sh` to its final form. Modify `package.json` (`deploy:smoke`).

- [ ] **Step 1: Write the remaining checks first.** The script creates a temporary env file with generated secrets and unusual ports, brings the whole stack up under its own project name, and checks, through the public HTTPS port only:
  1. The stack becomes healthy; `migrate` exited 0; the app's page loads; `/api/v1/health` answers; `/api/docs` is not found.
  2. The seeded admin can log in with the temporary password; the refresh cookie is `HttpOnly`, `Secure`, `SameSite=Strict`; the session refreshes with that cookie; changing the password works.
  3. Recording an expense, uploading a small proof, approving it, exporting CSV and reading the audit log all work end to end; an 11 MB upload is refused with the API's Indonesian message as JSON.
  4. Six wrong logins from one client are rate-limited (the limit is per client address, proving the proxy passes it on).
  5. **Update and restart:** `up -d --build` again and a restart of every container keep the transaction and its proof downloadable, and `migrate` runs again without error.
  6. **Backup and restore:** a backup triggered in the `backup` container appears in the host folder with its three files; restoring it into a second, empty throwaway stack reproduces the transaction and the proof.
  7. **Missing configuration:** bringing the stack up with `JWT_ACCESS_SECRET` shortened to 10 characters fails before `api` becomes healthy, with the reason in the logs.
  It always tears its own project down (containers, networks and its own volumes) at the end, also on failure, and touches nothing else.
- [ ] **Step 2: Run.** Expected: fail on the first missing piece; fix forward until every check passes. A defect in the application found here is fixed test-first in the owning suite, not in the script.
- [ ] **Step 3: Run** the script twice in a row to prove it cleans up after itself, then `npm run lint && npm test && npm run test:e2e` to prove nothing else moved. Expected: pass.
- [ ] **Step 4: Commit** `test(deploy): add a from-zero deployment smoke test`.

---

### Task 5: Documentation

**Files:** Create `docs/deployment.md`. Modify `README.md`, `docs/security-checklist.md`, `docs/backup-restore.md`, `docs/decisions.md`.

- [ ] **Step 1: Write `docs/deployment.md`** as numbered steps a person who has never seen the project can follow on a fresh Linux server: what is needed (Docker with Compose, a host name pointing at the server, ports 80 and 443 open); getting the code; copying `deploy/env.example` and filling each value, with how to generate the secrets; choosing `TLS_MODE` (public host name with Let's Encrypt, or an internal certificate for a LAN and how staff devices trust it); starting; first login and the forced password change; where the data lives; updating to a new version; viewing logs; stopping; what the nightly backup does, where the files land, and that copies must be kept off the server; restoring; and a short "if something goes wrong" list (a required variable missing, certificate not issued, API unhealthy, disk full).
- [ ] **Step 2: Verify the guide by following it literally** on this machine with throwaway values (the same path the smoke test automates), correcting every step that does not work as written. Record in the guide the date and the versions it was verified with.
- [ ] **Step 3: Update** the README (short "Menjalankan di server" section linking to the guide; install, migrate, seed, backup and restore each named with their command), the security checklist (scheduling and `NODE_ENV=production` now met, with evidence), the backup guide (the container commands), and this phase's rulings in `docs/decisions.md`.
- [ ] **Step 4: Commit** `docs: add the deployment guide`.

---

## Fase 6 acceptance

- [ ] A clean deployment from zero by following the README works (base document, Fase 6 exit criterion), proven by `deploy/smoke.sh` and by following `docs/deployment.md` literally once.
- [ ] Every item of the security checklist is met or explicitly listed as the operator's responsibility.
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` and `npm run deploy:smoke` pass.
