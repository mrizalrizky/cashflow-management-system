# Fase 3a: Transactions API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API for the core of the app: recording cash in and out with proof attachments, the approval flow, voiding, and transfers between accounts, with every role seeing and doing only what it is allowed to.

**Architecture:** All "who may do what to this transaction" rules live in one pure policy module with a table-driven unit test; services ask the policy and never re-implement a rule. All "which transactions may this user see" rules live in one scope function built on `ProjectAccessService`. Status changes are conditional updates so two people acting at once cannot both win. Files go through a small `StorageService` interface with a local-disk driver.

**Tech Stack:** NestJS 12 (ESM), Prisma 7.10.0, PostgreSQL 16, multer (already installed with `@nestjs/platform-express`), Vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md` sections 2.2, 2.4, 3, 4, 5 and base document `implementation-plan-cashflow-mvp.md` sections 5, 6, 8, 11 (Fase 3), 13. Where they conflict, the spec wins. Earlier rulings: `docs/decisions.md`.

Fase 3 is split in two. This plan (3a) is the API. Fase 3b is the web side: transaction list, form with upload, approval actions, transfer form.

## Global Constraints

- Only `APPROVED` transactions count towards balances and, later, dashboards.
- Nothing is ever hard-deleted except an attachment on a transaction that is still `PENDING` or `REJECTED`.
- Money is `bigint` in code and a digit string in JSON. A transaction amount is 1 to 13 digits and greater than zero.
- `transaction_date` is a calendar date (`YYYY-MM-DD`), separate from `created_at`, and may not be in the future (Jakarta calendar).
- Every permission decision goes through `transaction-policy.ts`; every list or lookup goes through `TransactionAccessService.scope()`. A transaction outside a user's scope answers 404, as if it did not exist.
- Approve, reject, void and cancel use a conditional update on the expected status; if no row changes, answer 409 `Transaksi sudah diproses pengguna lain`.
- Every create, edit, status change and attachment change writes an audit row in the same database transaction as the change.
- Uploaded files: at most 10 MB; only JPEG, PNG, WebP and PDF as judged from the file's content, not its name or declared type; stored under a generated key; downloaded only through an authenticated route.
- Reuse `common/` (money, calendar-date, pagination, search, validation, advisory-lock) and the test helpers. Do not copy their logic.
- The API is ESM (`.js` import suffixes). Messages are Indonesian.
- Do not write `apps/api/dist`; verify with `npm run lint -w api` (which type-checks) and the test suites.
- Out of scope: dashboards and project summaries (Fase 4), CSV/Excel export (Fase 5), an S3 storage driver, any web code.

## Review Focus

- **Horizontal access (IDOR):** a project manager fetching, editing, approving or downloading the proof of a transaction on a project they are not assigned to, and a staff user doing the same to someone else's transaction, by id, through list filters (`projectId`, `accountId`, `search`), and through attachment ids. Pinned in Tasks 2, 3, 4 and 5.
- **Approval rules at the edges:** approving your own transaction; a project manager approving an overhead transaction or one created by another project manager; approving an expense with no proof; approving something already approved, rejected or voided; two approvals at once. Pinned in Tasks 1 and 5.
- **Hostile or broken uploads:** an executable renamed to `.pdf`, a file whose declared type lies, an 11 MB file, an empty file, a file name with path separators or control characters, more files than allowed. Pinned in Task 4.
- **Transfers stay whole:** both legs are created, counted and voided together; neither can be edited, approved, cancelled or voided alone; a transfer never appears as income or expense. Pinned in Task 6.
- **Moving a pending transaction to another project:** allowed only when the user may act on both the old and the new project. Pinned in Task 3.

## File Structure

```
apps/api/src/
├─ transactions/
│  ├─ transaction-policy.ts          pure rules: canEdit, canCancel, canReview, canVoid, canAttach
│  ├─ transaction-access.service.ts  scope(user), loadForUser(user, id)
│  ├─ transactions.service.ts        create, update (and resubmit), list, get
│  ├─ transaction-workflow.service.ts  cancel, approve, reject, void
│  ├─ transfers.service.ts           create transfer; void is delegated from workflow
│  ├─ transaction.mapper.ts
│  ├─ transactions.controller.ts
│  ├─ transactions.module.ts
│  └─ dto/transaction.dto.ts
├─ attachments/
│  ├─ file-sniffer.ts                detect JPEG, PNG, WebP, PDF from bytes
│  ├─ file-name.ts                   sanitizeFileName()
│  ├─ attachments.service.ts
│  ├─ attachments.controller.ts
│  └─ attachments.module.ts
├─ storage/
│  ├─ storage.service.ts             abstract class StorageService
│  ├─ local-disk.storage.ts
│  └─ storage.module.ts              global
├─ config/env.validation.ts          (modify) STORAGE_DIR
├─ audit/audit.service.ts            (modify) new actions
└─ app.module.ts                     (modify)
apps/api/test/
├─ fixtures.ts                       (modify) createTransaction overrides, uploadProof helper, system categories
├─ routes.ts                         (modify)
└─ transaction-*.e2e-spec.ts, attachments.e2e-spec.ts, transfers.e2e-spec.ts
```

## Shared interfaces

```ts
// transactions/transaction-policy.ts  (no imports from Nest or Prisma services)
export interface PolicyActor { id: string; role: Role; assignedProjectIds: ReadonlySet<string> }
export interface PolicySubject {
  status: TxStatus; projectId: string | null; createdById: string;
  creatorRole: Role; isTransfer: boolean;
}
export interface TransactionPermissions { canEdit: boolean; canCancel: boolean; canReview: boolean; canVoid: boolean; canAttach: boolean }
export function permissionsFor(actor: PolicyActor, tx: PolicySubject): TransactionPermissions;
export function canRecordFor(actor: PolicyActor, projectId: string | null): boolean;   // create, or move an edit onto this project

// transactions/transaction-access.service.ts
TransactionAccessService.actorFor(db, user: AuthUser): Promise<PolicyActor>;          // loads assigned project ids once
TransactionAccessService.scope(actor: PolicyActor): Prisma.TransactionWhereInput;
        // SUPER_ADMIN: {}   PROJECT_MANAGER: { project_id: { in: [...assigned] } }   STAFF: { created_by_id: actor.id }
TransactionAccessService.loadForUser(db, actor, id): Promise<TransactionWithRelations>;   // 404 outside scope

// storage/storage.service.ts
export abstract class StorageService {
  abstract save(key: string, content: Buffer): Promise<void>;
  abstract open(key: string): Promise<NodeJS.ReadableStream>;    // rejects when the object is missing
  abstract delete(key: string): Promise<void>;                   // no error when already missing
}

// API shapes
interface TransactionResponse {
  id; type: 'IN' | 'OUT'; amount: string; transactionDate: string; description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'VOID';
  account: { id; name }; category: { id; name }; project: { id; code; name } | null;
  isTransfer: boolean; transferGroupId: string | null;
  createdBy: { id; name }; reviewedBy: { id; name } | null; reviewedAt: string | null; rejectReason: string | null;
  voidedBy: { id; name } | null; voidedAt: string | null; voidReason: string | null;
  attachments: { id; fileName; mimeType; sizeBytes: number; createdAt: string }[];
  permissions: TransactionPermissions;       // for the caller
  createdAt: string; updatedAt: string;
}
```

Routes (all under `/api/v1`, all roles unless noted; scope and policy decide the rest):

| Route | Notes |
|---|---|
| `GET /transactions` | paged; filters `dateFrom`, `dateTo`, `type`, `status`, `accountId`, `categoryId`, `projectId`, `overhead=true`, `search`; newest `transactionDate` first |
| `GET /transactions/:id` | |
| `POST /transactions` | always creates `PENDING` |
| `PATCH /transactions/:id` | `PENDING`, or own `REJECTED` (which resubmits it) |
| `POST /transactions/:id/cancel` | body `{ reason }`; `PENDING` becomes `VOID` |
| `POST /transactions/:id/approve` | |
| `POST /transactions/:id/reject` | body `{ reason }` |
| `POST /transactions/:id/void` | SUPER_ADMIN; body `{ reason }`; `APPROVED` becomes `VOID`; a transfer voids both legs |
| `POST /transactions/transfer` | SUPER_ADMIN; creates two `APPROVED` legs |
| `POST /transactions/:id/attachments` | multipart field `file` |
| `GET /attachments/:id/download` | streamed |
| `DELETE /attachments/:id` | |

---

### Task 1: The permission policy

**Files:** Create `transactions/transaction-policy.ts`, `transactions/transaction-policy.spec.ts`.

The rules, which the spec is the authority for:

| Action | Status needed | SUPER_ADMIN | PROJECT_MANAGER | STAFF |
|---|---|---|---|---|
| record for a project | n/a | any project or overhead | assigned projects only, never overhead | any project or overhead |
| edit | PENDING | any | own | own |
| edit (resubmit) | REJECTED | any | own | own |
| cancel | PENDING | any | own | own |
| attach or remove proof | PENDING, REJECTED | any | own | own |
| approve or reject | PENDING | any, including own | on an assigned project, created by someone else who is **not** a project manager; never overhead | never |
| void | APPROVED | yes | never | never |

A transfer leg allows only `canVoid` (SUPER_ADMIN, while APPROVED); every other permission is false for everyone.

- [ ] **Step 1: Failing unit test.** One `it.each` table covering every cell above plus: a project manager whose assignment was removed loses every permission on their own old transaction except none (they can no longer see it; the policy still answers `canEdit` by ownership, and scope hides it, so assert the policy value and leave visibility to Task 2); `VOID` allows nothing for anyone; an unknown role allows nothing; `canRecordFor` for each role with an assigned project, an unassigned project, and overhead.
- [ ] **Step 2: Run** `npm test -w api`. Expected: fail, module missing.
- [ ] **Step 3: Implement** as plain functions with one `switch` on role per rule. No I/O.
- [ ] **Step 4: Run** unit tests and lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add transaction permission policy`.

---

### Task 2: Create, list and read

**Files:** Create `transaction-access.service.ts`, `transactions.service.ts`, `transaction.mapper.ts`, `transactions.controller.ts`, `transactions.module.ts`, `dto/transaction.dto.ts`, `test/transaction-create.e2e-spec.ts`, `test/transaction-read.e2e-spec.ts`. Modify `app.module.ts`, `audit.service.ts`, `test/routes.ts`, `test/fixtures.ts`.

- [ ] **Step 1: Failing e2e tests.**

Create:
  - Each role creates a `PENDING` transaction and gets a `TransactionResponse` with nested account, category, project and creator, `attachments: []`, and `permissions` matching Task 1 for the caller.
  - SUPER_ADMIN and STAFF may record for any ACTIVE project or for overhead (`projectId` omitted or `null`). PROJECT_MANAGER: assigned project allowed; unassigned project 404 `Proyek tidak ditemukan`; overhead 403.
  - A COMPLETED or CANCELLED project is refused (400 with a field error on `projectId`) for PROJECT_MANAGER and STAFF and allowed for SUPER_ADMIN.
  - Field errors: amount `"0"`, negative, decimal, 14 digits, a JSON number; a date that does not exist; a date tomorrow (Jakarta); empty description; description over 500 characters; unknown `type`.
  - Category rules, each a field error on `categoryId`: type differs from the transaction's type; inactive; a system category; unknown id.
  - Account rules on `accountId`: inactive; unknown id.
  - `status`, `createdById` and any other unknown property are rejected.
  - An audit row `CREATE` with `amount` as a string.

Read (fixture: projects A and B; manager M on A; staff S1 and S2; transactions by each on A, on B, and overhead):
  - List scope: SUPER_ADMIN sees all; M sees every transaction on A and nothing else (including M's own old transaction on B after M was unassigned from B); S1 sees only S1's own.
  - `GET /transactions/:id` outside scope is 404 with the same body as an unknown id.
  - Filters cannot widen scope: M with `projectId=<B>` gets an empty list; S1 with `search` matching S2's description gets nothing; `overhead=true` for M is empty.
  - Filters work for SUPER_ADMIN: date range (inclusive both ends), `type`, `status`, `accountId`, `categoryId`, `projectId`, `overhead=true`, `search` on description (case-insensitive, wildcards escaped); `projectId` together with `overhead=true` is a 400.
  - Order: `transactionDate` descending, then `createdAt` descending, then id; paging metadata.
  - `permissions` in list rows reflect the caller, for example `canReview` true for M on S1's transaction on A and false on M's own.
  - No balance or other account detail beyond `id` and `name` appears for any role.
- [ ] **Step 2: Run** `npm run test:e2e -w api`. Expected: fail with 404.
- [ ] **Step 3: Implement.** `actorFor` loads the assigned project ids with one query (none for SUPER_ADMIN and STAFF). List and get include the relations in one query (no N+1) and compute `permissions` with the policy. Creation validates references inside the transaction it writes in.
- [ ] **Step 4: Run** e2e, unit, lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add transaction creation, listing and scoping`.

---

### Task 3: Edit, resubmit and cancel

**Files:** Modify `transactions.service.ts`, `transactions.controller.ts`, `dto/transaction.dto.ts`. Create `transaction-workflow.service.ts` (cancel only for now), `test/transaction-edit.e2e-spec.ts`.

- [ ] **Step 1: Failing e2e tests.**
  - The creator edits their PENDING transaction: any of type, amount, date, description, account, category, project. The same validation as create applies to the resulting whole (changing `type` without a matching category is refused).
  - SUPER_ADMIN edits anyone's PENDING transaction. A project manager cannot edit a staff member's transaction on their project (403), and nobody outside scope can (404).
  - **Moving projects:** M (on A and B) moves their own transaction from A to B: allowed. M moving it to C (unassigned): 404. M moving it to overhead: 403. STAFF moving their own to a COMPLETED project: 400.
  - APPROVED and VOID transactions cannot be edited by anyone, including SUPER_ADMIN (409 `Transaksi tidak bisa diubah pada status ini`).
  - **Resubmit:** the creator edits their REJECTED transaction; it returns to PENDING with `reviewedBy`, `reviewedAt` and `rejectReason` cleared; audit action `RESUBMIT` keeps the old reason in `before`. An edit with an empty body also resubmits.
  - **Cancel:** creator or SUPER_ADMIN, PENDING only, `reason` required (1 to 500 characters); result is `VOID` with `voidedBy`, `voidedAt`, `voidReason`; audit `CANCEL`. Cancelling twice: the second gets 409. A project manager cannot cancel a staff member's transaction.
  - A transfer leg cannot be edited or cancelled (409).
  - Audit rows carry `before` and `after`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Edit and resubmit share one code path; the write is a conditional update on the status that was read.
- [ ] **Step 4: Run** e2e, lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add transaction editing, resubmission and cancellation`.

---

### Task 4: Storage and attachments

**Files:** Create everything under `storage/` and `attachments/`, `attachments/file-sniffer.spec.ts`, `attachments/file-name.spec.ts`, `storage/local-disk.storage.spec.ts`, `test/attachments.e2e-spec.ts`. Modify `config/env.validation.ts` (+ spec), `.env.example`, `vitest.config.e2e.ts` (a temporary `STORAGE_DIR`), `app.module.ts`, `test/fixtures.ts` (`uploadProof`, sample file buffers), `.gitignore` if needed, `README.md`.

- [ ] **Step 1: Install** `npm install -w api -D @types/multer`.
- [ ] **Step 2: Failing tests.**

Unit:
  - `sniffFileType`: recognises minimal valid JPEG, PNG, WebP and PDF headers; returns null for a Windows executable (`MZ`), a ZIP, HTML, SVG, an empty buffer, and a buffer shorter than the signature.
  - `sanitizeFileName`: keeps letters, digits, spaces, dots, dashes, underscores; strips path separators (`../../etc/passwd` becomes `passwd`, `C:\\x\\nota.pdf` becomes `nota.pdf`), control characters and quotes; collapses to at most 120 characters keeping the extension; an empty or all-stripped name becomes `bukti`; forces the extension to match the sniffed type (`nota.exe` with PDF content becomes `nota.pdf`).
  - `LocalDiskStorage`: save then open returns the bytes; delete removes; delete of a missing key resolves; open of a missing key rejects; a key containing `..` or a separator is refused.
  - Env: `STORAGE_DIR` defaults to `./storage`.

e2e:
  - The creator uploads a PDF to their PENDING transaction: 201 with `id`, `fileName`, `mimeType: 'application/pdf'`, `sizeBytes`; the transaction then lists it; the stored key is not the file name.
  - Upload is refused: to an APPROVED or VOID transaction (409); by a project manager on a staff member's transaction (403); outside scope (404); to a transfer leg (409).
  - Content rules: an executable named `nota.pdf` with `Content-Type: application/pdf` is 400 `Jenis berkas tidak didukung`; a real PNG declared as `application/octet-stream` and named `x.bin` is accepted as `image/png` and renamed with `.png`; an empty file 400; 10 MB + 1 byte 413 `Berkas terlalu besar (maksimal 10 MB)`; no file 400.
  - The 11th attachment on one transaction is refused (400).
  - Download: the bytes round-trip exactly; `Content-Type` is the sniffed type; `Content-Disposition` is `attachment` with the sanitised name; `X-Content-Type-Options: nosniff`; available to everyone in scope (creator, the project's manager, SUPER_ADMIN) and 404 to everyone else (another staff user, a manager of another project), and 401 without a token.
  - Delete: uploader or SUPER_ADMIN while PENDING or REJECTED: 204, row and file gone, audit `DETACH`. After approval: 409 and the file is still there.
  - A storage failure during upload leaves no attachment row; a database failure after the file was written removes the file (service-level test with a storage double).
- [ ] **Step 3: Run.** Expected: fail.
- [ ] **Step 4: Implement.** `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })` with memory storage; map multer's size error to 413 with the Indonesian message. Keys are `<uuid>.<ext>`. `StorageModule` is global and provides `StorageService` with `LocalDiskStorage`. Download uses `StreamableFile`.
- [ ] **Step 5: Run** unit, e2e, lint. Expected: pass.
- [ ] **Step 6: Commit** `feat(api): add proof attachments with local-disk storage`.

---

### Task 5: Approve, reject and void

**Files:** Modify `transaction-workflow.service.ts`, `transactions.controller.ts`, `dto/transaction.dto.ts`. Create `test/transaction-approval.e2e-spec.ts`.

- [ ] **Step 1: Failing e2e tests.**
  - SUPER_ADMIN approves a staff member's income transaction: `APPROVED`, `reviewedBy` and `reviewedAt` set; the account balance (from `GET /accounts`) moves by exactly the amount; audit `APPROVE`.
  - **Proof rule:** an OUT transaction with no attachment cannot be approved (400 `Pengeluaran wajib punya bukti sebelum disetujui`); with one, it can. An IN transaction needs none.
  - **Who may review:** M approves S1's transaction on project A (allowed); M on S1's transaction on B (404); M on S1's overhead transaction (404, out of scope); M on another manager's transaction on A (403); M on their own (403); STAFF on anything (403 on their own, 404 on others'). SUPER_ADMIN approving their own is allowed.
  - Reject needs a reason (1 to 500 characters); result `REJECTED` with `rejectReason`; balances unchanged; audit `REJECT`.
  - **Already processed:** approving or rejecting anything not PENDING is 409. **Two at once:** `Promise.all` of two approvals gives exactly one 200 and one 409, and the balance moves once. Approve racing reject gives one winner.
  - **Void:** SUPER_ADMIN voids an APPROVED transaction with a reason; the balance returns to what it was before approval; audit `VOID`. Voiding PENDING or REJECTED is 409 (use cancel). PROJECT_MANAGER and STAFF get 403.
  - Approving for SUPER_ADMIN returns `accountBalance` (the account's balance after approval, which may be negative: approval is never refused for that); for PROJECT_MANAGER the field is absent.
  - Approval still works when the account or category has since been deactivated or the project completed.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Each action: load through scope (404), ask the policy (403), check the status-specific precondition, then `updateMany({ where: { id, status: expected }, data })` and treat `count === 0` as 409, then audit, all in one database transaction.
- [ ] **Step 4: Run** e2e, lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add approval, rejection and voiding`.

---

### Task 6: Transfers

**Files:** Create `transfers.service.ts`, `test/transfers.e2e-spec.ts`. Modify `transactions.controller.ts`, `transaction-workflow.service.ts`, `dto/transaction.dto.ts`, `test/fixtures.ts` (`seedSystemCategories`).

- [ ] **Step 1: Failing e2e tests.**
  - SUPER_ADMIN transfers 500,000 from account X to Y: 201 with both legs, each `APPROVED`, `isTransfer: true`, sharing one `transferGroupId`; the OUT leg on X uses the system category Transfer Keluar and the IN leg on Y uses Transfer Masuk; neither has a project; X's balance falls and Y's rises by exactly the amount; the total across accounts is unchanged.
  - Refused: PROJECT_MANAGER and STAFF (403); same account on both sides; an inactive or unknown account; amount zero or malformed; a future date.
  - If the system categories are missing, the request fails with 500 and nothing is written (the seed creates them; assert no orphan leg).
  - Both legs appear in the list for SUPER_ADMIN with `isTransfer: true`. A new list filter `includeTransfers=false` hides them (the web's income and expense views use it).
  - A leg cannot be edited, cancelled, approved, rejected, or given an attachment (409 for each).
  - **Void:** voiding either leg voids both with the same reason in one database transaction; both balances return; voiding again is 409; two simultaneous voids of the two legs give exactly one success.
  - Audit: one `TRANSFER` row on creation naming both leg ids, and one `VOID` row per leg.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Creation and void each run in a single database transaction. Void of a leg locates its sibling by `transfer_group_id` and uses one conditional `updateMany` over the group; anything other than exactly two rows changed rolls back with 409.
- [ ] **Step 4: Run** the full suite: `npm run lint && npm test && npm run test:e2e`. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add transfers between accounts`.

---

### Task 7: End-to-end flow and documentation

**Files:** Create `test/transaction-flow.e2e-spec.ts`. Modify `README.md`, `docs/decisions.md`.

- [ ] **Step 1: Write one flow test** that walks the base document's Fase 3 exit criterion through the API only: a staff user records an expense on project A with a proof photo; the project's manager sees it, cannot see project B's, and approves it; the staff user can no longer edit it; the admin sees the account balance reduced; the admin voids it with a reason and the balance returns; the staff user records another, the manager rejects it with a reason, the staff user edits and resubmits, and the manager approves. Every step asserts the status and the `permissions` the next actor relies on.
- [ ] **Step 2: Run.** Expected: pass (the pieces exist); if it fails, the defect belongs to the owning task and gets a focused test there first.
- [ ] **Step 3: Document.** README: where uploads are stored (`STORAGE_DIR`) and that it must be backed up together with the database. `docs/decisions.md`: the rulings made in this phase.
- [ ] **Step 4: Commit** `test(api): add end-to-end transaction flow`.

---

## Fase 3a acceptance

- [ ] Unit tests cover the permission matrix; e2e tests prove a project manager cannot see or change transactions on unassigned projects and that the record-to-approve flow works (base document, Fase 3 exit criteria).
- [ ] `npm run lint`, `npm test` and `npm run test:e2e` pass.
