# Fase 4b: Dashboard and Project Summary Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Fase 4a figures on screen: the company dashboard as the admin's landing page, and a summary tab on the project page for the admin and the project's manager.

**Architecture:** Two thin views over one typed API module (`api/reports.ts`). The figures are drawn with three small presentational components built here and used by both views: `StatCard` (one labelled amount), `BarList` (ranked amounts with proportional bars) and `MonthlyCashflowChart` (income and expense bars per month). Charts are plain HTML and CSS, not a canvas: every number is real text a screen reader and a test can read, bar sizes are computed with `BigInt` so no amount is ever turned into a JS number, and no chart library is added. Loading and failure follow the existing `useAsyncData` pattern.

**Tech Stack:** Vue 3.5 (`<script setup>`, TypeScript), Vue Router 5, Pinia 4, PrimeVue 4.5.5, Tailwind 4, Vitest + @vue/test-utils, Playwright.

**Spec:** base document `implementation-plan-cashflow-mvp.md` (sections 9, 10 and 11 Fase 4). API contract: `docs/superpowers/plans/2026-10-07-fase-4a-dashboard-api.md`, `apps/api/src/reports/report.mapper.ts` and `docs/decisions.md` (Fase 4a).

## Global Constraints

- Money is a string of digits (a leading `-` for negative) in every API call and in component state. Never convert it to a JS `number`, not even to size a bar; proportions are computed with `BigInt`. Display as `Rp 1.250.000` and `-Rp 500.000`.
- Dates display as `dd MMM yyyy`; months as `MMM yyyy` (`Okt 2026`). Calendar dates and months travel as `YYYY-MM-DD` and `YYYY-MM` strings with no time zone conversion.
- All user-facing text is Indonesian.
- The web shows what the API returns. It does not recompute totals, balances or percentages; the only arithmetic is proportions for drawing.
- A negative amount (net outflow, negative balance, overpaid contract, negative cash difference) is always shown with its minus sign and in red; colour is never the only signal.
- Reuse over repetition: the dashboard and the project summary share `StatCard` and `BarList`; nothing is copied between the two views.
- Usable at 360 px width: no horizontal page scroll; the monthly chart scrolls inside its own container if it must.
- PrimeVue stays at `4.5.5`. No new dependencies.
- Every API call goes through `src/api/http.ts`. The API is not changed in this phase; a defect found there is fixed test-first in the API e2e suite.
- Out of scope: export, audit log page (Fase 5); balances as of a past date; drill-down from a chart bar.

## Review Focus

- **Nothing to show:** a period with no transactions, a new company with no accounts, a project with no transactions or a contract value of 0. Cards read `Rp 0`, charts show a short "belum ada data" line instead of empty axes, the percentage shows `-`, and nothing renders `NaN`, `Infinity` or a full-width bar for zero. Pinned in Tasks 1, 2 and 5.
- **Negative and lopsided figures:** a month with only expenses, a net outflow, an account below zero, a contract that was overpaid (more than 100%), one category dwarfing the rest. Signs and colours are right, bars never exceed their track, and a tiny non-zero amount still gets a visible sliver. Pinned in Tasks 1, 2 and 5.
- **Very large amounts:** totals above 2^53 are labelled exactly and their bars keep the right proportions. Pinned in Task 1.
- **Changing the period carelessly:** a start after the end, a range longer than 60 months, clicking presets quickly. The message appears under the offending field (the API names it), the last good figures stay on screen, and only the answer to the latest request is shown. Pinned in Task 3.
- **Part of the page failing:** the summary request fails or the project manager is removed from the project while the page is open. The summary tab shows its own error with a retry; the rest of the project page keeps working; a 404 follows the page's existing "Proyek tidak ditemukan" behaviour on reload. Pinned in Task 5.

## File Structure

```
apps/web/src/
├─ api/
│  ├─ types.ts                     (modify) dashboard and summary types
│  └─ reports.ts                   getCompanyDashboard, getProjectSummary
├─ lib/
│  ├─ shares.ts                    shareOf, largest (BigInt proportions)
│  ├─ format.ts                    (modify) formatMonth
│  └─ periods.ts                   period presets for the dashboard
├─ components/
│  ├─ StatCard.vue                 label, amount, optional hint; red when negative
│  ├─ BarList.vue                  ranked list: name, amount, share bar
│  ├─ MonthlyCashflowChart.vue     income and expense bars per month, net below
│  └─ MoneyText.vue                an amount with sign and red when negative
├─ views/dashboard/
│  ├─ DashboardView.vue
│  ├─ PeriodPicker.vue             presets plus two dates
│  └─ RecentTransactions.vue       compact list of the ten latest
├─ views/projects/
│  ├─ ProjectSummaryPanel.vue
│  └─ ProjectDetailView.vue        (modify) Ringkasan tab first
├─ views/transactions/TransactionsView.vue   (modify) honour ?status= on arrival
└─ router/routes.ts                (modify) /dashboard
apps/web/e2e/dashboard.spec.ts
```

## Shared interfaces

```ts
// api/types.ts  (field names copied from apps/api/src/reports/report.mapper.ts; the mapper wins)
export interface Period { from: string; to: string }
export interface Cashflow { income: string; expense: string; net: string }
export interface CategoryAmount { categoryId: string; name: string; amount: string }
export interface CompanyDashboard {
  period: Period;
  accounts: { id; name; type: AccountType; isActive: boolean; balance: string }[];
  totalBalance: string;
  totals: Cashflow;
  monthly: (Cashflow & { month: string })[];
  expenseByCategory: CategoryAmount[];
  expenseByScope: { overhead: string; project: string };
  recentTransactions: Transaction[];
  pendingCount: number;
}
export interface ProjectSummary {
  projectId; contractValue; received; outstanding: string; receivedPercent: number | null;
  cost; cashDifference: string; costByCategory: CategoryAmount[]; pendingCount: number;
}

// api/reports.ts
export function getCompanyDashboard(period?: Partial<Period>): Promise<CompanyDashboard>;   // GET /dashboard/company
export function getProjectSummary(projectId: string): Promise<ProjectSummary>;              // GET /projects/:id/summary

// lib/shares.ts
/** Part of a whole as a percentage 0..100 for drawing; BigInt inside. 0 when the whole is 0 or the part is not positive; at least `min` (default 1) when the part is positive; never above 100. */
export function shareOf(part: string, whole: string, min?: number): number;
/** The largest of several digit strings, as a digit string ('0' for none). */
export function largest(amounts: string[]): string;

// lib/format.ts
export function formatMonth(month: string): string;          // '2026-10' -> 'Okt 2026'; '-' when malformed

// lib/periods.ts
export interface PeriodPreset { id: 'last12' | 'thisMonth' | 'thisYear'; label: string; range(today: string): Partial<Period> }
export const PERIOD_PRESETS: PeriodPreset[];                  // last12 sends no dates (the API default)

// components
MoneyText:   props: amount: string; signed?: boolean ('+' for positive)        // red and '-' when negative
StatCard:    props: label: string; amount: string; hint?: string; tone?: 'plain' | 'income' | 'expense'
BarList:     props: items: { id: string; name: string; amount: string }[]; emptyText: string; tone?: 'expense' | 'neutral'
MonthlyCashflowChart: props: months: (Cashflow & { month: string })[]
PeriodPicker: v-model: Partial<Period>; props: resolved: Period | null; errors: Record<string, string>
```

Routes: `/dashboard` becomes the real page (SUPER_ADMIN). `/transaksi?status=PENDING` opens the list with that status filter set.

---

### Task 1: Report API module and the shared display pieces

**Files:** Modify `api/types.ts`, `lib/format.ts`. Create `api/reports.ts`, `lib/shares.ts`, `components/MoneyText.vue`, `components/StatCard.vue`, `components/BarList.vue`, and specs `api/__tests__/reports.spec.ts`, `lib/__tests__/shares.spec.ts`, `components/__tests__/report-display.spec.ts`; extend `lib/__tests__/format.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - `getCompanyDashboard()` calls `GET /dashboard/company` with no query; with `{ from, to }` it passes both; with only one, only that one. `getProjectSummary('p1')` calls `GET /projects/p1/summary`.
  - `shareOf`: `('50', '200')` → 25; `('200', '200')` → 100; `('300', '200')` → 100 (never above); `('0', '200')`, `('-5', '200')` and `('5', '0')` → 0; `('1', '1000000')` → 1 (the minimum sliver); with `min` 0 → 0; `('9007199254740993', '18014398509481986')` → 50 exactly; malformed input → 0.
  - `largest`: `['5', '40', '7']` → `'40'`; with values above 2^53 picks the right one; `[]` → `'0'`; ignores negatives when a positive exists.
  - `formatMonth`: `'2026-10'` → `Okt 2026`; `'2026-01'` → `Jan 2026`; `'2026-13'`, `''`, `null` → `-`.
  - `MoneyText`: `'1250000'` → `Rp 1.250.000`, not red; `'-500000'` → `-Rp 500.000`, red; `'0'` → `Rp 0`, not red; with `signed`, `'500000'` → `+Rp 500.000`.
  - `StatCard`: shows label, amount and hint; a negative amount is red whatever the tone; tone `income` is green and `expense` red for positive amounts.
  - `BarList`: lists items in the given order with name, amount and a bar whose width is its share of the **largest** item; the largest is 100%; a tiny item still has a visible bar; an item of `'0'` has no bar; each bar has an accessible text alternative ("40% dari yang terbesar" is not needed; the amount text suffices and the bar is `aria-hidden`); with no items it shows `emptyText`; amounts above 2^53 are labelled exactly.
- [ ] **Step 2: Run** `npm test -w web`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add report API module and display pieces`.

---

### Task 2: Monthly cash flow chart

**Files:** Create `components/MonthlyCashflowChart.vue` and spec `components/__tests__/MonthlyCashflowChart.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - One column per month, in the given order, labelled `Agu 2026` etc.; each has an income bar and an expense bar whose heights are their share of the largest single income or expense value in the whole chart; the largest bar is 100%.
  - Each column states its figures as text for assistive technology and on hover/focus: "Agu 2026: masuk Rp 30.000.000, keluar Rp 17.000.000, selisih Rp 13.000.000"; the net is shown under the column, red with a minus sign when negative.
  - A month with only expenses has no income bar; a month of zeros has neither bar but keeps its label, so the axis stays continuous.
  - When every month is zero the chart shows "Belum ada transaksi yang disetujui pada periode ini" instead of the columns.
  - With 24 months the columns keep a minimum width and the chart scrolls sideways inside its own container.
  - The chart is a list (`role="list"`) with a legend "Masuk" and "Keluar" that does not rely on colour alone.
  - Values above 2^53 give exact labels and proportional bars.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** with `shareOf` and `largest`.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add monthly cash flow chart`.

---

### Task 3: Company dashboard page

**Files:** Create `views/dashboard/DashboardView.vue`, `PeriodPicker.vue`, `RecentTransactions.vue`, `lib/periods.ts` and specs. Modify `router/routes.ts`.

- [ ] **Step 1: Failing tests.**
  - Routing: `/dashboard` renders the dashboard for SUPER_ADMIN (other roles are already redirected by the guard).
  - On arrival it requests the dashboard with no dates and shows: the period it covers ("01 Nov 2025 – 07 Okt 2026", from the response); cards for Total saldo, Masuk, Keluar and Selisih; each account with its balance (negative in red, inactive accounts marked "Nonaktif"); the monthly chart; expense by category as a `BarList`; overhead versus project as two amounts with their shares; the count waiting for review; and the recent transactions.
  - The waiting count links to `/transaksi?status=PENDING`; with a count of 0 it reads "Tidak ada transaksi yang menunggu" and is not a link.
  - `RecentTransactions`: each row shows date, description (linked to `/transaksi/<id>`), project or "Overhead" or "Transfer", the signed amount (muted when not approved) and the status tag; with none it reads "Belum ada transaksi".
  - `lib/periods`: with today `2026-10-07`, `thisMonth` → `2026-10-01..2026-10-07`, `thisYear` → `2026-01-01..2026-10-07`, `last12` → `{}`.
  - `PeriodPicker`: three preset buttons and two labelled date fields ("Dari tanggal", "Sampai tanggal") showing the resolved period; choosing a preset or a date emits the new period; the active preset is marked.
  - Changing the period requests the dashboard with those dates and replaces the figures. While the request runs the old figures stay visible with a loading indication.
  - **Careless periods:** a start after the end is caught in the browser with the message under "Dari tanggal" and sends nothing; an API 400 naming `to` ("Rentang paling lama 60 bulan") appears under "Sampai tanggal" and the previous figures stay; correcting the dates clears the message.
  - **Latest answer wins:** two period changes in quick succession where the first answer arrives last leave the second period's figures on screen.
  - A failed first load shows the error state with retry; an empty company shows `Rp 0` cards, "Belum ada akun", and the charts' empty lines.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** on `useAsyncData`, `StatCard`, `BarList`, `MonthlyCashflowChart`, `MoneyText`, `SignedAmount`, `TransactionStatusTag`.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add company dashboard`.

---

### Task 4: Open the transaction list on a status

**Files:** Modify `views/transactions/TransactionsView.vue`, `TransactionFilters.vue` and `views/transactions/__tests__/list.spec.ts`.

- [ ] **Step 1: Failing tests.** Opening `/transaksi?status=PENDING` sends `status=PENDING` on the first request and shows "Menunggu" selected in the status filter; an unknown value (`?status=apa`) is ignored; Reset clears it; without the query the list behaves as before and makes one request, not two.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** The view reads the query once on arrival and seeds its filters.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): open the transaction list on a status`.

---

### Task 5: Project summary tab

**Files:** Create `views/projects/ProjectSummaryPanel.vue` and spec. Modify `views/projects/ProjectDetailView.vue` and its specs.

- [ ] **Step 1: Failing tests.**
  - The project page's tabs are Ringkasan, Transaksi, Anggota, with Ringkasan shown first.
  - `ProjectSummaryPanel` requests `GET /projects/:id/summary` and shows cards for Nilai kontrak, Diterima (with "30% dari kontrak" and a progress bar at 30%), Sisa belum diterima, Biaya and Selisih kas, plus cost by category as a `BarList` and, when there are any, "1 transaksi menunggu ditinjau".
  - **Lopsided:** received above the contract shows "125% dari kontrak", a full (not overflowing) progress bar, and the remainder as `-Rp 5.000.000` in red with the hint "Diterima melebihi nilai kontrak"; a negative cash difference is red with its minus sign.
  - **Nothing to show:** contract value 0 shows `-` instead of a percentage and no progress bar; no transactions shows `Rp 0` cards and "Belum ada biaya yang disetujui".
  - **Partial failure:** a failed summary shows an error with retry inside the tab only; the header, the other tabs and the edit button still work. Changing the route id loads the other project's summary.
  - After a transaction is recorded from the Transaksi tab, the summary is requested again the next time it is shown.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add project summary tab`.

---

### Task 6: Browser test and documentation

**Files:** Create `apps/web/e2e/dashboard.spec.ts`. Modify `docs/decisions.md`.

- [ ] **Step 1: Write the flow** (independent of the other browser specs; data is prepared through the API as the admin: two accounts, categories, a project with a contract value and a manager, and approved income and expense with known amounts in the current month, plus one pending expense):
  1. The admin signs in and lands on the dashboard; Total saldo, Masuk, Keluar and Selisih show the amounts computed by hand in the spec's comments; the current month's column states the same figures; the category list shows the categories in order.
  2. The waiting count shows 1; clicking it opens the transaction list with "Menunggu" selected and exactly the pending expense listed.
  3. Choosing "Bulan ini" keeps the figures; choosing a past period with no transactions shows `Rp 0` and the chart's empty line.
  4. The project manager signs in, opens the project, and the Ringkasan tab shows contract value, received with its percentage, cost and cash difference as computed by hand; `/dashboard` sends them back to their landing page.
  5. At 360 px width the dashboard and the project summary have no horizontal page scroll.
- [ ] **Step 2: Run** `npm run test:browser -w web`. Expected: all browser tests pass. Fix any defect it reveals in the owning task, with a unit test first.
- [ ] **Step 3: Document** this phase's rulings in `docs/decisions.md`.
- [ ] **Step 4: Commit** `test(web): add browser test for the dashboard`.

---

## Fase 4b acceptance

- [ ] The admin sees the company dashboard with charts, and the admin and a project's manager see that project's summary (base document, Fase 4 frontend items).
- [ ] `npm run lint`, `npm test`, `npm run test:e2e`, web build and `npm run test:browser -w web` pass.
