# Implementation Plan: Aplikasi Arus Kas Perusahaan (MVP)

Dokumen ini adalah brief untuk Claude Code. Kerjakan **per fase** secara berurutan. Setelah tiap fase selesai, jalankan test, pastikan acceptance criteria terpenuhi, lalu lanjut ke fase berikutnya. Kalau ada keputusan yang tidak tercakup di dokumen ini, pilih default yang paling sederhana dan catat di `docs/decisions.md`.

---

## 1. Konteks

- Perusahaan: konsultan dan kontraktor properti (bangun rumah, interior design), karyawan kurang dari 10 orang.
- Tujuan: aplikasi web internal untuk melihat arus kas masuk dan keluar, baik **per perusahaan** maupun **per proyek**.
- Satu transaksi terkait **paling banyak satu proyek**. Transaksi tanpa proyek dianggap **overhead perusahaan** (gaji, sewa kantor, listrik, pajak, dll).
- Satu perusahaan saja (single tenant). Mata uang hanya IDR. Bahasa antarmuka: Indonesia.

## 2. Ruang lingkup

### Termasuk (MVP)
1. Autentikasi dan manajemen user dengan 3 peran (SUPER_ADMIN, PROJECT_MANAGER, STAFF), termasuk penugasan PROJECT_MANAGER ke proyek tertentu
2. Master data: akun kas/bank, kategori transaksi, proyek
3. Transaksi kas masuk/keluar (plus transfer antar akun) dengan upload bukti
4. Alur approval sederhana
5. Dashboard perusahaan dan dashboard per proyek
6. Audit log
7. Deployment dengan Docker

### Tidak termasuk (jangan dibangun sekarang)
- BOQ (Bill of Quantities)
- Payroll, absensi, HRIS
- Jadwal termin klien, hutang/piutang, invoice
- Laporan laba rugi formal, integrasi pajak
- Multi-currency, multi-company

Namun **rancang skema supaya mudah ditambah** modul di atas lewat migrasi biasa (lihat bagian 12).

## 3. Tech stack

| Lapisan | Pilihan |
|---|---|
| Backend | NestJS (TypeScript), REST API, validasi dengan `class-validator` |
| Database | PostgreSQL 16 |
| ORM | Prisma (migrasi lewat `prisma migrate`) |
| Auth | JWT access token (15 menit) + refresh token (7 hari), password hash dengan argon2 |
| Frontend | Angular (versi stabil terbaru), PrimeNG, Tailwind CSS, NgRx untuk state yang dibagi antar halaman |
| Chart | PrimeNG Chart (Chart.js) |
| Storage bukti | Abstraksi `StorageService`; implementasi awal: S3-compatible (MinIO untuk dev/homelab), bisa diganti disk lokal |
| Testing | Jest (unit + e2e backend), Playwright untuk 2 sampai 3 alur kritis di frontend |
| Deployment | Docker Compose: `api`, `web` (nginx), `postgres`, `minio` |

## 4. Struktur repo

```
/
├─ apps/
│  ├─ api/            # NestJS
│  └─ web/            # Angular
├─ docker-compose.yml
├─ docker-compose.dev.yml
├─ docs/
│  ├─ decisions.md
│  └─ api.md          # ringkasan endpoint (atau OpenAPI via @nestjs/swagger)
├─ CLAUDE.md          # aturan kerja untuk Claude Code (lihat bagian 14)
└─ README.md
```

## 5. Aturan data dan bisnis (penting)

1. **Uang disimpan sebagai integer rupiah** (`BigInt`/`bigint`), tanpa desimal. Jangan pakai float.
2. **Tanggal**: simpan UTC, tampilkan dalam Asia/Jakarta (WIB). Field `transaction_date` bertipe DATE (tanggal transaksi sebenarnya), terpisah dari `created_at`.
3. **Transaksi tidak pernah dihapus permanen.** Gunakan status `VOID` dengan alasan. Transaksi yang sudah `APPROVED` hanya bisa di-void oleh SUPER_ADMIN, tidak bisa diedit bebas.
4. **Hanya transaksi `APPROVED` yang dihitung** di saldo dan dashboard.
5. **Saldo akun dihitung**, bukan disimpan: `opening_balance + total masuk approved - total keluar approved +/- transfer`.
6. **Transfer antar akun**: dibuat sebagai 2 transaksi terhubung (`transfer_group_id`): satu OUT di akun asal, satu IN di akun tujuan, kategori khusus "Transfer". Transaksi bertipe transfer **dikecualikan** dari laporan pemasukan dan pengeluaran.
7. **Kategori** punya tipe (`IN` atau `OUT`). Transaksi harus memakai kategori dengan tipe yang sama.
8. **Proyek berstatus `COMPLETED` atau `CANCELLED`**: transaksi baru ke proyek tersebut ditolak kecuali oleh SUPER_ADMIN.
9. Semua perubahan pada transaksi, proyek, akun, kategori, dan user dicatat di audit log.
10. **Penamaan database memakai `snake_case`** (tabel, kolom, enum, index). Detail di bagian 7.

## 6. Peran dan hak akses

Tiga peran: **SUPER_ADMIN**, **PROJECT_MANAGER** (koordinator proyek), dan **STAFF**. Akses PROJECT_MANAGER dibatasi pada proyek yang ditugaskan kepadanya lewat tabel `ProjectMember`. Hanya user dengan peran PROJECT_MANAGER yang bisa ditugaskan ke proyek.

| Aksi | SUPER_ADMIN | PROJECT_MANAGER | STAFF |
|---|---|---|---|
| Lihat dashboard perusahaan | ya | tidak | tidak |
| Lihat daftar dan ringkasan proyek | semua proyek | hanya proyek yang ditugaskan | tidak (hanya melihat kode dan nama proyek aktif di dropdown input) |
| Buat/edit proyek, tugaskan PROJECT_MANAGER | ya | tidak | tidak |
| Lihat transaksi | semua | hanya transaksi pada proyek yang ditugaskan | hanya miliknya sendiri |
| Input transaksi (status PENDING) | semua proyek dan overhead | hanya proyek yang ditugaskan, tidak bisa overhead | proyek aktif mana pun atau overhead |
| Edit/hapus transaksi PENDING | semua | miliknya sendiri | miliknya sendiri |
| Approve / reject transaksi | semua | transaksi proyek yang ditugaskan, **buatan orang lain** | tidak |
| Void transaksi APPROVED | ya | tidak | tidak |
| Kelola akun dan kategori | ya | tidak | tidak |
| Lihat saldo akun | ya | tidak | tidak |
| Kelola user dan lihat audit log | ya | tidak | tidak |

Aturan tambahan:
- **Tidak ada yang boleh meng-approve transaksi buatannya sendiri**, kecuali SUPER_ADMIN.
- Transaksi **overhead** (tanpa proyek) dan transaksi **buatan PROJECT_MANAGER** hanya bisa di-approve oleh SUPER_ADMIN.
- PROJECT_MANAGER dan STAFF boleh memilih akun kas/bank saat input transaksi, tetapi hanya melihat nama akun, **tanpa saldo**.
- Transaksi yang dibuat SUPER_ADMIN boleh langsung `APPROVED` (opsi auto-approve saat membuat).
- **Pembatasan akses proyek wajib dilakukan di sisi server** (service/query level), bukan hanya dengan menyembunyikan menu. Setiap query transaksi dan proyek untuk PROJECT_MANAGER harus difilter berdasarkan `ProjectMember`. Mengakses proyek lain lewat ID harus menghasilkan 404 atau 403.
- Bila PROJECT_MANAGER dicabut dari sebuah proyek, aksesnya ke proyek tersebut hilang seketika. Transaksi yang sudah ia buat tetap ada.

## 7. Model data (Prisma, ringkas)

**Konvensi penamaan database: `snake_case`.**
- Nama tabel: `snake_case` bentuk jamak (`users`, `project_members`, `audit_logs`).
- Nama kolom: `snake_case` (`created_at`, `contract_value`).
- Nama tipe enum: `snake_case` (`tx_status`); nilai enum tetap `UPPER_CASE`.
- Nama index dan constraint: `idx_<tabel>_<kolom>` dan `uq_<tabel>_<kolom>`.
- Di Prisma, nama model dan field tetap `PascalCase`/`camelCase` supaya kode TypeScript idiomatis, dipetakan ke `snake_case` lewat `@@map` dan `@map`. Properti JSON di API tetap `camelCase`.
- Setiap model dan field baru wajib memakai `@@map`/`@map` sejak awal.


```prisma
enum Role {
  SUPER_ADMIN
  PROJECT_MANAGER
  STAFF
  @@map("role")
}

enum TxType {
  IN
  OUT
  @@map("tx_type")
}

enum TxStatus {
  PENDING
  APPROVED
  REJECTED
  VOID
  @@map("tx_status")
}

enum ProjectStatus {
  ACTIVE
  COMPLETED
  CANCELLED
  @@map("project_status")
}

enum AccountType {
  CASH
  BANK
  @@map("account_type")
}

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         Role
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("users")
}

model Account {
  id             String      @id @default(uuid())
  name           String
  type           AccountType
  openingBalance BigInt      @default(0) @map("opening_balance")
  isActive       Boolean     @default(true) @map("is_active")
  createdAt      DateTime    @default(now()) @map("created_at")

  @@map("accounts")
}

model Category {
  id        String  @id @default(uuid())
  name      String
  type      TxType
  isSystem  Boolean @default(false) @map("is_system") // mis. "Transfer", tidak bisa dihapus
  isActive  Boolean @default(true) @map("is_active")

  @@unique([name, type], map: "uq_categories_name_type")
  @@map("categories")
}

model Project {
  id            String        @id @default(uuid())
  code          String        @unique            // mis. PRJ-2026-001
  name          String
  clientName    String        @map("client_name")
  contractValue BigInt        @default(0) @map("contract_value")
  status        ProjectStatus @default(ACTIVE)
  startDate     DateTime?     @map("start_date")
  endDate       DateTime?     @map("end_date")
  notes         String?
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  @@map("projects")
}

model ProjectMember {
  projectId  String   @map("project_id")
  userId     String   @map("user_id")   // wajib user dengan role PROJECT_MANAGER (validasi di service)
  assignedAt DateTime @default(now()) @map("assigned_at")
  assignedBy String?  @map("assigned_by")

  @@id([projectId, userId])
  @@index([userId], map: "idx_project_members_user_id")
  @@map("project_members")
}

model Transaction {
  id              String    @id @default(uuid())
  type            TxType
  amount          BigInt                                  // > 0, rupiah
  transactionDate DateTime  @db.Date @map("transaction_date")
  description     String
  status          TxStatus  @default(PENDING)
  accountId       String    @map("account_id")
  categoryId      String    @map("category_id")
  projectId       String?   @map("project_id")            // null = overhead perusahaan
  transferGroupId String?   @map("transfer_group_id")     // pasangan transfer
  createdById     String    @map("created_by_id")
  approvedById    String?   @map("approved_by_id")
  approvedAt      DateTime? @map("approved_at")
  rejectReason    String?   @map("reject_reason")
  voidReason      String?   @map("void_reason")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  attachments     Attachment[]
  // relasi ke Account, Category, Project, User

  @@index([transactionDate], map: "idx_transactions_transaction_date")
  @@index([projectId, status], map: "idx_transactions_project_id_status")
  @@index([accountId, status], map: "idx_transactions_account_id_status")
  @@map("transactions")
}

model Attachment {
  id            String   @id @default(uuid())
  transactionId String   @map("transaction_id")
  storageKey    String   @map("storage_key")
  fileName      String   @map("file_name")
  mimeType      String   @map("mime_type")
  sizeBytes     Int      @map("size_bytes")
  uploadedById  String   @map("uploaded_by_id")
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("attachments")
}

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")
  action     String   // CREATE | UPDATE | APPROVE | REJECT | VOID | LOGIN | ...
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id")
  before     Json?
  after      Json?
  ip         String?
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([entityType, entityId], map: "idx_audit_logs_entity")
  @@index([createdAt], map: "idx_audit_logs_created_at")
  @@map("audit_logs")
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  tokenHash String    @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")

  @@map("refresh_tokens")
}
```

### Seed data
- 1 user SUPER_ADMIN awal (email dan password dari environment variable, wajib ganti saat login pertama)
- Akun contoh: "Kas Kecil", "Rekening Bank Utama"
- Kategori masuk: DP Proyek, Termin Proyek, Pelunasan Proyek, Pendapatan Lain
- Kategori keluar: Material, Upah Tukang, Subkontraktor, Peralatan, Transportasi, Perizinan, Gaji Staf, Sewa Kantor, Utilitas, Pajak, Operasional Lain
- Kategori sistem: Transfer Masuk, Transfer Keluar

## 8. Endpoint API (ringkas)

Semua di bawah `/api/v1`, dilindungi JWT dan role guard.

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`
- `GET/POST/PATCH /users` (SUPER_ADMIN)
- `GET/POST/PATCH /accounts` (tulis: SUPER_ADMIN), `GET /accounts/options` (id dan nama saja, tanpa saldo, untuk semua role)
- `GET/POST/PATCH /categories`
- `GET /projects`, `GET /projects/:id`, `GET /projects/:id/summary` (di-scope: SUPER_ADMIN semua, PROJECT_MANAGER hanya proyek yang ditugaskan)
- `POST/PATCH /projects` (SUPER_ADMIN), `PUT /projects/:id/members` (SUPER_ADMIN; set daftar PROJECT_MANAGER proyek)
- `GET /projects/options` (id, kode, nama proyek aktif; untuk dropdown input, di-scope sesuai role)
- `GET /transactions` (filter: tanggal, akun, kategori, proyek, status, tipe, pencarian teks; paginasi)
- `POST /transactions`, `PATCH /transactions/:id`, `POST /transactions/:id/approve`, `/reject`, `/void`
- `POST /transactions/transfer`
- `POST /transactions/:id/attachments`, `GET /attachments/:id/download` (signed URL atau stream), `DELETE /attachments/:id`
- `GET /dashboard/company?from=&to=` (SUPER_ADMIN)
- `GET /audit-logs` (SUPER_ADMIN; filter entitas, user, tanggal)

Format error seragam: `{ statusCode, message, errors? }`. Dokumentasikan dengan `@nestjs/swagger`.

## 9. Dashboard (definisi metrik)

### Perusahaan (`/dashboard/company`, hanya SUPER_ADMIN)
- Saldo per akun dan total saldo
- Total masuk dan total keluar pada periode (tanpa transfer), serta selisih
- Arus kas per bulan (12 bulan terakhir atau rentang yang dipilih): masuk, keluar, net
- Pengeluaran per kategori (periode terpilih)
- Pengeluaran overhead (tanpa proyek) vs pengeluaran proyek
- 10 transaksi terbaru dan jumlah transaksi PENDING yang menunggu approval

### Per proyek (`/projects/:id/summary`, SUPER_ADMIN semua proyek, PROJECT_MANAGER hanya proyek yang ditugaskan)
- Nilai kontrak, total diterima, **sisa belum diterima** (kontrak dikurangi diterima), persentase diterima
- Total biaya proyek dan **selisih kas** (diterima dikurangi biaya)
- Biaya per kategori
- Daftar transaksi proyek

Semua query agregasi dilakukan di database (SQL/Prisma `groupBy`), bukan dengan memuat semua baris ke memori.

## 10. Frontend (halaman Angular)

1. Login, ganti password
2. Layout dengan sidebar (menu tampil sesuai role)
3. Dashboard perusahaan
4. Daftar transaksi: filter, pencarian, paginasi, badge status, aksi approve/reject/void sesuai role
5. Form transaksi (dialog/halaman): tipe, jumlah (input format Rupiah), tanggal, akun, kategori (terfilter sesuai tipe), proyek opsional, deskripsi, upload bukti (drag and drop, preview gambar/PDF)
6. Form transfer antar akun
7. Daftar proyek dan detail proyek (ringkasan + tab transaksi). Untuk PROJECT_MANAGER menu ini bernama **Proyek Saya** dan hanya menampilkan proyek yang ditugaskan. SUPER_ADMIN punya tab **Anggota** untuk menugaskan PROJECT_MANAGER
8. Master data: akun, kategori
9. Manajemen user (SUPER_ADMIN)
10. Audit log (SUPER_ADMIN)

Halaman awal dan menu per peran:
- **SUPER_ADMIN**: landing di Dashboard perusahaan. Menu: Dashboard, Transaksi, Proyek, Master data, Pengguna, Audit log.
- **PROJECT_MANAGER**: landing di Proyek Saya. Menu: Proyek Saya, Transaksi (hanya proyek yang ditugaskan).
- **STAFF**: landing di Transaksi miliknya. Menu: Transaksi.

Ketentuan UI: responsif (dipakai juga lewat HP untuk input bukti di lapangan), format angka `Rp 1.250.000`, tanggal `dd MMM yyyy`, loading dan error state konsisten, konfirmasi sebelum aksi destruktif.

## 11. Fase pengerjaan

### Fase 0: Setup
- Inisialisasi monorepo, lint, prettier, husky (opsional), konfigurasi env
- Docker Compose dev (postgres, minio), skrip seed
- CI sederhana (lint + test) bila memakai GitHub Actions

**Selesai bila:** `docker compose up` menjalankan DB dan storage, API dan web bisa jalan lokal, ada endpoint `/health`.

### Fase 1: Auth dan user
- Login, refresh, logout, ganti password, role guard, decorator `@Roles()`
- CRUD user (SUPER_ADMIN), rate limit pada login, audit log untuk login dan perubahan user
- Frontend: login, guard rute, interceptor token + refresh otomatis

**Selesai bila:** tiga role terbukti dibatasi lewat e2e test; user nonaktif tidak bisa login.

### Fase 2: Master data
- CRUD akun, kategori, proyek (dengan validasi dan soft-deactivate, bukan hapus)
- Pembuatan kode proyek otomatis
- Penugasan PROJECT_MANAGER ke proyek (`ProjectMember`) beserta validasi role dan helper scoping akses proyek yang dipakai ulang di semua modul
- Frontend: halaman master data dan daftar/detail proyek (tanpa ringkasan dulu)

**Selesai bila:** data master bisa dikelola dan terpakai di dropdown fase berikutnya.

### Fase 3: Transaksi, bukti, approval
- CRUD transaksi sesuai aturan bagian 5 dan 6, transfer antar akun
- Upload/download bukti (batas 10 MB, tipe: jpg, png, webp, pdf; validasi mime dan ukuran di server)
- Approve/reject/void dengan audit log
- Frontend: daftar, filter, form, upload, aksi approval

**Selesai bila:** unit test aturan bisnis (saldo, transfer, status, larangan self-approve, approval sesuai peran) lulus, e2e test membuktikan PROJECT_MANAGER tidak bisa melihat atau mengubah transaksi proyek yang tidak ditugaskan kepadanya dan alur input sampai approve berjalan end-to-end.

### Fase 4: Dashboard
- Endpoint agregasi dan ringkasan proyek (bagian 9)
- Frontend: dashboard perusahaan, tab ringkasan di detail proyek, chart
- Index database dicek untuk query agregasi

**Selesai bila:** PROJECT_MANAGER hanya bisa membuka ringkasan proyeknya sendiri dan angka dashboard cocok dengan perhitungan manual pada dataset seed uji; waktu respons wajar pada 10.000 transaksi dummy.

### Fase 5: Audit log dan hardening
- Halaman audit log, filter, ekspor transaksi ke CSV/Excel (sesuai filter)
- Helmet, CORS ketat, validasi input menyeluruh, sanitasi nama file upload
- Backup: skrip `pg_dump` terjadwal dan dokumentasi restore

**Selesai bila:** checklist keamanan bagian 13 terpenuhi.

### Fase 6: Deployment
- Dockerfile produksi (multi-stage) untuk api dan web, `docker-compose.yml` produksi
- Reverse proxy dengan HTTPS (Caddy/Traefik/nginx), variabel env terdokumentasi
- README: cara install, migrasi, seed, backup dan restore

**Selesai bila:** deploy bersih dari nol mengikuti README berhasil.

## 12. Persiapan untuk modul berikutnya (jangan dibangun sekarang)

- **BOQ**: nanti tambah tabel `BoqItem (projectId, name, volume, unit, sellPrice)` dan kolom opsional `boqItemId` di `Transaction`. Tidak butuh perubahan struktur yang sudah ada.
- **Payroll**: nanti tambah `Employee`, `PayrollRun`, `PayrollItem`; hasil payroll membuat transaksi OUT dengan kategori "Gaji Staf" (proyek opsional untuk alokasi ke proyek). Aturan PPh 21 dan BPJS harus **konfigurabel**, bukan hardcode.
- **Termin klien**: tabel `PaymentTerm (projectId, dueDate, amount, status)` yang ditautkan ke transaksi IN.

## 13. Checklist keamanan dan kualitas

- Password di-hash argon2, tidak pernah di-log; refresh token disimpan sebagai hash
- Semua endpoint punya guard role dan scoping proyek untuk PROJECT_MANAGER (uji akses horizontal/IDOR: user A tidak bisa membaca data proyek user B lewat ID); e2e test memastikan akses ditolak untuk role yang tidak berhak
- Validasi DTO dengan whitelist (`forbidNonWhitelisted`)
- File upload: cek mime sebenarnya, batas ukuran, nama file di-generate ulang, akses unduh lewat endpoint terotentikasi
- Rate limit pada login
- Tidak ada secret di repo; semua lewat env
- Backup database terjadwal dan pernah diuji restore
- Test minimal: aturan saldo, transfer, status transaksi, permission, dan agregasi dashboard

## 14. Aturan kerja untuk Claude Code (salin ke `CLAUDE.md`)

- Kerjakan satu fase pada satu waktu; jangan memulai fase berikutnya sebelum acceptance criteria fase saat ini lulus.
- Jangan membangun fitur di luar ruang lingkup (BOQ, payroll, dll) walau terlihat mudah.
- Tulis test bersamaan dengan fitur, terutama aturan bisnis di bagian 5.
- Semua perubahan skema lewat migrasi Prisma; jangan edit DB manual.
- Penamaan tabel, kolom, enum, dan index di database wajib `snake_case` (gunakan `@@map` dan `@map` di Prisma). Jangan membuat tabel atau kolom dengan nama `camelCase`.
- Uang selalu integer rupiah; jangan pernah memakai `number` untuk nominal di layer data (gunakan `bigint` dan serialisasi sebagai string di API).
- Setiap aksi yang mengubah data penting harus menulis audit log.
- Catat keputusan non-trivial di `docs/decisions.md`.
- Bila ada ambiguitas yang mengubah struktur data, berhenti dan tanyakan dulu daripada menebak.
