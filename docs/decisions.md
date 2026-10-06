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
- **Sesi yang diakhiri dihapus barisnya.** Logout, ganti password, reset oleh admin, ganti peran, dan penonaktifan menghapus baris `refresh_tokens`. `revoked_at` hanya diisi oleh rotasi, sehingga deteksi pencurian hanya terpicu oleh token lama yang sudah ditukar, bukan oleh perangkat lain yang sesinya sengaja diakhiri.
- **Password saat ini salah dijawab 400** (error field `currentPassword`), bukan 401, supaya klien tidak mengiranya sesi kedaluwarsa.
- **Perubahan peran dan status aktif diserikan** dengan advisory lock PostgreSQL, supaya dua admin yang saling menurunkan pada saat bersamaan tidak menghilangkan SUPER_ADMIN terakhir.

## Fase 1b

- **Access token hanya di memori.** Tidak ada data sesi yang ditulis JavaScript ke storage atau cookie; saat halaman dimuat ulang, sesi dipulihkan lewat cookie refresh.
- **Dua tab refresh bersamaan.** Web menyerikan refresh antar tab dengan Web Locks (bila tersedia) dan mencoba sekali lagi setelah jeda singkat. API tidak menghapus cookie bila sebuah refresh hanya kalah cepat dari tab lain, karena cookie di browser saat itu sudah milik sesi yang baru.
- **Menu mengikuti rute.** Item menu tampil berdasarkan `meta.roles` rutenya, jadi menu dan guard tidak bisa berbeda. Yang benar-benar menjaga data tetap API.
- **Tipe API ditulis tangan** di `apps/web/src/api/types.ts` untuk fase ini; pembuatan otomatis dari OpenAPI ditunda ke awal Fase 2.
- **Test browser terisolasi.** Playwright menjalankan API (port 3100, build ke `dist-browser-test`) dan web (port 5174) sendiri terhadap `cashflow_test`, supaya server dan data pengembangan tidak tersentuh.
- **`primeicons` dikunci di 7.0.0** (MIT).

## Fase 2a

- **Uang di JSON berupa string digit** (maksimal 18 digit), dua arah. Angka JSON, desimal, dan pemisah ribuan ditolak.
- **Saldo akun dihitung** dari saldo awal dan transaksi `APPROVED` (`AccountBalanceService`), tidak disimpan. Saldo awal boleh negatif.
- **Nama akun unik** tanpa membedakan huruf besar/kecil; **nama kategori unik per tipe**. Tipe kategori tidak bisa diubah, dan kategori sistem tidak bisa diubah sama sekali.
- **Kode proyek** `PRJ-<tahun>-<nomor>`: tahun saat proyek dibuat (waktu Jakarta), nomor berurutan per tahun dan dibuat di bawah advisory lock supaya dua proyek yang dibuat bersamaan tidak bertabrakan.
- **Akses proyek di satu tempat:** `ProjectAccessService`. Proyek di luar jangkauan dijawab 404, sama seperti proyek yang tidak ada.
- **Ganti peran dari PROJECT_MANAGER mencabut penugasan proyeknya** (dicatat di audit sebagai `removed_project_ids`). Penonaktifan tidak mencabutnya, jadi akses kembali saat diaktifkan lagi.
- **Verifikasi tanpa menulis `dist`:** `npm run typecheck -w api` (ikut dijalankan oleh `lint`) memeriksa `src`, `test`, dan `scripts`.
- **Dokumentasi API** disajikan Swagger di `/api/docs` hanya di luar produksi. **Tipe API di web tetap ditulis tangan** (`apps/web/src/api/types.ts`); pembuatan otomatis dari OpenAPI tidak dikerjakan karena menuntut setiap respons dijadikan kelas DTO terdokumentasi.
- **Install script `@scarf/scarf` ditolak** (telemetri milik dependensi Swagger UI).
