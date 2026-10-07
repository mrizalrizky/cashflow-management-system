# Arus Kas

Aplikasi internal arus kas perusahaan. Lihat `implementation-plan-cashflow-mvp.md` dan `docs/superpowers/`.

## Prasyarat

Node 24.12 atau lebih baru, Docker Desktop.

## Menjalankan secara lokal

```bash
npm install
npm run db:up
cp apps/api/.env.example apps/api/.env   # lalu isi SEED_ADMIN_PASSWORD dan JWT_ACCESS_SECRET
npm run db:migrate -w api
npm run db:seed -w api
```

Jalankan API dan web di dua terminal terpisah:

```bash
npm run dev:api     # http://localhost:3000/api/v1/health
npm run dev:web     # http://localhost:5173
```

Seed aman dijalankan berulang. Admin pertama hanya dibuat bila belum ada SUPER_ADMIN, dan wajib ganti password saat login pertama.

## Berkas bukti transaksi

Bukti transaksi (foto atau PDF nota) disimpan sebagai berkas di folder `STORAGE_DIR` (`apps/api/.env`, bawaan `./storage`), bukan di database. Database hanya menyimpan nama dan lokasi berkasnya.

Karena itu **cadangkan folder `STORAGE_DIR` bersama database**, dan pulihkan keduanya dari waktu yang sama. Database tanpa foldernya berarti bukti tidak bisa dibuka; folder tanpa databasenya berarti berkas tanpa pemilik.

Riwayat perubahan data bisa dibaca admin di menu **Audit log**, dan daftar transaksi bisa diunduh sebagai CSV lewat tombol **Ekspor CSV** di halaman Transaksi (isinya mengikuti filter yang sedang dipakai dan hak pengguna).

Cara mencadangkan, memulihkan, dan menguji pemulihan ada di [docs/backup-restore.md](docs/backup-restore.md). Daftar periksa keamanan ada di [docs/security-checklist.md](docs/security-checklist.md).

## Dokumentasi API

Saat API berjalan di luar produksi, daftar rute bisa dibuka di http://localhost:3000/api/docs.

## Test

```bash
npm run lint
npm test
npm run test:e2e       # e2e API; butuh database berjalan
npm run test:browser   # alur login di browser sungguhan; butuh database berjalan
```

Test browser menjalankan API dan web sendiri di port 3100 dan 5174 terhadap `cashflow_test`, jadi server dan data pengembangan tidak tersentuh. Sekali saja, pasang browsernya: `npx playwright install chromium` di `apps/web`.

e2e memakai database `cashflow_test`, yang dibuat otomatis saat volume PostgreSQL pertama kali dibuat.

## Bila port 5432 sudah terpakai

Set `POSTGRES_PORT` sebelum `npm run db:up`, lalu sesuaikan port di `DATABASE_URL` (`apps/api/.env`) dan set `TEST_DATABASE_URL` untuk e2e:

```bash
export POSTGRES_PORT=5433
export TEST_DATABASE_URL=postgresql://cashflow:cashflow_dev@localhost:5433/cashflow_test
```

## Di belakang reverse proxy

`TRUST_PROXY_HOPS` (di `apps/api/.env`) adalah jumlah reverse proxy di depan API:

- `0` bila API diakses langsung (pengembangan lokal).
- `1` bila ada satu reverse proxy (Caddy/nginx) di depannya.

Bila terlalu kecil, semua orang terbaca dari IP proxy yang sama dan berbagi satu batas percobaan login. Bila terlalu besar, klien bisa memalsukan IP-nya lewat header `X-Forwarded-For`.
