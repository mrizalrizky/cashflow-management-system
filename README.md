# Arus Kas

Aplikasi internal arus kas perusahaan. Lihat `implementation-plan-cashflow-mvp.md` dan `docs/superpowers/`.

## Prasyarat

Node 24.12 atau lebih baru, Docker Desktop.

## Menjalankan secara lokal

```bash
npm install
npm run db:up
cp apps/api/.env.example apps/api/.env
npm run db:migrate -w api
npm run db:seed -w api
npm run dev:api     # http://localhost:3000/api/v1/health
npm run dev:web     # http://localhost:5173
```

## Test

```bash
npm run lint
npm test
npm run test:e2e    # butuh database berjalan
```
