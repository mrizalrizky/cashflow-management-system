# Fase 5a: Audit Log, Export, Hardening and Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server side of Fase 5: let the admin read the audit log, let every role export the transactions they can see, close the remaining items of the security checklist (base document, section 13), and make backup and restore a tested routine.

**Architecture:** Two read endpoints built on what exists. The audit log gets a read-only module beside `AuditService`. The export reuses the transaction list's scope and filter (`TransactionAccessService.scope` and the list's filter-to-where function, extracted so both use the same one) and streams rows from the database in batches into a CSV writer, so memory stays flat however many rows match. Hardening is configuration in `configureApp` (security headers, CORS closed by default) plus one test that walks every registered route and proves none is reachable without a token. Backup and restore are two shell scripts that cover the database and the attachment folder together, exercised by a restore drill.

**Tech Stack:** NestJS 12 (ESM), Prisma 7 with PostgreSQL 16, Vitest, supertest, `helmet` (new dependency, MIT), Bash + Docker Compose for the scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` (sections 4 and 5, and the backup row of section 2.4) and base document `implementation-plan-cashflow-mvp.md` (sections 8, 11 Fase 5, 13). Decisions so far: `docs/decisions.md`.

## Global Constraints

- The audit log is read-only: no endpoint creates, changes or deletes an entry. Only SUPER_ADMIN may read it.
- The export shows exactly what the same user would see in the transaction list with the same filters: same scope, same filters, same order. A project manager never exports another project's rows; staff export only their own.
- A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is neutralised so a spreadsheet does not run it as a formula. Amounts are exported as plain digits (a negative sign never occurs: amounts are positive and the type is its own column).
- Money is `bigint` in code and digits in the file; never a JS `number`. Calendar dates are written as `YYYY-MM-DD`; timestamps in Asia/Jakarta.
- No endpoint loads all matching rows into memory. The export reads in batches and streams.
- Secrets never appear in an audit response: `before`/`after` are already sanitised when written, and the response must not add `password_hash`, tokens or storage keys.
- Exporting is itself audited (who, when, which filters, how many rows).
- Prisma fields are `snake_case`; JSON is `camelCase`. Relative imports end in `.js`. Error format `{ statusCode, message, errors? }` with Indonesian messages.
- Do not write `apps/api/dist`; verify with `npm run lint -w api` and the e2e suite. The backup scripts must never touch a database or folder other than the ones named in their arguments or environment.
- Out of scope: the audit log page and the export button (Fase 5b); production Compose, HTTPS and scheduling inside containers (Fase 6); an Excel `.xlsx` file.

## Review Focus

- **Exporting what is not yours:** a project manager or staff member adding `projectId`, `accountId` or `search` filters, or asking for transfers, never gets a row the list would not show them. Pinned in Task 2.
- **Hostile text in a spreadsheet:** a description such as `=HYPERLINK(...)`, `+62...`, `-5`, `@SUM`, text with quotes, semicolons, commas or line breaks. The file stays one row per transaction, the text survives intact, and nothing is executed. Pinned in Task 2.
- **A large export:** tens of thousands of rows complete without the process holding them all, and the row count equals the list's total for the same filters. Pinned in Task 2.
- **Reading other people's secrets through the audit log:** a non-admin gets 403; an admin never sees a password hash, a token or a storage key in any entry, including entries written by earlier phases. Pinned in Task 1.
- **A backup that cannot be restored:** a backup taken while the app is running restores to a database and an attachment folder where every transaction's proof opens, and the scripts refuse to overwrite anything without being told to. Pinned in Task 5.

## File Structure

```
apps/api/src/
├─ audit/
│  ├─ audit-log.controller.ts        GET /audit-logs
│  ├─ audit-log.service.ts           list with filters
│  ├─ audit-log.mapper.ts
│  ├─ dto/list-audit-logs.dto.ts
│  └─ audit.module.ts                (modify)
├─ common/csv.ts                     toCsvRow, neutraliseCell (pure) + spec
├─ transactions/
│  ├─ transaction-filters.ts         the list's filter-to-where function, extracted
│  ├─ transaction-export.service.ts  batches -> CSV stream
│  ├─ transactions.controller.ts     (modify) GET /transactions/export
│  └─ transactions.service.ts        (modify) use transaction-filters
├─ app.setup.ts                      (modify) helmet, CORS
└─ config/env.validation.ts          (modify) CORS_ORIGINS
apps/api/test/
├─ audit-logs.e2e-spec.ts
├─ transaction-export.e2e-spec.ts
├─ security-headers.e2e-spec.ts
└─ route-guards.e2e-spec.ts
scripts/
├─ backup.sh                         database dump + attachment archive
├─ restore.sh
└─ restore-drill.sh                  backup -> restore into scratch -> compare
docs/
├─ backup-restore.md
└─ security-checklist.md             section 13, item by item, with evidence
```

## Shared interfaces

```ts
// GET /audit-logs?page=&pageSize=&entityType=&entityId=&userId=&action=&dateFrom=&dateTo=   (SUPER_ADMIN)
interface AuditLogResponse {
  id: string;
  action: string;                       // LOGIN, CREATE, APPROVE, ...
  entityType: string;
  entityId: string;
  user: { id: string; name: string } | null;   // null for e.g. a failed login of an unknown email
  before: unknown | null;
  after: unknown | null;
  ip: string | null;
  createdAt: string;                    // ISO timestamp
}
// Paginated<AuditLogResponse>, newest first. dateFrom/dateTo are Jakarta calendar days, inclusive.

// common/csv.ts
export const CSV_SEPARATOR = ';';
export function neutraliseCell(value: string): string;   // prefixes ' when the cell would be read as a formula
export function toCsvRow(cells: (string | null)[]): string;   // quoted where needed, ends with \r\n

// transactions/transaction-filters.ts
export function toTransactionWhere(query: TransactionFilterQuery): Prisma.TransactionWhereInput;

// GET /transactions/export?<the list's filters, without page and pageSize>     (all roles, scoped)
// 200 text/csv; charset=utf-8, Content-Disposition: attachment; filename="transaksi-YYYYMMDD-HHmm.csv"
// UTF-8 with BOM, separator ';', header row:
// Tanggal;Tipe;Jumlah;Keterangan;Akun;Kategori;Kode Proyek;Proyek;Status;Transfer;Dicatat oleh;Ditinjau oleh;Alasan penolakan;Alasan pembatalan;Jumlah bukti;Dicatat pada

// AuditAction gains 'EXPORT' (entity_type 'transaction', entity_id 'export', after: { filters, rows })
```

---

### Task 1: Read the audit log

**Files:** Create `audit/audit-log.controller.ts`, `audit-log.service.ts`, `audit-log.mapper.ts`, `dto/list-audit-logs.dto.ts`, `test/audit-logs.e2e-spec.ts`. Modify `audit/audit.module.ts`, `test/routes.ts`.

- [ ] **Step 1: Failing e2e tests.**
  - Access: SUPER_ADMIN 200; PROJECT_MANAGER and STAFF 403; no token 401. There is no POST, PATCH, PUT or DELETE under `/audit-logs` (each answers 404).
  - After a login, a created account and an approved transaction, the list returns those entries newest first, each with `action`, `entityType`, `entityId`, the acting user's id and name, `before`/`after` as stored, `ip` and `createdAt`; an entry without a user has `user: null`.
  - Filters, alone and combined: `entityType`, `entityId` (the history of one transaction, in order), `userId`, `action`, and `dateFrom`/`dateTo` as Jakarta days (an entry at 23:30 Jakarta on the 6th is in the 6th, not the 7th; both ends inclusive). Paging: `page`, `pageSize`, `meta.total`.
  - **No secrets:** after a login, a password change, a password reset and a proof upload, no entry's JSON contains `password`, `password_hash`, `token`, `token_hash` or `storage_key` as a key at any depth.
  - Asking badly: `userId=abc`, `dateFrom=2026-13-01`, `dateFrom` after `dateTo`, `pageSize=1000`, an unknown parameter each answer 400 with the field named.
- [ ] **Step 2: Run** `npm run test:e2e -w api -- test/audit-logs.e2e-spec.ts`. Expected: fail (404).
- [ ] **Step 3: Implement.** Order by `created_at` descending then `id`. The date filter converts Jakarta days to an instant range.
- [ ] **Step 4: Run** the spec, then lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add the audit log list`.

---

### Task 2: Export transactions

**Files:** Create `common/csv.ts`, `common/csv.spec.ts`, `transactions/transaction-filters.ts`, `transactions/transaction-export.service.ts`, `test/transaction-export.e2e-spec.ts`. Modify `transactions/transactions.service.ts`, `transactions.controller.ts`, `transactions.module.ts`, `dto/transaction.dto.ts`, `audit/audit.service.ts` (`EXPORT`).

- [ ] **Step 1: Failing unit tests** for `common/csv.ts`.
  - `neutraliseCell`: `=1+1`, `+62812`, `-5`, `@SUM(A1)`, a leading tab and a leading carriage return each get a leading `'`; ordinary text, an empty string and text with `=` in the middle are unchanged.
  - `toCsvRow`: cells joined with `;` and ended with `\r\n`; a cell containing `;`, `"`, `\n` or `\r` is wrapped in quotes with inner quotes doubled; `null` is an empty cell; a neutralised cell is still quoted when it needs to be.
- [ ] **Step 2: Failing e2e tests.**
  - Access: every role 200; no token 401. The response is `text/csv; charset=utf-8`, an attachment named `transaksi-<date>-<time>.csv`, and starts with the UTF-8 byte order mark followed by the header row.
  - Content: one row per transaction, in the list's order, with date `YYYY-MM-DD`, type (`Masuk`/`Keluar`), amount as digits, description, account, category, project code and name (empty for overhead), status label, `Ya`/`Tidak` for transfer, who recorded and reviewed, the rejection and void reasons, the number of proofs, and the recording time in Jakarta as `YYYY-MM-DD HH:mm`.
  - **Same as the list:** for each role and for several filter sets (`status`, `type`, date range, `projectId`, `accountId`, `search`, `overhead`, `includeTransfers=false`), the exported ids' count and order equal the list's `meta.total` and order for the same query.
  - **Not yours:** a project manager filtering on an unassigned `projectId`, and staff filtering on someone else's project, get a file with only the header. A project manager's unfiltered export has no overhead row and no other project's row.
  - **Hostile text:** descriptions `=HYPERLINK("http://x","y")`, `+62 812`, `-5 unit`, `@SUM(A1)`, `Semen; 10 "sak"`, and a two-line description each stay one logical row (parsed back with a real CSV parser in the test), the formula-like ones start with `'`, and the text is otherwise intact. A project or account name beginning with `=` is neutralised too.
  - **Large:** with 20,000 transactions the export completes, has 20,001 lines, and the service reads in batches (the test counts `findMany` calls: more than one, each with `take` at most the batch size).
  - Audit: one `EXPORT` entry per export with the user, the filters used and the row count; a failed export (bad filter, 400) writes none.
  - Asking badly: an invalid filter value answers 400 with the field named; `page` and `pageSize` are not accepted.
- [ ] **Step 3: Run** unit and e2e. Expected: fail.
- [ ] **Step 4: Implement.** Move the list's filter-to-where function into `transaction-filters.ts` and make the list use it (its tests must pass unchanged). The export pages by a keyset on the list's order, in batches of 1,000, writing each batch to the response stream and waiting when the stream is full.
- [ ] **Step 5: Run** unit, the export spec and the transaction specs, then lint. Expected: pass.
- [ ] **Step 6: Commit** `feat(api): export transactions as CSV`.

---

### Task 3: Security headers and CORS

**Files:** Modify `app.setup.ts`, `config/env.validation.ts`, `.env.example`, `apps/api/package.json` (add `helmet`). Create `test/security-headers.e2e-spec.ts`.

- [ ] **Step 1: Failing e2e tests.**
  - Every response (a 200, a 401 and a 404) carries `X-Content-Type-Options: nosniff`, `X-Frame-Options` denying framing (or the equivalent `frame-ancestors`), `Referrer-Policy`, and no `X-Powered-By`.
  - With `CORS_ORIGINS` unset: a request with `Origin: https://lain.example` gets no `Access-Control-Allow-Origin`, and a preflight (`OPTIONS` with `Access-Control-Request-Method`) is not approved.
  - With `CORS_ORIGINS=https://kas.example.com`: that origin is allowed with credentials; another origin is not; the value is never `*`.
  - `CORS_ORIGINS` containing `*` or a malformed URL fails environment validation at start.
  - The attachment download still returns its own `Content-Disposition` and `nosniff`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** `npm install helmet -w api`. The API serves JSON and files only, so the content security policy is `default-src 'none'; frame-ancestors 'none'`. Swagger (non-production only) keeps working: relax the policy for `/api/docs` only.
- [ ] **Step 4: Run** the spec, the docs spec and lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add security headers and closed-by-default CORS`.

---

### Task 4: Every route is guarded, and the checklist

**Files:** Create `test/route-guards.e2e-spec.ts`, `docs/security-checklist.md`.

- [ ] **Step 1: Failing test.** Read every registered route from the running application (method and path). The public allow-list is exactly: health, login, refresh, logout, and the API docs outside production. For every other route, a request without a token answers 401 (ids replaced by a random UUID, bodies empty). The test fails if a route exists that is neither on the allow-list nor answering 401, and if an allow-listed route has disappeared. A second table lists every admin-only route (users, account and category and project writes, project members, transfers, void, dashboard, audit log) and asserts 403 for PROJECT_MANAGER and STAFF.
- [ ] **Step 2: Run.** Expected: the test fails only if a route is unguarded; if it passes at once, prove it can fail by temporarily marking one guarded route public in a scratch copy, and record that in the ledger.
- [ ] **Step 3: Write `docs/security-checklist.md`:** each item of section 13 of the base document with where it is enforced and which test proves it (argon2 and token hashing; role guards and IDOR; DTO whitelist; upload checks; login rate limit; no secrets in the repository, verified with `git ls-files` and a search for key-like strings; backup; the minimum test list). Any item not fully met is listed as open with what is missing.
- [ ] **Step 4: Run** the full suite: `npm run lint && npm test && npm run test:e2e`. Expected: pass.
- [ ] **Step 5: Commit** `test(api): prove every route is guarded; add the security checklist`.

---

### Task 5: Backup and restore

**Files:** Create `scripts/backup.sh`, `scripts/restore.sh`, `scripts/restore-drill.sh`, `docs/backup-restore.md`. Modify `README.md`, `package.json` (script aliases), `docs/decisions.md`.

- [ ] **Step 1: Write the drill first** (`scripts/restore-drill.sh`), which is the test of the other two: it seeds a scratch database and a scratch attachment folder with a few transactions and proof files, runs `backup.sh`, restores into a second scratch database and folder with `restore.sh`, and then compares row counts per table, a checksum of the transactions' ids and amounts, and the checksum of every attachment file against the path recorded in its row. It exits non-zero on any difference and removes its scratch data at the end. It refuses to run unless every database name it touches ends in `_drill`.
- [ ] **Step 2: Run it.** Expected: fail (the scripts do not exist).
- [ ] **Step 3: Implement.**
  - `backup.sh`: takes the database URL (or Compose service), the attachment folder and a target folder from the environment; writes `cashflow-<UTC timestamp>/` containing `database.dump` (`pg_dump --format=custom`), `attachments.tar.gz` and a `SHA256SUMS` file; the dump is taken first and the archive second, so a proof uploaded in between has no row pointing at a missing file; deletes backups older than `BACKUP_KEEP_DAYS` (default 14) only inside the target folder and only if they match its own naming; exits non-zero and leaves no partial folder on failure.
  - `restore.sh`: takes a backup folder, verifies `SHA256SUMS`, and restores into the database and folder named in the environment; refuses to run when the target database has tables or the target folder has files unless `--force` is given, and prints exactly what it is about to replace.
- [ ] **Step 4: Run** the drill. Expected: pass. Record its output in `docs/backup-restore.md` as the tested restore.
- [ ] **Step 5: Document** in `docs/backup-restore.md`: what is backed up and why both parts belong together, how to run a backup by hand, a cron line for a nightly backup, how to restore step by step, how to run the drill, and where to keep copies (not on the same disk). Link it from the README. Add this phase's rulings to `docs/decisions.md`.
- [ ] **Step 6: Commit** `feat(ops): add backup, restore and a restore drill`.

---

## Fase 5a acceptance

- [ ] Every item of the security checklist (base document, section 13) is met and has evidence in `docs/security-checklist.md`, or is listed there as open.
- [ ] A backup has been restored by the drill.
- [ ] `npm run lint`, `npm test` and `npm run test:e2e` pass.
