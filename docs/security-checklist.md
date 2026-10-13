# Checklist keamanan dan kualitas

Tiap butir bagian 13 dokumen dasar (`implementation-plan-cashflow-mvp.md`), di mana ia ditegakkan, dan test mana yang membuktikannya. Path test relatif terhadap `apps/api`. Diperiksa terakhir pada Fase 6; butir 1, 2 dan 5 disesuaikan untuk edisi pribadi (P1).

| # | Butir | Status |
|---|-------|--------|
| 1 | PIN di-hash argon2, tidak pernah di-log; refresh token disimpan sebagai hash | Terpenuhi |
| 2 | Semua endpoint wajib sesi pemilik kecuali yang ditandai terbuka (edisi pribadi: tanpa peran dan proyek) | Terpenuhi |
| 3 | Validasi DTO dengan whitelist | Terpenuhi |
| 4 | Unggah berkas: jenis sebenarnya, batas ukuran, nama dibuat ulang, unduh lewat endpoint terotentikasi | Terpenuhi |
| 5 | Rate limit dan jeda pada masuk dengan PIN | Terpenuhi |
| 6 | Tidak ada secret di repo | Terpenuhi |
| 7 | Backup terjadwal dan pernah diuji restore | Terpenuhi |
| 8 | Test minimal: saldo, transfer, status transaksi, permission, agregasi dashboard | Terpenuhi |

## 1. PIN dan token

- **Di mana:** PIN 6 sampai 12 angka (`src/common/pin-policy.ts`), di-hash argon2id (`src/auth/password.service.ts`, dipakai `src/auth/pin.service.ts`). `src/auth/token.service.ts`: refresh token acak, yang disimpan hanya hash SHA-256-nya; sesi 30 hari, dirotasi tiap diperpanjang, dan diakhiri saat PIN diganti (perangkat lain) atau direset (semua); token akses yang masih beredar ikut ditolak pada permintaan berikutnya lewat `users.session_version` (`src/auth/jwt-auth.guard.ts`). PIN saat ini di Ganti PIN ikut hitungan dan jeda yang sama dengan masuk. `src/audit/audit.service.ts` membuang field rahasia (`pin`, `pin_hash`, `currentPin`, `newPin`, `token_hash`, `refreshToken`) sebelum menyimpan `before`/`after`.
- **Bukti:** `src/auth/token.service.spec.ts`, `src/audit/audit.service.spec.ts`, `test/auth-pin.e2e-spec.ts`, `test/reset-pin.e2e-spec.ts`, `test/auth-refresh.e2e-spec.ts` (rotasi dan deteksi pemakaian ulang), `test/audit-logs.e2e-spec.ts` ("never shows a password, a token or where a file is stored").

## 2. Guard sesi

- **Di mana:** `src/auth/jwt-auth.guard.ts` berlaku global; rute terbuka harus ditandai `@Public()`. Edisi pribadi hanya punya satu pemilik, jadi tidak ada lagi peran, proyek, atau scoping per pengguna; `src/transactions/transaction-policy.ts` tinggal menentukan apa yang boleh dilakukan pada transaksi menurut statusnya.
- **Bukti:** `test/route-guards.e2e-spec.ts` membaca semua rute yang terdaftar dan memastikan tiap rute di luar daftar terbuka (health, pin-status, setup-pin, login, refresh, logout) menjawab 401 tanpa token maupun dengan token palsu. Rute baru yang bisa dipanggil tanpa sesi membuat test ini gagal.

## 3. Validasi masukan

- **Di mana:** `src/common/validation.ts` (`whitelist`, `forbidNonWhitelisted`, `transform`), dipasang global di `src/app.setup.ts`. Parameter id memakai `ParseUUIDPipe`.
- **Bukti:** `test/error-format.e2e-spec.ts`, dan kasus "unknown parameter" atau field tak dikenal di hampir tiap file e2e (mis. `test/dashboard.e2e-spec.ts`, `test/audit-logs.e2e-spec.ts`, `test/transaction-export.e2e-spec.ts`).

## 4. Unggah dan unduh berkas

- **Di mana:** `src/attachments/file-sniffer.ts` (jenis ditentukan dari isi berkas), `src/attachments/attachments.service.ts` (maksimal 10 MB dan 10 berkas per transaksi; kunci penyimpanan dibuat ulang sebagai UUID), `src/attachments/file-name.ts` (nama tampilan disanitasi), `src/storage/local-disk.storage.ts` (menolak kunci di luar pola). Unduhan hanya lewat `GET /attachments/:id/download` dengan token, selalu sebagai lampiran dan dengan `nosniff`.
- **Bukti:** `src/attachments/attachment-files.spec.ts`, `test/attachments.e2e-spec.ts`.

## 5. Batas percobaan PIN

- **Di mana:** `src/auth/pin-lockout.ts` dan `src/auth/pin.service.ts`: lima PIN salah berturut-turut menjeda masuk 15 menit untuk semua pengunjung, disimpan di database (`users.pin_failed_attempts`, `users.pin_locked_until`) sehingga tidak hilang saat API dinyalakan ulang. Di atasnya, throttle per IP (`LOGIN_RATE_LIMIT`) di `src/auth/auth.controller.ts`, dengan `TRUST_PROXY_HOPS` supaya IP klien asli terbaca di belakang reverse proxy.
- **Bukti:** `src/auth/pin-lockout.spec.ts`, `test/auth-pin-lockout.e2e-spec.ts`, `test/auth-rate-limit.e2e-spec.ts`, dan `deploy/smoke.sh` bagian 4.

## 6. Tidak ada secret di repo

- **Di mana:** `.gitignore` mengabaikan `.env` dan `.env.*` kecuali `.env.example`; semua secret dibaca dari environment dan divalidasi saat start (`src/config/env.validation.ts`).
- **Bukti (diperiksa manual pada Fase 5a):**
  - `git ls-files` hanya memuat `apps/api/.env.example`, yang `JWT_ACCESS_SECRET`-nya kosong.
  - Pencarian `git grep` untuk pola `secret|password|token|api key = "<nilai>"` di luar test tidak menemukan nilai sungguhan. Edisi pribadi tidak lagi punya password admin awal: PIN dibuat pemilik saat aplikasi pertama dibuka.
  - `docker-compose.dev.yml` hanya untuk pengembangan; password database di dalamnya adalah bawaan lokal, bukan secret. Compose produksi (Fase 6) harus mengambilnya dari environment.

## 7. Backup dan restore

- **Di mana:** `scripts/backup.sh`, `scripts/restore.sh`, `scripts/restore-drill.sh`; panduan di `docs/backup-restore.md`.
- **Bukti:** hasil uji restore tercatat di `docs/backup-restore.md`.
- **Terjadwal:** layanan `backup` di `docker-compose.prod.yml` menjalankan cadangan tiap malam (`deploy/backup-loop.sh`); cadangan yang gagal menandai container tidak sehat. Dibuktikan `deploy/smoke.sh` (bagian 3 dan 6), termasuk pemulihan dari cadangan yang dibuat di dalam container.
- **Tanggung jawab pengelola server:** menyalin folder cadangan ke luar server.

## 8. Test minimal

| Aturan | Test |
|--------|------|
| Saldo | `test/accounts.e2e-spec.ts`, `test/transaction-flow.e2e-spec.ts`, `test/dashboard.e2e-spec.ts` |
| Transfer | `test/transfers.e2e-spec.ts` |
| Status transaksi | `test/transaction-edit.e2e-spec.ts`, `test/transaction-flow.e2e-spec.ts` |
| Permission | `src/transactions/transaction-policy.spec.ts`, `test/route-guards.e2e-spec.ts` |
| Agregasi dashboard | `test/dashboard.e2e-spec.ts`, `test/report-scale.e2e-spec.ts` |

## Di luar bagian 13, ditambahkan pada Fase 5a

- **Header keamanan** (`helmet`) dan **CORS tertutup secara bawaan** (`CORS_ORIGINS`): `src/app.setup.ts`, dibuktikan `test/security-headers.e2e-spec.ts`.
- **Ekspor CSV aman dari rumus spreadsheet:** `src/common/csv.ts`, dibuktikan `src/common/csv.spec.ts` dan `test/transaction-export.e2e-spec.ts`.
- **Log audit hanya bisa dibaca**: `test/audit-logs.e2e-spec.ts`.

## Yang masih terbuka

- Tidak ada lagi butir bagian 13 yang terbuka. `NODE_ENV=production` ditetapkan oleh `docker-compose.prod.yml` sendiri, dan `deploy/smoke.sh` memastikan dokumentasi API tertutup dan cookie sesi `Secure` pada susunan produksi.
- Tanggung jawab pengelola server, bukan aplikasi: menyalin cadangan ke luar server, menjaga `deploy/.env`, dan pengaturan HTTPS/HSTS di Cloudflare (lihat `docs/deployment.md`).
- Pengiriman ulang permintaan simpan saat jaringan putus bisa mencatat transaksi dua kali (tidak ada kunci idempotensi). Dicatat pada tinjauan Fase 3b; bukan butir bagian 13.

## Ditambahkan pada Fase 6

- **Image tanpa rahasia dan tanpa hak root**, tanpa `.env`, kode sumber, test atau berkas bukti; **tidak ada port yang dibuka** di server (jalan masuk hanya Cloudflare Tunnel); Compose menolak jalan bila nilai wajib kosong. Dibuktikan `deploy/smoke.sh` bagian 1 sampai 3.
- **Batas percobaan masuk tetap per pengunjung di balik dua proxy** (Cloudflare dan Caddy): `deploy/smoke.sh` bagian 4.
- **Kebijakan keamanan browser (CSP) untuk halaman web** diuji dengan browser sungguhan: `deploy/smoke-browser.mjs`.

## Ditambahkan pada P3 (Wishlist dan penilaian AI)

- **Kunci Claude hanya di server** (`ANTHROPIC_API_KEY` di `deploy/.env`), tidak pernah dikirim ke browser; tanpa kunci, penilaian menjawab 503 dan tidak memanggil apa pun. Test tidak pernah memakai kunci sungguhan: `vitest.config.e2e.ts` dan `apps/web/e2e/env.ts` mengosongkannya, dan panggilan ke Claude diganti tiruan (`test/fake-ai.ts`).
- **Jawaban pemilik dikirim sebagai data**: di dalam satu tag, sebagai JSON dengan `<` dan `>` di-escape, dan instruksi sistem menyatakan isinya bukan perintah. Keluaran AI dicek ketat (`src/wishlist/ai/review-output.ts`) sebelum disimpan. Bukti: `src/wishlist/ai/review-prompt.spec.ts`, `review-output.spec.ts`.
- **Ringkasan keuangan hanya berisi total**, tanpa nama akun, kategori, keterangan, atau bukti. Bukti: `test/finance-summary.e2e-spec.ts` dan `test/wishlist-review.e2e-spec.ts` ("never sends account names, categories or descriptions").
- **Batas harian** (`AI_REVIEW_DAILY_LIMIT`) dihitung dari penilaian yang berhasil per hari Jakarta; kegagalan tidak dihitung dan tidak mengubah barang. Isi permintaan dan kunci tidak pernah dicatat di log.
