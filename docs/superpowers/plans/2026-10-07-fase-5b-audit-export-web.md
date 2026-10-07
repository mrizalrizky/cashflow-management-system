# Fase 5b: Audit Log Page and Export Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the two Fase 5a endpoints on screen: an audit log page for the admin, and an export button on the transaction list for every role.

**Architecture:** The audit log page is one more paged list built from the existing pieces (`usePagedList`, `PagedTable`, `FilterBar`, `FilterSelect`, `DateField`), plus a detail dialog that shows what changed. What changed is computed by one pure function (`changedFields`) from the entry's `before` and `after`, and every value is rendered as plain text. The export button asks the API for the file with the list's current filters, through the same authenticated download path the proof files use, extended to pass filters and to read the file name the API chose.

**Tech Stack:** Vue 3.5 (`<script setup>`, TypeScript), Vue Router 5, Pinia 4, PrimeVue 4.5.5, Tailwind 4, Vitest + @vue/test-utils, Playwright.

**Spec:** base document `implementation-plan-cashflow-mvp.md` (sections 10 and 11 Fase 5). API contract: `docs/superpowers/plans/2026-10-07-fase-5a-audit-export-hardening.md`, `apps/api/src/audit/{audit-log.mapper.ts,dto/list-audit-logs.dto.ts}`, `apps/api/src/transactions/transaction-export.service.ts`, and `docs/decisions.md` (Fase 5a).

## Global Constraints

- The audit log page is offered to SUPER_ADMIN only (menu and route); the API is what enforces it. Nothing on the page changes data: there is no edit, delete or "clear" control.
- Everything from an audit entry (`before`, `after`, names, ids, IP) is rendered as text. Nothing from it is rendered as HTML, used as a link target without being built by the app, or evaluated.
- The export sends exactly the filters the list on screen is using, and no page number. The file is whatever the API returns: the web does not build, convert or re-encode it.
- Money values inside an audit entry are digit strings and are shown as rupiah when the field is a known amount; they are never converted to a JS `number`.
- Timestamps display in Asia/Jakarta as `dd MMM yyyy HH.mm`; calendar dates as `dd MMM yyyy`.
- All user-facing text is Indonesian.
- Reuse over repetition: no page copies paging, filter, toast, download or dialog logic from another.
- Usable at 360 px width: no horizontal page scroll; the table scrolls inside its own container.
- PrimeVue stays at `4.5.5`. No new dependencies. The API is not changed in this phase.
- Out of scope: exporting the audit log, exporting to `.xlsx`, deployment (Fase 6).

## Review Focus

- **The file is not what is on screen:** filters set a moment ago (a search still being typed, a status from the address, a date range that runs backwards and so is not applied), the project page's fixed project, transfers hidden by the switch. The export must use the same filters the last list request used. Pinned in Task 3.
- **A slow or failing export:** a large file, a second click while the first is running, the API answering 400 or the network dropping. One request at a time, a visible busy state, and a clear message on failure; no empty or partial file is saved. Pinned in Task 3.
- **Awkward audit entries:** no user (a failed login), no `before` or no `after`, an action or record type the web has no label for, nested values, very long text, and text containing HTML or script. All readable, none executed, none breaking the layout. Pinned in Tasks 1 and 2.
- **Reading the history of one record:** opening the log from a transaction shows that transaction's entries only, in order, and the filter is visible and removable. Pinned in Task 2.
- **Not the admin:** a project manager or staff member typing the address is sent to their landing page and sees no menu item; the export button is still there for them and exports only their rows. Pinned in Tasks 2 and 3.

## File Structure

```
apps/web/src/
├─ api/
│  ├─ http.ts                      (modify) requestFile: blob plus the file name from the response
│  ├─ types.ts                     (modify) AuditLog
│  ├─ audit-logs.ts                listAuditLogs
│  └─ transactions.ts              (modify) exportTransactions
├─ lib/
│  ├─ format.ts                    (modify) formatDateTime
│  ├─ labels.ts                    (modify) audit action and record-type labels
│  └─ audit.ts                     changedFields, describeValue
├─ composables/useFileDownload.ts  one download at a time, busy state, error toast
├─ views/audit/
│  ├─ AuditLogView.vue
│  └─ AuditLogDetailDialog.vue
├─ views/transactions/
│  ├─ TransactionsView.vue         (modify) export button
│  └─ TransactionDetailView.vue    (modify) "Riwayat" link for the admin
└─ router/ routes.ts, paths.ts, navigation.ts   (modify) /audit-log
apps/web/e2e/audit-export.spec.ts
```

## Shared interfaces

```ts
// api/types.ts  (field names from apps/api/src/audit/audit-log.mapper.ts; the mapper wins)
export interface AuditLog {
  id: string; action: string; entityType: string; entityId: string;
  user: NamedRef | null; before: unknown; after: unknown; ip: string | null; createdAt: string;
}

// api/http.ts
export interface DownloadedFile { blob: Blob; fileName: string | null }
export function requestFile(path: string, query?: Record<string, QueryValue>): Promise<DownloadedFile>;
// requestBlob(path) stays, built on requestFile

// api/audit-logs.ts
export interface AuditLogFilters { entityType?; entityId?; userId?; action?; dateFrom?; dateTo? }   // strings or null
export function listAuditLogs(params: PageParams & AuditLogFilters): Promise<Paginated<AuditLog>>;

// api/transactions.ts
export function exportTransactions(filters: TransactionFilters): Promise<DownloadedFile>;   // GET /transactions/export

// lib/format.ts
export function formatDateTime(value: string | null | undefined): string;   // '06 Okt 2026 10.05' in Jakarta; '-' when empty

// lib/labels.ts
export function auditActionLabel(action: string): string;      // 'APPROVE' -> 'Menyetujui'; unknown -> the raw value
export function auditEntityLabel(entityType: string): string;  // 'transaction' -> 'Transaksi'; unknown -> the raw value
export const AUDIT_ACTION_OPTIONS: Option<string>[]; export const AUDIT_ENTITY_OPTIONS: Option<string>[];

// lib/audit.ts
export interface FieldChange { field: string; before: string; after: string }
/** Fields whose value differs between the two snapshots, in a stable order; '-' for an absent value. */
export function changedFields(before: unknown, after: unknown): FieldChange[];
export function describeValue(field: string, value: unknown): string;   // text only; amounts as rupiah; nested values as compact JSON

// composables/useFileDownload.ts
export function useFileDownload(): { downloading: Ref<boolean>; download(fetch: () => Promise<DownloadedFile>, fallbackName: string): Promise<void> };
```

Routes: `/audit-log` (SUPER_ADMIN; menu "Audit log" after Pengguna). `/audit-log?entityType=transaction&entityId=<id>` opens it filtered on one record.

---

### Task 1: Building blocks

**Files:** Modify `api/http.ts`, `api/types.ts`, `api/transactions.ts`, `lib/format.ts`, `lib/labels.ts` and their specs. Create `api/audit-logs.ts`, `lib/audit.ts`, `composables/useFileDownload.ts` and specs.

- [ ] **Step 1: Failing tests.**
  - `requestFile('/transactions/export', { status: 'PENDING', search: '' })` requests that path with the query (empty values dropped), with the bearer token, and resolves `{ blob, fileName }` where the name comes from `Content-Disposition: attachment; filename="transaksi-20261007-1005.csv"`; without that header the name is `null`; a name containing a path separator or `..` is reduced to its last segment; a 401 refreshes and retries once; a 400 rejects with the API's message and field errors; `requestBlob` still resolves a `Blob`.
  - `listAuditLogs` and `exportTransactions` call the right path with exactly the given parameters and no `page` or `pageSize` on the export.
  - `formatDateTime('2026-10-06T03:05:00.000Z')` → `06 Okt 2026 10.05`; `'2026-10-06T17:30:00.000Z'` → `07 Okt 2026 00.30`; empty or malformed → `-`.
  - Labels: every action the API writes today (LOGIN, LOGIN_FAILED, LOGOUT, TOKEN_REUSE, CHANGE_PASSWORD, RESET_PASSWORD, CREATE, UPDATE, SET_MEMBERS, RESUBMIT, CANCEL, APPROVE, REJECT, VOID, TRANSFER, ATTACH, DETACH, EXPORT) and every record type (transaction, account, category, project, user) has an Indonesian label; an unknown value is returned unchanged.
  - `changedFields`: lists only fields that differ; `(null, after)` lists every field of `after` with `-` before; `(before, null)` the reverse; identical snapshots → `[]`; a non-object snapshot (a string, an array) is one change under the field `nilai`; fields are in alphabetical order; `updated_at` alone changing is still listed.
  - `describeValue`: `null` and `undefined` → `-`; `true`/`false` → `Ya`/`Tidak`; a string is returned as it is, including `<script>alert(1)</script>`; `amount`, `opening_balance` and `contract_value` digit strings → rupiah; a nested object or array → compact JSON; text longer than 300 characters is cut with `…`.
  - `useFileDownload`: `downloading` is true while the fetch runs; the file is saved under the API's name, or the fallback when there is none; a second call while one is running does nothing; a failure shows the API's message as an error toast and saves nothing; `downloading` is false afterwards either way.
- [ ] **Step 2: Run** `npm test -w web`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add audit log and export building blocks`.

---

### Task 2: Audit log page

**Files:** Create `views/audit/AuditLogView.vue`, `AuditLogDetailDialog.vue` and spec `views/audit/__tests__/audit-log.spec.ts`. Modify `router/paths.ts`, `routes.ts`, `navigation.ts`, `views/transactions/TransactionDetailView.vue`, and the guard, layout and detail specs.

- [ ] **Step 1: Failing tests.**
  - Routing and menu: `/audit-log` opens for SUPER_ADMIN and redirects PROJECT_MANAGER and STAFF to their landing pages; the admin menu becomes Dashboard, Transaksi, Proyek, Master data, Pengguna, Audit log; other menus are unchanged.
  - The list: newest first as the API returns it; each row shows the time (`06 Okt 2026 10.05`), who (the user's name, or "Tidak dikenal" when there is none), the action label, the record type label and a short form of the record id, and the IP on wide screens; paging sends `page` and `pageSize`; empty state "Belum ada catatan" (and "Tidak ada catatan yang cocok" with a filter); error state with retry. There is no control that changes or deletes anything.
  - Filters: record type, action, user (a dropdown of users loaded from the users list), and a date range with named fields; each sends the matching parameter and returns to page 1; a range that runs backwards is not sent and shows a message; "Reset" clears them all.
  - **One record's history:** opening `/audit-log?entityType=transaction&entityId=<uuid>` sends both on the first (single) request and shows a removable notice "Riwayat satu data: Transaksi <id singkat>"; removing it clears `entityId` and reloads. An `entityType` that is not a simple word, or an over-long `entityId`, in the address is ignored.
  - Detail dialog (opened from a row): shows time, user, action, record type, the full record id and the IP, then a table of changed fields with before and after values from `changedFields` and `describeValue`. With no `before` it is titled as a new record and lists the `after` values; with neither it says "Tidak ada rincian perubahan". For a transaction entry the record id links to `/transaksi/<id>`; for other types it is plain text.
  - **Awkward entries:** an unknown action or record type shows its raw value; a value containing `<img src=x onerror=...>` appears as that literal text and creates no element; a 5,000-character value is cut; a nested value is shown as compact JSON.
  - Transaction detail page: SUPER_ADMIN sees a "Riwayat" link to `/audit-log?entityType=transaction&entityId=<id>`; other roles do not.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** on `usePagedList`, `PagedTable`, `FilterBar`, `FilterSelect`, `DateField`.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add audit log page`.

---

### Task 3: Export button

**Files:** Modify `views/transactions/TransactionsView.vue`, `TransactionTable.vue` (expose the filters of its last request) and `views/transactions/__tests__/list.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - Every role sees an "Ekspor CSV" button on the transaction list.
  - Clicking it requests the export with the filters of the list's last request and no paging: after choosing a status and a project; after a search has been applied (not while it is still being typed: the export uses what the list shows); with a status that came from the address; with transfers hidden; and with a backwards date range, where no dates are sent, exactly as for the list.
  - The file is saved under the name the API sent; with none, under `transaksi.csv`.
  - **One at a time:** while the export runs the button is disabled and shows progress; a second click sends nothing more.
  - **Failing:** a 400 or a network failure shows the message as an error toast, saves nothing, and re-enables the button.
  - A success toast reads "Berkas ekspor diunduh".
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** with `useFileDownload` and `exportTransactions`.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add transaction export button`.

---

### Task 4: Browser test and documentation

**Files:** Create `apps/web/e2e/audit-export.spec.ts`. Modify `docs/decisions.md`, `README.md`.

- [ ] **Step 1: Write the flow** (independent of the other browser specs; data prepared through the API as the admin: an account, a category, a project with a manager, a staff user, two expenses by the staff user of which one is approved, and one overhead expense by the admin with the description `=1+1 uji`):
  1. The staff user opens Transaksi and clicks "Ekspor CSV"; the downloaded file is named `transaksi-<date>-<time>.csv`, starts with the byte order mark, and has the header plus exactly their two rows.
  2. The admin filters the list on "Disetujui" and exports; the file has only the approved row. With the filter reset, the file contains the `=1+1 uji` row with a leading apostrophe.
  3. The admin opens Audit log from the menu; the newest entries are the exports just made, labelled "Mengekspor", with the right users.
  4. The admin opens the approved transaction, follows "Riwayat", and sees only that transaction's entries (recorded, proof added, approved), newest first; opening the approval shows the status changing from "PENDING" to "APPROVED".
  5. The project manager has no "Audit log" menu item and is sent away from `/audit-log`.
  6. At 360 px width the audit log page has no horizontal page scroll.
- [ ] **Step 2: Run** `npm run test:browser -w web`. Expected: all browser tests pass. Fix any defect it reveals in the owning task, with a unit test first.
- [ ] **Step 3: Document** this phase's rulings in `docs/decisions.md`; add one line to the README on where the audit log and export are.
- [ ] **Step 4: Commit** `test(web): add browser test for the audit log and export`.

---

## Fase 5b acceptance

- [ ] The admin can read and filter the audit log, and every role can export the transactions they see (base document, Fase 5 frontend items).
- [ ] `npm run lint`, `npm test`, `npm run test:e2e`, web build and `npm run test:browser -w web` pass.
