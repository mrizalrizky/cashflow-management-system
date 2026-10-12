# P1 Personal Edition and PIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the company cash-flow app on branch `personal-edition` into a one-person app: remove projects, approvals, users and roles, replace email/password login with a PIN (global lockout, 30-day sessions, change and reset), and add a "Catat pengeluaran" button to the dashboard.

**Architecture:** The API keeps its modules for accounts, categories, transactions, attachments, reports, audit and health. The `projects` and `users` modules are deleted; the transaction policy shrinks to "editable while recorded". The `users` table keeps exactly one hidden owner row that holds the PIN hash and the lockout counter; sessions keep using the existing refresh-token rotation. The web app loses role-based routing and gains three screens: create PIN, enter PIN, settings (change PIN, audit log link).

**Tech Stack:** NestJS 12 (ESM, `.js` imports), Prisma 7.10 with `@prisma/adapter-pg`, PostgreSQL, argon2, Vitest, oxlint; Vue 3.5 `<script setup>` TS, Pinia, Vue Router 5, PrimeVue 4.5, Tailwind 4, Vitest + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-personal-edition-design.md` (section P1). Base spec: `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md`; where they conflict on this branch, the personal-edition spec wins.

## Global Constraints

- Work only on branch `personal-edition`. Never commit to `main`.
- Prisma model fields, columns, tables, enums and indexes `snake_case`; model names `PascalCase` with `@@map`; no `@map` on fields.
- JSON properties in the API `camelCase`; mapping happens in response mappers.
- Money is always integer rupiah: `bigint` in the data layer, digit strings in JSON, never JS `number`.
- Every action that changes important data writes an audit log in the same database transaction.
- No hard delete for transactions (`VOID` only).
- API is ESM: every relative import ends in `.js`.
- All schema changes through Prisma migrations; never edit a database by hand.
- Record non-trivial decisions in `docs/decisions.md`.
- UI text is Indonesian.
- PIN: 6 to 12 digits; stored as an argon2 hash; never written to logs or audit logs.
- Lockout: 5 consecutive wrong PINs pause PIN entry for 15 minutes for every visitor; the counter lives in the database.
- Refresh token lifetime: 30 days, renewed on each refresh.
- **Databases:** `apps/api/.env` points at the owner's real Neon database: never run anything that uses it. Every test command passes `TEST_DATABASE_URL` explicitly. On this machine `localhost:5432` is an SSH tunnel, so start a throwaway database first and use it for every API e2e and browser test run:

  ```bash
  MSYS_NO_PATHCONV=1 docker run -d --rm --name cashflow-e2e-tmp -e POSTGRES_USER=cashflow -e POSTGRES_PASSWORD=cashflow_dev -e POSTGRES_DB=cashflow_test -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine
  export TEST_DATABASE_URL='postgresql://cashflow:cashflow_dev@127.0.0.1:55432/cashflow_test'
  ```

  Remove it at the end with `docker rm -f cashflow-e2e-tmp`.
- Never run `nest build` into `apps/api/dist` on the host (the user's dev server uses it); verify the API with `npm run lint -w api` and the e2e suite.
- The deploy smoke test (`npm run deploy:smoke`) only touches what it creates (`cashflow-smoke*`). Do not edit `deploy/smoke.sh` while it is running.

## Review Focus

1. **Two browser tabs on the "Buat PIN" screen at once:** the second submit must get a clear 409 ("PIN sudah dibuat") and no second PIN may overwrite the first. Test in Task 4 (`setup-pin` twice in parallel).
2. **Lockout boundary and expiry:** the 5th wrong PIN must answer with the lockout message (not "PIN salah"), the 6th attempt during the pause must not even check the PIN (a correct PIN is refused too), and after the pause one wrong PIN must not lock again. Tests in Task 4.
3. **Leading zeros and non-digits in a PIN:** `"000123"` is a valid PIN and must round-trip exactly; `"12345a"`, `" 123456"`, `123456` (number) and 13 digits are refused with a field error. Tests in Task 4 (API) and Task 6 (web form).
4. **Editing a transaction that is already counted:** in the personal edition an `APPROVED` transaction is edited in place and stays `APPROVED`; a `VOID` one answers 409. The dashboard totals change immediately. Tests in Task 2.
5. **Session after a PIN reset from the server:** every open device must be signed out on its next request, and the next visit must show "Buat PIN", not the PIN entry screen. Test in Task 5 (API) and Task 6 (web routing when `pinSet` is false).

---

## File Structure

### API (`apps/api`)

Deleted:
- `src/projects/` (whole folder), `src/users/` (whole folder)
- `src/reports/project-summary.controller.ts`, `src/reports/project-summary.service.ts`
- `src/auth/roles.guard.ts`, `src/auth/dto/change-password.dto.ts`, `src/auth/dto/login.dto.ts`
- `src/common/email.ts`, `src/common/password-policy.ts`
- `src/transactions/transaction-policy.spec.ts` (replaced by a smaller one)
- Tests: `test/projects.e2e-spec.ts`, `test/project-members.e2e-spec.ts`, `test/project-access.e2e-spec.ts`, `test/project-summary.e2e-spec.ts`, `test/users.e2e-spec.ts`, `test/auth-roles.e2e-spec.ts`, `test/auth-password.e2e-spec.ts`, `test/transaction-approval.e2e-spec.ts`

Created:
- `src/auth/pin.service.ts` — owner lookup, PIN setup, verify with lockout, change, reset.
- `src/auth/pin-lockout.ts` — pure lockout rules (no I/O) and their unit test `src/auth/pin-lockout.spec.ts`.
- `src/auth/dto/pin.dto.ts` — `SetupPinDto`, `LoginDto`, `ChangePinDto`.
- `src/common/pin-policy.ts` — `IsPin()` validator.
- `src/cli/reset-pin.ts` — command-line entry for `npm run reset-pin`.
- `prisma/migrations/20261012090000_personal_edition/migration.sql`
- Tests: `test/auth-pin.e2e-spec.ts`, `test/auth-pin-lockout.e2e-spec.ts`, `test/reset-pin.e2e-spec.ts`, `src/transactions/transaction-policy.spec.ts` (new content)

Modified (main ones): `prisma/schema.prisma`, `src/app.module.ts`, `src/auth/*`, `src/audit/audit.service.ts`, `src/accounts/accounts.controller.ts`, `src/categories/*`, `src/attachments/attachments.service.ts`, `src/transactions/*`, `src/reports/*`, `src/database/seed.ts`, `prisma/seed.ts`, `scripts/drill-seed.ts`, `scripts/e2e-prepare.ts`, `package.json`, and the shared test helpers `test/fixtures.ts`, `test/transaction-fixtures.ts`, `test/report-fixtures.ts`, `test/routes.ts`, `test/test-db.ts`.

### Web (`apps/web`)

Deleted:
- `src/views/projects/`, `src/views/users/`, `src/views/ChangePasswordView.vue`
- `src/api/projects.ts`, `src/api/users.ts`
- `src/components/ProjectStatusTag.vue`

Created:
- `src/views/auth/PinLoginView.vue`, `src/views/auth/SetupPinView.vue`, `src/views/settings/SettingsView.vue`
- `src/components/PinField.vue`
- `src/lib/pin.ts` (shared PIN validation rule)
- Tests: `src/views/__tests__/pin-views.spec.ts`, `src/views/settings/__tests__/settings.spec.ts`, `src/lib/__tests__/pin.spec.ts`

Modified: `src/api/{types,auth,http,reports,transactions}.ts`, `src/stores/session.ts`, `src/router/{routes,guards,paths,navigation}.ts`, `src/layouts/AppLayout.vue`, `src/lib/{labels,transactions,audit}.ts`, `src/composables/{useTransactionOptions,useTransactionActions}.ts`, `src/views/transactions/*`, `src/views/dashboard/*`, `src/test/{session,transactions}.ts`, `e2e/*`.

Deleted on the web: `src/views/LoginView.vue` (replaced by `PinLoginView.vue`), `src/views/__tests__/auth-views.spec.ts` (replaced), `src/components/PasswordField.vue` (no remaining user).

### Deploy and docs

Modified: `deploy/env.example`, `docker-compose.prod.yml`, `deploy/smoke.sh`, `deploy/smoke-browser.mjs`, `docs/deployment.md`, `docs/backup-restore.md`, `docs/security-checklist.md`, `docs/decisions.md`, `README.md`.

---

## Task 1: Remove projects (API and web)

Projects are the most self-contained company feature. Removing them first leaves approvals and roles intact, so the suite stays green between tasks. The `projects` and `project_members` tables stay in the schema until Task 3's migration.

**Files:**
- Delete: `apps/api/src/projects/`, `apps/api/src/reports/project-summary.controller.ts`, `apps/api/src/reports/project-summary.service.ts`, `apps/api/test/projects.e2e-spec.ts`, `apps/api/test/project-members.e2e-spec.ts`, `apps/api/test/project-access.e2e-spec.ts`, `apps/api/test/project-summary.e2e-spec.ts`
- Delete: `apps/web/src/views/projects/`, `apps/web/src/api/projects.ts`, `apps/web/src/components/ProjectStatusTag.vue`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/reports/{reports.module,report.mapper,cashflow-report.service,dashboard.service}.ts`, `apps/api/src/transactions/{transaction-policy,transaction-access.service,transaction-references,transactions.service,transaction.mapper,transaction-filters,transaction-export.service}.ts`, `apps/api/src/transactions/dto/transaction.dto.ts`, `apps/api/src/common/advisory-lock.ts`
- Modify tests: `apps/api/test/{fixtures,transaction-fixtures,report-fixtures,routes,route-guards.e2e-spec,dashboard.e2e-spec,report-scale.e2e-spec,transaction-create.e2e-spec,transaction-edit.e2e-spec,transaction-read.e2e-spec,transaction-export.e2e-spec,transaction-approval.e2e-spec,transaction-flow.e2e-spec,schema.e2e-spec}.ts`
- Modify web: `src/api/{types,reports,transactions}.ts`, `src/router/{routes,paths,navigation}.ts`, `src/composables/useTransactionOptions.ts`, `src/lib/{labels,transactions,audit}.ts`, `src/views/transactions/{TransactionFormDialog,TransactionDetailView,TransactionFilters,TransactionTable}.vue`, `src/views/dashboard/{DashboardView,RecentTransactions}.vue`, `src/test/transactions.ts` and their specs.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `PolicyActor` without `assignedProjectIds`: `{ id: string; role: Role }` (removed entirely in Task 3).
  - `TransactionReferences` without `projectId`; `ChangedReferences = { account: boolean; category: boolean }`; `ALL_REFERENCES = { account: true, category: true }`.
  - `TransactionResponse` without `project`.
  - `CompanyDashboardResponse` without `expenseByScope`.
  - `TransactionFiltersDto` without `projectId` and `overhead`.
  - Web `useTransactionOptions()` returns `{ accounts, categoriesFor, loading, error, reload }` (no `projects`).
  - Web `PATHS` without `projects`; `PROJECT_DETAIL_ROUTE` and `projectPath` removed.

- [ ] **Step 1: Write the failing tests**

In `apps/api/test/route-guards.e2e-spec.ts`, replace the `'finds the routes of every module'` expectation list and add a test that no project route exists:

```ts
  it('finds the routes of every module', () => {
    const names = registeredRoutes(ctx).map(nameOf);

    expect(names.length).toBeGreaterThanOrEqual(25);
    expect(names).toEqual(expect.arrayContaining([...PUBLIC, ...ADMIN_ONLY]));
    expect(names).toEqual(
      expect.arrayContaining([
        'GET /api/v1/transactions/export',
        'POST /api/v1/transactions/{id}/attachments',
        'GET /api/v1/attachments/{id}/download',
      ]),
    );
  });

  it('has no project routes in the personal edition', () => {
    expect(registeredRoutes(ctx).map(nameOf).filter((name) => name.includes('/projects'))).toEqual([]);
  });
```

Remove `'POST /api/v1/projects'`, `'PATCH /api/v1/projects/{id}'` and `'PUT /api/v1/projects/{id}/members'` from `ADMIN_ONLY`.

In `apps/api/test/dashboard.e2e-spec.ts`, add:

```ts
  it('no longer splits spending into overhead and projects', async () => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'get', DASHBOARD).expect(200);
    expect(res.body).not.toHaveProperty('expenseByScope');
  });
```

In `apps/api/test/transaction-create.e2e-spec.ts`, add:

```ts
  it('refuses a projectId as an unknown field', async () => {
    const world = await setupWorld(ctx);
    const res = await call(ctx, world.admin, 'post', TRANSACTIONS)
      .send({ ...expenseBody(world), projectId: randomUUID() })
      .expect(400);
    expect(errorFields(res.body)).toContain('projectId');
  });
```

(`expenseBody` is the existing helper in `transaction-fixtures.ts` that builds a valid OUT body; import `randomUUID` from `node:crypto` if the file does not already. The global `ValidationPipe` uses `forbidNonWhitelisted`, so an unknown field is a 400 on that field.)

In `apps/web/src/views/transactions/__tests__/form.spec.ts`, add:

```ts
  it('has no project field', async () => {
    const { wrapper } = await mountForm()
    expect(wrapper.find('#tx-project').exists()).toBe(false)
  })
```

(use the file's existing `mountForm` helper).

- [ ] **Step 2: Run them to see them fail**

Run (with the throwaway database from Global Constraints):
`cd apps/api && npx vitest run --config ./vitest.config.e2e.ts test/route-guards.e2e-spec.ts test/dashboard.e2e-spec.ts test/transaction-create.e2e-spec.ts`
Expected: FAIL — project routes still registered, `expenseByScope` present, `projectId` accepted.

Run: `cd apps/web && npx vitest run src/views/transactions/__tests__/form.spec.ts`
Expected: FAIL — `#tx-project` exists.

- [ ] **Step 3: Remove projects from the API**

1. Delete `src/projects/`, `src/reports/project-summary.controller.ts`, `src/reports/project-summary.service.ts`.
2. `src/app.module.ts`: remove the `ProjectsModule` import and entry.
3. `src/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { CashflowReportService } from './cashflow-report.service.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [DashboardController],
  providers: [CashflowReportService, DashboardService],
})
export class ReportsModule {}
```

4. `src/reports/report.mapper.ts`: delete `ProjectSummaryResponse`, `percentOf`, `toProjectSummary`; remove `expenseByScope` from `CompanyDashboardResponse`, from the `toCompanyDashboard` input type and from its returned object.
5. `src/reports/cashflow-report.service.ts`: remove `projectId` from the filter type and the `...(filter.projectId ? ...)` line; delete the `expenseByScope` method.
6. `src/reports/dashboard.service.ts`: remove `expenseByScope` from the `Promise.all` list and from the `toCompanyDashboard` call.
7. `src/transactions/transaction-policy.ts`: remove `assignedProjectIds` from `PolicyActor`, `projectId` from `PolicySubject`, delete `managerCanReview` and `canRecordFor`, and make the `PROJECT_MANAGER` case `return isOwner ? ownerPermissions(tx) : NOTHING;` (roles go away completely in Task 3).
8. `src/transactions/transaction-access.service.ts`: `actorFor` returns `{ id: user.id, role: user.role }` without querying members; in `scope`, `PROJECT_MANAGER` becomes `return { created_by_id: actor.id };` (same as STAFF).
9. `src/transactions/transaction-references.ts`: remove `projectId` from `TransactionReferences`, `project` from `ChangedReferences` and `ALL_REFERENCES`, delete `assertProjectAllowed` and the `ForbiddenException`, `projectNotFound` and `canRecordFor` imports.
10. `src/transactions/transactions.service.ts`: remove every `projectId` / `project_id` line in `create` and `update` and the `project:` entry passed to `assertReferencesValid`.
11. `src/transactions/transaction.mapper.ts`: remove `project` from `TRANSACTION_INCLUDE`, `TransactionResponse`, `toAuditSnapshot`, `toPolicySubject` and `toTransactionResponse`.
12. `src/transactions/transaction-filters.ts`: delete the `projectId && overhead` check and the two `project_id` lines.
13. `src/transactions/dto/transaction.dto.ts`: delete `projectId` from `CreateTransactionDto` and `UpdateTransactionDto`; delete `projectId` and `overhead` from `TransactionFiltersDto`.
14. `src/transactions/transaction-export.service.ts`: remove `'Kode Proyek'` and `'Proyek'` from `HEADER`, `project` from `EXPORT_SELECT`, and the two `row.project?...` cells from `toCells`.
15. `src/common/advisory-lock.ts`: remove the `projectCode` entry (only the projects module used it).

- [ ] **Step 4: Update the API test helpers and tests**

1. `test/fixtures.ts`: delete `createProject` and `assign`; remove `projectId` from `createTransaction`'s input and data; remove `Project` and `ProjectStatus` from the type import.
2. `test/transaction-fixtures.ts`: `World` loses `projectA` and `projectB`; `setupWorld` no longer creates projects or assigns the manager; any body builder that sets `projectId` drops it.
3. `test/report-fixtures.ts`: remove the two projects, every `projectId` in the recorded transactions, `expenseByScope` from the expected dashboard, and the `projectA` / `projectB` expected summaries.
4. `test/routes.ts`: delete `PROJECTS` and `PROJECT_OPTIONS`.
5. Delete the four project test files listed under **Files**.
6. In `dashboard.e2e-spec.ts`, `report-scale.e2e-spec.ts`, `transaction-create.e2e-spec.ts`, `transaction-edit.e2e-spec.ts`, `transaction-read.e2e-spec.ts`, `transaction-export.e2e-spec.ts`, `transaction-approval.e2e-spec.ts` and `transaction-flow.e2e-spec.ts`: delete every test whose subject is a project (project filter, overhead filter, project scope of a manager, moving a transaction between projects, project columns in the CSV, project review rules) and remove `projectId` / `project` from the remaining bodies and expectations. `schema.e2e-spec.ts` keeps checking the project tables until Task 3.

- [ ] **Step 5: Remove projects from the web**

1. Delete `src/views/projects/`, `src/api/projects.ts`, `src/components/ProjectStatusTag.vue`.
2. `src/api/types.ts`: delete `ProjectStatus`, `ProjectMember`, `Project`, `ProjectOption`, `ProjectSummary`; remove `project` from `Transaction` and `expenseByScope` from `CompanyDashboard`.
3. `src/api/reports.ts`: delete `getProjectSummary`.
4. `src/api/transactions.ts`: remove `projectId` from the input and filter types and its doc comment.
5. `src/router/paths.ts`: delete `projects`, `PROJECT_DETAIL_ROUTE`, `projectPath`, and make `PROJECT_MANAGER: PATHS.transactions` in `LANDING` (roles go away in Task 5).
6. `src/router/routes.ts`: delete the two project routes and `PROJECT_ROLES`.
7. `src/router/navigation.ts`: delete the Proyek menu item.
8. `src/composables/useTransactionOptions.ts`: stop loading `listProjectOptions`; delete `projects` and `projectLabel`.
9. `src/lib/transactions.ts`: delete `OVERHEAD`.
10. `src/lib/labels.ts`: delete the project status label set and the `project: 'Proyek'` audit field label.
11. `src/lib/audit.ts`: remove `'contract_value'` and `'contract_value_with_ppn'` from `MONEY_FIELDS`.
12. `src/views/transactions/TransactionFormDialog.vue`: remove the `presetProject` prop, `projectId` from `Form`, `blank`, `fromEntity`, `toInput` and `validate`, the `projectOptions` computed, the `fieldForStatus: { 404: 'projectId' }` option and the "Proyek" `SelectField`.
13. `src/views/transactions/TransactionDetailView.vue`: delete the project `<dt>/<dd>` pair (`data-testid="tx-project"`), `canOpenProject` and the `projectLabel` / `projectPath` imports.
14. `src/views/transactions/TransactionFilters.vue`: delete the project filter (`project` computed, `projectOptions`, its `FilterSelect`) and `projectId` / `overhead` from the filter model.
15. `src/views/transactions/TransactionTable.vue` and `src/views/dashboard/RecentTransactions.vue`: delete the project line under each description.
16. `src/views/dashboard/DashboardView.vue`: delete the `scopes` computed and the "Overhead dan proyek" section; the categories section takes the full row (`<section>` without the two-column grid).
17. `src/test/transactions.ts`: delete `RUMAH`, `KAFE` and `project` from `makeTransaction`.
18. Update the web specs that referenced projects (`transactions/__tests__/*.spec.ts`, `dashboard/__tests__/dashboard.spec.ts`, `api/__tests__/*.spec.ts`, `router/__tests__/guards.spec.ts`, `layouts/__tests__/AppLayout.spec.ts`, `lib/__tests__/audit.spec.ts`): delete project cases and project fields from fixtures.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm run lint` (root) — Expected: 0 errors.
Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts` — Expected: all pass.
Run: `npm test` (root) — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A apps/api apps/web
git commit -m "refactor: remove projects from the personal edition"
```

---

## Task 2: Remove approvals (API and web)

Transactions are counted the moment they are saved. `PENDING` and `REJECTED` stop being produced (the enum values are dropped in Task 3's migration). Editing and adding proof work on recorded (`APPROVED`) transactions; `VOID` stays the only way to cancel.

**Files:**
- Delete: `apps/api/test/transaction-approval.e2e-spec.ts`
- Modify: `apps/api/src/transactions/{transaction-policy,transaction-workflow.service,transactions.service,transactions.controller,transfers.service,transaction-guards,transaction-export.service,transaction.mapper}.ts`, `apps/api/src/transactions/dto/transaction.dto.ts`, `apps/api/src/attachments/attachments.service.ts`, `apps/api/src/reports/{dashboard.service,report.mapper}.ts`, `apps/api/src/audit/audit.service.ts`
- Replace: `apps/api/src/transactions/transaction-policy.spec.ts`
- Modify tests: `apps/api/test/{transaction-create,transaction-edit,transaction-read,transaction-flow,transaction-export,attachments,dashboard,transfers,audit,route-guards.e2e-spec,routes}.ts`, `apps/api/test/fixtures.ts`
- Modify web: `src/api/{types,transactions}.ts`, `src/composables/useTransactionActions.ts`, `src/lib/{labels,transactions}.ts`, `src/views/transactions/{TransactionFormDialog,TransactionDetailView,TransactionFilters,TransactionsView}.vue`, `src/views/dashboard/DashboardView.vue`, `src/components/TransactionStatusTag.vue`, `src/test/transactions.ts` and specs.

**Interfaces:**
- Consumes: Task 1's `PolicyActor`, `TransactionResponse`.
- Produces:
  - `TransactionPermissions = { canEdit: boolean; canAttach: boolean; canVoid: boolean }`.
  - `permissionsFor(actor: PolicyActor, tx: PolicySubject): TransactionPermissions` where `PolicySubject = { status: TxStatus; createdById: string; isTransfer: boolean }`.
  - `EDITABLE_STATUSES: readonly TxStatus[] = ['APPROVED']`.
  - `TransactionWorkflowService` exposes only `void(user, id, reason, ip)` and `transition(tx, where, from, data, expectedRows?)`.
  - `TransactionResponse` without `reviewedBy`, `reviewedAt`, `rejectReason`.
  - `CompanyDashboardResponse` without `pendingCount`.
  - Web `useTransactionActions()` returns `{ busy, reasonOpen, reasonRequest, void }`.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/transactions/transaction-policy.spec.ts` with:

```ts
import { permissionsFor, PolicyActor, PolicySubject } from './transaction-policy.js';

const ADMIN: PolicyActor = { id: 'u-1', role: 'SUPER_ADMIN' };

function subject(overrides: Partial<PolicySubject> = {}): PolicySubject {
  return { status: 'APPROVED', createdById: 'u-1', isTransfer: false, ...overrides };
}

describe('permissionsFor', () => {
  it('lets a recorded transaction be edited, given proof and voided', () => {
    expect(permissionsFor(ADMIN, subject())).toEqual({ canEdit: true, canAttach: true, canVoid: true });
  });

  it('allows nothing on a voided transaction', () => {
    expect(permissionsFor(ADMIN, subject({ status: 'VOID' }))).toEqual({
      canEdit: false,
      canAttach: false,
      canVoid: false,
    });
  });

  it('only lets a transfer side be voided, together with its pair', () => {
    expect(permissionsFor(ADMIN, subject({ isTransfer: true }))).toEqual({
      canEdit: false,
      canAttach: false,
      canVoid: true,
    });
  });
});
```

In `apps/api/test/transaction-create.e2e-spec.ts`, add:

```ts
  it('counts a new transaction at once', async () => {
    const world = await setupWorld(ctx);
    const res = await call(ctx, world.admin, 'post', TRANSACTIONS).send(expenseBody(world)).expect(201);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body).not.toHaveProperty('reviewedBy');
    expect(res.body.permissions).toEqual({ canEdit: true, canAttach: true, canVoid: true });
  });
```

In `apps/api/test/transaction-edit.e2e-spec.ts`, add:

```ts
  it('edits a recorded transaction in place and keeps it counted', async () => {
    const world = await setupWorld(ctx);
    const created = (await call(ctx, world.admin, 'post', TRANSACTIONS).send(expenseBody(world)).expect(201)).body;

    const res = await call(ctx, world.admin, 'patch', `${TRANSACTIONS}/${created.id}`)
      .send({ amount: '75000' })
      .expect(200);

    expect(res.body).toMatchObject({ amount: '75000', status: 'APPROVED' });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'UPDATE', entity_id: created.id } });
    expect(row.before).toMatchObject({ amount: expect.any(String) });
  });

  it('refuses to edit a voided transaction', async () => {
    const world = await setupWorld(ctx);
    const created = (await call(ctx, world.admin, 'post', TRANSACTIONS).send(expenseBody(world)).expect(201)).body;
    await call(ctx, world.admin, 'post', `${TRANSACTIONS}/${created.id}/void`).send({ reason: 'salah' }).expect(200);

    await call(ctx, world.admin, 'patch', `${TRANSACTIONS}/${created.id}`).send({ amount: '1' }).expect(409);
  });
```

In `apps/api/test/route-guards.e2e-spec.ts`, add:

```ts
  it('has no approval routes in the personal edition', () => {
    const names = registeredRoutes(ctx).map(nameOf);
    for (const removed of ['approve', 'reject', 'cancel']) {
      expect(names).not.toContain(`POST /api/v1/transactions/{id}/${removed}`);
    }
  });
```

In `apps/web/src/views/transactions/__tests__/form.spec.ts`, add:

```ts
  it('saves an expense without proof straight away, without asking', async () => {
    vi.mocked(transactionsApi.createTransaction).mockResolvedValue(makeTransaction({ status: 'APPROVED' }))
    const { wrapper } = await mountForm()
    await fillValidExpense(wrapper)
    await submitForm(wrapper)

    expect(document.body.textContent).not.toContain('Simpan tanpa bukti')
    expect(transactionsApi.createTransaction).toHaveBeenCalledOnce()
    expect(wrapper.find('#tx-approve-now').exists()).toBe(false)
  })
```

(`fillValidExpense` is the helper the file already uses to fill amount, date, account, category and description; if it is named differently, use that name.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx vitest run src/transactions/transaction-policy.spec.ts` — Expected: FAIL (old permissions shape).
Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts test/transaction-create.e2e-spec.ts test/transaction-edit.e2e-spec.ts test/route-guards.e2e-spec.ts` — Expected: FAIL (status `PENDING`, edit of APPROVED refused, approval routes present).
Run: `cd apps/web && npx vitest run src/views/transactions/__tests__/form.spec.ts` — Expected: FAIL (confirmation dialog shown).

- [ ] **Step 3: Implement in the API**

1. `src/transactions/transaction-policy.ts` — replace the file:

```ts
import type { Role, TxStatus } from '../generated/prisma/client.js';

/**
 * Aturan "apa yang boleh dilakukan pada sebuah transaksi", tanpa I/O. Di edisi pribadi
 * transaksi langsung dihitung saat disimpan; yang membedakan hanya tercatat atau dibatalkan.
 */

export interface PolicyActor {
  id: string;
  role: Role;
}

export interface PolicySubject {
  status: TxStatus;
  createdById: string;
  isTransfer: boolean;
}

export interface TransactionPermissions {
  /** Mengubah isi. */
  canEdit: boolean;
  /** Menambah atau menghapus bukti. */
  canAttach: boolean;
  /** Membatalkan; saldo kembali karena transaksi VOID tidak dihitung. */
  canVoid: boolean;
}

/** Status tempat isi dan bukti transaksi masih boleh diubah. */
export const EDITABLE_STATUSES: readonly TxStatus[] = ['APPROVED'];

export function permissionsFor(_actor: PolicyActor, tx: PolicySubject): TransactionPermissions {
  const recorded = tx.status === 'APPROVED';
  // Sisi transfer tidak diubah sendiri; hanya dibatalkan bersama pasangannya.
  if (tx.isTransfer) return { canEdit: false, canAttach: false, canVoid: recorded };
  return { canEdit: recorded, canAttach: recorded, canVoid: recorded };
}
```

(`PolicyActor` and the `_actor` parameter are removed in Task 3, when roles go.)

2. `src/transactions/transaction-workflow.service.ts`: delete `cancel`, `approve`, `reject`, `ApprovalResponse`, `balanceOf`, the `AccountBalanceService` and `fromMoney` imports and constructor parameter, the `expectedUpdatedAt` and `precondition` members of `Transition`, and the `assertSeenVersion` call in `run`. `void` stays as it is.
3. `src/transactions/transaction-guards.ts`: delete `changedSinceSeen` and `assertSeenVersion`.
4. `src/transactions/transactions.controller.ts`: delete the `cancel`, `approve` and `reject` handlers and the `RejectDto`, `ReviewDto`, `ApprovalResponse` imports.
5. `src/transactions/dto/transaction.dto.ts`: delete `ReviewDto` and `RejectDto`; the `ReasonDto` comment becomes `/** Alasan pembatalan (void). */`.
6. `src/transactions/transactions.service.ts`:
   - `create`: add `status: 'APPROVED',` to the `data` object; change its doc comment to `/** Transaksi baru langsung tercatat dan dihitung. */`.
   - `update`: change the doc comment to `/** Mengubah transaksi yang tercatat. Statusnya tetap APPROVED. */`; in the `transition` call replace the last four fields (`status`, `reviewed_by_id`, `reviewed_at`, `reject_reason`) with nothing, and call it as `this.workflow.transition(tx, { id }, 'APPROVED', { ...fields })`; the audit action is always `'UPDATE'`.
7. `src/transactions/transfers.service.ts`: remove `reviewed_by_id` and `reviewed_at` from `shared`.
8. `src/transactions/transaction.mapper.ts`: remove `reviewed_by` from `TRANSACTION_INCLUDE`; remove `reviewedBy`, `reviewedAt`, `rejectReason` from `TransactionResponse` and `toTransactionResponse`; remove `reviewed_by_id` and `reject_reason` from `toAuditSnapshot`; `toPolicySubject` returns `{ status, createdById: tx.created_by_id, isTransfer }`. `created_by` in the include becomes `{ select: { id: true, name: true } }`.
9. `src/transactions/transaction-export.service.ts`: `STATUS_LABELS` becomes `{ APPROVED: 'Tercatat', VOID: 'Dibatalkan', PENDING: 'Menunggu', REJECTED: 'Ditolak' }` for now (the last two leave with the enum in Task 3); remove `'Ditinjau oleh'` and `'Alasan penolakan'` from `HEADER`, `reject_reason` and `reviewed_by` from `EXPORT_SELECT`, and their cells from `toCells`.
10. `src/attachments/attachments.service.ts`: keep the structure; `assertCanChangeProof` already uses `canAttach` with `EDITABLE_STATUSES`, which now means "recorded". Change the comment in `upload` from "mis. disetujui" to "mis. dibatalkan", and in `recordChange` delete the sentence about the reviewer.
11. `src/reports/dashboard.service.ts` and `src/reports/report.mapper.ts`: remove `pendingCount` everywhere.
12. `src/audit/audit.service.ts`: remove `'RESUBMIT'`, `'CANCEL'`, `'APPROVE'`, `'REJECT'` from `AuditAction`.

- [ ] **Step 4: Update the API tests**

1. Delete `test/transaction-approval.e2e-spec.ts`.
2. `test/fixtures.ts`: `createTransaction` keeps defaulting `status` to `'APPROVED'`.
3. In `transaction-create`, `transaction-edit`, `transaction-read`, `transaction-flow`, `transaction-export`, `attachments`, `dashboard`, `transfers` and `audit` e2e specs: delete tests about approving, rejecting, cancelling, resubmitting, `expectedUpdatedAt`, proof required before approval, pending counts and reviewer columns; change remaining expectations of `status: 'PENDING'` after create to `'APPROVED'`; tests that edited a `PENDING` transaction now edit the `APPROVED` one created by the API; tests that expected proof upload to be refused on an `APPROVED` transaction now expect it on a `VOID` one.
4. `test/route-guards.e2e-spec.ts`: keep the new test from Step 1.

- [ ] **Step 5: Implement on the web**

1. `src/api/types.ts`: `TransactionPermissions` becomes `{ canEdit: boolean; canAttach: boolean; canVoid: boolean }`; remove `reviewedBy`, `reviewedAt`, `rejectReason` from `Transaction` and `pendingCount` from `CompanyDashboard`.
2. `src/api/transactions.ts`: delete `approveTransaction`, `rejectTransaction`, `cancelTransaction`, `ApprovedTransaction` and the "Mengubah transaksi REJECTED" comment.
3. `src/lib/transactions.ts`: delete `negativeBalanceWarning` and its import.
4. `src/lib/labels.ts`: transaction status labels become `{ PENDING: 'Menunggu', APPROVED: 'Tercatat', REJECTED: 'Ditolak', VOID: 'Dibatalkan' }` for now, and the status filter options list only `APPROVED` and `VOID` (the two remaining values are removed from the type in Task 5).
5. `src/composables/useTransactionActions.ts`: keep only `void`; delete `approve`, `reject`, `cancel`, `CHANGED`, `PROCESSED`, `showLatest` and the 409 branch in `run` (a 409 now just shows the API message through the caller's error handling). The returned object is `{ busy, reasonOpen, reasonRequest, void: voidTx }`. The void note for a normal transaction becomes `'Transaksi dibatalkan dan tidak lagi dihitung di saldo.'`.
6. `src/views/transactions/TransactionFormDialog.vue`:
   - delete `approveNow` from `Form`, `blank` and `fromEntity`; delete the `Checkbox` import and the "Langsung setujui" label;
   - delete `isResubmit`, the `Message` about the rejection and the `alwaysUpdate` option; `title` is `editing.value ? 'Ubah transaksi' : 'Catat transaksi'`; remove the `:submit-label` binding;
   - delete the proof rule in `validate` (only the field rules remain);
   - `Aftermath` becomes `{ failedUploads: FailedUpload[] }`; `createWithProof` returns `created` after uploading; `afterCreate` warns about failed uploads (and navigates to the detail page) or shows `'Transaksi dicatat'`;
   - `save()` is removed; the dialog's `@submit` calls `onSubmit` directly, and the `useConfirm` import goes;
   - `onSaved` shows `'Transaksi disimpan'` after an edit.
7. `src/views/transactions/TransactionDetailView.vue`: delete the approve, reject and cancel buttons, the "Perbaiki dan ajukan lagi" label (the edit button is always "Ubah"), the missing-proof warning for pending expenses, the reviewer and rejection rows, and every `isAdmin` / `role` check (everything shown is governed by `transaction.permissions`).
8. `src/views/transactions/TransactionsView.vue`: the title is always `'Transaksi'`; delete `isStaff`.
9. `src/views/dashboard/DashboardView.vue`: delete the pending link and the "Tidak ada transaksi yang menunggu" paragraph, and the `RouterLink` / `PATHS` imports if unused.
10. `src/test/transactions.ts`: `makeTransaction` defaults to `status: 'APPROVED'` and `permissions: { canEdit: true, canAttach: true, canVoid: true }`, without reviewer fields.
11. Update the web specs: delete approval, rejection, cancellation, resubmission, "approve now", pending-link and negative-balance cases; adjust permission fixtures to the new shape.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm run lint` — Expected: 0 errors.
Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts` — Expected: all pass.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A apps/api apps/web
git commit -m "refactor: record transactions without approval in the personal edition"
```

---

## Task 3: Owner and schema migration (API)

Replace users and roles with one owner row, and drop every company column and table in one migration.

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261012090000_personal_edition/migration.sql`
- Delete: `apps/api/src/users/`, `apps/api/src/auth/roles.guard.ts`, `apps/api/test/users.e2e-spec.ts`, `apps/api/test/auth-roles.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/auth/{auth.module,auth.types,decorators,jwt-auth.guard}.ts`, `apps/api/src/accounts/accounts.controller.ts`, `apps/api/src/categories/{categories.controller,categories.service}.ts`, `apps/api/src/audit/audit-log.controller.ts`, `apps/api/src/reports/dashboard.controller.ts`, `apps/api/src/transactions/*`, `apps/api/src/attachments/attachments.service.ts`
- Modify tests: `apps/api/test/{schema.e2e-spec,test-db,fixtures,route-guards.e2e-spec}.ts` and every spec that used `loginAs`, `asAdmin`, `expectAccess`, `adminOnly`.

Login itself still uses email and password at the end of this task only inside the test helper (see Step 4); Task 4 replaces it with the PIN.

**Interfaces:**
- Consumes: Task 2's policy and workflow.
- Produces:
  - Prisma `User` model: `{ id, name, pin_hash: string | null, pin_failed_attempts: number, pin_locked_until: Date | null, created_at, updated_at }`.
  - `TxStatus` enum: `APPROVED | VOID`, default `APPROVED`.
  - `AuthUser = { id: string; name: string }`; `toAuthUser(user: User): AuthUser`.
  - `permissionsFor(tx: PolicySubject): TransactionPermissions` (no actor).
  - `TransactionAccessService` methods: `load(db: Db, id: string)`, `loadForUpdate(tx, id)`; `actorFor` and `scope` removed.
  - `toTransactionResponse(tx: TransactionWithRelations): TransactionResponse`.
  - Test helper `asOwner(ctx): Promise<TestSession & { user: User }>` (replaces `asAdmin`, `loginAs`); `expectAccess` and `adminOnly` removed.

- [ ] **Step 1: Write the failing tests**

Replace the body of `apps/api/test/schema.e2e-spec.ts` assertions about tables and columns with:

```ts
  it('keeps only the personal-edition tables', async () => {
    const rows = await ctx.prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(rows.map((row) => row.table_name)).toEqual([
      'accounts',
      'attachments',
      'audit_logs',
      'categories',
      'refresh_tokens',
      'transactions',
      'users',
    ]);
  });

  it('stores the owner with a PIN and a lockout counter, and no email, password or role', async () => {
    const columns = await ctx.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' ORDER BY column_name`;
    expect(columns.map((column) => column.column_name)).toEqual([
      'created_at',
      'id',
      'name',
      'pin_failed_attempts',
      'pin_hash',
      'pin_locked_until',
      'updated_at',
    ]);
  });

  it('knows only recorded and voided transactions, without reviewer or project columns', async () => {
    const values = await ctx.prisma.$queryRaw<{ value: string }[]>`
      SELECT unnest(enum_range(NULL::tx_status))::text AS value`;
    expect(values.map((row) => row.value)).toEqual(['APPROVED', 'VOID']);

    const columns = await ctx.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions'`;
    const names = columns.map((column) => column.column_name);
    for (const removed of ['project_id', 'reviewed_by_id', 'reviewed_at', 'reject_reason']) {
      expect(names).not.toContain(removed);
    }
  });
```

Keep the file's existing money CHECK-constraint test if it has one; delete tests about project tables and the role enum.

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts test/schema.e2e-spec.ts`
Expected: FAIL — `project_members` and `projects` still listed, `users` still has `email`.

- [ ] **Step 3: Change the schema and create the migration**

In `prisma/schema.prisma`:
- delete `enum Role`, `enum ProjectStatus`, `model Project`, `model ProjectMember`;
- `enum TxStatus { APPROVED VOID @@map("tx_status") }`;
- `model User` becomes:

```prisma
/// Satu-satunya pengguna: pemilik edisi pribadi. Baris ini dibuat seed dan tidak pernah ditampilkan.
model User {
  id                  String    @id @default(uuid())
  name                String
  /// Hash argon2 PIN; null berarti PIN belum dibuat.
  pin_hash            String?
  /// PIN salah berturut-turut sejak terakhir berhasil atau sejak jeda terakhir.
  pin_failed_attempts Int       @default(0)
  /// Selama waktu ini belum lewat, PIN tidak bisa dicoba sama sekali.
  pin_locked_until    DateTime?
  created_at          DateTime  @default(now())
  updated_at          DateTime  @updatedAt

  transactions_created Transaction[] @relation("transaction_created_by")
  transactions_voided  Transaction[] @relation("transaction_voided_by")
  attachments          Attachment[]
  audit_logs           AuditLog[]
  refresh_tokens       RefreshToken[]

  @@map("users")
}
```

- `model Transaction`: `status TxStatus @default(APPROVED)`; delete `project_id`, `reviewed_by_id`, `reviewed_at`, `reject_reason`, the `project` and `reviewed_by` relations, and `@@index([project_id, status], ...)`.

Generate the migration against the throwaway database (never the `.env` one):

```bash
cd apps/api
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate dev --create-only --name personal_edition
```

Rename the created folder to `prisma/migrations/20261012090000_personal_edition`. Open `migration.sql` and make sure it:
- drops `project_members`, then `projects`, then the `project_status` and `role` types;
- drops the four `users` columns and the four `transactions` columns and the `idx_transactions_project_id_status` index;
- adds `pin_hash`, `pin_failed_attempts` (`INTEGER NOT NULL DEFAULT 0`), `pin_locked_until` to `users`;
- recreates `tx_status` with `APPROVED` and `VOID` (Prisma writes this as `CREATE TYPE "tx_status_new"`, `ALTER TABLE ... USING ("status"::text::"tx_status_new")`, drop and rename) and sets the default to `'APPROVED'`.

Add this comment at the top of `migration.sql`:

```sql
-- Edisi pribadi: tanpa proyek, persetujuan, email, password, dan peran.
-- Dipasang pada database baru. Pada database berisi transaksi PENDING atau REJECTED,
-- perubahan tipe tx_status gagal dengan sengaja: data perusahaan tidak dipindahkan.
```

Then `npx prisma generate`.

- [ ] **Step 4: Remove users and roles from the code**

1. Delete `src/users/` and `src/auth/roles.guard.ts`; remove `UsersModule` from `app.module.ts`; in `auth.module.ts` remove the `RolesGuard` provider (and its import and "Urutan penting" comment) and `PasswordService` from `exports` stays for now (Task 4 uses it).
2. `src/auth/auth.types.ts`:

```ts
import type { User } from '../generated/prisma/client.js';

/** Pemilik yang sedang masuk, seperti yang dikirim ke klien dan ditempel ke request. */
export interface AuthUser {
  id: string;
  name: string;
}

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, name: user.name };
}

/** Hasil masuk, refresh, atau ganti PIN. `refreshToken` hanya untuk cookie. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
```

3. `src/auth/decorators.ts`: delete `ROLES`, `Roles`, `ALLOW_PENDING_PASSWORD_CHANGE` and `AllowPendingPasswordChange`.
4. `src/auth/jwt-auth.guard.ts`: after loading the user, only `if (!user) throw invalidSession();`; delete the `must_change_password` block, the `ForbiddenException` import and the `ALLOW_PENDING_PASSWORD_CHANGE` import. The comment becomes `// Dibaca ulang tiap request supaya sesi berakhir seketika setelah PIN direset.`
5. Remove every `@Roles(...)` decorator and its import in `accounts.controller.ts`, `categories.controller.ts`, `audit-log.controller.ts`, `dashboard.controller.ts`, `transactions.controller.ts`; the dashboard comment becomes `/** Saldo dan arus kas pada sebuah periode. */`.
6. `src/categories/categories.service.ts`: `list(query)` uses `query.isActive` directly (delete the role line and the `user` parameter; update the controller call).
7. `src/transactions/transaction-policy.ts`: delete `PolicyActor` and the `Role` import; signature becomes `permissionsFor(tx: PolicySubject)`.
8. `src/transactions/transaction-access.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '../database/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { TRANSACTION_INCLUDE, TransactionWithRelations } from './transaction.mapper.js';

export function transactionNotFound(): NotFoundException {
  return new NotFoundException('Transaksi tidak ditemukan');
}

/** Memuat transaksi beserta relasinya, dengan atau tanpa kunci baris. */
@Injectable()
export class TransactionAccessService {
  async load(db: Db, id: string): Promise<TransactionWithRelations> {
    const transaction = await db.transaction.findUnique({ where: { id }, include: TRANSACTION_INCLUDE });
    if (!transaction) throw transactionNotFound();
    return transaction;
  }

  /**
   * Seperti `load`, tetapi mengunci baris transaksi (dan pasangan transfernya, selalu dalam
   * urutan yang sama) sampai transaksi database selesai, supaya perubahan isi, bukti, dan
   * pembatalan tidak saling mendahului.
   */
  async loadForUpdate(tx: Prisma.TransactionClient, id: string): Promise<TransactionWithRelations> {
    await tx.$queryRaw`
      SELECT id FROM transactions
      WHERE id = ${id}
         OR transfer_group_id = (SELECT transfer_group_id FROM transactions WHERE id = ${id})
      ORDER BY id
      FOR UPDATE`;
    return this.load(tx, id);
  }
}
```

9. Every caller of `actorFor`, `scope`, `loadForUser` and `loadForUpdate(tx, actor, id)` (transactions service, workflow, transfers, export, attachments, dashboard): drop the actor; use `load` / `loadForUpdate(tx, id)`; lists and exports use only `toTransactionWhere(query)` as `where`; `findInScope` in attachments becomes `this.prisma.attachment.findUnique({ where: { id } })` with the same not-found error; delete the uploader check in `remove`.
10. `src/transactions/transaction-guards.ts`: `assertPermitted(transaction, action)` calls `permissionsFor(toPolicySubject(transaction))`; `notAllowed` stays (used for the 403 branch, which can no longer happen for a recorded transaction but keeps the shape for transfers).
11. `src/transactions/transaction.mapper.ts`: `toTransactionResponse(tx)` computes `permissions: permissionsFor(toPolicySubject(tx))`.
12. `src/transactions/transaction-export.service.ts`: `STATUS_LABELS` becomes `{ APPROVED: 'Tercatat', VOID: 'Dibatalkan' }`; remove `'Dicatat oleh'` from `HEADER`, `created_by` from `EXPORT_SELECT` and its cell.
13. `src/audit/audit.service.ts`: remove `'CHANGE_PASSWORD'`, `'RESET_PASSWORD'` and `'SET_MEMBERS'` from `AuditAction`.

- [ ] **Step 5: Update the API test helpers**

1. `test/test-db.ts`: the `TRUNCATE` list becomes `"attachments", "audit_logs", "refresh_tokens", "transactions", "categories", "accounts", "users"`.
2. Delete `test/users.e2e-spec.ts` and `test/auth-roles.e2e-spec.ts`.
3. `test/fixtures.ts`: until Task 4 adds the PIN, sessions are signed directly, without the login route:

```ts
import { TokenService } from '../src/auth/token.service.js';
import { SessionService } from '../src/auth/session.service.js';

/** Pemilik edisi pribadi, langsung di database; `pinHash` null berarti PIN belum dibuat. */
export function createOwner(prisma: PrismaClient, overrides: { pinHash?: string | null } = {}): Promise<User> {
  return prisma.user.create({ data: { name: 'Pemilik', pin_hash: overrides.pinHash ?? null } });
}

/** Sesi pemilik tanpa lewat layar PIN; dipakai test yang tidak menguji cara masuk. */
export async function asOwner(ctx: E2eContext): Promise<TestSession & { user: User }> {
  const user = (await ctx.prisma.user.findFirst()) ?? (await createOwner(ctx.prisma));
  const accessToken = await ctx.app.get(TokenService).signAccessToken(user.id);
  const refreshToken = await ctx.app.get(SessionService).create(ctx.prisma, user.id);
  return {
    accessToken,
    cookie: `refresh_token=${refreshToken}`,
    body: { accessToken, user: { id: user.id, name: user.name } },
    user,
  };
}
```

Delete `DEFAULT_PASSWORD`, `UserOverrides`, the hash cache, `createUser`, `login`, `loginAs`, `expectAccess`, `ADMIN_ONLY`, `adminOnly`, `asAdmin`, and the `Role` and `PasswordService` imports. Add `User` to the type import if missing.
4. Replace `asAdmin(ctx)` and `loginAs(ctx, ...)` with `asOwner(ctx)` in every remaining spec (`grep -rl "asAdmin\|loginAs" test`). Delete tests that compare roles (e.g. "staff cannot …", "a manager sees …") and every `expectAccess(...)` call: one owner sees and does everything.
5. `test/transaction-fixtures.ts`: `World` is `Ledger & { owner: TestSession & { user: User } }`; `setupWorld` creates the ledger and `owner: await asOwner(ctx)`. Rename `world.admin` to `world.owner` in the specs.
6. `test/route-guards.e2e-spec.ts`: delete `ADMIN_ONLY`, its uses in `'finds the routes of every module'`, and the `it.each(['PROJECT_MANAGER', 'STAFF'] ...)` test. Remove `'GET /api/v1/users'` etc. from any list.
7. The auth e2e specs (`auth-login`, `auth-refresh`, `auth-rate-limit`, `audit`) still exercise the email login; mark their `describe` blocks `describe.skip` with the comment `// Diganti test PIN di Task 4.` (Task 4 deletes or rewrites them).

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm run lint` — Expected: 0 errors. (The auth controller and service still reference `email` and `password_hash`; make them compile by deleting the `login` and `changePassword` methods and handlers and the `LoginDto` / `ChangePasswordDto` files now; Task 4 adds the PIN versions.)
Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts` — Expected: all pass (skipped auth specs reported as skipped).
Run: `cd apps/api && npx vitest run` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A apps/api
git commit -m "refactor: one owner instead of users and roles; drop company tables"
```

---

## Task 4: PIN setup, login and lockout (API)

**Files:**
- Create: `apps/api/src/common/pin-policy.ts`, `apps/api/src/auth/dto/pin.dto.ts`, `apps/api/src/auth/pin-lockout.ts`, `apps/api/src/auth/pin-lockout.spec.ts`, `apps/api/src/auth/pin.service.ts`, `apps/api/test/auth-pin.e2e-spec.ts`, `apps/api/test/auth-pin-lockout.e2e-spec.ts`
- Modify: `apps/api/src/auth/{auth.controller,auth.service,auth.module,token.service,password.service}.ts`, `apps/api/src/audit/audit.service.ts`, `apps/api/test/{routes,route-guards.e2e-spec,auth-refresh.e2e-spec,auth-rate-limit.e2e-spec,audit.e2e-spec}.ts`, `apps/api/test/fixtures.ts`
- Delete: `apps/api/test/auth-login.e2e-spec.ts`, `apps/api/src/common/email.ts`, `apps/api/src/common/password-policy.ts`

**Interfaces:**
- Consumes: Task 3's `User` model, `AuthUser`, `SessionService`, `TokenService`.
- Produces:
  - Routes: `GET /api/v1/auth/pin-status` → `{ pinSet: boolean }` (public); `POST /api/v1/auth/setup-pin` `{ pin }` → `SessionResponse` (public; 409 when a PIN exists); `POST /api/v1/auth/login` `{ pin }` → `SessionResponse` (public, throttled; 401 wrong PIN; 429 while locked); `POST /api/v1/auth/change-pin` `{ currentPin, newPin }` → `SessionResponse`; `refresh`, `logout`, `me` unchanged.
  - `PIN_MAX_ATTEMPTS = 5`, `PIN_LOCK_MS = 15 * 60 * 1000` in `pin-lockout.ts`.
  - `PinService.verify(tx, pin, ip, now?): Promise<PinCheck>` with `PinCheck = { kind: 'ok'; owner } | { kind: 'wrong' } | { kind: 'locked'; minutes }`; `pinLocked(minutes): HttpException` (429).
  - `PinService.reset(db: Db): Promise<boolean>` used by Task 5.
  - Audit actions `PIN_SETUP`, `PIN_CHANGE`, `PIN_RESET`, `LOGIN_LOCKED`.
  - Test helpers `OWNER_PIN = '135792'`, `setupPin(ctx, pin?)`, `loginWithPin(ctx, pin)`.

- [ ] **Step 1: Write the failing unit test for the lockout rules**

`apps/api/src/auth/pin-lockout.spec.ts`:

```ts
import { afterFailure, lockedFor, PIN_LOCK_MS, PIN_MAX_ATTEMPTS } from './pin-lockout.js';

const NOW = new Date('2026-10-12T03:00:00.000Z');

describe('pin lockout', () => {
  it('counts a wrong PIN without locking before the fifth', () => {
    expect(afterFailure({ attempts: 3, now: NOW })).toEqual({ attempts: 4, lockedUntil: null });
  });

  it('locks for 15 minutes on the fifth wrong PIN and starts counting again from zero', () => {
    expect(afterFailure({ attempts: PIN_MAX_ATTEMPTS - 1, now: NOW })).toEqual({
      attempts: 0,
      lockedUntil: new Date(NOW.getTime() + PIN_LOCK_MS),
    });
  });

  it('reports the remaining minutes, rounded up, while locked', () => {
    const lockedUntil = new Date(NOW.getTime() + 61_000);
    expect(lockedFor(lockedUntil, NOW)).toBe(2);
  });

  it('is not locked once the pause has passed', () => {
    expect(lockedFor(new Date(NOW.getTime() - 1), NOW)).toBeNull();
    expect(lockedFor(null, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing e2e tests**

Add to `apps/api/test/routes.ts`:

```ts
export const PIN_STATUS = `${API}/auth/pin-status`;
export const SETUP_PIN = `${API}/auth/setup-pin`;
export const CHANGE_PIN = `${API}/auth/change-pin`;
```

and delete `CHANGE_PASSWORD` and `USERS`.

Add to `apps/api/test/fixtures.ts`:

```ts
export const OWNER_PIN = '135792';

/** Membuat PIN lewat API, seperti pada kunjungan pertama. */
export async function setupPin(ctx: E2eContext, pin: string = OWNER_PIN): Promise<TestSession> {
  const res = await api(ctx).post(SETUP_PIN).send({ pin }).expect(201);
  return { accessToken: res.body.accessToken, cookie: refreshCookie(res), body: res.body };
}

export function loginWithPin(ctx: E2eContext, pin: string) {
  return api(ctx).post(LOGIN).send({ pin });
}
```

(import `SETUP_PIN` and `LOGIN` from `./routes.js`; `setupPin` requires the owner row, which the test creates with `createOwner(ctx.prisma)` first.)

`apps/api/test/auth-pin.e2e-spec.ts`:

```ts
import { api, setupE2e } from './e2e-context.js';
import { bearer, createOwner, errorFields, loginWithPin, OWNER_PIN, refreshCookie, setupPin } from './fixtures.js';
import { CHANGE_PIN, LOGOUT, ME, PIN_STATUS, REFRESH, SETUP_PIN } from './routes.js';

describe('PIN', () => {
  const ctx = setupE2e();

  beforeEach(async () => {
    await createOwner(ctx.prisma);
  });

  it('says there is no PIN yet on a fresh install', async () => {
    const res = await api(ctx).get(PIN_STATUS).expect(200);
    expect(res.body).toEqual({ pinSet: false });
  });

  it('creates the PIN once, signs in at once and records it without the PIN itself', async () => {
    const session = await setupPin(ctx);

    expect(session.body.user).toEqual({ id: expect.any(String), name: 'Pemilik' });
    await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(200);
    expect((await api(ctx).get(PIN_STATUS)).body).toEqual({ pinSet: true });

    const owner = await ctx.prisma.user.findFirstOrThrow();
    expect(owner.pin_hash).toMatch(/^\$argon2/);
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'PIN_SETUP' } });
    expect(JSON.stringify(row)).not.toContain(OWNER_PIN);
  });

  it('refuses to create a second PIN, also when two tabs submit at once', async () => {
    const [a, b] = await Promise.all([
      api(ctx).post(SETUP_PIN).send({ pin: '111111' }),
      api(ctx).post(SETUP_PIN).send({ pin: '222222' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    await api(ctx).post(SETUP_PIN).send({ pin: '333333' }).expect(409);

    const winner = a.status === 201 ? '111111' : '222222';
    await loginWithPin(ctx, winner).expect(200);
  });

  it.each([
    ['too short', '12345'],
    ['too long', '1234567890123'],
    ['with a letter', '12345a'],
    ['with a space', ' 123456'],
    ['as a number', 123456],
  ])('refuses a PIN that is %s', async (_label, pin) => {
    const res = await api(ctx).post(SETUP_PIN).send({ pin }).expect(400);
    expect(errorFields(res.body)).toContain('pin');
  });

  it('keeps leading zeros', async () => {
    await setupPin(ctx, '000123');
    await loginWithPin(ctx, '000123').expect(200);
    await loginWithPin(ctx, '123').expect(400);
  });

  it('signs in with the right PIN and refuses a wrong one', async () => {
    await setupPin(ctx);
    const ok = await loginWithPin(ctx, OWNER_PIN).expect(200);
    expect(ok.body.user.name).toBe('Pemilik');

    const wrong = await loginWithPin(ctx, '999999').expect(401);
    expect(wrong.body.message).toBe('PIN salah');
  });

  it('asks to create a PIN instead of signing in while none exists', async () => {
    const res = await loginWithPin(ctx, OWNER_PIN).expect(409);
    expect(res.body.message).toBe('PIN belum dibuat');
  });

  it('keeps a device signed in for 30 days', async () => {
    const session = await setupPin(ctx);
    const token = await ctx.prisma.refreshToken.findFirstOrThrow();
    const days = (token.expires_at.getTime() - token.created_at.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    const refreshed = await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(200);
    expect(refreshCookie(refreshed)).not.toBe(session.cookie);
  });

  it('changes the PIN with the current one, ending other sessions but not this one', async () => {
    const here = await setupPin(ctx);
    const elsewhere = await loginWithPin(ctx, OWNER_PIN).expect(200);

    const changed = await api(ctx)
      .post(CHANGE_PIN)
      .set(...bearer(here.accessToken))
      .send({ currentPin: OWNER_PIN, newPin: '246810' })
      .expect(200);

    await api(ctx).post(REFRESH).set('Cookie', refreshCookie(elsewhere)).expect(401);
    await api(ctx).post(REFRESH).set('Cookie', refreshCookie(changed)).expect(200);
    await loginWithPin(ctx, OWNER_PIN).expect(401);
    await loginWithPin(ctx, '246810').expect(200);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'PIN_CHANGE' } })).toBe(1);
  });

  it('refuses to change the PIN with a wrong current PIN or to the same PIN', async () => {
    const session = await setupPin(ctx);
    const wrong = await api(ctx)
      .post(CHANGE_PIN)
      .set(...bearer(session.accessToken))
      .send({ currentPin: '000000', newPin: '246810' })
      .expect(400);
    expect(errorFields(wrong.body)).toEqual(['currentPin']);

    const same = await api(ctx)
      .post(CHANGE_PIN)
      .set(...bearer(session.accessToken))
      .send({ currentPin: OWNER_PIN, newPin: OWNER_PIN })
      .expect(400);
    expect(errorFields(same.body)).toEqual(['newPin']);
  });

  it('signs out this device', async () => {
    const session = await setupPin(ctx);
    await api(ctx).post(LOGOUT).set('Cookie', session.cookie).expect(204);
    await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(401);
  });
});
```

`apps/api/test/auth-pin-lockout.e2e-spec.ts`:

```ts
import { PIN_LOCK_MS } from '../src/auth/pin-lockout.js';
import { createTestApp } from './app-factory.js';
import { api, setupE2e } from './e2e-context.js';
import { createOwner, loginWithPin, OWNER_PIN, setupPin } from './fixtures.js';
import { LOGIN } from './routes.js';

const WRONG = '999999';

describe('PIN lockout', () => {
  const ctx = setupE2e();

  beforeEach(async () => {
    await createOwner(ctx.prisma);
    await setupPin(ctx);
  });

  async function failTimes(count: number): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i < count; i += 1) statuses.push((await loginWithPin(ctx, WRONG)).status);
    return statuses;
  }

  it('pauses PIN entry for 15 minutes on the fifth wrong PIN', async () => {
    expect(await failTimes(5)).toEqual([401, 401, 401, 401, 429]);

    const owner = await ctx.prisma.user.findFirstOrThrow();
    const pause = owner.pin_locked_until!.getTime() - Date.now();
    expect(pause).toBeGreaterThan(PIN_LOCK_MS - 60_000);
    expect(pause).toBeLessThanOrEqual(PIN_LOCK_MS);
  });

  it('refuses even the right PIN during the pause, saying how long is left, without counting', async () => {
    await failTimes(5);

    const res = await loginWithPin(ctx, OWNER_PIN).expect(429);
    expect(res.body.message).toMatch(/^PIN dikunci\. Coba lagi dalam 15 menit\.$/);
    const owner = await ctx.prisma.user.findFirstOrThrow();
    expect(owner.pin_failed_attempts).toBe(0);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LOGIN_LOCKED' } })).toBe(1);
  });

  it('accepts the PIN again after the pause and starts counting from zero', async () => {
    await failTimes(5);
    // Waktu palsu: jedanya dibuat sudah lewat.
    await ctx.prisma.user.updateMany({ data: { pin_locked_until: new Date(Date.now() - 1000) } });

    expect(await failTimes(1)).toEqual([401]);
    await loginWithPin(ctx, OWNER_PIN).expect(200);
    expect((await ctx.prisma.user.findFirstOrThrow()).pin_failed_attempts).toBe(0);
  });

  it('resets the count after a successful PIN', async () => {
    await failTimes(4);
    await loginWithPin(ctx, OWNER_PIN).expect(200);
    expect(await failTimes(4)).toEqual([401, 401, 401, 401]);
  });

  it('keeps the pause after the application restarts', async () => {
    await failTimes(5);
    const restarted = await createTestApp();
    try {
      await api({ app: restarted, prisma: ctx.prisma }).post(LOGIN).send({ pin: OWNER_PIN }).expect(429);
    } finally {
      await restarted.close();
    }
  });
});
```

Rewrite the remaining auth specs for the PIN:
- delete `test/auth-login.e2e-spec.ts` (covered by `auth-pin`);
- `test/auth-refresh.e2e-spec.ts`: remove `describe.skip`; obtain sessions with `createOwner` + `setupPin` / `loginWithPin` instead of the email login; delete the "deactivated user" and "role changed" cases;
- `test/auth-rate-limit.e2e-spec.ts`: remove `describe.skip`; send `{ pin: '999999' }` to `LOGIN` after `createOwner` + `setupPin` with `LOGIN_RATE_LIMIT` low enough to trip before the 5-attempt lock (`createTestApp({ LOGIN_RATE_LIMIT: 3 })`): the 4th request answers 429 with the throttler message `'Terlalu banyak percobaan login. Coba lagi nanti.'`;
- `test/audit.e2e-spec.ts`: remove `describe.skip`; assert `PIN_SETUP` and `LOGIN` rows instead of the email login rows, and that no audit row contains the PIN.

In `apps/api/test/route-guards.e2e-spec.ts`, `PUBLIC` becomes:

```ts
const PUBLIC = [
  'GET /api/v1/health',
  'GET /api/v1/health/live',
  'GET /api/v1/auth/pin-status',
  'POST /api/v1/auth/setup-pin',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
];
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd apps/api && npx vitest run src/auth/pin-lockout.spec.ts` — Expected: FAIL, module not found.
Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts test/auth-pin.e2e-spec.ts test/auth-pin-lockout.e2e-spec.ts test/route-guards.e2e-spec.ts` — Expected: FAIL, routes 404.

- [ ] **Step 4: Implement**

`apps/api/src/auth/pin-lockout.ts`:

```ts
/** PIN salah berturut-turut yang memicu jeda. */
export const PIN_MAX_ATTEMPTS = 5;
/** Lama jeda setelah PIN salah yang ke-`PIN_MAX_ATTEMPTS`. */
export const PIN_LOCK_MS = 15 * 60 * 1000;

export interface LockState {
  attempts: number;
  lockedUntil: Date | null;
}

/** Keadaan sesudah satu PIN salah. Pada kesalahan ke-5, jeda dimulai dan hitungan kembali ke nol. */
export function afterFailure({ attempts, now }: { attempts: number; now: Date }): LockState {
  const next = attempts + 1;
  if (next < PIN_MAX_ATTEMPTS) return { attempts: next, lockedUntil: null };
  return { attempts: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MS) };
}

/** Sisa jeda dalam menit (dibulatkan ke atas), atau null bila tidak sedang dijeda. */
export function lockedFor(lockedUntil: Date | null, now: Date): number | null {
  if (!lockedUntil || lockedUntil <= now) return null;
  return Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000);
}
```

`apps/api/src/common/pin-policy.ts`:

```ts
import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

export const PIN_PATTERN = /^\d{6,12}$/;
export const PIN_MESSAGE = 'PIN harus 6 sampai 12 angka';

/** PIN: 6 sampai 12 angka, dikirim sebagai teks supaya angka nol di depan tidak hilang. */
export function IsPin(): PropertyDecorator {
  return applyDecorators(IsString({ message: PIN_MESSAGE }), Matches(PIN_PATTERN, { message: PIN_MESSAGE }));
}
```

`apps/api/src/auth/dto/pin.dto.ts`:

```ts
import { IsPin } from '../../common/pin-policy.js';

export class SetupPinDto {
  @IsPin()
  pin: string;
}

export class LoginDto {
  @IsPin()
  pin: string;
}

export class ChangePinDto {
  @IsPin()
  currentPin: string;

  @IsPin()
  newPin: string;
}
```

`apps/api/src/auth/pin.service.ts`:

```ts
import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { validationFailed } from '../common/validation.js';
import type { Db } from '../database/db.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { afterFailure, lockedFor } from './pin-lockout.js';
import { PasswordService } from './password.service.js';

export function pinLocked(minutes: number): HttpException {
  return new HttpException(`PIN dikunci. Coba lagi dalam ${minutes} menit.`, HttpStatus.TOO_MANY_REQUESTS);
}

/**
 * Hasil memeriksa PIN. Penolakan dikembalikan, bukan dilempar: hitungan salah, jeda, dan
 * catatan auditnya harus tetap tersimpan, sedangkan error di dalam transaksi database
 * membatalkan semuanya. Pemanggil melempar errornya setelah transaksi selesai.
 */
export type PinCheck =
  | { kind: 'ok'; owner: User }
  | { kind: 'wrong' }
  | { kind: 'locked'; minutes: number };

/** Pemilik dibuat seed; tanpa itu aplikasi salah pasang, bukan salah input. */
async function ownerFor(db: Db): Promise<User> {
  const owner = await db.user.findFirst();
  if (!owner) throw new Error('Pemilik belum ada; jalankan seed.');
  return owner;
}

/**
 * PIN pemilik: membuat, memeriksa dengan jeda setelah terlalu banyak salah, mengganti, dan
 * mereset. Hash memakai argon2 lewat PasswordService; PIN sendiri tidak pernah disimpan atau dicatat.
 */
@Injectable()
export class PinService {
  constructor(
    private readonly hashes: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async isSet(db: Db): Promise<boolean> {
    return (await ownerFor(db)).pin_hash !== null;
  }

  /** Hanya berhasil selama PIN belum ada; dari dua permintaan bersamaan, satu yang menang. */
  async setup(tx: Prisma.TransactionClient, pin: string, ip: string | null): Promise<User> {
    const owner = await ownerFor(tx);
    const pin_hash = await this.hashes.hash(pin);
    const { count } = await tx.user.updateMany({ where: { id: owner.id, pin_hash: null }, data: { pin_hash } });
    if (count === 0) throw new ConflictException('PIN sudah dibuat');
    await this.audit.log(tx, { userId: owner.id, action: 'PIN_SETUP', entityType: 'user', entityId: owner.id, ip });
    return tx.user.findUniqueOrThrow({ where: { id: owner.id } });
  }

  /**
   * Memeriksa PIN di bawah kunci baris pemilik, supaya tebakan yang datang bersamaan tetap
   * dihitung satu per satu.
   */
  async verify(tx: Prisma.TransactionClient, pin: string, ip: string | null, now = new Date()): Promise<PinCheck> {
    const owner = await ownerFor(tx);
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: owner.id } });
    if (current.pin_hash === null) throw new ConflictException('PIN belum dibuat');

    const minutes = lockedFor(current.pin_locked_until, now);
    if (minutes !== null) {
      await this.audit.log(tx, { userId: owner.id, action: 'LOGIN_LOCKED', entityType: 'user', entityId: owner.id, ip });
      return { kind: 'locked', minutes };
    }

    if (await this.hashes.verify(current.pin_hash, pin)) {
      const updated = await tx.user.update({
        where: { id: owner.id },
        data: { pin_failed_attempts: 0, pin_locked_until: null },
      });
      return { kind: 'ok', owner: updated };
    }

    const next = afterFailure({ attempts: current.pin_failed_attempts, now });
    await tx.user.update({
      where: { id: owner.id },
      data: { pin_failed_attempts: next.attempts, pin_locked_until: next.lockedUntil },
    });
    await this.audit.log(tx, { userId: owner.id, action: 'LOGIN_FAILED', entityType: 'user', entityId: owner.id, ip });
    // PIN salah yang memulai jeda dijawab dengan pesan jeda, supaya pemilik tahu harus menunggu.
    return next.lockedUntil ? { kind: 'locked', minutes: lockedFor(next.lockedUntil, now)! } : { kind: 'wrong' };
  }

  async change(tx: Prisma.TransactionClient, ownerId: string, currentPin: string, newPin: string, ip: string | null): Promise<void> {
    const owner = await tx.user.findUniqueOrThrow({ where: { id: ownerId } });
    if (!(await this.hashes.verify(owner.pin_hash, currentPin))) {
      // Sengaja 400, bukan 401: sesi pemanggil masih sah, hanya isian formulirnya yang salah.
      throw validationFailed([{ field: 'currentPin', messages: ['PIN saat ini salah'] }]);
    }
    if (newPin === currentPin) {
      throw validationFailed([{ field: 'newPin', messages: ['PIN baru harus berbeda dari PIN saat ini'] }]);
    }
    await tx.user.update({ where: { id: ownerId }, data: { pin_hash: await this.hashes.hash(newPin) } });
    await this.audit.log(tx, { userId: ownerId, action: 'PIN_CHANGE', entityType: 'user', entityId: ownerId, ip });
  }

  /** Untuk perintah `reset-pin` di server: PIN, hitungan, jeda, dan semua sesi dikosongkan. */
  async reset(db: Db): Promise<boolean> {
    const owner = await db.user.findFirst();
    if (!owner) return false;
    await db.user.update({
      where: { id: owner.id },
      data: { pin_hash: null, pin_failed_attempts: 0, pin_locked_until: null },
    });
    await db.refreshToken.deleteMany({ where: { user_id: owner.id } });
    await this.audit.log(db, { userId: owner.id, action: 'PIN_RESET', entityType: 'user', entityId: owner.id });
    return true;
  }
}

```

`apps/api/src/auth/password.service.ts`: change the class comment and the dummy-hash text to be PIN-neutral (`argon2.hash('dummy-pin')`), keep the API (`hash`, `verify`).

`apps/api/src/auth/token.service.ts`: `export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;`.

`apps/api/src/auth/auth.service.ts`: replace `login` and `changePassword` (the latter was deleted in Task 3) with:

```ts
  /** PIN pertama; langsung membuka sesi. */
  async setupPin(pin: string, ip: string | null): Promise<Session> {
    const { owner, refreshToken } = await this.prisma.$transaction(async (tx) => {
      const owner = await this.pins.setup(tx, pin, ip);
      return { owner, refreshToken: await this.sessions.create(tx, owner.id) };
    });
    return this.buildSession(owner, refreshToken);
  }

  async login(pin: string, ip: string | null): Promise<Session> {
    // Penolakan dilempar setelah transaksi selesai, supaya hitungan salah dan auditnya tersimpan.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const check = await this.pins.verify(tx, pin, ip);
      if (check.kind !== 'ok') return check;
      await this.logUserEvent(tx, 'LOGIN', check.owner.id, ip);
      return { ...check, refreshToken: await this.sessions.create(tx, check.owner.id) };
    });
    if (outcome.kind === 'wrong') throw new UnauthorizedException('PIN salah');
    if (outcome.kind === 'locked') throw pinLocked(outcome.minutes);
    return this.buildSession(outcome.owner, outcome.refreshToken);
  }

  /** Mengganti PIN, mengakhiri semua sesi lain, dan membuka sesi baru untuk pemanggil. */
  async changePin(ownerId: string, currentPin: string, newPin: string, ip: string | null): Promise<Session> {
    const { owner, refreshToken } = await this.prisma.$transaction(async (tx) => {
      await this.pins.change(tx, ownerId, currentPin, newPin, ip);
      await this.sessions.endAll(tx, ownerId);
      return {
        owner: await tx.user.findUniqueOrThrow({ where: { id: ownerId } }),
        refreshToken: await this.sessions.create(tx, ownerId),
      };
    });
    return this.buildSession(owner, refreshToken);
  }

  pinStatus(): Promise<{ pinSet: boolean }> {
    return this.pins.isSet(this.prisma).then((pinSet) => ({ pinSet }));
  }
```

Inject `private readonly pins: PinService` in the constructor and drop `PasswordService` from it; import `PinService` and `pinLocked` from `./pin.service.js`. `PinService.verify` records wrong PINs and the pause inside the transaction and returns the outcome; `login` throws only after the transaction has committed, so the counter and the audit rows survive the 401 or 429. In `refresh`, delete `if (!current.user.is_active) throw sessionEnded();`.

`apps/api/src/auth/auth.controller.ts`: replace the `login` and `changePassword` handlers and the DTO imports with:

```ts
  @Public()
  @Get('pin-status')
  pinStatus(): Promise<{ pinSet: boolean }> {
    return this.auth.pinStatus();
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('setup-pin')
  async setupPin(
    @Body() dto: SetupPinDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respondWithSession(res, await this.auth.setupPin(dto.pin, ip));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respondWithSession(res, await this.auth.login(dto.pin, ip));
  }

  @Post('change-pin')
  @HttpCode(200)
  async changePin(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePinDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respondWithSession(res, await this.auth.changePin(user.id, dto.currentPin, dto.newPin, ip));
  }
```

Remove `@AllowPendingPasswordChange()` from `me`, and import `ChangePinDto, LoginDto, SetupPinDto` from `./dto/pin.dto.js`.

`apps/api/src/auth/auth.module.ts`: add `PinService` to `providers` and `exports` (Task 5's CLI uses it); the throttler comment becomes `// Hanya dipakai rute yang memasang ThrottlerGuard (buat PIN dan masuk).` and `errorMessage` stays.

`apps/api/src/audit/audit.service.ts`: add `'PIN_SETUP' | 'PIN_CHANGE' | 'PIN_RESET' | 'LOGIN_LOCKED'` to `AuditAction`; add `'pin_hash'`, `'pin'`, `'currentPin'`, `'newPin'` to `SECRET_FIELDS` and remove `'password'`, `'currentPassword'`, `'newPassword'`, `'password_hash'`.

Delete `src/common/email.ts` and `src/common/password-policy.ts` (no remaining users after Task 3; run `grep -rn "email.js\|password-policy.js" src test scripts` to confirm). `src/common/http-exception.filter.spec.ts` uses `'email'` only as sample data and stays.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd apps/api && npx vitest run src/auth` — Expected: PASS.
Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts` — Expected: all pass, none skipped.
Run: `npm run lint -w api` — Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api
git commit -m "feat(auth): PIN setup, login with lockout, and PIN change"
```

---

## Task 5: Seed, PIN reset command and scripts (API)

**Files:**
- Modify: `apps/api/src/database/seed.ts`, `apps/api/prisma/seed.ts`, `apps/api/scripts/{drill-seed,e2e-prepare}.ts`, `apps/api/package.json`, `apps/api/test/seed.e2e-spec.ts`
- Create: `apps/api/src/cli/reset-pin.ts`, `apps/api/test/reset-pin.e2e-spec.ts`

**Interfaces:**
- Consumes: `PinService.reset(db)` from Task 4.
- Produces:
  - `seedDatabase(prisma: PrismaClient): Promise<void>` (no options).
  - `resetPin(prisma: PrismaClient): Promise<boolean>` exported from `src/cli/reset-pin.ts`.
  - npm scripts in `apps/api/package.json`: `"reset-pin": "node dist/cli/reset-pin.js"`, `"reset-pin:dev": "tsx src/cli/reset-pin.ts"`.

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/test/seed.e2e-spec.ts` with:

```ts
import { seedDatabase } from '../src/database/seed.js';
import { setupE2e } from './e2e-context.js';

describe('seed', () => {
  const ctx = setupE2e();

  it('creates the owner without a PIN, personal accounts and categories, on first install', async () => {
    await seedDatabase(ctx.prisma);

    const owners = await ctx.prisma.user.findMany();
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ name: 'Pemilik', pin_hash: null });
    expect((await ctx.prisma.account.findMany({ orderBy: { name: 'asc' } })).map((a) => a.name)).toEqual([
      'Dompet',
      'Rekening Bank',
    ]);
    expect(await ctx.prisma.category.count({ where: { name: 'Makan & Minum', type: 'OUT' } })).toBe(1);
    expect(await ctx.prisma.category.count({ where: { name: 'Gaji', type: 'IN' } })).toBe(1);
  });

  it('is safe to run on every deploy: one owner, the PIN kept, renamed defaults not brought back', async () => {
    await seedDatabase(ctx.prisma);
    await ctx.prisma.user.updateMany({ data: { pin_hash: 'hash-tetap' } });
    await ctx.prisma.account.updateMany({ where: { name: 'Dompet' }, data: { name: 'Dompet Harian' } });

    await seedDatabase(ctx.prisma);

    expect(await ctx.prisma.user.count()).toBe(1);
    expect((await ctx.prisma.user.findFirstOrThrow()).pin_hash).toBe('hash-tetap');
    expect(await ctx.prisma.account.count({ where: { name: 'Dompet' } })).toBe(0);
  });

  it('still makes sure the transfer categories exist on every run', async () => {
    await seedDatabase(ctx.prisma);
    await ctx.prisma.category.deleteMany({ where: { is_system: true } });

    await seedDatabase(ctx.prisma);

    const system = await ctx.prisma.category.findMany({ where: { is_system: true }, orderBy: { name: 'asc' } });
    expect(system.map((category) => [category.name, category.type])).toEqual([
      ['Transfer Keluar', 'OUT'],
      ['Transfer Masuk', 'IN'],
    ]);
  });
});
```

`apps/api/test/reset-pin.e2e-spec.ts`:

```ts
import { resetPin } from '../src/cli/reset-pin.js';
import { api, setupE2e } from './e2e-context.js';
import { createOwner, loginWithPin, OWNER_PIN, setupPin } from './fixtures.js';
import { PIN_STATUS, REFRESH } from './routes.js';

describe('reset-pin', () => {
  const ctx = setupE2e();

  it('clears the PIN, the lockout and every session, and records it', async () => {
    await createOwner(ctx.prisma);
    const session = await setupPin(ctx);
    await ctx.prisma.user.updateMany({
      data: { pin_failed_attempts: 3, pin_locked_until: new Date(Date.now() + 60_000) },
    });

    expect(await resetPin(ctx.prisma)).toBe(true);

    expect((await api(ctx).get(PIN_STATUS)).body).toEqual({ pinSet: false });
    await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(401);
    expect(await ctx.prisma.user.findFirstOrThrow()).toMatchObject({
      pin_hash: null,
      pin_failed_attempts: 0,
      pin_locked_until: null,
    });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'PIN_RESET' } })).toBe(1);

    await setupPin(ctx, '246810');
    await loginWithPin(ctx, OWNER_PIN).expect(401);
  });

  it('does nothing when there is no owner yet', async () => {
    expect(await resetPin(ctx.prisma)).toBe(false);
  });

  it('leaves accounts and transactions untouched', async () => {
    await createOwner(ctx.prisma);
    await ctx.prisma.account.create({ data: { name: 'Dompet', type: 'CASH' } });
    await resetPin(ctx.prisma);
    expect(await ctx.prisma.account.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts test/seed.e2e-spec.ts test/reset-pin.e2e-spec.ts`
Expected: FAIL — `seedDatabase` still requires admin options; `src/cli/reset-pin.js` not found.

- [ ] **Step 3: Implement**

`apps/api/src/database/seed.ts` — replace `SeedOptions`, `PLACEHOLDER_PASSWORD`, `ensureAdmin`, the account and category lists, and `seedDatabase`:

```ts
import type { PrismaClient } from '../generated/prisma/client.js';

const ACCOUNTS = [
  { name: 'Dompet', type: 'CASH' },
  { name: 'Rekening Bank', type: 'BANK' },
] as const;

const CATEGORIES_IN = ['Gaji', 'Bonus', 'Pendapatan Lain'];

const CATEGORIES_OUT = [
  'Makan & Minum',
  'Belanja',
  'Transportasi',
  'Tagihan & Utilitas',
  'Kesehatan',
  'Hiburan',
  'Pendidikan',
  'Lain-lain',
];

/** Kategori awal yang boleh diubah pemilik; hanya dibuat pada pemasangan pertama. */
const DEFAULT_CATEGORIES = [
  ...CATEGORIES_IN.map((name) => ({ name, type: 'IN', is_system: false }) as const),
  ...CATEGORIES_OUT.map((name) => ({ name, type: 'OUT', is_system: false }) as const),
];

/** Kategori yang dibutuhkan aplikasi sendiri (transfer antar akun); selalu dipastikan ada. */
const SYSTEM_CATEGORIES = [
  { name: 'Transfer Masuk', type: 'IN', is_system: true } as const,
  { name: 'Transfer Keluar', type: 'OUT', is_system: true } as const,
];

/**
 * Membuat pemilik (tanpa PIN: PIN dibuat pada kunjungan pertama). Bila sudah ada, tidak
 * melakukan apa pun. Mengembalikan true pada pemasangan pertama.
 */
async function ensureOwner(prisma: PrismaClient): Promise<boolean> {
  if (await prisma.user.findFirst()) return false;
  await prisma.user.create({ data: { name: 'Pemilik' } });
  return true;
}
```

Keep `ensureAccounts` and `ensureCategories` as they are, and:

```ts
/**
 * Aman dijalankan berulang (dan memang dijalankan tiap deploy): tidak menggandakan data dan
 * tidak menyentuh PIN. Akun dan kategori awal hanya dibuat pada pemasangan pertama.
 */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  const firstInstall = await ensureOwner(prisma);
  if (firstInstall) {
    await ensureAccounts(prisma);
    await ensureCategories(prisma, DEFAULT_CATEGORIES);
  }
  await ensureCategories(prisma, SYSTEM_CATEGORIES);
}
```

Delete the `PasswordService`, `normalizeEmail` and `PASSWORD_MIN_LENGTH` imports.

`apps/api/prisma/seed.ts` and `apps/api/scripts/e2e-prepare.ts`: call `seedDatabase(prisma)` without options.

`apps/api/scripts/drill-seed.ts`: the user is `prisma.user.create({ data: { name: 'Uji Pulih' } })`; the transaction status is `i % 2 === 0 ? 'APPROVED' : 'VOID'`.

`apps/api/src/cli/reset-pin.ts`:

```ts
/**
 * Lupa PIN: mengosongkan PIN pemilik, hitungan salah, dan semua sesi. Kunjungan berikutnya
 * meminta PIN baru. Data lain tidak tersentuh.
 *
 *   npm run reset-pin                                   (setelah build, mis. di container)
 *   deploy/dc run --rm api npm run reset-pin            (produksi)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { PinService } from '../auth/pin.service.js';
import { PrismaClient } from '../generated/prisma/client.js';

export function resetPin(prisma: PrismaClient): Promise<boolean> {
  return new PinService(new PasswordService(), new AuditService()).reset(prisma);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL wajib diisi');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const done = await resetPin(prisma);
    console.log(done ? 'PIN direset. Buka aplikasi untuk membuat PIN baru.' : 'Pemilik belum ada; tidak ada yang direset.');
  } finally {
    await prisma.$disconnect();
  }
}

// Dijalankan sebagai perintah, bukan saat diimpor test.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/cli/reset-pin.js') || process.argv[1]?.endsWith('reset-pin.ts')) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

`apps/api/package.json` scripts: add `"reset-pin": "node dist/cli/reset-pin.js"` and `"reset-pin:dev": "tsx src/cli/reset-pin.ts"`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts` — Expected: all pass.
Run: `npm run lint -w api` — Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api
git commit -m "feat: owner seed, personal defaults, and the reset-pin command"
```

---

## Task 6: Web — roles removed, PIN screens and settings

**Files:**
- Delete: `apps/web/src/views/users/`, `apps/web/src/api/users.ts`, `apps/web/src/views/ChangePasswordView.vue`, `apps/web/src/views/LoginView.vue`, `apps/web/src/views/__tests__/auth-views.spec.ts`, `apps/web/src/components/PasswordField.vue`
- Create: `apps/web/src/lib/pin.ts`, `apps/web/src/lib/__tests__/pin.spec.ts`, `apps/web/src/components/PinField.vue`, `apps/web/src/views/auth/PinLoginView.vue`, `apps/web/src/views/auth/SetupPinView.vue`, `apps/web/src/views/settings/SettingsView.vue`, `apps/web/src/views/__tests__/pin-views.spec.ts`, `apps/web/src/views/settings/__tests__/settings.spec.ts`
- Modify: `apps/web/src/api/{types,auth,http}.ts`, `apps/web/src/stores/session.ts`, `apps/web/src/router/{routes,guards,paths,navigation,index}.ts`, `apps/web/src/layouts/AppLayout.vue`, `apps/web/src/lib/labels.ts`, `apps/web/src/views/transactions/TransactionDetailView.vue`, `apps/web/src/views/master-data/*`, `apps/web/src/test/session.ts`, and the specs `router/__tests__/guards.spec.ts`, `stores/__tests__/session.spec.ts`, `layouts/__tests__/AppLayout.spec.ts`, `api/__tests__/http.spec.ts`, `api/__tests__/master-data.spec.ts`

**Interfaces:**
- Consumes: Task 4's routes.
- Produces:
  - `AuthUser = { id: string; name: string }`; `TxStatus = 'APPROVED' | 'VOID'`.
  - `api/auth.ts`: `pinStatus(): Promise<{ pinSet: boolean }>`, `setupPin(pin): Promise<SessionResponse>`, `login(pin): Promise<SessionResponse>`, `changePin(currentPin, newPin): Promise<SessionResponse>`, `logout()`, `me()`.
  - Session store: `{ user, ready, isAuthenticated, restore, setupPin, login, changePin, logout, onExpired }`.
  - `PATHS = { root: '/', login: '/masuk', setupPin: '/buat-pin', dashboard: '/dashboard', transactions: '/transaksi', masterData: '/master-data', settings: '/pengaturan', auditLog: '/pengaturan/audit-log' }`.
  - `resolveNavigation({ user, to }): NavigationResult` and `postLoginPath(redirect?: unknown): string`.
  - `menu(): MenuItem[]`.
  - `pinRules(label: string): Rule[]` in `lib/pin.ts`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/__tests__/pin.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pinRules } from '../pin'
import { collectErrors } from '../validation'

function check(pin: string): string | undefined {
  return collectErrors({ pin }, { pin: pinRules('PIN') }).pin
}

describe('pinRules', () => {
  it.each(['123456', '000123', '123456789012'])('accepts %s', (pin) => {
    expect(check(pin)).toBeUndefined()
  })

  it('asks for a PIN when empty', () => {
    expect(check('')).toBe('PIN wajib diisi')
  })

  it.each(['12345', '1234567890123', '12345a', ' 123456'])('refuses %j', (pin) => {
    expect(check(pin)).toBe('PIN harus 6 sampai 12 angka')
  })
})
```

`apps/web/src/views/__tests__/pin-views.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/http'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import PinLoginView from '../auth/PinLoginView.vue'
import SetupPinView from '../auth/SetupPinView.vue'

vi.mock('@/api/auth')

const SESSION = { accessToken: 'token', user: { id: 'u-owner', name: 'Pemilik' } }

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
})

describe('SetupPinView', () => {
  it('creates the PIN after it is typed twice the same, then opens the dashboard', async () => {
    vi.mocked(authApi.setupPin).mockResolvedValue(SESSION)
    const { wrapper, router } = await mountView(SetupPinView, { path: '/buat-pin' })

    await fill(wrapper, '#pin', '000123')
    await fill(wrapper, '#pin-confirm', '000123')
    await submitForm(wrapper)

    expect(authApi.setupPin).toHaveBeenCalledWith('000123')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('stops when the two PINs differ', async () => {
    const { wrapper } = await mountView(SetupPinView, { path: '/buat-pin' })
    await fill(wrapper, '#pin', '123456')
    await fill(wrapper, '#pin-confirm', '123457')
    await submitForm(wrapper)

    expect(wrapper.get('#pin-confirm-error').text()).toBe('PIN tidak sama')
    expect(authApi.setupPin).not.toHaveBeenCalled()
  })

  it('sends the visitor to the PIN entry when another tab already created the PIN', async () => {
    vi.mocked(authApi.setupPin).mockRejectedValue(new ApiError(409, 'PIN sudah dibuat'))
    const { wrapper, router } = await mountView(SetupPinView, { path: '/buat-pin' })
    await fill(wrapper, '#pin', '123456')
    await fill(wrapper, '#pin-confirm', '123456')
    await submitForm(wrapper)

    expect(router.currentRoute.value.path).toBe('/masuk')
  })
})

describe('PinLoginView', () => {
  it('signs in with the PIN and follows the redirect', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    const { wrapper, router } = await mountView(PinLoginView, { path: '/masuk?redirect=/transaksi' })

    await fill(wrapper, '#pin', '135792')
    await submitForm(wrapper)

    expect(authApi.login).toHaveBeenCalledWith('135792')
    expect(router.currentRoute.value.path).toBe('/transaksi')
  })

  it('shows the API message for a wrong PIN and for the pause', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(new ApiError(401, 'PIN salah'))
    vi.mocked(authApi.login).mockRejectedValueOnce(new ApiError(429, 'PIN dikunci. Coba lagi dalam 15 menit.'))
    const { wrapper } = await mountView(PinLoginView, { path: '/masuk' })

    await fill(wrapper, '#pin', '999999')
    await submitForm(wrapper)
    expect(wrapper.text()).toContain('PIN salah')

    await submitForm(wrapper)
    expect(wrapper.text()).toContain('PIN dikunci. Coba lagi dalam 15 menit.')
  })
})
```

`apps/web/src/views/settings/__tests__/settings.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/http'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signIn } from '@/test/session'
import SettingsView from '../SettingsView.vue'

vi.mock('@/api/auth')

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  signIn()
})

describe('SettingsView', () => {
  it('changes the PIN and links to the audit log', async () => {
    vi.mocked(authApi.changePin).mockResolvedValue({ accessToken: 't', user: { id: 'u-owner', name: 'Pemilik' } })
    const { wrapper } = await mountView(SettingsView, { path: '/pengaturan', withOverlays: true })

    expect(wrapper.find('a[href="/pengaturan/audit-log"]').exists()).toBe(true)
    await fill(wrapper, '#current-pin', '135792')
    await fill(wrapper, '#new-pin', '246810')
    await fill(wrapper, '#new-pin-confirm', '246810')
    await submitForm(wrapper)

    expect(authApi.changePin).toHaveBeenCalledWith('135792', '246810')
    expect(document.body.textContent).toContain('PIN diganti. Perangkat lain sudah dikeluarkan.')
  })

  it('shows the API complaint about the current PIN under that field', async () => {
    vi.mocked(authApi.changePin).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [{ field: 'currentPin', messages: ['PIN saat ini salah'] }]),
    )
    const { wrapper } = await mountView(SettingsView, { path: '/pengaturan', withOverlays: true })
    await fill(wrapper, '#current-pin', '000000')
    await fill(wrapper, '#new-pin', '246810')
    await fill(wrapper, '#new-pin-confirm', '246810')
    await submitForm(wrapper)

    expect(wrapper.get('#current-pin-error').text()).toBe('PIN saat ini salah')
  })
})
```

Replace the cases in `apps/web/src/router/__tests__/guards.spec.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { postLoginPath, resolveNavigation } from '../guards'

const OWNER = { id: 'u-owner', name: 'Pemilik' }
const page = (path: string, meta = {}) => ({ path, fullPath: path, meta })

describe('resolveNavigation', () => {
  it('sends a visitor without a session to the PIN entry, remembering the page', () => {
    expect(resolveNavigation({ user: null, to: page('/transaksi') })).toEqual({
      path: '/masuk',
      query: { redirect: '/transaksi' },
    })
  })

  it('lets a visitor open the public PIN pages', () => {
    expect(resolveNavigation({ user: null, to: page('/buat-pin', { public: true }) })).toBe(true)
  })

  it('sends the owner from the root and the PIN pages to the dashboard', () => {
    expect(resolveNavigation({ user: OWNER, to: page('/') })).toEqual({ path: '/dashboard' })
    expect(resolveNavigation({ user: OWNER, to: page('/masuk', { public: true }) })).toEqual({ path: '/dashboard' })
  })

  it('lets the owner open every other page', () => {
    expect(resolveNavigation({ user: OWNER, to: page('/pengaturan/audit-log') })).toBe(true)
  })
})

describe('postLoginPath', () => {
  it('follows a safe redirect and otherwise opens the dashboard', () => {
    expect(postLoginPath('/transaksi')).toBe('/transaksi')
    expect(postLoginPath('//evil.example')).toBe('/dashboard')
    expect(postLoginPath(undefined)).toBe('/dashboard')
  })
})
```

Keep the existing `safeRedirect` cases in that file.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run src/lib/__tests__/pin.spec.ts src/views/__tests__/pin-views.spec.ts src/views/settings src/router/__tests__/guards.spec.ts`
Expected: FAIL — modules not found, old guard signature.

- [ ] **Step 3: Implement**

`apps/web/src/lib/pin.ts`:

```ts
import { required, type Rule } from './validation'

export const PIN_PATTERN = /^\d{6,12}$/
export const PIN_MESSAGE = 'PIN harus 6 sampai 12 angka'

/** Aturan yang sama dengan API: 6 sampai 12 angka, tanpa spasi. */
export function pinRules(label: string): Rule[] {
  return [required(label), (value) => (PIN_PATTERN.test(String(value)) ? null : PIN_MESSAGE)]
}
```

(If `required` trims the value before checking, `' 123456'` still reaches the pattern rule unchanged because `collectErrors` passes the raw value; confirm with the test.)

`apps/web/src/components/PinField.vue`:

```vue
<script setup lang="ts">
import Password from 'primevue/password'
import FormField from '@/components/FormField.vue'

/** Field PIN: tersembunyi, papan angka di ponsel, dengan label dan pesan error. */
defineProps<{
  id: string
  label: string
  error?: string
  /** `current-password` untuk PIN yang sedang dipakai, `new-password` untuk yang baru. */
  autocomplete: 'current-password' | 'new-password'
}>()

const value = defineModel<string>({ required: true })
</script>

<template>
  <FormField :id="id" v-slot="field" :label="label" :error="error">
    <Password
      v-model="value"
      :input-id="field.id"
      :input-props="{ autocomplete, inputmode: 'numeric', maxlength: 12, 'aria-describedby': field.describedBy }"
      :invalid="field.invalid"
      :feedback="false"
      toggle-mask
      fluid
    />
  </FormField>
</template>
```

`apps/web/src/api/types.ts`: delete `Role` and `User`; `AuthUser` becomes `{ id: string; name: string }`; `TxStatus` becomes `'APPROVED' | 'VOID'`.

`apps/web/src/api/auth.ts`:

```ts
import { request } from './http'
import type { AuthUser, SessionResponse } from './types'

/** Apakah PIN sudah dibuat; menentukan layar pertama. */
export function pinStatus(): Promise<{ pinSet: boolean }> {
  return request('/auth/pin-status', { auth: false })
}

export function setupPin(pin: string): Promise<SessionResponse> {
  return request('/auth/setup-pin', { method: 'POST', body: { pin }, auth: false })
}

export function login(pin: string): Promise<SessionResponse> {
  return request('/auth/login', { method: 'POST', body: { pin }, auth: false })
}

/** Publik di sisi API: boleh dipanggil walau access token sudah kedaluwarsa. */
export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST', auth: false })
}

export function me(): Promise<{ user: AuthUser }> {
  return request('/auth/me')
}

export function changePin(currentPin: string, newPin: string): Promise<SessionResponse> {
  return request('/auth/change-pin', { method: 'POST', body: { currentPin, newPin } })
}
```

`apps/web/src/api/http.ts`: delete `onForbidden` from the session events interface and the `if (error.statusCode === 403) sessionEvents?.onForbidden()` line (no role can change any more); update `api/__tests__/http.spec.ts` accordingly.

`apps/web/src/stores/session.ts`: delete `role`, `isAdmin`, `resync`, `changePassword` and the `onForbidden` binding; `login(pin)` calls `authApi.login(pin)`; add `setupPin(pin)` and `changePin(currentPin, newPin)`, both `apply(await authApi.…)`; the returned object is `{ user, ready, isAuthenticated, restore, setupPin, login, changePin, logout, onExpired }`.

`apps/web/src/router/paths.ts`:

```ts
export const PATHS = {
  root: '/',
  login: '/masuk',
  setupPin: '/buat-pin',
  dashboard: '/dashboard',
  transactions: '/transaksi',
  masterData: '/master-data',
  settings: '/pengaturan',
  auditLog: '/pengaturan/audit-log',
} as const

/** Halaman pertama setelah masuk. */
export const HOME = PATHS.dashboard

/** Pola rute halaman detail transaksi. */
export const TRANSACTION_DETAIL_ROUTE = `${PATHS.transactions}/:id`

export function transactionPath(id: string): string {
  return `${PATHS.transactions}/${id}`
}
```

`apps/web/src/router/routes.ts`: `RouteMeta` keeps only `public`, `layout`, `title`; routes:

```ts
export const routes: RouteRecordRaw[] = [
  {
    path: PATHS.login,
    component: () => import('@/views/auth/PinLoginView.vue'),
    meta: { public: true, layout: 'auth', title: 'Masuk' },
  },
  {
    path: PATHS.setupPin,
    component: () => import('@/views/auth/SetupPinView.vue'),
    meta: { public: true, layout: 'auth', title: 'Buat PIN' },
  },
  // Guard selalu mengalihkan `/` ke dasbor.
  { path: PATHS.root, component: placeholder },
  {
    path: PATHS.dashboard,
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: PATHS.transactions,
    component: () => import('@/views/transactions/TransactionsView.vue'),
    meta: { title: 'Transaksi' },
  },
  {
    path: TRANSACTION_DETAIL_ROUTE,
    component: () => import('@/views/transactions/TransactionDetailView.vue'),
    meta: { title: 'Transaksi' },
  },
  {
    path: PATHS.masterData,
    component: () => import('@/views/master-data/MasterDataView.vue'),
    meta: { title: 'Master data' },
  },
  {
    path: PATHS.settings,
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: { title: 'Pengaturan' },
  },
  {
    path: PATHS.auditLog,
    component: () => import('@/views/audit/AuditLogView.vue'),
    meta: { title: 'Audit log' },
  },
  { path: '/:pathMatch(.*)*', redirect: PATHS.root },
]
```

`apps/web/src/router/guards.ts`:

```ts
import type { RouteMeta } from 'vue-router'
import type { AuthUser } from '@/api/types'
import { HOME, PATHS } from './paths'

export interface NavigationInput {
  user: AuthUser | null
  to: { path: string; fullPath: string; meta: RouteMeta }
}

export type NavigationResult = true | { path: string; query?: Record<string, string> }

/**
 * Tujuan setelah masuk yang aman dipakai: hanya path di dalam aplikasi ini.
 * `//host` dan `/\host` ditolak karena browser membacanya sebagai alamat situs lain.
 */
export function safeRedirect(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null
}

/** Hanya soal kenyamanan: yang benar-benar menjaga data adalah API. */
export function resolveNavigation({ user, to }: NavigationInput): NavigationResult {
  if (!user) return to.meta.public ? true : { path: PATHS.login, query: { redirect: to.fullPath } }
  if (to.meta.public || to.path === PATHS.root) return { path: HOME }
  return true
}

/** Halaman yang dibuka setelah masuk atau setelah membuat PIN. */
export function postLoginPath(redirect?: unknown): string {
  return safeRedirect(redirect) ?? HOME
}
```

`apps/web/src/router/navigation.ts`:

```ts
import { PATHS } from './paths'

export interface MenuItem {
  label: string
  icon: string
  to: string
}

const MENU: MenuItem[] = [
  { label: 'Dashboard', icon: 'pi pi-chart-bar', to: PATHS.dashboard },
  { label: 'Transaksi', icon: 'pi pi-receipt', to: PATHS.transactions },
  { label: 'Master data', icon: 'pi pi-database', to: PATHS.masterData },
  { label: 'Pengaturan', icon: 'pi pi-cog', to: PATHS.settings },
]

export function menu(): MenuItem[] {
  return MENU
}
```

`apps/web/src/views/auth/SetupPinView.vue`:

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { ApiError } from '@/api/http'
import FormAlert from '@/components/FormAlert.vue'
import PinField from '@/components/PinField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { pinRules } from '@/lib/pin'
import { collectErrors } from '@/lib/validation'
import { PATHS } from '@/router/paths'
import { postLoginPath } from '@/router/guards'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

const form = reactive({ pin: '', pinConfirm: '' })
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() => session.setupPin(form.pin))

async function onSubmit(): Promise<void> {
  const errors = collectErrors(form, { pin: pinRules('PIN') })
  if (!errors.pin && form.pinConfirm !== form.pin) errors.pinConfirm = 'PIN tidak sama'
  const result = await submit(errors)
  if (result.ok) {
    await router.replace(postLoginPath())
  } else if (result.error instanceof ApiError && result.error.statusCode === 409) {
    // Tab lain sudah membuat PIN lebih dulu.
    await router.replace(PATHS.login)
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <h1 class="text-lg font-semibold">Buat PIN</h1>
    <p class="text-sm text-surface-600">PIN dipakai setiap kali Anda membuka aplikasi. 6 sampai 12 angka.</p>
    <FormAlert :message="formError" />
    <PinField id="pin" v-model="form.pin" label="PIN" autocomplete="new-password" :error="fieldErrors.pin" />
    <PinField
      id="pin-confirm"
      v-model="form.pinConfirm"
      label="Ulangi PIN"
      autocomplete="new-password"
      :error="fieldErrors.pinConfirm"
    />
    <Button type="submit" label="Simpan PIN" :loading="submitting" :disabled="submitting" fluid />
  </form>
</template>
```

If `useFormSubmit`'s result does not carry the error, extend it minimally: `submit` returns `{ ok: false, error: unknown }` on failure (add a test case in `composables/__tests__/useFormSubmit.spec.ts` asserting `error` is the thrown value).

`apps/web/src/views/auth/PinLoginView.vue`:

```vue
<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { pinStatus } from '@/api/auth'
import FormAlert from '@/components/FormAlert.vue'
import PinField from '@/components/PinField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { pinRules } from '@/lib/pin'
import { collectErrors } from '@/lib/validation'
import { postLoginPath } from '@/router/guards'
import { PATHS } from '@/router/paths'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ pin: '' })
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() => session.login(form.pin))

onMounted(async () => {
  try {
    // Belum ada PIN (pemasangan baru, atau baru direset): buat dulu.
    if (!(await pinStatus()).pinSet) await router.replace(PATHS.setupPin)
  } catch {
    // Server tidak terjangkau: biarkan form tampil; pesan muncul saat mencoba masuk.
  }
})

async function onSubmit(): Promise<void> {
  const result = await submit(collectErrors(form, { pin: pinRules('PIN') }))
  if (result.ok) await router.replace(postLoginPath(route.query.redirect))
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <h1 class="text-lg font-semibold">Masuk</h1>
    <FormAlert :message="formError" />
    <PinField id="pin" v-model="form.pin" label="PIN" autocomplete="current-password" :error="fieldErrors.pin" />
    <Button type="submit" label="Masuk" :loading="submitting" :disabled="submitting" fluid />
  </form>
</template>
```

Add a test to `pin-views.spec.ts` for the redirect to `/buat-pin`:

```ts
  it('opens "Buat PIN" when no PIN exists yet', async () => {
    vi.mocked(authApi.pinStatus).mockResolvedValue({ pinSet: false })
    const { router } = await mountView(PinLoginView, { path: '/masuk' })
    expect(router.currentRoute.value.path).toBe('/buat-pin')
  })
```

and in the other `PinLoginView` tests set `vi.mocked(authApi.pinStatus).mockResolvedValue({ pinSet: true })` first.

`apps/web/src/views/settings/SettingsView.vue`:

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import FormAlert from '@/components/FormAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import PinField from '@/components/PinField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useNotify } from '@/composables/useNotify'
import { pinRules } from '@/lib/pin'
import { collectErrors } from '@/lib/validation'
import { PATHS } from '@/router/paths'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const notify = useNotify()

const blank = () => ({ currentPin: '', newPin: '', newPinConfirm: '' })
const form = reactive(blank())
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() =>
  session.changePin(form.currentPin, form.newPin),
)

async function onSubmit(): Promise<void> {
  const errors = collectErrors(form, { currentPin: pinRules('PIN saat ini'), newPin: pinRules('PIN baru') })
  if (!errors.newPin && form.newPinConfirm !== form.newPin) errors.newPinConfirm = 'PIN tidak sama'
  const result = await submit(errors)
  if (result.ok) {
    Object.assign(form, blank())
    notify.success('PIN diganti. Perangkat lain sudah dikeluarkan.')
  }
}
</script>

<template>
  <PageHeader title="Pengaturan" />

  <div class="grid gap-6 lg:grid-cols-2">
    <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
      <h2 class="mb-3 text-lg font-semibold">Ganti PIN</h2>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
        <FormAlert :message="formError" />
        <PinField
          id="current-pin"
          v-model="form.currentPin"
          label="PIN saat ini"
          autocomplete="current-password"
          :error="fieldErrors.currentPin"
        />
        <PinField id="new-pin" v-model="form.newPin" label="PIN baru" autocomplete="new-password" :error="fieldErrors.newPin" />
        <PinField
          id="new-pin-confirm"
          v-model="form.newPinConfirm"
          label="Ulangi PIN baru"
          autocomplete="new-password"
          :error="fieldErrors.newPinConfirm"
        />
        <Button type="submit" label="Simpan PIN" :loading="submitting" :disabled="submitting" class="self-start" />
      </form>
    </section>

    <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
      <h2 class="mb-3 text-lg font-semibold">Riwayat perubahan</h2>
      <p class="mb-3 text-sm text-surface-600">Semua perubahan data dan setiap kali masuk tercatat di log audit.</p>
      <RouterLink :to="PATHS.auditLog" class="font-medium text-primary-700 hover:underline">Buka log audit</RouterLink>
    </section>
  </div>
</template>
```

`apps/web/src/test/session.ts`:

```ts
import type { AuthUser } from '@/api/types'
import { useSessionStore } from '@/stores/session'

/** Menandai pemilik sebagai sedang masuk, tanpa melewati API. Panggil setelah `freshPinia()`. */
export function signIn(overrides: Partial<AuthUser> = {}): AuthUser {
  const user: AuthUser = { id: 'u-owner', name: 'Pemilik', ...overrides }
  useSessionStore().user = user
  return user
}
```

Replace every `signInAs('…')` call in the web specs with `signIn()` and delete cases that compared roles (`grep -rl signInAs src`).

`apps/web/src/layouts/AppLayout.vue`: the menu is `menu()`; delete the user name / role label block (keep the "Keluar" button); delete the `roleLabel` import.

`apps/web/src/lib/labels.ts`: delete the role label set (`roleLabel`, `ROLE_OPTIONS`); transaction status labels become `{ APPROVED: 'Tercatat', VOID: 'Dibatalkan' }` with severities `{ APPROVED: 'success', VOID: 'secondary' }`; add audit action labels `PIN_SETUP: 'PIN dibuat'`, `PIN_CHANGE: 'PIN diganti'`, `PIN_RESET: 'PIN direset'`, `LOGIN_LOCKED: 'Masuk ditolak (PIN dikunci)'`, and remove the labels of removed actions (`CHANGE_PASSWORD`, `RESET_PASSWORD`, `SET_MEMBERS`, `RESUBMIT`, `CANCEL`, `APPROVE`, `REJECT`). The label sets are open, so old rows still render their raw action name.

`apps/web/src/views/master-data/*` and `apps/web/src/views/transactions/TransactionDetailView.vue`: delete any remaining `isAdmin` / `role` checks (the owner can do everything that `permissions` allows).

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run lint` — Expected: 0 errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): PIN screens and settings; no roles or users"
```

---

## Task 7: "Catat pengeluaran" on the dashboard (web)

**Files:**
- Modify: `apps/web/src/views/dashboard/DashboardView.vue`, `apps/web/src/views/dashboard/__tests__/dashboard.spec.ts`

**Interfaces:**
- Consumes: `TransactionFormDialog` (`transaction: null`, `options`, `v-model:visible`, emits `saved`), `useTransactionOptions()`, `useAsyncData`'s `reload`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/views/dashboard/__tests__/dashboard.spec.ts` (mock `@/api/accounts`, `@/api/categories` and `@/api/transactions` at the top if the file does not already, resolving the options to one active account and one OUT category):

```ts
describe('DashboardView: recording an expense', () => {
  it('opens the transaction form with "Pengeluaran" chosen and reloads the figures after saving', async () => {
    const { wrapper } = await mountDashboard()
    vi.mocked(reportsApi.getCompanyDashboard).mockClear()

    await wrapper.get('[data-testid="record-expense"]').trigger('click')
    await flushPromises()
    const form = wrapper.findComponent(TransactionFormDialog)
    expect(form.props('visible')).toBe(true)
    expect(form.props('transaction')).toBeNull()
    expect((document.querySelector('#tx-type') as HTMLElement).textContent).toContain('Pengeluaran')

    form.vm.$emit('saved', makeTransaction())
    await flushPromises()
    expect(reportsApi.getCompanyDashboard).toHaveBeenCalledTimes(1)
  })

  it('changes nothing when the form is closed without saving', async () => {
    const { wrapper } = await mountDashboard()
    vi.mocked(reportsApi.getCompanyDashboard).mockClear()

    await wrapper.get('[data-testid="record-expense"]').trigger('click')
    wrapper.findComponent(TransactionFormDialog).vm.$emit('update:visible', false)
    await flushPromises()
    expect(reportsApi.getCompanyDashboard).not.toHaveBeenCalled()
  })
})
```

(`mountDashboard` is the file's existing helper; if the type option label is not "Pengeluaran", use the label `TX_TYPE_OPTIONS` gives `OUT`.)

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/web && npx vitest run src/views/dashboard`
Expected: FAIL — no `[data-testid="record-expense"]`.

- [ ] **Step 3: Implement**

In `DashboardView.vue`:

```ts
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import TransactionFormDialog from '@/views/transactions/TransactionFormDialog.vue'

const options = useTransactionOptions()
const recording = ref(false)
```

Replace `<PageHeader title="Dashboard" />` with:

```vue
  <PageHeader title="Dashboard">
    <template #actions>
      <Button
        label="Catat pengeluaran"
        icon="pi pi-plus"
        data-testid="record-expense"
        @click="recording = true"
      />
    </template>
  </PageHeader>
```

and add after the main template block (inside the root):

```vue
  <TransactionFormDialog
    v-model:visible="recording"
    :transaction="null"
    :options="options"
    @saved="reload"
  />
```

The form's blank type is already `'OUT'`, so "Pengeluaran" is preselected and can still be changed. If `useTransactionOptions` loads on creation, nothing else is needed; if it exposes a `load()` that the transactions page calls on open, call it in the button's click handler before setting `recording`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/web && npx vitest run src/views/dashboard` — Expected: PASS.
Run: `npm run lint -w web` — Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/dashboard
git commit -m "feat(web): record an expense from the dashboard"
```

---

## Task 8: Browser tests, deployment and docs

**Files:**
- Modify: `apps/web/e2e/{env,helpers,api,global-setup,auth.spec,dashboard.spec,export-audit.spec,master-data.spec,transactions.spec}.ts`
- Modify: `deploy/env.example`, `docker-compose.prod.yml`, `deploy/smoke.sh`, `deploy/smoke-browser.mjs`, `docs/deployment.md`, `docs/backup-restore.md`, `docs/security-checklist.md`, `docs/decisions.md`, `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `OWNER = { pin: '135792' }` in `e2e/env.ts`; `signIn(page)` in `e2e/helpers.ts`.

- [ ] **Step 1: Update the browser tests (they fail first)**

1. `e2e/env.ts`: replace `ADMIN` with `export const OWNER = { pin: '135792', newPin: '246810' }` and drop `SEED_ADMIN_*` from `apiEnv`.
2. `e2e/helpers.ts`:

```ts
import { expect, type Locator, type Page } from '@playwright/test'
import { OWNER } from './env'

/** Masuk dengan PIN; pada database baru, PIN dibuat dulu. */
export async function signIn(page: Page, pin: string = OWNER.pin): Promise<void> {
  await page.goto('/masuk')
  await page.waitForURL(/\/(masuk|buat-pin)$/)
  if (page.url().endsWith('/buat-pin')) {
    await page.getByLabel('PIN', { exact: true }).fill(pin)
    await page.getByLabel('Ulangi PIN').fill(pin)
    await page.getByRole('button', { name: 'Simpan PIN' }).click()
  } else {
    await page.getByLabel('PIN', { exact: true }).fill(pin)
    await page.getByRole('button', { name: 'Masuk' }).click()
  }
  await page.waitForURL((url) => !/\/(masuk|buat-pin)$/.test(url.pathname))
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page).toHaveURL(/\/masuk/)
}

export function sidebarLinks(page: Page): Locator {
  return page.getByTestId('sidebar').getByRole('link')
}

export async function openFromMenu(page: Page, label: string): Promise<void> {
  await sidebarLinks(page).filter({ hasText: label }).click()
}
```

3. `e2e/api.ts`: the API helper used to prepare data signs in with `POST /auth/login { pin: OWNER.pin }` (after `POST /auth/setup-pin` when `GET /auth/pin-status` says `pinSet: false`).
4. `e2e/auth.spec.ts`: one flow: first visit opens "Buat PIN"; create the PIN; the sidebar shows Dashboard, Transaksi, Master data, Pengaturan; sign out; a wrong PIN shows "PIN salah"; the right PIN opens the dashboard; Pengaturan changes the PIN to `OWNER.newPin` and back to `OWNER.pin` (so later files still sign in with `OWNER.pin`).
5. `e2e/dashboard.spec.ts`: remove the coordinator and project-summary steps and the `contractValue` / project setup; add a step: click "Catat pengeluaran", fill amount `50000`, account, category and description, save, and see "Keluar" on the dashboard grow by `Rp 50.000`.
6. `e2e/master-data.spec.ts`: remove the user-creation and project steps.
7. `e2e/transactions.spec.ts` and `e2e/export-audit.spec.ts`: remove approval, coordinator and staff steps; a recorded transaction can be voided and shows "Dibatalkan".
8. `scripts/e2e-prepare.ts` (API) already seeds without options (Task 5).

Run (throwaway database running): `cd apps/web && npm run test:browser`
Expected before the fixes in the specs are complete: FAIL; after: all pass.

- [ ] **Step 2: Update deployment**

1. `deploy/env.example`: delete the "Admin pertama" block (`SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`); change the `LOGIN_RATE_LIMIT` comment to `# Percobaan PIN per alamat pengunjung per menit (di atas jeda 15 menit setelah 5 PIN salah).`
2. `docker-compose.prod.yml`: remove the three `SEED_ADMIN_*` lines from `migrate`'s environment.
3. `deploy/smoke.sh`:
   - remove `SEED_ADMIN_*` from the generated env file and from the "required variables" check list;
   - the login section becomes: `GET /api/v1/auth/pin-status` answers `{"pinSet":false}`; `POST /api/v1/auth/setup-pin` with `{"pin":"135792"}` answers 201 and a session; a second `setup-pin` answers 409; `POST /api/v1/auth/login` with the PIN answers 200; with `999999` answers 401;
   - the rate-limit check sends wrong PINs instead of wrong passwords and still expects the throttler's 429 per visitor;
   - add a check: `docker compose ... run --rm api npm run reset-pin` prints "PIN direset", after which `pin-status` answers `{"pinSet":false}` and the old refresh cookie is refused (401);
   - every later request that needed an admin session uses the PIN session.
4. `deploy/smoke-browser.mjs`: sign in through "Buat PIN" / "Masuk" with the PIN (the CSP check is unchanged).

Run: `npm run deploy:smoke` (in the background; do not edit `deploy/smoke.sh` while it runs).
Expected: `UJI ASAP BERHASIL` with the new check count, nothing left behind (`docker ps -a | grep cashflow-smoke` empty).

- [ ] **Step 3: Update the docs**

1. `docs/deployment.md`:
   - Langkah 3 table: delete the `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` rows and the sentence about `SEED_ADMIN_NAME`.
   - Langkah 5 "Login pertama" becomes "Pertama kali": open the address, create a PIN (6 to 12 digits, typed twice), then adjust the default accounts and categories in Master data.
   - New section "Lupa PIN": `deploy/dc run --rm api npm run reset-pin`, then open the app and create a new PIN; data is untouched; all devices are signed out.
   - Troubleshooting: replace the `SEED_ADMIN_PASSWORD` cause for `migrate` failing; add "Masuk ditolak: PIN dikunci" → wait 15 minutes, or reset the PIN.
   - The "Terakhir diverifikasi" section: today's date and the new smoke check count.
2. `docs/backup-restore.md` and `README.md`: remove the admin email/password mentions; README's commands table gets a "Lupa PIN" row with `deploy/dc run --rm api npm run reset-pin`.
3. `docs/security-checklist.md`: replace the password and role items with: PIN 6 to 12 digits, argon2; 5 wrong PINs pause entry for 15 minutes for everyone, stored in the database; per-visitor rate limit still applies; sessions 30 days, rotated, ended on PIN change and reset; PIN never logged.
4. `docs/decisions.md`: add a section `## Edisi pribadi (P1)` with:
   - **Branch `personal-edition` menghapus proyek, persetujuan, pengguna, dan peran**; database baru, migrasi menolak berjalan pada data perusahaan.
   - **Satu baris pemilik di tabel `users`** supaya sesi, transaksi, bukti, dan log audit tetap menunjuk ke pengguna.
   - **PIN 6 sampai 12 angka, jeda 15 menit setelah 5 salah untuk semua pengunjung**, disimpan di database; batas per pengunjung tetap berlaku.
   - **Transaksi yang tercatat boleh diubah**; pembatalan lewat VOID. Bukti tidak lagi wajib.
   - **Akun dan kategori awal diganti untuk keperluan pribadi** (Dompet, Rekening Bank; Gaji, Bonus, Makan & Minum, …).
   - **Lupa PIN lewat perintah server `reset-pin`**, bukan lewat aplikasi, supaya tidak ada jalan masuk tanpa PIN.

- [ ] **Step 4: Full verification**

Run (throwaway database running):
- `npm run lint` — Expected: 0 errors.
- `npm test` — Expected: all pass.
- `npm run test:e2e -w api` — Expected: all pass.
- `cd apps/web && npm run test:browser` — Expected: all pass.
- `npm run deploy:smoke` — Expected: `UJI ASAP BERHASIL`.
- `grep -rn -i "project\|SUPER_ADMIN\|PROJECT_MANAGER\|STAFF\|PENDING\|REJECTED\|must_change\|SEED_ADMIN" apps/api/src apps/web/src deploy docker-compose.prod.yml` — Expected: no matches (generated Prisma client excluded).

Then `docker rm -f cashflow-e2e-tmp` and `graphify update .`.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/e2e apps/api/scripts deploy docker-compose.prod.yml docs README.md
git commit -m "chore: browser tests, deployment and docs for the personal edition"
```
