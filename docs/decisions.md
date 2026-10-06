# Catatan keputusan

Keputusan desain utama ada di `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md`. File ini mencatat keputusan yang diambil saat implementasi.

## Fase 0

- **Husky tidak dipasang.** Opsional di dokumen dasar; lint dan test dijalankan CI.
- **Kredensial database dev ditulis di `docker-compose.dev.yml`.** Hanya untuk mesin lokal. Produksi memakai environment variable (Fase 6).
- **Test dan lint mengikuti bawaan scaffold:** Vitest dan oxlint di API, Vitest, oxlint dan ESLint di web.
- **Prisma dikunci di 7.10.0** karena tag `latest` di npm masih release candidate 8.0.
- **PrimeVue dikunci di 4.5.5** karena versi 5 tidak berlisensi MIT.
- **e2e memakai database `cashflow_test`** pada kontainer yang sama, dan menolak jalan bila nama database tidak diakhiri `_test`.
