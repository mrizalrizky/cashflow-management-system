# Fase 1b: Auth and Users Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A usable web app for everything Fase 1a exposes: log in, be forced to change a temporary password, stay logged in across reloads, see a role-appropriate app shell, and (as SUPER_ADMIN) manage users.

**Architecture:** One HTTP client owns the access token (in memory only) and transparently refreshes it once on a 401. A Pinia store holds the current user and drives the router guards. Pages are thin: they call typed API modules and render PrimeVue components. Form handling, error mapping and formatting live in shared composables and helpers so later phases reuse them.

**Tech Stack:** Vue 3.5 (`<script setup>`, TypeScript), Vite 8, Vue Router 5, Pinia 4, PrimeVue 4.5.5 with Aura, Tailwind 4, Vitest + @vue/test-utils, Playwright for one end-to-end flow.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` sections 2.3 and 2.4 (base document: `implementation-plan-cashflow-mvp.md` sections 6, 10, 11 Fase 1). Where they conflict, the spec wins. API contract: `docs/superpowers/plans/2026-10-06-fase-1a-auth-api.md` plus the rulings in `docs/decisions.md`.

## Global Constraints

- The access token lives in memory only. Never write it, or anything else about the session, to `localStorage`, `sessionStorage` or a cookie from JavaScript.
- The refresh token is an httpOnly cookie the browser handles; web code never reads it. All requests use `credentials: 'same-origin'`.
- Every API call goes through `src/api/http.ts`. No component calls `fetch` directly.
- All user-facing text is Indonesian. Dates display as `dd MMM yyyy` in Asia/Jakarta.
- Hiding a menu item is not access control: the API enforces roles. The web app only avoids showing what would fail.
- Shared state goes in Pinia only when more than one page needs it (the session). Everything else is local component state or a composable.
- PrimeVue stays at `4.5.5`, `@primeuix/themes` at `2.0.3`. Pin `primeicons` to `7.0.0`.
- Usable on a phone: no horizontal scrolling at 360 px width; the sidebar becomes a drawer below the `lg` breakpoint.
- Reuse over repetition: a second page must not copy form, error or table-paging logic from the first.
- Out of scope: projects, accounts, categories, transactions, dashboard, audit log page.

## Review Focus

- **Page reload while logged in:** the user stays logged in and lands on the page they were on, with no flash of the login page. Pinned in Task 4.
- **Access token expires mid-use:** the request that got 401 is retried once after a silent refresh; several requests failing together cause one refresh, not several. Pinned in Task 2.
- **Two tabs refresh at the same moment:** the losing tab retries the refresh once before giving up, so it is not logged out. Pinned in Task 2.
- **Session really gone (refresh fails):** the user is sent to the login page with the page they wanted remembered, not left on a broken screen. Pinned in Tasks 2 and 4.
- **A user typing a URL their role may not open:** they are redirected to their own landing page, and a user who must change their password cannot leave the change-password page. Pinned in Task 4.

## File Structure

```
apps/web/src/
├─ main.ts                         (modify) PrimeVue options, services, locale, session restore
├─ App.vue                         (modify) Toast + ConfirmDialog hosts
├─ api/
│  ├─ http.ts                      request(), ApiError, token holder, single-flight refresh
│  ├─ types.ts                     AuthUser, Role, User, Paginated, FieldError
│  ├─ auth.ts                      login, refresh, logout, me, changePassword
│  └─ users.ts                     listUsers, createUser, updateUser, resetUserPassword
├─ stores/session.ts               current user, login/logout/restore, role helpers
├─ router/
│  ├─ index.ts                     (modify) routes with meta
│  ├─ guards.ts                    resolveNavigation(): pure decision function
│  └─ navigation.ts                menu items and landing page per role
├─ composables/
│  ├─ useFormSubmit.ts             submitting flag, field errors, general error
│  └─ usePagedList.ts              page/pageSize/filters -> load, loading, error
├─ lib/
│  ├─ format.ts                    formatDate, roleLabel
│  └─ validation.ts                required(), minLength(), email(), collectErrors()
├─ components/
│  ├─ FormField.vue                label + slot + error text
│  ├─ PageHeader.vue               title + actions slot
│  └─ ErrorState.vue               message + retry button
├─ layouts/
│  ├─ AppLayout.vue                sidebar/drawer, top bar, logout
│  └─ AuthLayout.vue               centred card for login and change password
└─ views/
   ├─ LoginView.vue
   ├─ ChangePasswordView.vue
   ├─ HomeView.vue                 (replace) temporary landing content per role
   └─ users/
      ├─ UsersView.vue             table, filters, paging
      ├─ UserFormDialog.vue        create and edit
      └─ ResetPasswordDialog.vue
apps/web/e2e/auth.spec.ts          Playwright flow
apps/api/src/common/pagination.ts  (modify) carry-over fix
```

## Shared interfaces

```ts
// api/types.ts
export type Role = 'SUPER_ADMIN' | 'PROJECT_MANAGER' | 'STAFF';
export interface AuthUser { id: string; name: string; email: string; role: Role; mustChangePassword: boolean }
export interface User extends AuthUser { isActive: boolean; createdAt: string; updatedAt: string }
export interface Paginated<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }
export interface FieldError { field: string; messages: string[] }
export interface SessionResponse { accessToken: string; user: AuthUser }

// api/http.ts
export class ApiError extends Error {
  statusCode: number;            // 0 when the network request itself failed
  fieldErrors: FieldError[];     // empty unless the API sent `errors`
}
export interface RequestOptions { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; query?: Record<string, string | number | boolean | undefined>; auth?: boolean }
export function request<T>(path: string, options?: RequestOptions): Promise<T>;   // path is relative to /api/v1
export function setAccessToken(token: string | null): void;
export function onSessionExpired(handler: () => void): void;                      // called once when refresh fails

// stores/session.ts (Pinia, id 'session')
state:   user: AuthUser | null; ready: boolean
getters: isAuthenticated, role
actions: restore(): Promise<void>;                 // call once at startup; never throws
         login(email, password): Promise<void>;
         changePassword(current, next): Promise<void>;
         logout(): Promise<void>;
         clear(): void;

// router/guards.ts
export interface NavigationInput { user: AuthUser | null; to: { path: string; fullPath: string; meta: RouteMeta } }
export function resolveNavigation(input: NavigationInput): true | { path: string; query?: Record<string, string> };

// router/navigation.ts
export interface MenuItem { label: string; icon: string; to: string; roles: Role[] }
export const MENU: MenuItem[];
export function landingPath(role: Role): string;
export function menuFor(role: Role): MenuItem[];

// composables/useFormSubmit.ts
export function useFormSubmit<T>(action: () => Promise<T>): {
  submitting: Ref<boolean>; fieldErrors: Ref<Record<string, string>>; formError: Ref<string | null>;
  submit(clientErrors?: Record<string, string>): Promise<T | undefined>;
};

// composables/usePagedList.ts
export function usePagedList<T, F extends object>(
  fetchPage: (params: F & { page: number; pageSize: number }) => Promise<Paginated<T>>,
  initialFilters: F,
): { items: Ref<T[]>; total: Ref<number>; page: Ref<number>; pageSize: Ref<number>; filters: F; loading: Ref<boolean>; error: Ref<string | null>; reload(): Promise<void> };
```

Route meta: `{ public?: boolean; roles?: Role[]; allowPendingPasswordChange?: boolean; layout?: 'auth' | 'app' }`.

Routes: `/login` (public, auth layout), `/ganti-password` (allowPendingPasswordChange, auth layout), `/` (redirects to `landingPath(role)`), `/pengguna` (roles SUPER_ADMIN), and a catch-all that redirects to `/`. Placeholder routes `/dashboard`, `/transaksi`, `/proyek` render `HomeView` until their phases, so the menu and landing rules can be built and tested now.

Landing pages: SUPER_ADMIN `/dashboard`, PROJECT_MANAGER `/proyek`, STAFF `/transaksi`.

---

### Task 1: API carry-overs from the Fase 1a review

**Files:** Modify `apps/api/src/common/pagination.ts`, `apps/api/src/users/users.service.ts`, `apps/api/src/config/env.validation.ts`, `apps/api/test/users.e2e-spec.ts`, `apps/api/src/config/env.validation.spec.ts`, `README.md`.

- [ ] **Step 1: Failing tests.** e2e: `GET /users?page=100000000000` returns 400; two users with the same name are returned in the same order on repeated calls and across `page=1&pageSize=1` / `page=2&pageSize=1` (no repeats, no gaps). Unit: `TRUST_PROXY_HOPS=11` is rejected.
- [ ] **Step 2: Run** `npm run test:e2e -w api && npm test -w api`. Expected: those fail.
- [ ] **Step 3: Implement.** `@Max(100_000)` on `page`; `orderBy: [{ name: 'asc' }, { id: 'asc' }]`; `@Max(10)` on `TRUST_PROXY_HOPS`. README: a short section on `TRUST_PROXY_HOPS` (0 when the API is reached directly, 1 behind one reverse proxy; too low shares one login rate limit across everyone, too high lets clients forge their IP).
- [ ] **Step 4: Run** the same commands plus `npm run lint -w api`. Expected: pass.
- [ ] **Step 5: Commit** `fix(api): bound page number, stabilise user ordering, document proxy hops`.

---

### Task 2: HTTP client with silent refresh

**Files:** Create `apps/web/src/api/types.ts`, `apps/web/src/api/http.ts`, `apps/web/src/api/__tests__/http.spec.ts`. Delete `apps/web/src/api/health.ts` and its spec (the health indicator goes away with the new home page in Task 6; if anything still imports it at this point, leave the file until Task 6).

**Interfaces:** Produces everything listed under `api/http.ts` and `api/types.ts`.

- [ ] **Step 1: Failing tests** (`http.spec.ts`, stubbing global `fetch`):
  - Sends `GET /api/v1/users?page=2&search=a%20b`, skipping `undefined` query values, with `credentials: 'same-origin'`.
  - Sends a JSON body with `Content-Type: application/json`; sends no body and no content type for GET.
  - Adds `Authorization: Bearer <token>` when a token is set; omits it when `auth: false`.
  - Returns parsed JSON; returns `undefined` for 204.
  - A 400 with `errors` throws `ApiError` with `statusCode`, `message` and `fieldErrors`.
  - A network failure throws `ApiError` with `statusCode: 0` and message `Tidak dapat terhubung ke server`.
  - A non-JSON error body (HTML from a proxy) throws `ApiError` with a generic Indonesian message, not a parse error.
  - **Silent refresh:** a 401 on an authenticated request triggers `POST /auth/refresh`, stores the new token and retries the original request once with it.
  - **Single flight:** three requests that all get 401 cause exactly one refresh call, and all three succeed.
  - **Two tabs:** when the first refresh attempt answers 401, the client tries the refresh exactly once more before giving up.
  - **Session gone:** when the refresh fails twice, the token is cleared, the `onSessionExpired` handler is called exactly once (even with three waiting requests), and each request rejects with a 401 `ApiError`.
  - A 401 on `auth: false` requests (login) is **not** refreshed; it is thrown as is.
  - A request retried after refresh that gets 401 again is thrown, not refreshed in a loop.
- [ ] **Step 2: Run** `npm test -w web`. Expected: fail, module missing.
- [ ] **Step 3: Implement.** The refresh logic is the part to get exactly right:

```ts
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

async function callRefresh(): Promise<boolean> {
  // Dicoba dua kali: tab lain mungkin baru saja merotasi token yang sama.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const session = await send<SessionResponse>('/auth/refresh', { method: 'POST', auth: false });
      accessToken = session.accessToken;
      return true;
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 401) return false;
    }
  }
  return false;
}

/** Semua request yang gagal 401 menunggu satu refresh yang sama. */
function refreshOnce(): Promise<boolean> {
  refreshing ??= callRefresh()
    .then((ok) => {
      if (!ok) {
        accessToken = null;
        sessionExpiredHandler?.();
      }
      return ok;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const authenticated = options.auth !== false;
  try {
    return await send<T>(path, options);
  } catch (error) {
    const expired = error instanceof ApiError && error.statusCode === 401 && authenticated;
    if (!expired || !(await refreshOnce())) throw error;
    return send<T>(path, options);
  }
}
```

`send` builds the URL, headers and body, calls `fetch`, and converts every failure to `ApiError`. Export `refreshSession(): Promise<SessionResponse | null>` for the store's startup restore, built on the same `callRefresh` path so restore and silent refresh never race each other.

- [ ] **Step 4: Run** `npm test -w web && npm run lint -w web`. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add HTTP client with silent token refresh`.

---

### Task 3: API modules and session store

**Files:** Create `apps/web/src/api/auth.ts`, `apps/web/src/api/users.ts`, `apps/web/src/stores/session.ts`, `apps/web/src/stores/__tests__/session.spec.ts`.

**Interfaces:** Consumes `request`, `setAccessToken`, `onSessionExpired`, `refreshSession`. Produces the `session` store and the API functions:

```ts
// api/auth.ts
login(email, password): Promise<SessionResponse>          // auth: false
logout(): Promise<void>                                   // auth: false
changePassword(currentPassword, newPassword): Promise<SessionResponse>
// api/users.ts
listUsers(params: { page; pageSize; search?; role?; isActive? }): Promise<Paginated<User>>
createUser(input: { name; email; role; password }): Promise<User>
updateUser(id, input: Partial<{ name; email; role; isActive }>): Promise<User>
resetUserPassword(id, newPassword): Promise<User>
```

- [ ] **Step 1: Failing tests** (`session.spec.ts`, mocking the `api/auth` and `api/http` modules):
  - `restore()` with a valid refresh sets `user` and `ready`; with no session leaves `user` null and still sets `ready`; never throws, even on a network error.
  - `restore()` called twice performs one refresh.
  - `login()` stores the user and the token; a failed login leaves the store empty and rethrows.
  - `changePassword()` replaces the user (so `mustChangePassword` becomes false) and the token.
  - `logout()` clears the store even when the API call fails.
  - When the HTTP client reports session expiry, the store clears itself.
  - Nothing is ever written to `localStorage` or `sessionStorage` (spy on `Storage.prototype.setItem`).
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** as a setup-style Pinia store. `restore()` memoises its promise.
- [ ] **Step 4: Run** tests and lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add auth and users API modules and session store`.

---

### Task 4: Routing, guards and navigation

**Files:** Create `apps/web/src/router/guards.ts`, `apps/web/src/router/navigation.ts`, `apps/web/src/router/__tests__/guards.spec.ts`, `apps/web/src/router/__tests__/navigation.spec.ts`. Modify `apps/web/src/router/index.ts`, `apps/web/src/main.ts`.

**Interfaces:** Produces `resolveNavigation`, `MENU`, `menuFor`, `landingPath`, and the route table described under Shared interfaces.

- [ ] **Step 1: Failing tests.** `resolveNavigation` is a pure function, so every rule is a table row:

| user | going to | result |
|---|---|---|
| none | `/pengguna` | `/login?redirect=/pengguna` |
| none | `/login` | allowed |
| logged in | `/login` | their landing page |
| must change password | any page but `/ganti-password` | `/ganti-password` |
| must change password | `/ganti-password` | allowed |
| no pending change | `/ganti-password` | allowed (voluntary change) |
| STAFF | `/pengguna` | `/transaksi` |
| PROJECT_MANAGER | `/pengguna` | `/proyek` |
| SUPER_ADMIN | `/pengguna` | allowed |
| any role | `/` | their landing page |
| none | `/login?redirect=//evil.example` then logged in | landing page, never an external URL |

  `navigation.spec.ts`: `menuFor` returns Dashboard, Transaksi, Proyek, Pengguna for SUPER_ADMIN; Proyek Saya, Transaksi for PROJECT_MANAGER; Transaksi for STAFF. Every menu path is allowed by `resolveNavigation` for that role.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** `router.beforeEach` awaits `session.restore()` and then returns `resolveNavigation(...)`; this await is what prevents the login page flashing on reload. After login, redirect to the `redirect` query only when it starts with a single `/`. Register `onSessionExpired` in `main.ts` to push `/login?redirect=<current fullPath>`. Master data and audit log are not in the menu yet; each is added by the phase that builds its page.
- [ ] **Step 4: Run** tests, lint, `npm run build -w web`. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add route guards and role-based navigation`.

---

### Task 5: Form building blocks, login and change password

**Files:** Create `apps/web/src/lib/validation.ts`, `apps/web/src/composables/useFormSubmit.ts`, `apps/web/src/components/FormField.vue`, `apps/web/src/layouts/AuthLayout.vue`, `apps/web/src/views/LoginView.vue`, `apps/web/src/views/ChangePasswordView.vue`, and specs for `validation`, `useFormSubmit`, `LoginView`, `ChangePasswordView`. Modify `apps/web/src/main.ts` (PrimeVue `cssLayer`, `ToastService`, `ConfirmationService`, Indonesian locale from `primelocale`, `primeicons` CSS), `apps/web/src/App.vue`, `apps/web/src/assets/main.css` (layer order).

- [ ] **Step 1: Install** `npm install -w web --save-exact primeicons@7.0.0 && npm install -w web primelocale`.
- [ ] **Step 2: Failing tests.**
  - `validation`: `required`, `minLength(8)`, `email` return an Indonesian message or `null`; `collectErrors({ field: [rules] }, values)` returns only the fields that failed, first message each.
  - `useFormSubmit`: sets `submitting` during the call; client errors block the call; an `ApiError` with `fieldErrors` fills `fieldErrors` (first message per field) and a 400 without them fills `formError`; a network error fills `formError` with the connection message; a second submit while one is running is ignored; errors clear on the next submit.
  - `LoginView`: empty submit shows required messages and calls nothing; a valid submit calls `session.login` with the typed values; a 401 shows `Email atau password salah`; a 429 shows the rate-limit message; the button is disabled and shows a spinner while submitting; success navigates to the `redirect` query or the landing page; a user with `mustChangePassword` is sent to `/ganti-password`.
  - `ChangePasswordView`: shows the "wajib ganti password" notice only when a change is pending; rejects a new password under 8 characters and a confirmation that differs, without calling the API; a server field error on `currentPassword` appears under that field; success navigates to the landing page; a logout link is present so a user who cannot change the password can leave.
- [ ] **Step 3: Run.** Expected: fail.
- [ ] **Step 4: Implement.** `FormField` renders a `<label for>`, the default slot, and the error with `role="alert"`; inputs get `aria-invalid`. PrimeVue is configured with `cssLayer: { name: 'primevue', order: 'theme, base, primevue, utilities' }` so Tailwind utilities can override component styles. Passwords use PrimeVue `Password` with `toggleMask` and `:feedback="false"`.
- [ ] **Step 5: Run** tests, lint, build. Expected: pass.
- [ ] **Step 6: Commit** `feat(web): add login and change password pages`.

---

### Task 6: App shell

**Files:** Create `apps/web/src/layouts/AppLayout.vue`, `apps/web/src/components/PageHeader.vue`, `apps/web/src/layouts/__tests__/AppLayout.spec.ts`. Modify `apps/web/src/App.vue` (choose layout from `route.meta.layout`), `apps/web/src/views/HomeView.vue` (replace the health indicator with a plain placeholder: page title and "Halaman ini dibangun pada fase berikutnya"). Delete `apps/web/src/api/health.ts` and both old specs.

- [ ] **Step 1: Failing tests** (`AppLayout.spec.ts`): renders exactly `menuFor(role)` for each of the three roles; marks the active item with `aria-current="page"`; shows the user's name and role label; the user menu offers "Ganti password" and "Keluar"; "Keluar" calls `session.logout` and navigates to `/login`; the mobile menu button toggles the drawer and choosing an item closes it.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Fixed sidebar from `lg` up; PrimeVue `Drawer` below it. One `<nav>` component is used in both places. `lib/format.ts` gets `roleLabel` (`Super Admin`, `Koordinator Proyek`, `Staf`).
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add app shell with role-based menu`.

---

### Task 7: User management page

**Files:** Create `apps/web/src/composables/usePagedList.ts`, `apps/web/src/components/ErrorState.vue`, `apps/web/src/lib/format.ts` (add `formatDate`), `apps/web/src/views/users/UsersView.vue`, `UserFormDialog.vue`, `ResetPasswordDialog.vue`, and specs for `usePagedList`, `format`, `UsersView`, `UserFormDialog`, `ResetPasswordDialog`.

- [ ] **Step 1: Failing tests.**
  - `usePagedList`: loads page 1 on first `reload`; changing a filter resets to page 1 and reloads; a slow earlier response never overwrites a newer one; an error sets `error` and keeps the previous items; `loading` is true only while the latest request is pending.
  - `formatDate('2026-10-06T17:30:00.000Z')` is `07 Okt 2026` (Jakarta is the next day); an invalid input returns `-`.
  - `UsersView`: shows name, email, role label, status tag and created date per row; typing in search reloads after a 300 ms debounce with `search`; role and status filters send `role` and `isActive`; paging sends `page` and `pageSize`; shows an empty state ("Belum ada pengguna" / "Tidak ada pengguna yang cocok") and an error state with a working retry; "Nonaktifkan" asks for confirmation, then calls `updateUser(id, { isActive: false })`, shows a success toast and reloads; the current user's own row has no deactivate action; an API refusal is shown as an error toast with the API's message.
  - `UserFormDialog`: create mode requires name, valid email, role and a password of 8+ characters; edit mode has no password field and sends only changed fields; a 409 shows `Email sudah dipakai` under the email field; on success it emits `saved` and closes.
  - `ResetPasswordDialog`: requires 8+ characters; on success shows that the user must change it at next login, emits `saved`, closes.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** PrimeVue `DataTable` with `lazy` paging driven by `usePagedList`; on small screens the table scrolls inside its own container and secondary columns are hidden. Both dialogs use `useFormSubmit` and `FormField`. `UsersService`'s 409 arrives without `fieldErrors`, so `UserFormDialog` maps status 409 to the email field.
- [ ] **Step 4: Run** tests, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): add user management page`.

---

### Task 8: End-to-end flow in a real browser

**Files:** Create `apps/web/playwright.config.ts`, `apps/web/e2e/auth.spec.ts`, `apps/web/e2e/global-setup.ts`. Modify `apps/web/package.json` (script `test:browser`), root `package.json`, `.github/workflows/ci.yml`, `.gitignore`, `README.md`.

- [ ] **Step 1: Install** `npm install -w web -D @playwright/test && npx -w web playwright install chromium`.
- [ ] **Step 2: Configure.** `global-setup.ts` refuses to run unless the database name ends in `_test`, applies migrations, truncates the tables and seeds an admin (`admin@example.com`, a known temporary password). `webServer` starts the API on port 3100 against `cashflow_test` and Vite on port 5174 proxying to it (make the proxy target read `VITE_API_TARGET`, default `http://localhost:3000`), so the developer's own dev servers and database are untouched.
- [ ] **Step 3: Write the flow.** One test, in order:
  1. Opening `/pengguna` while logged out lands on `/login`.
  2. Logging in as the seeded admin lands on `/ganti-password` and no other page can be opened.
  3. Changing the password lands on `/dashboard`; the menu shows the four admin items.
  4. Reloading the page keeps the user logged in on the same page.
  5. On Pengguna, creating a STAFF user makes them appear in the table.
  6. Logging out returns to `/login`; the browser's Back button does not reveal the app.
  7. The new STAFF user logs in, is forced to change their password, lands on `/transaksi`, sees only the Transaksi menu item, and typing `/pengguna` in the address bar sends them back to `/transaksi`.
  8. At a 360 px wide viewport the page has no horizontal scrollbar and the menu opens as a drawer.
- [ ] **Step 4: Run** `npm run test:browser -w web`. Expected: 1 passed. Fix any defect it reveals in the owning task's code, with a unit test first.
- [ ] **Step 5: CI.** Add a step that installs Chromium and runs the browser test after the existing steps.
- [ ] **Step 6: Commit** `test(web): add browser test for the login and user management flow`.

---

## Fase 1b acceptance

- [ ] The base document's Fase 1 frontend items work: login, route guards, token attached to requests with automatic refresh.
- [ ] `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build` and `npm run test:browser -w web` pass.
- [ ] No session data is stored by JavaScript anywhere in the browser.

## Deliberately deferred

- **API types generated from OpenAPI** (spec section 2.4). The handful of types this phase needs are hand-written in `api/types.ts`. Generation is set up at the start of Fase 2, when the number of DTOs makes drift a real risk and `@nestjs/swagger` decorators can be added to all DTOs in one pass.
