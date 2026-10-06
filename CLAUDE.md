# Aturan kerja

Spec: `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md`. Dokumen dasar: `implementation-plan-cashflow-mvp.md`. Bila bertentangan, spec yang berlaku.

- Kerjakan satu fase pada satu waktu; jangan memulai fase berikutnya sebelum acceptance criteria fase saat ini lulus.
- Jangan membangun fitur di luar ruang lingkup (BOQ, payroll, dll) walau terlihat mudah.
- Tulis test bersamaan dengan fitur, terutama aturan bisnis.
- Semua perubahan skema lewat migrasi Prisma; jangan edit DB manual.
- Field model Prisma, kolom, tabel, enum, dan index wajib `snake_case`. Nama model `PascalCase` dengan `@@map`. Jangan memakai `@map` pada field.
- Properti JSON di API `camelCase`; pemetaan dilakukan di response DTO.
- Uang selalu integer rupiah: `bigint` di layer data, string di JSON. Jangan pernah memakai `number` untuk nominal.
- Setiap aksi yang mengubah data penting harus menulis audit log dalam transaksi database yang sama.
- Tidak ada hard delete untuk transaksi.
- API memakai ESM: setiap import relatif diakhiri `.js`.
- Catat keputusan non-trivial di `docs/decisions.md`.
- Bila ada ambiguitas yang mengubah struktur data, berhenti dan tanyakan dulu daripada menebak.

## Perintah

- `npm run db:up` menjalankan PostgreSQL dev.
- `npm run dev:api`, `npm run dev:web` menjalankan API dan web.
- `npm test` unit test, `npm run test:e2e` e2e API (butuh database berjalan), `npm run lint`.
