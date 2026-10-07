# Fase 3b: Transactions Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The screens for everything Fase 3a exposes: a transaction list with filters, a form to record and correct transactions with proof files, a detail page where proof is viewed and transactions are approved, rejected, cancelled or voided, a transfer dialog for the admin, and the transaction tab of the project page.

**Architecture:** Thin views over typed API modules, built from the shared pieces of Fases 1b and 2b (`usePagedList`, `PagedTable`, `FilterBar`, `useEntityDialog`, `useFormSubmit`, `FormDialog`, `MoneyInput`, `DateField`, `useNotify`). The web never decides who may do what: every button is shown from the `permissions` object the API sends with each transaction. The list is one reusable `TransactionTable` used by both the transactions page and the project page. Decisions (approve, reject, cancel, void) live on the detail page, next to the proof, and go through one `useTransactionActions` composable.

**Tech Stack:** Vue 3.5 (`<script setup>`, TypeScript), Vue Router 5, Pinia 4, PrimeVue 4.5.5, Tailwind 4, Vitest + @vue/test-utils, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` (section 2.2) and base document `implementation-plan-cashflow-mvp.md` (sections 6, 10, 11 Fase 3). API contract: `docs/superpowers/plans/2026-10-07-fase-3a-transactions-api.md` and `docs/decisions.md` (Fase 3a).

## Global Constraints

- Money is a string of digits in every API call and in component state. Never convert it to a JS `number`. Display as `Rp 1.250.000`.
- Dates display as `dd MMM yyyy`. Calendar dates travel as `YYYY-MM-DD` strings with no time zone conversion. "Today" is today in Asia/Jakarta.
- All user-facing text is Indonesian.
- Every API call goes through `src/api/http.ts`, including uploads and downloads. No session data in browser storage.
- Controls are shown from `transaction.permissions` only. No role or status logic about transactions is re-implemented in the web. The API remains the gate.
- Account balances are shown to SUPER_ADMIN only. Other roles choose accounts from `GET /accounts/options`, which has no balances.
- Proof files are fetched with the access token and shown from a blob URL. Images may be previewed in an `<img>`; a PDF is only ever downloaded. Nothing from a proof is rendered as HTML.
- Reuse over repetition: no page copies form, paging, toast, confirm or upload logic from another. Shared behaviour lives in `composables/` or `components/`.
- Usable at 360 px width (staff record proof from a phone): no horizontal page scroll; wide tables scroll inside their own container; dialogs fit the screen.
- PrimeVue stays at `4.5.5`. No new UI libraries.
- Do not write `apps/api/dist`. The API is not changed in this phase; if a defect is found there, fix it test-first in the API e2e suite.
- Out of scope: project summary numbers and dashboard (Fase 4), export and audit log page (Fase 5).

## Review Focus

- **Saving twice:** a double click on Simpan, or a second click while a slow request is in flight, records one transaction or one transfer, not two. Pinned in Tasks 5 and 7.
- **Upload failing halfway:** the transaction was created but a proof file was refused or the network dropped. The user ends up on that transaction's page with a clear message and can add the proof there; pressing Simpan again must not be the way to retry, because it would create a second transaction. Pinned in Task 5.
- **Files a phone actually produces:** a 14 MB photo, an iPhone HEIC, a Word file, an eleventh file. Each is refused before upload with a message that says why. Pinned in Task 4.
- **Deciding on something that changed:** the creator edits the amount or swaps the proof while the reviewer has the page open. The decision is refused (409), the page reloads the new version and says so; nothing is approved. Pinned in Task 6.
- **Links to transactions that are not yours:** a typed or shared URL for an unknown, malformed or out-of-scope id shows "Transaksi tidak ditemukan" with a way back, not an error screen. Pinned in Task 6.

## File Structure

```
apps/web/src/
├─ api/
│  ├─ http.ts                          (modify) DELETE, multipart bodies, blob responses
│  ├─ types.ts                         (modify) Transaction, Attachment, options
│  ├─ transactions.ts                  list, get, create, update, cancel, approve, reject, void, transfer
│  ├─ attachments.ts                   upload, download, remove
│  └─ accounts.ts  projects.ts         (modify) listAccountOptions, listProjectOptions
├─ lib/
│  ├─ labels.ts                        (modify) transaction status labels and options
│  ├─ proof-files.ts                   checkProofFile, limits, accepted types
│  ├─ download.ts                      saveBlob
│  └─ calendar.ts                      todayInJakarta
├─ composables/
│  ├─ useTransactionOptions.ts         accounts, categories by type, projects for the form and filters
│  ├─ useTransactionActions.ts         approve, reject, cancel, void with their dialogs and messages
│  └─ useProofUpload.ts                upload a list of files one by one, reporting each result
├─ components/
│  ├─ TransactionStatusTag.vue         Menunggu / Disetujui / Ditolak / Dibatalkan
│  ├─ SignedAmount.vue                 +Rp green for IN, -Rp red for OUT, muted when not counted
│  ├─ ReasonDialog.vue                 one dialog for reject, cancel and void
│  ├─ ProofPicker.vue                  choose or drop files, validated, with a removable list
│  └─ ProofList.vue                    stored proof: preview image, download, remove
├─ views/transactions/
│  ├─ TransactionsView.vue             page: header actions, filters, table
│  ├─ TransactionFilters.vue           filter bar
│  ├─ TransactionTable.vue             reusable paged table (also used by the project page)
│  ├─ TransactionFormDialog.vue        record, edit, resubmit
│  ├─ TransactionDetailView.vue        fields, proof, decisions
│  └─ TransferDialog.vue               SUPER_ADMIN
├─ views/projects/ProjectDetailView.vue  (modify) real Transaksi tab
└─ router/ routes.ts, paths.ts         (modify) /transaksi, /transaksi/:id
apps/web/e2e/transactions.spec.ts
```

## Shared interfaces

```ts
// api/types.ts
export type TxStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'VOID';
export interface NamedRef { id: string; name: string }
export interface Attachment { id; fileName; mimeType; sizeBytes: number; createdAt; uploadedBy: NamedRef }
export interface TransactionPermissions { canEdit; canCancel; canReview; canVoid; canAttach: boolean }
export interface Transaction {
  id; type: TxType; amount: string; transactionDate: string; description: string; status: TxStatus;
  account: NamedRef; category: NamedRef; project: { id; code; name } | null;
  isTransfer: boolean; transferGroupId: string | null;
  createdBy: NamedRef; reviewedBy: NamedRef | null; reviewedAt: string | null; rejectReason: string | null;
  voidedBy: NamedRef | null; voidedAt: string | null; voidReason: string | null;
  attachments: Attachment[]; permissions: TransactionPermissions; createdAt: string; updatedAt: string;
}
export interface AccountOption { id; name; type: AccountType }
export interface ProjectOption { id; code; name }
// Field names are copied from apps/api/src/transactions/transaction.mapper.ts in Task 2; where this
// block and the mapper differ, the mapper wins.

// api/http.ts
export function request<T>(path, options?): Promise<T>;        // gains method 'DELETE' and `form?: FormData`
export function requestBlob(path: string): Promise<Blob>;      // same auth and silent refresh as request

// api/transactions.ts
export interface TransactionFilters {
  search?; dateFrom?; dateTo?; type?; status?; accountId?; categoryId?; projectId?;
  overhead?: boolean | null; includeTransfers?: boolean | null;
}
export interface TransactionInput { type; amount; transactionDate; description; accountId; categoryId; projectId: string | null }
export function listTransactions(params: PageParams & TransactionFilters): Promise<Paginated<Transaction>>;
export function getTransaction(id): Promise<Transaction>;
export function createTransaction(input: TransactionInput): Promise<Transaction>;
export function updateTransaction(id, input: Partial<TransactionInput>): Promise<Transaction>;
export function cancelTransaction(id, reason): Promise<Transaction>;
export function approveTransaction(id, expectedUpdatedAt): Promise<Transaction & { accountBalance?: string }>;
export function rejectTransaction(id, reason, expectedUpdatedAt): Promise<Transaction>;
export function voidTransaction(id, reason): Promise<Transaction>;
export function createTransfer(input: { fromAccountId; toAccountId; amount; transactionDate; description }): Promise<Transaction[]>;

// api/attachments.ts
export function uploadAttachment(transactionId: string, file: File): Promise<Attachment>;
export function downloadAttachment(id: string): Promise<Blob>;
export function removeAttachment(id: string): Promise<void>;

// lib/proof-files.ts
export const MAX_PROOF_BYTES = 10 * 1024 * 1024; export const MAX_PROOFS = 10;
export const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
export function checkProofFile(file: { name: string; type: string; size: number }): string | null;  // message, or null when fine

// composables
export function useProofUpload(): {
  uploading: Ref<boolean>;
  upload(transactionId: string, files: File[]): Promise<{ failed: { file: File; message: string }[] }>;
};
export function useTransactionActions(options: { onChanged: (tx: Transaction) => void; onStale: () => void }): {
  approve(tx: Transaction): Promise<void>; reject(tx: Transaction): void; cancel(tx: Transaction): void; void(tx: Transaction): void;
  busy: Ref<boolean>;
};

// components
ReasonDialog:  v-model:visible; props: title, label, confirmLabel, submit: (reason: string) => Promise<void>
ProofPicker:   v-model: File[]; props: max (how many more may be added), disabled?
ProofList:     props: attachments, canRemove: boolean; emits: removed(id)
TransactionTable: props: filters: TransactionFilters, showProject?: boolean (default true); exposes reload()
```

Routes: `/transaksi` becomes the real list (all roles), `/transaksi/:id` is the detail page (all roles; not in the menu; `transactionPath(id)` in `paths.ts`).

---

### Task 1: HTTP client: delete, upload, download

**Files:** Modify `api/http.ts` and its spec. Create `lib/download.ts` with a spec.

- [ ] **Step 1: Failing tests** (stubbing `fetch`).
  - `request(path, { method: 'DELETE' })` sends DELETE and resolves `undefined` on 204.
  - `request(path, { method: 'POST', form })` sends the `FormData` as the body with **no** `Content-Type` header (the browser sets the boundary) and with the bearer token; giving both `body` and `form` throws before any request.
  - `requestBlob(path)` resolves the response as a `Blob`; a 401 triggers the same silent refresh and one retry as `request`; a 404 rejects with `ApiError` carrying the API's message; a 403 notifies `onForbidden`.
  - `saveBlob(blob, 'nota.pdf')` creates an object URL, clicks a temporary link with that `download` name, and revokes the URL afterwards.
- [ ] **Step 2: Run** `npm test -w web`. Expected: fail.
- [ ] **Step 3: Implement.** `request` and `requestBlob` share one private `send()` that does auth, refresh and error mapping; only the body encoding and the response decoding differ.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): support uploads, downloads and delete in the HTTP client`.

---

### Task 2: API modules, labels and small display components

**Files:** Modify `api/types.ts`, `api/accounts.ts`, `api/projects.ts`, `lib/labels.ts`. Create `api/transactions.ts`, `api/attachments.ts`, `lib/calendar.ts`, `components/TransactionStatusTag.vue`, `components/SignedAmount.vue`, and specs `api/__tests__/transactions.spec.ts`, `components/__tests__/transaction-display.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - Each API function calls the right method and path and sends exactly the given body. `listTransactions` passes filters as query values with `null`, `undefined` and `''` dropped. `approveTransaction` and `rejectTransaction` send `expectedUpdatedAt`. `uploadAttachment` posts a `FormData` whose `file` part is the given file to `/transactions/:id/attachments`. `downloadAttachment` uses `requestBlob('/attachments/:id/download')`. `removeAttachment` sends DELETE. `listAccountOptions` calls `/accounts/options`; `listProjectOptions` calls `/projects/options`.
  - `todayInJakarta()` returns `YYYY-MM-DD` for Asia/Jakarta: at `2026-10-06T18:30:00Z` it is `2026-10-07`.
  - `TransactionStatusTag`: PENDING "Menunggu", APPROVED "Disetujui", REJECTED "Ditolak", VOID "Dibatalkan", each with its own severity.
  - `SignedAmount`: IN shows `+Rp 500.000` in green; OUT shows `-Rp 150.000` in red; with `counted: false` (any status but APPROVED) the amount is muted and carries a title "Belum dihitung dalam saldo".
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Copy the response field names from `apps/api/src/transactions/transaction.mapper.ts`.
- [ ] **Step 4: Run** tests, lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add transaction and attachment API modules`.

---

### Task 3: Transaction list

**Files:** Create `views/transactions/TransactionsView.vue`, `TransactionFilters.vue`, `TransactionTable.vue`, `composables/useTransactionOptions.ts`, and spec `views/transactions/__tests__/list.spec.ts`. Modify `router/routes.ts`, `router/paths.ts` and the guard spec.

- [ ] **Step 1: Failing tests.**
  - Routing: `/transaksi` opens the list for all three roles.
  - `TransactionTable`: rows show date (`01 Okt 2026`), description, category, project code and name (or "Overhead" when none), account, signed amount, status tag and creator; a transfer leg shows a "Transfer" tag in place of the project; each row links to `/transaksi/<id>`; a row whose `permissions.canReview` is true carries a "Perlu ditinjau" marker; paging sends `page` and `pageSize`; empty state "Belum ada transaksi" (and "Tidak ada transaksi yang cocok" when a filter is set); error state with retry; `showProject: false` hides the project column.
  - `TransactionFilters`: search (debounced), date from and to, type, status, account, category (narrowed to the chosen type), project (with an "Overhead (tanpa proyek)" choice that sends `overhead=true` and no `projectId`); changing any filter reloads from page 1; "Reset" clears them all; a date range with from after to is not sent and shows a message under the field.
  - Roles: as SUPER_ADMIN the header has "Catat transaksi" and "Transfer antar akun", and a "Tampilkan transfer" switch (on by default) that sends `includeTransfers=false` when off. As PROJECT_MANAGER and STAFF there is no transfer button and no transfer switch. As STAFF the title is "Transaksi Saya" and the creator column is hidden.
  - `useTransactionOptions`: loads account options, project options and active non-system categories once and shares them between the filters and the form; `categoriesFor(type)` returns only that type; a failed load exposes `error` and `reload()`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** on `usePagedList`, `PagedTable`, `FilterBar` and `FilterSelect`. The header buttons are wired to their dialogs in Tasks 5 and 7; until then they are rendered and do nothing.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add transaction list with filters`.

---

### Task 4: Proof files

**Files:** Create `lib/proof-files.ts`, `composables/useProofUpload.ts`, `components/ProofPicker.vue`, `components/ProofList.vue`, and specs.

- [ ] **Step 1: Failing tests.**
  - `checkProofFile`: JPEG, PNG, WebP and PDF up to exactly 10 MB pass; 10 MB + 1 byte → "Berkas terlalu besar (maksimal 10 MB)"; an empty file → "Berkas kosong"; `image/heic`, a `.docx`, and a file with no type → "Jenis berkas tidak didukung. Gunakan foto (JPG, PNG, WebP) atau PDF"; for HEIC the message adds that the phone camera should be set to JPG ("Paling Kompatibel").
  - `ProofPicker`: has a file input with `accept` set to the four types and `multiple`; choosing files emits them appended to the model; dropping files does the same; a refused file is not added and its reason is listed with its name; adding more than `max` keeps the first ones that fit and says "Maksimal 10 bukti per transaksi"; each chosen file shows name and size and can be removed; the same file chosen twice is added once; `disabled` blocks choosing and dropping.
  - `useProofUpload`: uploads files one at a time in order; `uploading` is true meanwhile; a refused file is reported in `failed` with the API's message and the remaining files are still tried; nothing throws.
  - `ProofList`: lists name, size (`1,2 MB`, `340 KB`) and uploader; "Unduh" fetches the blob and saves it under the stored name; for an image, "Lihat" opens a dialog showing it from a blob URL that is revoked when the dialog closes; a PDF has no "Lihat"; with `canRemove`, "Hapus" asks for confirmation, calls the API, emits `removed`, and shows a toast; an API refusal shows its message and emits nothing; without `canRemove` there is no remove control; an empty list reads "Belum ada bukti".
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add proof picker, upload and list`.

---

### Task 5: Transaction form

**Files:** Create `views/transactions/TransactionFormDialog.vue` and spec `views/transactions/__tests__/form.spec.ts`. Modify `TransactionsView.vue`, `lib/validation.ts` if a rule is missing.

- [ ] **Step 1: Failing tests.**
  - Create: fields are type (Pengeluaran by default), amount (`MoneyInput`), date (today in Jakarta by default; a later date is refused in the browser with "Tanggal transaksi tidak boleh di masa depan"), account, category, project, description, proof. Changing the type clears a chosen category and narrows the list. Amount must be above zero and at most 13 digits. Required messages appear under each field. The account list shows names without balances for every role.
  - Project by role: SUPER_ADMIN and STAFF may leave it empty ("Tanpa proyek (overhead)"); for PROJECT_MANAGER it is required and the overhead choice is absent.
  - Saving sends exactly `{ type, amount, transactionDate, description, accountId, categoryId, projectId }` with `amount` a digit string and `projectId` `null` when empty, then uploads the chosen proof files to the new transaction, closes, shows "Transaksi dicatat", and the list reloads.
  - **One request:** the save button is disabled and shows progress from the first click until the create and all uploads finish; a second click or Enter in that time sends nothing more.
  - **Upload fails after create:** the dialog closes, the user is taken to `/transaksi/<new id>`, and a message names the files that failed and says the transaction itself was saved. No second create request is possible from the form.
  - An expense saved with no proof shows a confirmation first: "Pengeluaran tanpa bukti tidak bisa disetujui. Simpan dulu dan tambahkan bukti nanti?" Income asks nothing.
  - API field errors (for example an account deactivated meanwhile) land under their fields and what was typed is kept; a 404 on the project shows "Proyek tidak ditemukan" under the project field.
  - SUPER_ADMIN only: a "Langsung setujui" checkbox. When ticked, saving runs create, upload, then approve; success shows "Transaksi dicatat dan disetujui"; if a proof upload failed the approve step is skipped and the user is taken to the detail page with the message; if the approval makes the account balance negative a warning toast shows the new balance. The checkbox is absent for other roles.
  - Edit (from the detail page): pre-fills every field; sends only changed fields; closes without a request when nothing changed and the status is PENDING; has no proof picker (proof is managed on the detail page). For a REJECTED transaction the title is "Perbaiki dan ajukan lagi", the rejection reason is shown at the top, and saving always sends the request (even with no change) and reports "Transaksi diajukan lagi". Reopening after an error starts clean.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** on `useEntityDialog`, `FormDialog`, `useTransactionOptions` and `useProofUpload`.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add transaction form with proof upload`.

---

### Task 6: Detail page and decisions

**Files:** Create `views/transactions/TransactionDetailView.vue`, `components/ReasonDialog.vue`, `composables/useTransactionActions.ts`, and specs. Modify `router/routes.ts`, `router/paths.ts` (`transactionPath(id)`).

- [ ] **Step 1: Failing tests.**
  - Loads `GET /transactions/:id` for the route id and shows type, signed amount, date, account, category, project (linked to the project page for roles that can open it; "Overhead" when none), description, status tag, who recorded it and when, and, when present, who reviewed it and when, the rejection reason, and who voided it with the reason. A back link returns to the list. Changing the route id loads the other transaction.
  - **Not yours:** a 404 or a malformed id shows "Transaksi tidak ditemukan" with a link back and no error toast; another failure shows the error state with retry.
  - Proof section: `ProofList` with removal offered when `permissions.canAttach`; with `canAttach` a `ProofPicker` and an "Unggah" button add files (limited to what is left of 10), then the page reloads; an expense that is PENDING with no proof shows the notice "Pengeluaran ini belum punya bukti dan belum bisa disetujui".
  - Buttons follow `permissions` exactly: `canEdit` → "Ubah" (or "Perbaiki dan ajukan lagi" when REJECTED) opening the form; `canCancel` → "Batalkan"; `canReview` → "Setujui" and "Tolak"; `canVoid` → "Void". With all five false there are no action buttons. A transfer leg shows the note "Bagian dari transfer antar akun. Void akan membatalkan kedua sisinya." and the void confirmation repeats it.
  - `ReasonDialog`: the reason is required, trimmed, at most 500 characters with a counter; the confirm button is disabled while submitting; an API error is shown inside the dialog and the text is kept; reopening starts empty.
  - `useTransactionActions`: approve asks for confirmation showing the amount and description, sends `expectedUpdatedAt` = the transaction's `updatedAt`, then calls `onChanged` and shows "Transaksi disetujui"; when the response has an `accountBalance` starting with `-`, a warning toast says the account is now negative and shows the balance. Reject, cancel and void open `ReasonDialog` with their own title and confirm label and send the reason (reject also sends `expectedUpdatedAt`).
  - **Changed meanwhile:** a 409 from approve or reject calls `onStale`; the page reloads the transaction and shows "Transaksi berubah sejak Anda membukanya. Periksa lagi sebelum memproses." or, when the status is no longer PENDING, "Transaksi sudah diproses pengguna lain". Nothing is approved and the buttons then follow the fresh `permissions`.
  - A 400 from approving an expense with no proof shows the API's message as an error toast.
  - While any action is in flight every action button is disabled.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add transaction detail with approval actions`.

---

### Task 7: Transfer between accounts

**Files:** Create `views/transactions/TransferDialog.vue` and spec. Modify `TransactionsView.vue`.

- [ ] **Step 1: Failing tests.**
  - Fields: from account, to account, amount, date (today by default, not in the future), description. All required. The to-account list leaves out the chosen from-account; choosing the same account on both sides is impossible, and the API's field error for it lands under "Akun tujuan".
  - Saving sends `{ fromAccountId, toAccountId, amount, transactionDate, description }`, closes, shows "Transfer dicatat", and the list reloads.
  - **One request:** the button is disabled from the first click until the response; a second click sends nothing.
  - A 500 (system categories missing) shows the generic server error and keeps the dialog open with its values.
  - The dialog is reachable only from the SUPER_ADMIN header button.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** on `FormDialog` and `useFormSubmit`.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add transfer between accounts`.

---

### Task 8: Transactions on the project page

**Files:** Modify `views/projects/ProjectDetailView.vue` and its spec.

- [ ] **Step 1: Failing tests.** The "Transaksi" tab renders `TransactionTable` with `filters: { projectId: <route id> }` and `showProject: false`, replacing the "next phase" note; rows link to the detail page; a "Catat transaksi" button opens the form with this project pre-selected (hidden when the project is not ACTIVE and the user is not SUPER_ADMIN); after saving the table reloads; changing the route id shows the other project's transactions.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** `TransactionFormDialog` gains an optional `projectId` prop for the preset.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): show project transactions on the project page`.

---

### Task 9: Browser test and documentation

**Files:** Create `apps/web/e2e/transactions.spec.ts`. Modify `apps/web/e2e/helpers.ts`, `docs/decisions.md`.

- [ ] **Step 1: Write the flow** (independent of the other browser specs; it creates its own account, category, project and users through the UI helpers or the API):
  1. A staff user opens Transaksi, records an expense of `150.000` on the project with a JPEG proof chosen in the form; the list shows it as "Menunggu" with `-Rp 150.000`.
  2. The project's coordinator signs in, sees the row marked "Perlu ditinjau", opens it, views the proof image, and approves; the status becomes "Disetujui".
  3. The staff user opens the same transaction and has no "Ubah" or "Batalkan" button.
  4. The staff user records a second expense; the coordinator rejects it with a reason; the staff user sees the reason, uses "Perbaiki dan ajukan lagi", changes the amount and saves; the status is "Menunggu" again.
  5. The admin opens Master data and sees the account balance reduced by exactly the approved amount; voids the approved transaction with a reason; the balance is back.
  6. The admin makes a transfer between two accounts; both rows appear with the "Transfer" tag, and turning off "Tampilkan transfer" hides them.
  7. The coordinator opens `/transaksi/<a random UUID>` and sees "Transaksi tidak ditemukan".
  8. At 360 px width the list, the form dialog and the detail page have no horizontal page scroll.
- [ ] **Step 2: Run** `npm run test:browser -w web`. Expected: all browser tests pass. Fix any defect it reveals in the owning task, with a unit test first.
- [ ] **Step 3: Document** this phase's rulings in `docs/decisions.md`.
- [ ] **Step 4: Commit** `test(web): add browser test for the transaction flow`.

---

## Fase 3b acceptance

- [ ] A transaction can be recorded with proof, reviewed, corrected, voided and transferred entirely in the browser, on a phone-width screen (base document, Fase 3 frontend items and exit criterion).
- [ ] `npm run lint`, `npm test`, `npm run test:e2e`, web build and `npm run test:browser -w web` pass.
