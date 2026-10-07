# Fase 4a: Dashboard and Project Summary API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two read-only endpoints that turn approved transactions into the numbers of section 9 of the base document: the company dashboard for the admin and the summary of one project for those who may see it.

**Architecture:** One `CashflowReportService` owns every aggregation (totals by type, expense by category, monthly cash flow, overhead versus project) as database queries (`groupBy` or SQL `GROUP BY`), never by loading rows. It takes a filter and is used by both endpoints, so "what counts" is defined once: status `APPROVED`, and for company figures no transfer legs. The dashboard reuses `AccountBalanceService` for balances and the transaction mapper for the recent list; the project summary reuses `ProjectAccessService` for scoping. A pure module resolves and validates the reporting period.

**Tech Stack:** NestJS 12 (ESM), Prisma 7 with PostgreSQL 16, Vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` (section 5: scoping, dates) and base document `implementation-plan-cashflow-mvp.md` (sections 8, 9 and 11 Fase 4). Decisions so far: `docs/decisions.md`.

## Global Constraints

- Money is `bigint` in code and a digit string in JSON (a leading `-` for negative results such as a net outflow). Never a JS `number`. A percentage is not money and is a `number`.
- Only `APPROVED` transactions count. Company income, expense and monthly figures exclude transfer legs (`transfer_group_id IS NOT NULL`). Account balances include them, as they already do.
- Aggregation happens in the database. No endpoint loads transaction rows to add them up; the only rows read are the ten recent transactions.
- `transaction_date` is a calendar date. Periods are inclusive on both ends and months are grouped on that column with no time zone conversion. "Today" and "this month" are Asia/Jakarta.
- Project scoping goes through `ProjectAccessService`; a project out of reach answers 404, the same as one that does not exist.
- Both endpoints are read-only: no audit rows, no writes.
- Prisma fields are `snake_case`; JSON is `camelCase`, mapped in the response. Relative imports end in `.js`. Schema changes only through a Prisma migration; index names follow `idx_<table>_<columns>`.
- Error format `{ statusCode, message, errors? }` with Indonesian messages.
- Do not write `apps/api/dist`; verify with `npm run lint -w api` and the e2e suite.
- Out of scope: the web pages and charts (Fase 4b), export (Fase 5), balances as of a past date.

## Review Focus

- **Edges of the period:** a transaction dated exactly on `from` or on `to` is counted; one a day outside is not; a transaction on the 1st or the last day of a month lands in that month, whatever the server's time zone. Pinned in Tasks 1 and 2.
- **Things that must never be counted:** pending, rejected and void transactions, and both legs of a transfer (also after the transfer is voided), in every figure except the account balances. Pinned in Task 2.
- **Nothing to report:** an empty database, a period with no transactions, a project with a contract value of zero or with no transactions. Every amount is `"0"`, lists are empty or zero-filled, the percentage is `null`, and nothing divides by zero. Pinned in Tasks 2 and 3.
- **Large sums:** totals above 2^53 rupiah come back exact. Pinned in Task 2.
- **Asking for what is not yours, or asking badly:** a project manager requesting an unassigned project's summary (404), staff requesting any summary or the dashboard (403), a malformed id (400), `from` after `to`, a malformed date, or a range longer than the limit (400 with the field named). Pinned in Tasks 2 and 3.

## File Structure

```
apps/api/src/reports/
├─ report-period.ts            resolvePeriod, monthsInPeriod (pure) + spec
├─ dto/period-query.dto.ts     from?, to?
├─ cashflow-report.service.ts  the aggregations
├─ report.mapper.ts            response types and mapping
├─ dashboard.service.ts        composes the company dashboard
├─ dashboard.controller.ts     GET /dashboard/company
├─ project-summary.service.ts  composes one project's summary
└─ reports.module.ts
apps/api/src/projects/projects.controller.ts   (modify) GET /projects/:id/summary
apps/api/prisma/migrations/<timestamp>_report_indexes/migration.sql
apps/api/test/
├─ report-fixtures.ts          a small ledger with hand-computed expectations
├─ dashboard.e2e-spec.ts
├─ project-summary.e2e-spec.ts
└─ report-scale.e2e-spec.ts    10,000 transactions
```

## Shared interfaces

```ts
// reports/report-period.ts
export const MAX_PERIOD_MONTHS = 60;
export interface Period { from: string; to: string }                 // YYYY-MM-DD, inclusive
/** Defaults: `to` = today (Jakarta); `from` = first day of the month eleven months before `to`'s month. */
export function resolvePeriod(query: { from?: string; to?: string }, today: string): Period;   // throws validationFailed
export function monthsInPeriod(period: Period): string[];            // ['2025-11', ..., '2026-10']

// reports/cashflow-report.service.ts
export interface ReportFilter { period?: Period; projectId?: string; excludeTransfers?: boolean }
export interface TypeTotals { income: bigint; expense: bigint }
export interface CategoryTotal { categoryId: string; name: string; amount: bigint }
export interface MonthTotals { month: string; income: bigint; expense: bigint }
class CashflowReportService {
  totals(db: Db, filter: ReportFilter): Promise<TypeTotals>;
  expenseByCategory(db: Db, filter: ReportFilter): Promise<CategoryTotal[]>;   // largest first, then by name
  monthly(db: Db, period: Period): Promise<MonthTotals[]>;                     // one entry per month, zero-filled; no transfers
  expenseByScope(db: Db, period: Period): Promise<{ overhead: bigint; project: bigint }>;
}

// GET /dashboard/company?from=&to=      (SUPER_ADMIN)
interface CompanyDashboardResponse {
  period: Period;
  accounts: { id; name; type; isActive: boolean; balance: string }[];   // current balances, by name
  totalBalance: string;
  totals: { income: string; expense: string; net: string };
  monthly: { month: string; income: string; expense: string; net: string }[];
  expenseByCategory: { categoryId: string; name: string; amount: string }[];
  expenseByScope: { overhead: string; project: string };
  recentTransactions: TransactionResponse[];   // the 10 most recently recorded, any status
  pendingCount: number;                        // transactions waiting for review
}

// GET /projects/:id/summary             (SUPER_ADMIN; PROJECT_MANAGER for assigned projects)
interface ProjectSummaryResponse {
  projectId: string;
  contractValue: string;
  received: string;              // approved income of the project, all time
  outstanding: string;           // contractValue - received (negative when overpaid)
  receivedPercent: number | null;  // two decimals; null when contractValue is 0
  cost: string;                  // approved expense of the project, all time
  cashDifference: string;        // received - cost
  costByCategory: { categoryId: string; name: string; amount: string }[];
  pendingCount: number;          // this project's transactions waiting for review
}
```

---

### Task 1: Reporting period

**Files:** Create `reports/report-period.ts`, `reports/report-period.spec.ts`, `reports/dto/period-query.dto.ts`.

- [ ] **Step 1: Failing unit tests.**
  - `resolvePeriod({}, '2026-10-07')` → `{ from: '2025-11-01', to: '2026-10-07' }`; with today `2026-01-15` → from `2025-02-01`.
  - Only `from` given: `to` is today. Only `to` given (`2026-03-31`): `from` is `2025-04-01`. Both given: used as they are, including a single day (`from` = `to`).
  - `from` after `to` → validation error naming `from` with "Tanggal awal tidak boleh setelah tanggal akhir".
  - A period touching more than 60 calendar months → validation error naming `to` with "Rentang paling lama 60 bulan"; exactly 60 months is accepted.
  - `monthsInPeriod`: `2025-11-01..2026-10-07` → twelve entries from `2025-11` to `2026-10`; `2026-01-31..2026-02-01` → `['2026-01', '2026-02']`; a single day → one entry; a range across a year end is continuous.
  - The DTO accepts absent values and `YYYY-MM-DD`; refuses `2026-13-01`, `07-10-2026`, an empty string and `null` with the field named.
- [ ] **Step 2: Run** `npm test -w api`. Expected: fail (module missing).
- [ ] **Step 3: Implement** with string and integer arithmetic on year and month only; no `Date` in local time.
- [ ] **Step 4: Run** tests and `npm run lint -w api`. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add the reporting period`.

---

### Task 2: Company dashboard

**Files:** Create `reports/cashflow-report.service.ts`, `reports/report.mapper.ts`, `reports/dashboard.service.ts`, `reports/dashboard.controller.ts`, `reports/reports.module.ts`, `test/report-fixtures.ts`, `test/dashboard.e2e-spec.ts`. Modify `app.module.ts`, `test/routes.ts`.

- [ ] **Step 1: The fixture.** `seedReportLedger(ctx)` inserts, directly with Prisma, a ledger whose expected figures are written next to it as constants computed by hand (a comment shows the arithmetic): two accounts with opening balances, three expense categories and one income category, two projects, and approved transactions spread over three months that include one on the first day and one on the last day of a month, overhead and project expenses, plus one each of pending, rejected and void, and one transfer between the accounts.
- [ ] **Step 2: Failing e2e tests.**
  - Access: SUPER_ADMIN 200; PROJECT_MANAGER and STAFF 403; no token 401.
  - With the fixture and a period covering it: `accounts` lists both accounts with their current balances (opening balance, approved income and expense, and the transfer), sorted by name, and `totalBalance` is their sum; `totals`, `monthly`, `expenseByCategory` and `expenseByScope` equal the hand-computed constants; `net` is income minus expense and is negative (`"-…"`) in the month built to be so.
  - **Never counted:** changing the pending, rejected and void rows' amounts, and voiding the transfer, leave every figure except the balances unchanged; the transfer's amount appears in no total, month, category or scope.
  - **Edges:** a period of exactly one day returns only that day's transactions; moving `from` one day later drops the transaction dated on the old `from`; the transactions dated on the 1st and on the last day of a month are reported in that month.
  - `monthly` has one entry for every month of the period, in order, with `"0"` for months without transactions. Without `from` and `to` it has twelve entries ending in the current Jakarta month, and `period` echoes the resolved dates.
  - `expenseByCategory` is ordered by amount descending then name, includes a category that has since been deactivated, and never includes income or a system category.
  - `recentTransactions` has at most ten items, newest recorded first, in the same shape as the transaction list (including `permissions`); `pendingCount` counts every pending transaction regardless of the period.
  - **Nothing to report:** on an empty database every amount is `"0"`, `accounts` is `[]`, `monthly` is twelve zero entries, the lists are empty and `pendingCount` is 0.
  - **Large sums:** two approved incomes of `9007199254740993` total `"18014398509481986"` exactly.
  - **Asking badly:** `from` after `to`, `from=2026-13-01`, and a 61-month range each answer 400 with the field named.
- [ ] **Step 3: Run** `npm run test:e2e -w api -- test/dashboard.e2e-spec.ts`. Expected: fail (404).
- [ ] **Step 4: Implement.** `totals`, `expenseByCategory` and `expenseByScope` use `groupBy`; `monthly` uses one SQL query grouping on `to_char(transaction_date, 'YYYY-MM')` and is zero-filled from `monthsInPeriod`. The dashboard service runs its queries concurrently.
- [ ] **Step 5: Run** the spec, then lint. Expected: pass.
- [ ] **Step 6: Commit** `feat(api): add the company dashboard`.

---

### Task 3: Project summary

**Files:** Create `reports/project-summary.service.ts`, `test/project-summary.e2e-spec.ts`. Modify `projects/projects.controller.ts`, `projects/projects.module.ts` or `reports/reports.module.ts` (whichever avoids a circular import; record the choice), `reports/report.mapper.ts`.

- [ ] **Step 1: Failing e2e tests** (using the Task 2 fixture).
  - Access: SUPER_ADMIN 200 for any project; the assigned PROJECT_MANAGER 200; a PROJECT_MANAGER not assigned 404; STAFF 403; an unknown id 404; a malformed id 400. Removing the manager from the project turns their next request into 404.
  - Figures for the fixture's first project equal the hand-computed constants: `contractValue`, `received`, `outstanding`, `receivedPercent` (two decimals), `cost`, `cashDifference`, and `costByCategory` ordered by amount descending then name.
  - Only approved transactions of **this** project count: the other project's, overhead, pending, rejected and void ones do not. `pendingCount` counts this project's pending transactions only.
  - `outstanding` is negative when more was received than the contract value, and `receivedPercent` then exceeds 100. `cashDifference` is negative when cost exceeds what was received.
  - **Nothing to report:** a project with contract value 0 has `receivedPercent: null`; a project with no transactions has `"0"` amounts, an empty `costByCategory`, and `outstanding` equal to the contract value.
  - A completed or cancelled project still has a summary.
- [ ] **Step 2: Run.** Expected: fail (404 for the route).
- [ ] **Step 3: Implement.** The percentage is computed from `bigint` basis points (`received * 10000n / contractValue`) and converted to a number only at the end.
- [ ] **Step 4: Run** the spec, then lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add the project summary`.

---

### Task 4: Indexes, scale and documentation

**Files:** Create `test/report-scale.e2e-spec.ts` and a migration. Modify `prisma/schema.prisma`, `test/schema.e2e-spec.ts` if it lists indexes, `docs/decisions.md`.

- [ ] **Step 1: Failing test.** Insert 10,000 transactions with `createMany` (deterministic amounts, dates spread over 24 months, a mix of statuses, types, categories, projects and overhead) while adding up the expected approved totals in the generator. Then: the dashboard for the full range and one project's summary each answer within 1,500 ms, and their `totals`, twelve-or-more `monthly` entries and the project's `received` and `cost` equal the generator's sums. The schema test expects an index `idx_transactions_status_transaction_date`.
- [ ] **Step 2: Run.** Expected: the index assertion fails.
- [ ] **Step 3: Implement.** Add `@@index([status, transaction_date], map: "idx_transactions_status_transaction_date")` and create the migration with `prisma migrate dev --name report_indexes` against the development database. Look at `EXPLAIN` for the monthly query on the 10,000-row data and note in `docs/decisions.md` which index it uses.
- [ ] **Step 4: Run** the full suite: `npm run lint && npm test && npm run test:e2e`. Expected: pass.
- [ ] **Step 5: Document** this phase's rulings in `docs/decisions.md`.
- [ ] **Step 6: Commit** `feat(api): index and scale-test the reports`.

---

## Fase 4a acceptance

- [ ] A project manager can open only the summaries of assigned projects, and dashboard figures match the hand computation on the fixture (base document, Fase 4 exit criteria).
- [ ] Both endpoints answer within 1,500 ms on 10,000 transactions.
- [ ] `npm run lint`, `npm test` and `npm run test:e2e` pass.
