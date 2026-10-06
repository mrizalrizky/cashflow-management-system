# Spec Desain: Aplikasi Arus Kas Perusahaan (MVP)

Tanggal: 2026-10-06
Dokumen dasar: [`implementation-plan-cashflow-mvp.md`](../../../implementation-plan-cashflow-mvp.md)

Spec ini **melengkapi dan mengoreksi** dokumen dasar. Semua yang tidak disebut di sini tetap berlaku seperti di dokumen dasar. Bila keduanya bertentangan, **spec ini yang berlaku**.

## 1. Tujuan

Aplikasi web internal untuk perusahaan konsultan dan kontraktor properti (kurang dari 10 karyawan) guna mencatat dan melihat arus kas masuk dan keluar per perusahaan dan per proyek, dengan alur approval, bukti transaksi, dan audit log. Single tenant, IDR, antarmuka bahasa Indonesia.

Berhasil bila: ketiga peran dibatasi di sisi server, angka dashboard cocok dengan perhitungan manual, dan deploy bersih dari nol mengikuti README berhasil.

## 2. Keputusan yang mengubah dokumen dasar

### 2.1 Penamaan: field model Prisma memakai `snake_case`

Mengganti konvensi di bagian 7 dokumen dasar.

- **Field model Prisma ditulis `snake_case`**, sama persis dengan nama kolom (`created_at`, `contract_value`). `@map` pada field tidak dipakai lagi.
- Nama model tetap `PascalCase` (konvensi Prisma) dan dipetakan ke tabel `snake_case` jamak lewat `@@map`.
- Nama tipe enum dipetakan ke `snake_case` lewat `@@map`; nilai enum tetap `UPPER_CASE`.
- Nama index dan constraint: `idx_<tabel>_<kolom>` dan `uq_<tabel>_<kolom>`.
- **Asumsi (belum dikonfirmasi):** properti JSON di API tetap `camelCase`. Pemetaan dilakukan di response DTO, yang memang dibutuhkan untuk mengubah `bigint` menjadi string dan menyembunyikan `password_hash`.

### 2.2 Aturan transaksi

1. **Tidak ada hapus.** Aksi "hapus" pada transaksi PENDING adalah **pembatalan**: status menjadi `VOID` dengan alasan wajib, `voided_by_id` diisi pembatal. Tidak ada hard delete di mana pun.
2. **Pencatatan peninjau.** `approved_by_id/approved_at` diganti `reviewed_by_id/reviewed_at` (dipakai untuk approve dan reject). Ditambah `voided_by_id/voided_at`.
3. **REJECTED bisa diajukan ulang.** Pembuat boleh mengedit transaksi REJECTED; menyimpan mengembalikannya ke `PENDING` dan mengosongkan `reviewed_by_id`, `reviewed_at`, `reject_reason`. Riwayat tersimpan di audit log.
4. **Transfer hanya oleh SUPER_ADMIN.** Kedua sisi dibuat dalam satu transaksi database, langsung `APPROVED`, dan di-void bersamaan. Sisi transfer tidak bisa diedit, di-approve, atau di-void sendiri-sendiri. Transfer dikenali dari `transfer_group_id IS NOT NULL` dan dikecualikan dari laporan pemasukan/pengeluaran.
5. **Bukti wajib untuk pengeluaran.** Transaksi `OUT` (selain transfer) harus punya minimal 1 lampiran sebelum bisa di-approve; aturan ini dicek server pada aksi approve. Lampiran terkunci (tidak bisa ditambah atau dihapus) setelah transaksi `APPROVED` atau `VOID`.
6. **Auto-approve SUPER_ADMIN.** `POST /transactions` selalu menghasilkan `PENDING`. Opsi "langsung setujui" di frontend menjalankan buat → unggah bukti → approve secara berurutan, sehingga aturan bukti tetap berlaku.
7. **Saldo negatif diizinkan.** Server tidak menolak; frontend menampilkan peringatan saat approve membuat saldo akun negatif (hanya terlihat oleh SUPER_ADMIN).
8. **Pindah proyek.** Saat `project_id` transaksi PENDING diubah, izin dicek terhadap proyek lama **dan** proyek baru.
9. **Konkurensi.** Approve, reject, void memakai update bersyarat (`WHERE status = ...`); bila 0 baris berubah, balas 409.

### 2.3 Auth dan user

- `users.must_change_password` (default `true` untuk user seed dan user buatan admin). Selama bernilai `true`, semua endpoint selain `change-password` dan `logout` membalas 403.
- Lupa password: `POST /users/:id/reset-password` (SUPER_ADMIN) menetapkan password sementara dan `must_change_password = true`. Tidak ada reset lewat email.
- Refresh token disimpan di cookie `httpOnly`, `Secure`, `SameSite=Strict`, path `/api/v1/auth`. Access token hanya di memori frontend.
- Refresh token dirotasi tiap refresh. Pemakaian ulang token yang sudah dirotasi mencabut semua token user tersebut.
- Semua refresh token user dicabut saat: dinonaktifkan, ganti peran, ganti atau reset password.
- Guard JWT membaca ulang `is_active`, `role`, dan `must_change_password` dari database pada tiap request. Keanggotaan proyek juga selalu dibaca dari database, tidak dari token.

### 2.4 Stack

| Hal | Dokumen dasar | Keputusan |
|---|---|---|
| Storage bukti | MinIO (S3-compatible) | Disk lokal pada Docker volume di balik antarmuka `StorageService`. Driver S3 **tidak** dibangun di MVP. Service `minio` dihapus dari Compose. |
| State frontend | NgRx | Angular signals + service. Tanpa NgRx. |
| Monorepo | tidak ditentukan | npm workspaces (`apps/api`, `apps/web`), tanpa Nx. |
| Tipe API di frontend | tidak ditentukan | Di-generate dari spesifikasi OpenAPI (`@nestjs/swagger`). |
| Backup | `pg_dump` | `pg_dump` **dan** arsip volume lampiran dalam satu skrip; restore keduanya didokumentasikan dan diuji. |

Docker Compose produksi: `api`, `web` (nginx), `postgres`, dan reverse proxy HTTPS (Caddy).

## 3. Skema Prisma (menggantikan bagian 7 dokumen dasar)

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
  id                   String   @id @default(uuid())
  name                 String
  email                String   @unique(map: "uq_users_email")
  password_hash        String
  role                 Role
  is_active            Boolean  @default(true)
  must_change_password Boolean  @default(true)
  created_at           DateTime @default(now())
  updated_at           DateTime @updatedAt

  @@map("users")
}

model Account {
  id              String      @id @default(uuid())
  name            String
  type            AccountType
  opening_balance BigInt      @default(0)
  is_active       Boolean     @default(true)
  created_at      DateTime    @default(now())

  @@map("accounts")
}

model Category {
  id        String  @id @default(uuid())
  name      String
  type      TxType
  is_system Boolean @default(false) // mis. Transfer Masuk/Keluar; tidak bisa diubah atau dinonaktifkan
  is_active Boolean @default(true)

  @@unique([name, type], map: "uq_categories_name_type")
  @@map("categories")
}

model Project {
  id             String        @id @default(uuid())
  code           String        @unique(map: "uq_projects_code") // mis. PRJ-2026-001
  name           String
  client_name    String
  contract_value BigInt        @default(0)
  status         ProjectStatus @default(ACTIVE)
  start_date     DateTime?     @db.Date
  end_date       DateTime?     @db.Date
  notes          String?
  created_at     DateTime      @default(now())
  updated_at     DateTime      @updatedAt

  @@map("projects")
}

model ProjectMember {
  project_id  String
  user_id     String   // wajib user dengan role PROJECT_MANAGER (validasi di service)
  assigned_at DateTime @default(now())
  assigned_by String?

  @@id([project_id, user_id])
  @@index([user_id], map: "idx_project_members_user_id")
  @@map("project_members")
}

model Transaction {
  id                String    @id @default(uuid())
  type              TxType
  amount            BigInt    // > 0, rupiah; CHECK constraint di migrasi
  transaction_date  DateTime  @db.Date
  description       String
  status            TxStatus  @default(PENDING)
  account_id        String
  category_id       String
  project_id        String?   // null = overhead perusahaan
  transfer_group_id String?   // terisi = sisi transfer
  created_by_id     String
  reviewed_by_id    String?   // approve atau reject
  reviewed_at       DateTime?
  reject_reason     String?
  voided_by_id      String?
  voided_at         DateTime?
  void_reason       String?
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt
  attachments       Attachment[]

  @@index([transaction_date], map: "idx_transactions_transaction_date")
  @@index([project_id, status], map: "idx_transactions_project_id_status")
  @@index([account_id, status], map: "idx_transactions_account_id_status")
  @@index([created_by_id], map: "idx_transactions_created_by_id")
  @@index([transfer_group_id], map: "idx_transactions_transfer_group_id")
  @@map("transactions")
}

model Attachment {
  id             String      @id @default(uuid())
  transaction_id String
  storage_key    String
  file_name      String
  mime_type      String
  size_bytes     Int
  uploaded_by_id String
  created_at     DateTime    @default(now())
  transaction    Transaction @relation(fields: [transaction_id], references: [id])

  @@index([transaction_id], map: "idx_attachments_transaction_id")
  @@map("attachments")
}

model AuditLog {
  id          String   @id @default(uuid())
  user_id     String?
  action      String   // CREATE | UPDATE | APPROVE | REJECT | VOID | LOGIN | ...
  entity_type String
  entity_id   String
  before      Json?
  after       Json?
  ip          String?
  created_at  DateTime @default(now())

  @@index([entity_type, entity_id], map: "idx_audit_logs_entity")
  @@index([created_at], map: "idx_audit_logs_created_at")
  @@map("audit_logs")
}

model RefreshToken {
  id         String    @id @default(uuid())
  user_id    String
  token_hash String    @unique(map: "uq_refresh_tokens_token_hash")
  expires_at DateTime
  revoked_at DateTime?
  created_at DateTime  @default(now())

  @@index([user_id], map: "idx_refresh_tokens_user_id")
  @@map("refresh_tokens")
}
```

Catatan skema:
- Relasi (foreign key) ke `Account`, `Category`, `Project`, `User` ditambahkan saat implementasi; nama field relasi juga `snake_case` (mis. `created_by`, `reviewed_by`).
- `CHECK (amount > 0)` ditambahkan lewat SQL mentah di file migrasi Prisma.
- Kode proyek dibuat dari sequence per tahun, dengan retry bila melanggar `uq_projects_code`.

## 4. Perubahan endpoint

Tambahan dan perubahan terhadap bagian 8 dokumen dasar:

- `POST /users/:id/reset-password` (SUPER_ADMIN)
- `POST /transactions/:id/cancel` (pembuat atau SUPER_ADMIN, hanya PENDING; alasan wajib). Tidak ada `DELETE /transactions/:id`.
- `PATCH /transactions/:id` juga berlaku untuk REJECTED milik sendiri (ajukan ulang).
- `POST /transactions/transfer` dan void transfer: SUPER_ADMIN saja.
- `GET /categories`: semua peran (untuk dropdown); tulis: SUPER_ADMIN.
- `GET /transactions/export` (Fase 5): scoping sama dengan daftar transaksi; sel yang diawali `=`, `+`, `-`, `@` di-escape.
- `DELETE /attachments/:id`: hard delete file dan baris, hanya saat transaksi PENDING atau REJECTED, oleh pengunggah atau SUPER_ADMIN; dicatat di audit log.

## 5. Ketentuan lintas modul

- **Serialisasi uang:** `bigint` dikirim sebagai string di JSON lewat serializer global; berlaku juga untuk isi `before`/`after` audit log.
- **Audit log:** ditulis dalam transaksi database yang sama dengan perubahannya. `password_hash` dan token tidak pernah masuk `before`/`after`. Tidak ada endpoint ubah atau hapus audit log.
- **Rate limit login:** `trust proxy` diaktifkan agar IP klien asli terbaca di belakang reverse proxy.
- **Scoping proyek:** satu helper dipakai ulang oleh modul proyek, transaksi, lampiran, ringkasan, dan ekspor. Akses ke ID di luar cakupan membalas 404.
- **Tanggal:** `transaction_date`, `start_date`, `end_date` adalah tanggal kalender (DATE) tanpa konversi zona waktu; agregasi bulanan langsung pada kolom tersebut.

## 6. Pengujian

Mengikuti dokumen dasar, ditambah kasus untuk keputusan di atas:

- Unit: pembatalan PENDING, ajukan ulang REJECTED, transfer atomik (buat dan void), bukti wajib pada approve OUT, kunci lampiran, update bersyarat (409 pada approve ganda), cek izin dua proyek saat pindah proyek.
- e2e: `must_change_password` memblokir endpoint lain; rotasi dan deteksi pemakaian ulang refresh token; user yang dinonaktifkan atau PROJECT_MANAGER yang dicabut kehilangan akses pada request berikutnya; IDOR antar proyek.
- e2e berjalan terhadap PostgreSQL sungguhan (kontainer), bukan mock.

## 7. Fase

Urutan dan kriteria selesai mengikuti bagian 11 dokumen dasar, dengan penyesuaian:

- **Fase 0:** `git init`, npm workspaces, Compose dev hanya `postgres`; tanpa MinIO.
- **Fase 1:** termasuk `must_change_password`, reset password oleh admin, cookie refresh token dan rotasinya.
- **Fase 3:** `StorageService` dengan driver disk lokal; aturan bagian 2.2.
- **Fase 5:** skrip backup mencakup database dan volume lampiran.
- **Fase 6:** Compose produksi tanpa MinIO, dengan Caddy.

## 8. Di luar lingkup

Sama dengan dokumen dasar (BOQ, payroll, termin klien, hutang/piutang, laba rugi, multi-currency, multi-company), ditambah: driver storage S3, reset password lewat email, NgRx.
