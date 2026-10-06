# Catatan keputusan

Keputusan desain utama ada di `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md`. File ini mencatat keputusan yang diambil saat implementasi.

## Fase 0

- **Husky tidak dipasang.** Opsional di dokumen dasar; lint dan test dijalankan CI.
- **Kredensial database dev ditulis di `docker-compose.dev.yml`.** Hanya untuk mesin lokal. Produksi memakai environment variable (Fase 6).
- **Test dan lint mengikuti bawaan scaffold:** Vitest dan oxlint di API, Vitest, oxlint dan ESLint di web.
- **Prisma dikunci di 7.10.0** karena tag `latest` di npm masih release candidate 8.0.
- **PrimeVue dikunci di 4.5.5** karena versi 5 tidak berlisensi MIT.
- **e2e memakai database `cashflow_test`** pada kontainer yang sama, dan menolak jalan bila nama database tidak diakhiri `_test`.
- **Install script npm (`allowScripts` di `package.json` root).** npm 11 memblokir install script secara default. Disetujui: `esbuild`, `prisma`, `@prisma/engines` (Prisma tidak bisa generate tanpa itu; kunci `esbuild` terikat versi, jadi perlu disetujui ulang bila versinya naik). Ditolak: `argon2`, karena binary prebuilt-nya sudah berfungsi. Cek ulang saat memilih image produksi di Fase 6.
- **Seed aman dijalankan berulang.** Admin hanya dibuat bila belum ada SUPER_ADMIN; password contoh dari `.env.example` ditolak.

## Fase 1a

- **Dua tab refresh bersamaan.** Refresh token yang sudah dirotasi dan dipakai lagi dalam 10 detik hanya dijawab 401. Setelah 10 detik dianggap pencurian: semua sesi user dicabut dan dicatat sebagai `TOKEN_REUSE`.
- **Admin tidak bisa mengunci diri.** Admin tidak bisa menonaktifkan atau mengubah peran akunnya sendiri, dan SUPER_ADMIN aktif terakhir tidak bisa dihilangkan.
- **Pencarian teks** memakai `containsText()` (`common/search.ts`) karena Prisma tidak meng-escape wildcard `%` dan `_`.
- **Belum diputuskan (Fase 2):** nasib baris `project_members` bila seorang PROJECT_MANAGER diubah perannya.
