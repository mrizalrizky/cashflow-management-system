# Fase 2a: Master Data API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API for the data every transaction will refer to: cash/bank accounts, transaction categories, and projects with their assigned project managers, including the project-access rules that Fase 3 and 4 reuse.

**Architecture:** Three modules (`accounts`, `categories`, `projects`) built from the shared pieces of Fase 1a (pagination, search, validation, audit, guards). One `ProjectAccessService` answers "which projects may this user see" and is the only place that rule lives. Money enters and leaves the API as a digit string and is a `bigint` everywhere in between.

**Tech Stack:** NestJS 12 (ESM), Prisma 7.10.0, PostgreSQL 16, Vitest, supertest. No new runtime dependencies except `@nestjs/swagger` in the last task.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` (sections 2.2, 3, 4, 5) and base document `implementation-plan-cashflow-mvp.md` (sections 5, 6, 8, 11 Fase 2). Where they conflict, the spec wins. Earlier rulings: `docs/decisions.md`.

Fase 2 is split in two. This plan (2a) is the API. Fase 2b is the web side: master data pages, project list and detail with the members tab.

## Global Constraints

- Prisma model fields are `snake_case`; API JSON is `camelCase`, mapped in one mapper function per entity. Never return a Prisma row directly.
- Money is integer rupiah: `bigint` in code, a string of digits in JSON, in both directions. Never a JS `number`.
- Calendar dates (`start_date`, `end_date`) are `YYYY-MM-DD` strings in JSON, with no time zone conversion.
- No hard deletes. Accounts and categories are deactivated with `is_active`; projects change `status`.
- Every create, update and membership change writes an audit row in the same database transaction as the change.
- Role and project scoping are enforced in the service or query, never only in the controller or the UI. A project outside a user's scope answers 404, as if it did not exist.
- Reuse `common/` (pagination, `containsText`, `validationFailed`, `IsOptionalNotNull`, `isUniqueViolation`) and the test helpers (`setupE2e`, `loginAs`, `routes.ts`, `errorFields`). Do not copy their logic.
- The API is ESM: every relative import ends in `.js`. Messages are Indonesian.
- Do not run `nest build` or anything else that writes `apps/api/dist` to verify work; the developer's dev server watches it. Use `npx tsc --noEmit -p tsconfig.build.json`.
- Out of scope: transactions, attachments, dashboards and summaries, any web code.

## Review Focus

- **A project manager asking for a project they are not assigned to**, by id, in a list, in the dropdown options, or right after being unassigned: 404 or absent, immediately. Pinned in Tasks 4 and 5.
- **Two projects created at the same moment:** both get distinct, consecutive codes; neither request fails. Pinned in Task 4.
- **Money at the edges:** an opening balance or contract value above 2^53, with leading zeros, negative, with decimals or separators (`1.250.000`, `1250000.50`), or sent as a JSON number. Exact values round-trip; malformed ones are rejected with a field error. Pinned in Tasks 1 and 2.
- **Protected categories:** the system categories (Transfer Masuk, Transfer Keluar) cannot be renamed, retyped or deactivated through any route. Pinned in Task 3.
- **Assigning the wrong people to a project:** a STAFF user, an inactive project manager, an unknown id, or the same id twice. The whole request is refused and nothing changes. Pinned in Task 5.

## File Structure

```
apps/api/src/
├─ common/money.ts                 IsMoneyString(), toMoney(), fromMoney()
├─ common/calendar-date.ts         IsCalendarDate(), toDate(), toDateString(), currentYearInJakarta()
├─ common/advisory-lock.ts         withLock(tx, LOCKS.x) for serialising rare critical sections
├─ audit/audit.service.ts          (modify) new actions
├─ users/users.service.ts          (modify) use advisory-lock helper; drop memberships on role change
├─ accounts/                       accounts.module, controller, service, account.mapper, dto/account.dto
├─ categories/                     categories.module, controller, service, category.mapper, dto/category.dto
├─ projects/
│  ├─ projects.module.ts
│  ├─ projects.controller.ts
│  ├─ projects.service.ts          CRUD and code generation
│  ├─ project-members.service.ts   setMembers()
│  ├─ project-access.service.ts    scope rules, exported for later phases
│  ├─ project.mapper.ts
│  └─ dto/project.dto.ts
└─ app.module.ts                   (modify)
apps/api/test/
├─ routes.ts                       (modify) ACCOUNTS, CATEGORIES, PROJECTS
├─ fixtures.ts                     (modify) createAccount, createCategory, createProject, assign
└─ accounts / categories / projects / project-members / project-access .e2e-spec.ts
```

## Shared interfaces

```ts
// common/money.ts
export const IsMoneyString: (options?: { allowNegative?: boolean }) => PropertyDecorator;
        // accepts /^\d{1,15}$/ (or /^-?\d{1,15}$/); rejects numbers, decimals, separators, empty
export function toMoney(value: string): bigint;
export function fromMoney(value: bigint): string;

// common/calendar-date.ts
export const IsCalendarDate: () => PropertyDecorator;       // real calendar date, YYYY-MM-DD
export function toDate(value: string): Date;                // UTC midnight
export function toDateString(value: Date): string;          // YYYY-MM-DD
export function currentYearInJakarta(now?: Date): number;

// common/advisory-lock.ts
export const LOCKS = { userAccess: 7301, projectCode: 7302 } as const;
export function withLock(tx: Prisma.TransactionClient, lock: number): Promise<void>;   // released at transaction end

// accounts
interface AccountResponse { id; name; type: 'CASH' | 'BANK'; openingBalance: string; balance: string; isActive: boolean; createdAt: string }
interface AccountOption  { id; name; type }

// categories
interface CategoryResponse { id; name; type: 'IN' | 'OUT'; isSystem: boolean; isActive: boolean }

// projects
interface ProjectMemberResponse { id; name; email }
interface ProjectResponse {
  id; code; name; clientName; contractValue: string; status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startDate: string | null; endDate: string | null; notes: string | null;
  members: ProjectMemberResponse[]; createdAt: string; updatedAt: string;
}
interface ProjectOption { id; code; name }

// projects/project-access.service.ts
ProjectAccessService.scope(user: AuthUser): Prisma.ProjectWhereInput;
        // SUPER_ADMIN: {}   PROJECT_MANAGER: { members: { some: { user_id } } }   STAFF: matches nothing
ProjectAccessService.optionsScope(user: AuthUser): Prisma.ProjectWhereInput;
        // active projects a user may record a transaction against: all for SUPER_ADMIN and STAFF, assigned for PROJECT_MANAGER
ProjectAccessService.assertCanView(db: Db, user: AuthUser, projectId: string): Promise<void>;   // 404 otherwise
```

Routes (all under `/api/v1`):

| Route | Who | Notes |
|---|---|---|
| `GET /accounts` | SUPER_ADMIN | paged; `search`, `type`, `isActive`; includes `balance` |
| `GET /accounts/options` | all roles | active accounts, `id`, `name`, `type` only; never a balance |
| `POST /accounts`, `PATCH /accounts/:id` | SUPER_ADMIN | |
| `GET /categories` | all roles | `type`, `isActive`; other roles always get active only |
| `POST /categories`, `PATCH /categories/:id` | SUPER_ADMIN | |
| `GET /projects` | SUPER_ADMIN, PROJECT_MANAGER | paged; `search`, `status`; scoped |
| `GET /projects/options` | all roles | scoped per `optionsScope` |
| `GET /projects/:id` | SUPER_ADMIN, PROJECT_MANAGER | scoped, 404 outside scope |
| `POST /projects`, `PATCH /projects/:id` | SUPER_ADMIN | |
| `PUT /projects/:id/members` | SUPER_ADMIN | body `{ userIds: string[] }`; replaces the list |

---

### Task 1: Shared helpers for money, dates and locks

**Files:** Create `common/money.ts`, `common/calendar-date.ts`, `common/advisory-lock.ts` with unit specs for the first two. Modify `users/users.service.ts` (use `withLock(tx, LOCKS.userAccess)`), `audit/audit.service.ts` (add `SET_MEMBERS` to `AuditAction`).

- [ ] **Step 1: Failing unit tests.**
  - Money, through a small DTO validated with the app's `createValidationPipe()`: accepts `"0"`, `"1250000"`, `"9007199254740993"` (and round-trips it exactly through `toMoney`/`fromMoney`), `"000123"` (value 123); rejects `""`, `"1.250.000"`, `"1250000.50"`, `"1e6"`, `" 12 "`, `"-5"`, the number `1250000`, `null`, and 16 digits; with `allowNegative` accepts `"-5"` and rejects `"--5"` and `"-"`.
  - Calendar date: accepts `"2026-10-06"` and `"2024-02-29"`; rejects `"2026-02-30"`, `"2026-13-01"`, `"06-10-2026"`, `"2026-10-06T00:00:00Z"`, a number; `toDateString(toDate(x)) === x`; `currentYearInJakarta(new Date('2026-12-31T17:30:00Z'))` is 2027.
- [ ] **Step 2: Run** `npm test -w api`. Expected: fail, modules missing.
- [ ] **Step 3: Implement.** `withLock` is `tx.$executeRaw\`SELECT pg_advisory_xact_lock(${lock})\``; replace the private lock method in `UsersService` with it.
- [ ] **Step 4: Run** `npm test -w api && npm run test:e2e -w api && npm run lint -w api`. Expected: pass, including the existing concurrent-admin test.
- [ ] **Step 5: Commit** `feat(api): add money, calendar-date and advisory-lock helpers`.

---

### Task 2: Accounts

**Files:** Create the `accounts/` module and `test/accounts.e2e-spec.ts`. Modify `app.module.ts`, `test/routes.ts`, `test/fixtures.ts` (`createAccount`).

- [ ] **Step 1: Failing e2e tests.**
  - Roles: `GET /accounts`, `POST`, `PATCH` are 401 without a token, 403 for STAFF and PROJECT_MANAGER, allowed for SUPER_ADMIN. `GET /accounts/options` is allowed for all three roles.
  - Create returns 201 with `openingBalance` and `balance` as strings, `isActive: true`; defaults `openingBalance` to `"0"` when omitted; trims the name.
  - Money edges on `openingBalance`: `"9007199254740993"` is stored and returned exactly; `"1.250.000"`, `1250000` (number) and `"12.5"` are rejected with a field error; a negative opening balance (`"-500000"`, an overdrawn account) is accepted.
  - A second account with the same name in any case returns 409 `Nama akun sudah dipakai`; renaming an account to its own name in another case is allowed.
  - Invalid `type`, empty name, unknown property: 400.
  - **Balance:** with opening balance 1,000,000, one APPROVED IN of 500,000, one APPROVED OUT of 200,000, one PENDING OUT, one REJECTED IN and one VOID OUT (inserted directly with Prisma), `balance` is `"1300000"`. An account with no transactions has `balance` equal to `openingBalance`. The balance of one account is not affected by another account's transactions.
  - List: ordered by name then id; `search`, `type`, `isActive` filters; paging metadata.
  - Options: only active accounts; each item has exactly the keys `id`, `name`, `type`.
  - Update changes name, type, opening balance and `isActive`; explicit `null` is a 400; unknown id is 404 `Akun tidak ditemukan`; malformed id is 400.
  - Create and update each write one audit row whose `after.opening_balance` is a string; a failed create writes none.
- [ ] **Step 2: Run** `npm run test:e2e -w api`. Expected: fail with 404.
- [ ] **Step 3: Implement.** Balances for a page of accounts come from **one** `groupBy(['account_id', 'type'])` over `status: 'APPROVED'` for the ids on that page, never one query per account. Name uniqueness is checked case-insensitively inside the write transaction.
- [ ] **Step 4: Run** e2e, unit, lint, type-check. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add accounts with computed balances`.

---

### Task 3: Categories

**Files:** Create the `categories/` module and `test/categories.e2e-spec.ts`. Modify `app.module.ts`, `test/routes.ts`, `test/fixtures.ts` (`createCategory`).

- [ ] **Step 1: Failing e2e tests.**
  - `GET /categories` works for all three roles; `POST` and `PATCH` are SUPER_ADMIN only.
  - Returns an array (categories are few; no paging), ordered by type, then name. `type=IN` filters. SUPER_ADMIN can ask for `isActive=false`; for STAFF and PROJECT_MANAGER inactive categories never appear, whatever they ask.
  - Create returns 201 with `isSystem: false`, `isActive: true`. The same name with the same type, in any case, is 409 `Kategori sudah ada`; the same name with the other type is allowed.
  - `isSystem` cannot be set from the body (400, unknown property).
  - Update can rename and deactivate. `type` is not accepted on update (400): a category's type never changes.
  - **System categories:** renaming or deactivating one returns 400 `Kategori sistem tidak bisa diubah` and leaves the row untouched.
  - Unknown id 404 `Kategori tidak ditemukan`; explicit `null` 400.
  - Audit rows for create and update.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** e2e, lint, type-check. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add categories with protected system categories`.

---

### Task 4: Projects and project access

**Files:** Create `projects/projects.module.ts`, `projects.controller.ts`, `projects.service.ts`, `project-access.service.ts`, `project.mapper.ts`, `dto/project.dto.ts`, `test/projects.e2e-spec.ts`, `test/project-access.e2e-spec.ts`. Modify `app.module.ts`, `test/routes.ts`, `test/fixtures.ts` (`createProject`, `assign`).

- [ ] **Step 1: Failing e2e tests.**

`projects.e2e-spec.ts` (as SUPER_ADMIN unless stated):
  - Create returns 201 with a generated `code` `PRJ-<year>-001` (year from `currentYearInJakarta`), `status: 'ACTIVE'`, `contractValue` as a string, `members: []`. Three creates give `-001`, `-002`, `-003`.
  - **Concurrent creates:** ten `POST /projects` sent with `Promise.all` all return 201 with ten distinct codes `-001` to `-010`.
  - The sequence restarts per year: with an existing `PRJ-2025-007`, the next project this year is `-001`. After `-999` the next code is `-1000`.
  - `code` and `status` are not accepted on create; `code` is never accepted on update.
  - Validation: empty `name` or `clientName`; `contractValue` negative, decimal or a number; `startDate` not a real date; `endDate` before `startDate` (400 with a field error on `endDate`), also when only one of them is changed in an update and the stored other one makes the range invalid.
  - Update changes each field; `notes`, `startDate` and `endDate` can be cleared with `null`, while `name`, `clientName` and `contractValue` cannot.
  - Status can move between ACTIVE, COMPLETED and CANCELLED in any direction.
  - List: ordered by `created_at` descending then id; `search` matches code, name or client name (wildcards escaped); `status` filter; paging.
  - Unknown id 404 `Proyek tidak ditemukan`; malformed id 400.
  - Audit rows for create and update, with `contract_value` as a string.

`project-access.e2e-spec.ts` (two projects A and B; manager M assigned to A only):
  - `GET /projects`: SUPER_ADMIN sees A and B; M sees only A; STAFF gets 403.
  - `GET /projects/:id`: M gets A; M asking for B gets 404 with the same body as a non-existent id; STAFF 403.
  - `GET /projects/options`: SUPER_ADMIN and STAFF get every ACTIVE project; M gets only A; a COMPLETED or CANCELLED project appears for nobody; each item has exactly `id`, `code`, `name`.
  - `POST` and `PATCH` are 403 for M, including on project A.
  - `ProjectAccessService.assertCanView` (service-level): resolves for SUPER_ADMIN on any project and for M on A; rejects with 404 for M on B, for STAFF on A, and for an unknown id.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Code generation, inside the create transaction:

```ts
await withLock(tx, LOCKS.projectCode);
const prefix = `PRJ-${currentYearInJakarta()}-`;
// Dibaca sebagai angka, bukan teks: sebagai teks "…-1000" terurut sebelum "…-999".
const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`
  SELECT MAX(CAST(SUBSTRING(code FROM ${prefix.length + 1}) AS INTEGER)) AS max
  FROM projects WHERE code LIKE ${prefix + '%'}`;
const code = `${prefix}${String((max ?? 0) + 1).padStart(3, '0')}`;
```

  Every read in `ProjectsService` composes `access.scope(user)` into its `where`; `get` uses `findFirst({ where: { id, ...scope } })` so "not found" and "not yours" are the same answer.
- [ ] **Step 4: Run** e2e, lint, type-check. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add projects with code generation and access scoping`.

---

### Task 5: Project members

**Files:** Create `projects/project-members.service.ts`, `test/project-members.e2e-spec.ts`. Modify `projects.controller.ts`, `projects.module.ts`, `users/users.service.ts`, `test/users.e2e-spec.ts`, `docs/decisions.md`.

- [ ] **Step 1: Failing e2e tests.**
  - `PUT /projects/:id/members` with two PROJECT_MANAGER ids returns the project with both in `members` (ordered by name), each row recording `assigned_by` as the admin.
  - It replaces the list: sending one remaining id plus one new id removes the dropped one, keeps the kept one's original `assigned_at`, and adds the new one. An empty array removes everyone.
  - **Refused as a whole, nothing changed**, each with a field error on `userIds`: a STAFF user; a SUPER_ADMIN; an inactive PROJECT_MANAGER; an unknown UUID; a malformed id; the same id twice; more than 50 ids; a body without `userIds`.
  - 403 for PROJECT_MANAGER and STAFF; 404 for an unknown project.
  - **Access follows membership immediately:** M can `GET /projects/:id`; after the admin removes M, M's next request with the same access token returns 404, and the project is gone from M's list and options.
  - One audit row `SET_MEMBERS` on entity `project` with `before` and `after` as sorted lists of user ids; a refused request writes none; a request that changes nothing writes none.
  - **Role change clears assignments** (`users.e2e-spec.ts`): when an admin changes a PROJECT_MANAGER's role to STAFF, their `project_members` rows are deleted and the audit `after` records `removed_project_ids`. Deactivating a project manager keeps their assignments, and reactivating restores their access.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** `ProjectMembersService.setMembers(actor, projectId, userIds, ip)` in one transaction: load the project, validate every id in a single `findMany`, diff against current members, `deleteMany` the removed, `createMany` the added. In `UsersService.update`, when the role changes away from `PROJECT_MANAGER`, delete that user's memberships in the same transaction.
- [ ] **Step 4: Record in `docs/decisions.md`:** a role change away from PROJECT_MANAGER removes project assignments; deactivation keeps them.
- [ ] **Step 5: Run** e2e, unit, lint, type-check. Expected: pass.
- [ ] **Step 6: Commit** `feat(api): add project member assignment`.

---

### Task 6: API documentation

**Files:** Create `apps/api/src/docs.ts`. Modify `apps/api/src/main.ts`, `apps/api/nest-cli.json`, `apps/api/package.json`, `README.md`, `docs/decisions.md`.

- [ ] **Step 1: Install** `npm install -w api @nestjs/swagger`.
- [ ] **Step 2: Failing e2e test** (`test/docs.e2e-spec.ts`): with docs enabled, `GET /api/docs-json` returns an OpenAPI document whose `paths` include `/api/v1/auth/login`, `/api/v1/users`, `/api/v1/accounts`, `/api/v1/categories`, `/api/v1/projects/{id}/members`, and which declares bearer authentication; the route needs no token.
- [ ] **Step 3: Implement** `setupDocs(app)` building the document with `DocumentBuilder().addBearerAuth()`, served at `/api/docs`. `main.ts` calls it only when `NODE_ENV !== 'production'`. Add the `@nestjs/swagger` plugin to `nest-cli.json` so request DTO properties are documented from their types.
- [ ] **Step 4: Run** e2e, lint, type-check; open `http://localhost:3000/api/docs` on the developer's running dev server and confirm the routes are listed.
- [ ] **Step 5: Record in `docs/decisions.md`** that web types stay hand-written (see "Decision needed" below), then **commit** `docs(api): serve OpenAPI documentation outside production`.

---

## Fase 2a acceptance

- [ ] Master data can be managed through the API and is available to the dropdown routes of the next phase (base document, Fase 2 exit criterion).
- [ ] A PROJECT_MANAGER cannot read any project they are not assigned to, by any route.
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` pass; API type-check passes.

## Decision needed: generated web types

The spec (section 2.4) says the web app's API types are generated from OpenAPI. Doing that properly needs every response to be a documented class, which means replacing the current mapper interfaces with response DTO classes and annotating every controller method, across Fase 1a and this phase. For one developer and a dozen response shapes that is more ceremony than protection.

This plan therefore serves Swagger documentation for humans (Task 6) and keeps the web types hand-written in `apps/web/src/api/types.ts`. If generated types are wanted after all, it is a self-contained task that can be added at any later point.
