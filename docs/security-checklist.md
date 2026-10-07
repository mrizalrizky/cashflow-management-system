# Checklist keamanan dan kualitas

Tiap butir bagian 13 dokumen dasar (`implementation-plan-cashflow-mvp.md`), di mana ia ditegakkan, dan test mana yang membuktikannya. Path test relatif terhadap `apps/api`. Diperiksa terakhir pada Fase 5a.

| # | Butir | Status |
|---|-------|--------|
| 1 | Password di-hash argon2, tidak pernah di-log; refresh token disimpan sebagai hash | Terpenuhi |
| 2 | Semua endpoint punya guard role dan scoping proyek; akses horizontal (IDOR) diuji | Terpenuhi |
| 3 | Validasi DTO dengan whitelist | Terpenuhi |
| 4 | Unggah berkas: jenis sebenarnya, batas ukuran, nama dibuat ulang, unduh lewat endpoint terotentikasi | Terpenuhi |
| 5 | Rate limit pada login | Terpenuhi |
| 6 | Tidak ada secret di repo | Terpenuhi |
| 7 | Backup terjadwal dan pernah diuji restore | Skrip dan uji restore terpenuhi; penjadwalan di server menunggu Fase 6 |
| 8 | Test minimal: saldo, transfer, status transaksi, permission, agregasi dashboard | Terpenuhi |

## 1. Password dan token

- **Di mana:** `src/auth/password.service.ts` (argon2id), `src/auth/token.service.ts` (refresh token acak, yang disimpan hanya hash SHA-256-nya). `src/audit/audit.service.ts` membuang field rahasia (`password`, `password_hash`, `token_hash`, dan sejenisnya) sebelum menyimpan `before`/`after`.
- **Bukti:** `src/auth/password.service.spec.ts`, `src/auth/token.service.spec.ts`, `src/audit/audit.service.spec.ts`, `test/auth-refresh.e2e-spec.ts` (rotasi dan deteksi pemakaian ulang), `test/audit-logs.e2e-spec.ts` ("never shows a password, a token or where a file is stored").

## 2. Guard peran dan scoping

- **Di mana:** `src/auth/jwt-auth.guard.ts` dan `roles.guard.ts` berlaku global; rute terbuka harus ditandai `@Public()`. Scoping proyek di `src/projects/project-access.service.ts`; scoping transaksi dan bukti di `src/transactions/transaction-access.service.ts`; siapa boleh apa di `src/transactions/transaction-policy.ts`.
- **Bukti:**
  - `test/route-guards.e2e-spec.ts` membaca semua rute yang terdaftar dan memastikan tiap rute di luar daftar terbuka (health, login, refresh, logout) menjawab 401 tanpa token maupun dengan token palsu, dan tiap rute khusus admin menjawab 403 untuk peran lain. Rute baru yang bisa dipanggil tanpa login membuat test ini gagal. Yang tidak dijaga test ini: rute baru yang seharusnya khusus admin tetapi lupa diberi `@Roles` (tetap wajib login), dan rute yang disembunyikan dari dokumen OpenAPI.
  - IDOR: `test/project-access.e2e-spec.ts`, `test/transaction-read.e2e-spec.ts`, `test/transaction-edit.e2e-spec.ts`, `test/attachments.e2e-spec.ts`, `test/project-summary.e2e-spec.ts`, `test/transaction-export.e2e-spec.ts` ("never hands over rows that are not the user's to see"). Data di luar jangkauan dijawab 404, sama seperti data yang tidak ada.
  - `test/auth-roles.e2e-spec.ts`: user yang dinonaktifkan atau dicabut dari proyek kehilangan akses pada request berikutnya.

## 3. Validasi masukan

- **Di mana:** `src/common/validation.ts` (`whitelist`, `forbidNonWhitelisted`, `transform`), dipasang global di `src/app.setup.ts`. Parameter id memakai `ParseUUIDPipe`.
- **Bukti:** `test/error-format.e2e-spec.ts`, dan kasus "unknown parameter" atau field tak dikenal di hampir tiap file e2e (mis. `test/dashboard.e2e-spec.ts`, `test/audit-logs.e2e-spec.ts`, `test/transaction-export.e2e-spec.ts`).

## 4. Unggah dan unduh berkas

- **Di mana:** `src/attachments/file-sniffer.ts` (jenis ditentukan dari isi berkas), `src/attachments/attachments.service.ts` (maksimal 10 MB dan 10 berkas per transaksi; kunci penyimpanan dibuat ulang sebagai UUID), `src/attachments/file-name.ts` (nama tampilan disanitasi), `src/storage/local-disk.storage.ts` (menolak kunci di luar pola). Unduhan hanya lewat `GET /attachments/:id/download` dengan token, selalu sebagai lampiran dan dengan `nosniff`.
- **Bukti:** `src/attachments/attachment-files.spec.ts`, `test/attachments.e2e-spec.ts`.

## 5. Rate limit login

- **Di mana:** `src/auth/auth.controller.ts` (throttle per IP, `LOGIN_RATE_LIMIT`), dengan `TRUST_PROXY_HOPS` supaya IP klien asli terbaca di belakang reverse proxy.
- **Bukti:** `test/auth-rate-limit.e2e-spec.ts`.

## 6. Tidak ada secret di repo

- **Di mana:** `.gitignore` mengabaikan `.env` dan `.env.*` kecuali `.env.example`; semua secret dibaca dari environment dan divalidasi saat start (`src/config/env.validation.ts`).
- **Bukti (diperiksa manual pada Fase 5a):**
  - `git ls-files` hanya memuat `apps/api/.env.example`, yang `JWT_ACCESS_SECRET` dan `SEED_ADMIN_PASSWORD`-nya kosong.
  - Pencarian `git grep` untuk pola `secret|password|token|api key = "<nilai>"` di luar test hanya menemukan nilai contoh `ganti-password-ini` di `src/database/seed.ts`, yang justru ditolak sebagai password (lihat `test/seed.e2e-spec.ts`).
  - `docker-compose.dev.yml` hanya untuk pengembangan; password database di dalamnya adalah bawaan lokal, bukan secret. Compose produksi (Fase 6) harus mengambilnya dari environment.

## 7. Backup dan restore

- **Di mana:** `scripts/backup.sh`, `scripts/restore.sh`, `scripts/restore-drill.sh`; panduan di `docs/backup-restore.md`.
- **Bukti:** hasil uji restore tercatat di `docs/backup-restore.md`.
- **Belum:** penjadwalan otomatis di server. Baris cron sudah didokumentasikan; pemasangannya bagian dari deployment (Fase 6).

## 8. Test minimal

| Aturan | Test |
|--------|------|
| Saldo | `test/accounts.e2e-spec.ts`, `test/transaction-approval.e2e-spec.ts`, `test/dashboard.e2e-spec.ts` |
| Transfer | `test/transfers.e2e-spec.ts` |
| Status transaksi | `test/transaction-edit.e2e-spec.ts`, `test/transaction-approval.e2e-spec.ts`, `test/transaction-flow.e2e-spec.ts` |
| Permission | `src/transactions/transaction-policy.spec.ts`, `test/route-guards.e2e-spec.ts`, file IDOR pada butir 2 |
| Agregasi dashboard | `test/dashboard.e2e-spec.ts`, `test/project-summary.e2e-spec.ts`, `test/report-scale.e2e-spec.ts` |

## Di luar bagian 13, ditambahkan pada Fase 5a

- **Header keamanan** (`helmet`) dan **CORS tertutup secara bawaan** (`CORS_ORIGINS`): `src/app.setup.ts`, dibuktikan `test/security-headers.e2e-spec.ts`.
- **Ekspor CSV aman dari rumus spreadsheet:** `src/common/csv.ts`, dibuktikan `src/common/csv.spec.ts` dan `test/transaction-export.e2e-spec.ts`.
- **Log audit hanya bisa dibaca**, oleh admin saja: `test/audit-logs.e2e-spec.ts`.

## Yang masih terbuka

- Penjadwalan backup di server dan `NODE_ENV=production` pada Compose produksi (Fase 6). Tanpa `NODE_ENV=production`, dokumentasi API terbuka dan cookie tidak `Secure`.
- Pengiriman ulang permintaan simpan saat jaringan putus bisa mencatat transaksi dua kali (tidak ada kunci idempotensi). Dicatat pada tinjauan Fase 3b; bukan butir bagian 13.
