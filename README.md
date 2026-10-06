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

## Test

```bash
npm run lint
npm test
npm run test:e2e    # butuh database berjalan
```

e2e memakai database `cashflow_test`, yang dibuat otomatis saat volume PostgreSQL pertama kali dibuat.

## Bila port 5432 sudah terpakai

Set `POSTGRES_PORT` sebelum `npm run db:up`, lalu sesuaikan port di `DATABASE_URL` (`apps/api/.env`) dan set `TEST_DATABASE_URL` untuk e2e:

```bash
export POSTGRES_PORT=5433
export TEST_DATABASE_URL=postgresql://cashflow:cashflow_dev@localhost:5433/cashflow_test
```
