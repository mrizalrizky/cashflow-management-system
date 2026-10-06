# Fase 2b: Master Data Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web pages for everything Fase 2a exposes: a master data page for accounts and categories, a project list, and a project detail page where an admin assigns project managers.

**Architecture:** Each page is a thin view over a typed API module, built from the shared pieces of Fase 1b (`usePagedList`, `useFormSubmit`, `FormDialog`, `FormField`, `PageHeader`, `ErrorState`). What the users page did inline and these pages need again (success and error toasts, the active/inactive toggle with confirmation, the status tag) is extracted first and the users page is moved onto it. Money is a digit string end to end; one `MoneyInput` component and one `formatRupiah` function handle all display and entry.

**Tech Stack:** Vue 3.5 (`<script setup>`, TypeScript), Vue Router 5, Pinia 4, PrimeVue 4.5.5, Tailwind 4, Vitest + @vue/test-utils, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` and base document `implementation-plan-cashflow-mvp.md` (sections 6, 10, 11 Fase 2). API contract: `docs/superpowers/plans/2026-10-06-fase-2a-master-data-api.md` and `docs/decisions.md`.

## Global Constraints

- Money is a string of digits in every API call and in component state. Never convert it to a JS `number`; format with `BigInt`. Display as `Rp 1.250.000` (negative as `-Rp 500.000`).
- Dates display as `dd MMM yyyy`. Calendar dates travel as `YYYY-MM-DD` strings with no time zone conversion.
- All user-facing text is Indonesian.
- Every API call goes through `src/api/http.ts`. No session data in browser storage.
- Hiding a control is not access control: the API enforces roles and project scope. The web only avoids offering what would fail.
- Reuse over repetition: a page must not copy form, paging, toast or confirm logic from another page. If two pages need it, it lives in `composables/` or `components/`.
- Usable at 360 px width: no horizontal page scroll; wide tables scroll inside their own container.
- PrimeVue stays at `4.5.5`. No new UI libraries.
- Do not write `apps/api/dist`. Verify the API with `npm run lint -w api` (which type-checks) and the e2e suite.
- Out of scope: transactions, attachments, project summary numbers, dashboard.

## Review Focus

- **Money entry by a person:** typing `1250000`, pasting `1.250.000` or `Rp 1.250.000`, typing letters, leaving the field empty, a value longer than 18 digits, and a negative opening balance. What is sent to the API is always a clean digit string or a visible validation error. Pinned in Task 2.
- **A project manager using the project pages:** they see only their projects, no add, edit or member controls, and typing the URL of another project shows "Proyek tidak ditemukan", not an error screen or someone else's data. Pinned in Tasks 7 and 8.
- **An admin whose password is reset, or whose role changes, while they have a page open:** the next action takes them to the right place (change password, or their new landing page) instead of a wall of error toasts. Pinned in Task 1.
- **Protected and inactive things in lists:** system categories show no edit or deactivate control; an inactive account or category is clearly marked and can be reactivated. Pinned in Tasks 5 and 6.
- **Member assignment mistakes:** saving with nobody selected clears the list after confirmation; a project manager deactivated since the page loaded produces the API's message next to the field, and the selection is kept. Pinned in Task 8.

## File Structure

```
apps/web/src/
├─ api/
│  ├─ types.ts                      (modify) Account, Category, Project and related types
│  ├─ accounts.ts  categories.ts  projects.ts
│  └─ http.ts                       (modify) session resync on 403
├─ lib/
│  ├─ money.ts                      formatRupiah, parseMoneyInput, groupDigits
│  ├─ validation.ts                 (modify) money rules
│  └─ labels.ts                     account type, tx type and project status labels and options
├─ composables/
│  ├─ useNotify.ts                  success and error toasts
│  ├─ useToggleActive.ts            activate at once, deactivate after confirmation
│  └─ usePagedList.ts               (modify) step back from an empty page
├─ components/
│  ├─ ActiveTag.vue                 Aktif / Nonaktif
│  ├─ MoneyInput.vue                digit-string model, grouped display
│  ├─ DateField.vue                 YYYY-MM-DD model over PrimeVue DatePicker
│  └─ TableCard.vue                 bordered, horizontally scrollable table container
├─ views/
│  ├─ master-data/
│  │  ├─ MasterDataView.vue         tabs: Akun, Kategori
│  │  ├─ AccountsTab.vue  AccountFormDialog.vue
│  │  └─ CategoriesTab.vue  CategoryFormDialog.vue
│  ├─ projects/
│  │  ├─ ProjectsView.vue  ProjectFormDialog.vue
│  │  ├─ ProjectDetailView.vue
│  │  └─ ProjectMembersPanel.vue
│  └─ users/UsersView.vue           (modify) use the extracted pieces
└─ router/ routes.ts, paths.ts, navigation.ts   (modify)
apps/web/e2e/master-data.spec.ts
```

## Shared interfaces

```ts
// api/types.ts
export type AccountType = 'CASH' | 'BANK';
export type TxType = 'IN' | 'OUT';
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export interface Account { id; name; type: AccountType; openingBalance: string; balance: string; isActive: boolean; createdAt: string }
export interface Category { id; name; type: TxType; isSystem: boolean; isActive: boolean }
export interface ProjectMember { id; name; email }
export interface Project {
  id; code; name; clientName; contractValue: string; status: ProjectStatus;
  startDate: string | null; endDate: string | null; notes: string | null;
  members: ProjectMember[]; createdAt: string; updatedAt: string;
}

// lib/money.ts
export function formatRupiah(value: string | null | undefined): string;      // 'Rp 1.250.000', '-Rp 500.000', '-' for empty or invalid
export function groupDigits(digits: string): string;                         // '1250000' -> '1.250.000'
export function parseMoneyInput(text: string, options?: { allowNegative?: boolean }): string | null;
        // digits only (optional leading '-'), or null when nothing usable was typed

// composables
export function useNotify(): { success(message: string): void; error(cause: unknown, fallback: string): void };
export function useToggleActive<T extends { id: string; name: string; isActive: boolean }>(options: {
  update: (id: string, isActive: boolean) => Promise<unknown>;
  onChanged: () => void;
  describe?: (item: T) => string;        // extra sentence in the confirmation
}): (item: T) => void;

// components
MoneyInput:  v-model: string  (digits; '' when empty)   props: id, invalid?, allowNegative?, ariaDescribedby?
DateField:   v-model: string | null  ('YYYY-MM-DD')      props: id, invalid?
ActiveTag:   props: active: boolean
TableCard:   default slot
```

Routes added: `/master-data` (SUPER_ADMIN; menu "Master data" after Proyek), `/proyek` becomes the real list (SUPER_ADMIN, PROJECT_MANAGER), `/proyek/:id` (same roles; not in the menu).

---

### Task 1: Carry-overs from the Fase 1b review

**Files:** Modify `api/http.ts`, `api/auth.ts`, `stores/session.ts`, `composables/usePagedList.ts`, `main.ts`, and their specs.

- [ ] **Step 1: Failing tests.**
  - `http`: a 403 on an authenticated request calls the bound `onForbidden` listener once and still rejects with the 403; a 403 on an `auth: false` request does not.
  - `session`: on `onForbidden` the store re-reads the user with `GET /auth/me`; when the user now has `mustChangePassword` (admin reset) or another role (demotion), `user` is updated; several 403s arriving together cause one `/auth/me` call; a failing `/auth/me` leaves the user unchanged.
  - `main`/router (tested through a small exported function `reconcileRoute(router, user)`): after the user changes, a route the user may no longer open is replaced by where `resolveNavigation` sends them; a still-allowed route is left alone.
  - `usePagedList`: when a reload of page 3 returns no rows but `total > 0`, it moves to the last page that has rows and loads it; on page 1 an empty result stays empty.
- [ ] **Step 2: Run** `npm test -w web`. Expected: fail.
- [ ] **Step 3: Implement.** `SessionEvents` gains `onForbidden()`. The store exposes `resync()` (memoised while in flight) and calls it from `onForbidden`. `main.ts` watches `session.user` and calls `reconcileRoute`.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `fix(web): resync the session on 403 and step back from an empty page`.

---

### Task 2: Money and date building blocks

**Files:** Create `lib/money.ts`, `components/MoneyInput.vue`, `components/DateField.vue` and specs. Modify `lib/validation.ts` (`money(label, options)` rule), `lib/format.ts` (`formatCalendarDate`).

- [ ] **Step 1: Failing tests.**
  - `formatRupiah`: `'1250000'` → `Rp 1.250.000`; `'0'` → `Rp 0`; `'-500000'` → `-Rp 500.000`; `'9007199254740993'` → `Rp 9.007.199.254.740.993` (exact); `''`, `null`, `'abc'`, `'12.5'` → `-`.
  - `parseMoneyInput`: `'1250000'`, `'1.250.000'`, `'Rp 1.250.000'`, `' 1 250 000 '` all → `'1250000'`; `'000123'` → `'123'`; `'0'` → `'0'`; `''` and `'abc'` → `null`; `'-500'` → `null` by default and `'-500'` with `allowNegative`; `'12,50'` → `null` (decimals are not rupiah); more than 18 digits → `null`.
  - `money` rule: required message when empty; `Nominal tidak valid` for unusable text; passes for a digit string.
  - `MoneyInput`: shows `1.250.000` for model `'1250000'`; typing `2500000` emits `'2500000'` and displays `2.500.000`; pasting `Rp 3.000.000` emits `'3000000'`; typing letters emits the previous digits unchanged; clearing emits `''`; with `allowNegative`, `-500000` emits `'-500000'`; uses `inputmode="numeric"`; forwards `id`, `aria-invalid` and `aria-describedby`.
  - `DateField`: model `'2026-10-06'` shows that calendar day regardless of the machine's time zone; picking a date emits `YYYY-MM-DD`; clearing emits `null`.
  - `formatCalendarDate('2026-10-06')` → `06 Okt 2026` with no day shift; `null` → `-`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** `MoneyInput` is a plain `InputText` with a computed display value; it never holds a number. `DateField` converts between the string and a local-midnight `Date` for PrimeVue's `DatePicker`, using local getters so the day never shifts.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add money and date inputs`.

---

### Task 3: Extract what the users page did inline

**Files:** Create `composables/useNotify.ts`, `composables/useToggleActive.ts`, `components/ActiveTag.vue`, `components/TableCard.vue`, `lib/labels.ts`, with specs for the two composables. Modify `views/users/UsersView.vue`, `lib/roles.ts` (fold into `labels.ts`, keep exports working through it).

- [ ] **Step 1: Failing tests** for `useNotify` (success toast; error toast uses the API message, or the fallback for a non-API error) and `useToggleActive` (activates immediately; asks before deactivating with the item's name; calls `update`, then `onChanged`, then a success toast; an API refusal shows its message and does not call `onChanged`; declining the confirmation calls nothing).
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement,** then replace the inline toast, confirm and tag code in `UsersView.vue` with the new pieces. The existing users tests must pass unchanged, which proves the extraction preserved behaviour.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `refactor(web): extract notify, toggle-active and table pieces from the users page`.

---

### Task 4: API modules

**Files:** Modify `api/types.ts`. Create `api/accounts.ts`, `api/categories.ts`, `api/projects.ts` and one spec `api/__tests__/master-data.spec.ts`.

- [ ] **Step 1: Failing tests** (stubbing `fetch`): each function calls the right method and path, sends exactly the given body, and passes filters as query values with `null`/`undefined` dropped. Cover `listAccounts`, `createAccount`, `updateAccount`; `listCategories`, `createCategory`, `updateCategory`; `listProjects`, `getProject`, `createProject`, `updateProject`, `setProjectMembers`; plus `listAssignableManagers()` which calls `GET /users?role=PROJECT_MANAGER&isActive=true&pageSize=100` and returns the `data` array.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add master data API modules`.

---

### Task 5: Master data page and accounts tab

**Files:** Create `views/master-data/MasterDataView.vue`, `AccountsTab.vue`, `AccountFormDialog.vue` and specs. Modify `router/paths.ts`, `routes.ts`, `navigation.ts` and the guard and layout specs that list the menus.

- [ ] **Step 1: Failing tests.**
  - Routing: `/master-data` opens for SUPER_ADMIN and redirects STAFF and PROJECT_MANAGER to their landing pages; the admin menu becomes Dashboard, Transaksi, Proyek, Master data, Pengguna; other menus are unchanged.
  - `MasterDataView`: two tabs, Akun and Kategori; Akun is shown first.
  - `AccountsTab`: rows show name, type label (Kas/Bank), opening balance and balance as rupiah, and the status tag; a negative balance is shown in red with the minus sign; search (debounced), type and status filters and paging send the right parameters; empty and error states as on the users page; deactivating asks for confirmation and reactivating does not; "Tambah akun" and the edit button open the dialog; saving reloads the list and shows a toast.
  - `AccountFormDialog`: create requires name and type and defaults the opening balance to `0`; sends `openingBalance` as a digit string; accepts a negative opening balance; a 409 shows `Nama akun sudah dipakai` under the name; edit pre-fills, sends only changed fields, and closes without a request when nothing changed; reopening after an error starts clean.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add master data page with accounts`.

---

### Task 6: Categories tab

**Files:** Create `views/master-data/CategoriesTab.vue`, `CategoryFormDialog.vue` and specs.

- [ ] **Step 1: Failing tests.**
  - `CategoriesTab`: two groups, Pemasukan and Pengeluaran, each listing its categories by name with a status tag; the type filter and "tampilkan nonaktif" switch call the API with `type` and `isActive`; system categories carry a "Sistem" tag and have **no** edit or deactivate control; ordinary categories can be renamed, deactivated (with confirmation) and reactivated; empty and error states.
  - `CategoryFormDialog`: create requires name and type; a 409 shows `Kategori sudah ada` under the name; edit shows the type as read-only text with the hint that a category's type cannot change, and sends only the name when it changed; reopening starts clean.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add categories tab`.

---

### Task 7: Project list

**Files:** Create `views/projects/ProjectsView.vue`, `ProjectFormDialog.vue` and specs. Modify `router/routes.ts`.

- [ ] **Step 1: Failing tests.**
  - `ProjectsView` as SUPER_ADMIN: title "Proyek"; rows show code, name, client, contract value as rupiah, status tag (Aktif / Selesai / Dibatalkan) and the member names; search and status filter and paging send the right parameters; each row links to `/proyek/<id>`; "Tambah proyek" opens the dialog; a saved project reloads the list.
  - As PROJECT_MANAGER: title "Proyek Saya"; no "Tambah proyek" button and no edit controls; the empty state reads "Anda belum ditugaskan ke proyek mana pun".
  - `ProjectFormDialog`: create requires name and client; contract value defaults to `0` and is sent as a digit string; dates are optional; an end date before the start date is caught in the browser with the message under the end date, and the API's field error for the same case lands in the same place; create has no status field, edit has one; edit sends only changed fields and sends `null` for a cleared date or note; reopening starts clean.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add project list and form`.

---

### Task 8: Project detail and members

**Files:** Create `views/projects/ProjectDetailView.vue`, `ProjectMembersPanel.vue` and specs. Modify `router/routes.ts`, `router/paths.ts` (`projectPath(id)`).

- [ ] **Step 1: Failing tests.**
  - `ProjectDetailView`: loads `GET /projects/:id` for the route id; shows code, name, client, contract value, status, dates (`-` when empty) and notes; a back link to the list; tabs "Anggota" and "Transaksi" (the latter says it is built in the next phase); a 404 shows "Proyek tidak ditemukan" with a link back, without an error toast; another failure shows the error state with retry; changing the route id loads the other project.
  - As SUPER_ADMIN an "Ubah proyek" button opens `ProjectFormDialog` and the page refreshes after saving; as PROJECT_MANAGER the button is absent.
  - `ProjectMembersPanel` as PROJECT_MANAGER: a read-only list of names and emails; no request for the manager list is made.
  - As SUPER_ADMIN: a multi-select of active project managers, pre-selected with the current members; a current member who is no longer in the active list (deactivated) still appears, marked "nonaktif", and stays selected; saving sends the selected ids and updates the list with a toast; saving with nobody selected asks for confirmation first; the save button is disabled until the selection differs from the saved one; an API field error on `userIds` is shown under the field and the selection is kept; failing to load the manager list shows a retry inside the panel only.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add project detail with member assignment`.

---

### Task 9: Browser test

**Files:** Create `apps/web/e2e/master-data.spec.ts`. Modify `apps/web/e2e/auth.spec.ts` only if shared helpers are extracted into `apps/web/e2e/helpers.ts`.

- [ ] **Step 1: Write the flow** (one test; the database is reset by the existing global setup, so it signs in as the seeded admin and changes the temporary password itself, or reuses the state left by `auth.spec.ts` if both run in one session; decide by reading how Playwright orders the two files and make the test independent of that order):
  1. Admin opens Master data, adds an account "Kas Proyek" with opening balance typed as `1.500.000`; the row shows `Rp 1.500.000` as both opening balance and balance.
  2. Adds a category "Material" of type Pengeluaran; it appears under Pengeluaran.
  3. Creates a user "Koordinator Uji" with role Koordinator Proyek.
  4. Creates a project "Rumah Uji" with contract value `850000000`; the list shows a code starting with `PRJ-` and `Rp 850.000.000`.
  5. Opens the project, assigns the coordinator in the Anggota tab, saves; the name appears in the member list.
  6. Logs out; the coordinator logs in, changes the temporary password, lands on "Proyek Saya" showing only "Rumah Uji", with no "Tambah proyek" button; opens it and sees no "Ubah proyek" button and a read-only member list.
  7. The coordinator types `/master-data` in the address bar and lands back on `/proyek`; types `/proyek/<a random UUID>` and sees "Proyek tidak ditemukan".
  8. At 360 px width the master data page (as admin) and the project list have no horizontal page scroll.
- [ ] **Step 2: Run** `npm run test:browser -w web`. Expected: both browser tests pass. Fix any defect it reveals in the owning task, with a unit test first.
- [ ] **Step 3: Commit** `test(web): add browser test for master data and projects`.

---

## Fase 2b acceptance

- [ ] Master data can be managed in the browser and projects can be listed, opened and staffed (base document, Fase 2 frontend items).
- [ ] `npm run lint`, `npm test`, `npm run test:e2e`, web build and `npm run test:browser -w web` pass.
