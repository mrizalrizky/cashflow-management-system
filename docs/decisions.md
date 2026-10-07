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
- **Nama kembar dicegah dengan advisory lock**, bukan constraint database: pengecekan nama akun dan kategori berjalan bergantian, jadi dua request bersamaan (mis. tombol Simpan terklik dua kali) tidak sama-sama lolos. Nama kategori sistem tidak boleh dipakai di tipe mana pun.
- **Mengubah anggota proyek hanya memeriksa yang baru ditugaskan.** Koordinator nonaktif yang sudah ditugaskan tetap dipertahankan. Perubahan anggota memakai kunci yang sama dengan perubahan peran user.
- **Kode proyek memakai advisory lock**, bukan "retry bila melanggar `uq_projects_code`" seperti catatan di spec; hasilnya sama dan tidak ada request yang gagal.
- **Tanggal kalender** hanya menerima tahun 1900 sampai 2999.
- **Untuk Fase 6:** `NODE_ENV=production` wajib diset di compose produksi; tanpa itu dokumentasi API terbuka dan cookie tidak `Secure`.

## Fase 2b

- **Nominal di web selalu string digit**, dihitung dengan `BigInt`. `MoneyInput` menerima ketikan dan tempelan berpemisah ribuan, tetapi menolak desimal (mis. `1250000.00` dari spreadsheet) dengan keterangan, bukan menebak.
- **Satu implementasi untuk tiap pola berulang:** `useEntityDialog` (dialog tambah/ubah, hanya mengirim field yang berubah), `usePagedList` + `PagedTable` (tabel berhalaman), `useToggleActive`, `useNotify`, `useAsyncData`, `TextField`/`SelectField`/`PasswordField`/`MoneyInput`/`DateField`.
- **403 di tengah sesi:** web membaca ulang data user (`/auth/me`) dan memindahkan user bila halaman yang sedang dibuka tidak lagi boleh dibukanya (mis. password direset atau peran diganti admin).
- **Halaman yang berkas kodenya gagal diambil** (tab lama setelah aplikasi diperbarui) dimuat ulang satu kali; bila masih gagal, ditampilkan pesan dengan tombol coba lagi.
- **Test browser memakai hasil build produksi** (`vite preview`), bukan server pengembangan.
- **Alamat proyek dengan id yang salah ketik** ditampilkan sebagai "Proyek tidak ditemukan", sama seperti proyek yang bukan miliknya.

## Fase 3a

- **Siapa boleh apa ditentukan di satu tempat:** `transaction-policy.ts` (fungsi murni). API mengirim hasilnya sebagai `permissions` di tiap transaksi, jadi web tidak mengulang aturannya.
- **Transaksi di luar jangkauan dijawab 404**, sama seperti yang tidak ada: koordinator hanya melihat transaksi proyek yang ditugaskan kepadanya, staf hanya miliknya sendiri. Transaksi tanpa proyek (overhead) hanya terlihat oleh pembuatnya dan admin.
- **Semua transaksi baru berstatus `PENDING`**, termasuk yang dicatat admin; tidak ada persetujuan otomatis. Koordinator meninjau transaksi di proyeknya yang dicatat staf atau admin; transaksi miliknya sendiri, milik sesama koordinator, dan transaksi tanpa proyek hanya ditinjau admin.
- **Mengubah transaksi `REJECTED` berarti mengajukannya lagi** (`PENDING`, alasan penolakan dikosongkan, audit `RESUBMIT`).
- **Tidak ada yang dihapus.** Membatalkan transaksi `PENDING` (`CANCEL`) dan membatalkan yang sudah `APPROVED` (`VOID`, admin saja) sama-sama menjadikannya `VOID` dengan alasan.
- **Pengeluaran wajib punya bukti sebelum disetujui**; pemasukan tidak. Bukti tidak bisa ditambah atau dihapus setelah transaksi disetujui.
- **Persetujuan tidak pernah ditolak karena saldo akan minus.** Jawaban persetujuan menyertakan saldo akun sesudahnya (`accountBalance`) hanya untuk admin, supaya web bisa memperingatkan.
- **Dua tindakan bersamaan, satu yang menang.** Tiap perubahan status mengunci baris transaksinya dan hanya berlaku bila statusnya belum berubah; yang kalah mendapat 409.
- **Peninjau memutuskan atas versi yang ia lihat.** Setujui dan tolak menerima `expectedUpdatedAt` (nilai `updatedAt` saat transaksi dibuka); bila transaksi atau buktinya berubah sesudah itu, jawabannya 409 dan peninjau diminta memeriksa lagi. Web selalu mengirimnya.
- **Penolakan karena hak atau status dibuat di satu tempat** (`assertPermitted` di `transaction-guards.ts`): status yang salah 409, selebihnya 403.
- **Berkas bukti** disimpan lewat `StorageService` (sekarang folder lokal `STORAGE_DIR`), maksimal 10 MB dan 10 berkas per transaksi. Jenisnya (JPEG, PNG, WebP, PDF) ditentukan dari isi berkas, bukan dari nama atau jenis yang dikirim browser, dan selalu dikirim sebagai unduhan.
- **Transfer antar akun** adalah dua transaksi `APPROVED` (kategori sistem Transfer Keluar dan Transfer Masuk) dengan `transfer_group_id` yang sama, tanpa proyek, hanya untuk admin. Satu sisi tidak bisa diubah sendiri; membatalkan salah satu membatalkan keduanya. Daftar transaksi bisa menyembunyikannya dengan `includeTransfers=false`.
- **Tanggal transaksi tidak boleh di masa depan** (waktu Jakarta), dan nominal maksimal 13 digit.
- **Untuk Fase 5:** cadangan harus mencakup folder `STORAGE_DIR`, bukan hanya database.

## Fase 3b

- **Tombol mengikuti `permissions` dari API.** Web tidak mengulang aturan siapa boleh apa pada transaksi; tiap tombol tampil hanya bila API menyatakannya boleh.
- **Keputusan diambil di halaman detail, di samping buktinya.** Setujui, tolak, batalkan dan void tidak ada di daftar; daftar hanya menandai baris "Perlu ditinjau". Dengan begitu tidak ada yang disetujui tanpa buktinya terlihat.
- **Peninjau memutuskan atas versi yang ia lihat.** Setujui dan tolak mengirim `updatedAt` transaksi yang tampil; bila API menjawab 409, halaman memuat versi terbaru dan memberi tahu, tanpa menyetujui apa pun.
- **Bukti: gambar bisa dipratinjau, PDF hanya diunduh.** Berkas diambil dengan access token dan ditampilkan dari alamat blob; tidak ada isi bukti yang dirender sebagai HTML. Berkas yang pasti ditolak API (lebih dari 10 MB, jenis lain, HEIC dari iPhone, lebih dari 10 berkas) disaring sebelum diunggah, dengan alasannya.
- **Simpan tidak pernah menjadi cara mengulang.** Begitu transaksi baru tersimpan, dialog selalu tertutup; bila bukti gagal diunggah atau persetujuan langsung gagal, pengguna dibawa ke halaman transaksi itu dengan pesan. Tombol simpan mati selama permintaan berjalan.
- **"Langsung setujui" (admin)** menjalankan simpan, unggah bukti, lalu setujui secara berurutan, sehingga pengeluaran tetap wajib berbukti. Bila saldo akun menjadi minus, admin diberi peringatan.
- **Proyek selalu dipilih secara tegas:** sebuah proyek atau "Tanpa proyek (overhead)". Kolom yang dikosongkan tidak diam-diam menjadi overhead. Koordinator tidak ditawari overhead.
- **Pilihan di filter dan form hanya yang aktif**, kecuali milik transaksi yang sedang diubah (atau proyek halaman asalnya), yang tetap ditawarkan walau sudah nonaktif.
- **Satu tabel transaksi** (`TransactionTable`) dipakai halaman Transaksi dan tab Transaksi di halaman proyek; batas tetap dari halaman pemakainya (`scope`) dibedakan dari filter pilihan pengguna.
- **Nilai filter kosong tidak dikirim** ke API (teks kosong diperlakukan seperti tidak diisi), berlaku untuk semua permintaan.

## Fase 4a

- **Yang dihitung didefinisikan di satu tempat:** `CashflowReportService`. Hanya transaksi `APPROVED`; angka perusahaan (masuk, keluar, per bulan, per kategori) tidak menghitung transfer antar akun. Semua penjumlahan dilakukan database, bukan dengan memuat baris.
- **Periode bawaan dashboard:** bulan berjalan dan sebelas bulan sebelumnya (waktu Jakarta). Kedua ujung periode ikut dihitung. Rentang paling lama 60 bulan.
- **Saldo akun di dashboard selalu saldo saat ini**, bukan saldo pada akhir periode. Yang mengikuti periode hanya masuk, keluar, arus kas bulanan, dan rincian pengeluaran.
- **Arus kas bulanan** dikelompokkan langsung pada `transaction_date` (tanggal kalender, tanpa zona waktu); bulan tanpa transaksi tetap muncul dengan nol.
- **"10 transaksi terbaru"** adalah yang terakhir dicatat (`created_at`), apa pun statusnya, termasuk transfer. Jumlah transaksi yang menunggu tidak mengikuti periode.
- **Ringkasan proyek mencakup seluruh umur proyek**, tanpa filter periode. Sisa belum diterima bisa negatif (diterima melebihi kontrak); persentase diterima dua desimal, dibulatkan ke bawah, dan kosong bila nilai kontrak 0. Ditambah jumlah transaksi proyek yang menunggu ditinjau.
- **Rute `/projects/:id/summary` dikelola modul laporan** (`ReportsModule`), supaya modul proyek tidak bergantung pada modul transaksi. Aksesnya tetap lewat `ProjectAccessService`: proyek di luar jangkauan dijawab 404.
- **Index baru `idx_transactions_status_transaction_date`** (status, tanggal transaksi). Pada 10.000 transaksi, query arus kas bulanan memakainya (Bitmap Index Scan). Migrasinya ditulis tangan (`20261007090000_report_indexes`) supaya database pengembangan tidak disentuh; jalankan `npx prisma migrate deploy` (atau `migrate dev`) untuk menerapkannya.
- **Batas waktu respons:** dashboard dan ringkasan proyek masing-masing di bawah 1.500 ms pada 10.000 transaksi, dijaga oleh `test/report-scale.e2e-spec.ts`.

## Fase 4b

- **Grafik digambar dengan HTML dan CSS biasa, tanpa pustaka grafik.** Tiap angka tetap berupa teks (terbaca pembaca layar dan bisa diuji), dan ukuran batang dihitung dengan `BigInt` (`lib/shares.ts`), jadi nominal tidak pernah menjadi `number`. Konsekuensinya hanya ada grafik batang sederhana.
- **Web tidak menghitung ulang angka laporan.** Total, saldo, selisih dan persentase ditampilkan apa adanya dari API; yang dihitung di web hanya proporsi untuk menggambar.
- **Tiga komponen dipakai bersama** oleh dashboard dan ringkasan proyek: `StatCard`, `BarList`, `MoneyText`. Nominal negatif selalu bertanda minus dan berwarna merah.
- **Periode dashboard:** pilihan cepat "12 bulan terakhir" (bawaan, tanpa mengirim tanggal), "Bulan ini", "Tahun ini", ditambah dua tanggal. Tanggal yang tidak dipilih diserahkan ke bawaan API dan yang tampil adalah periode yang benar-benar dipakai. Keberatan API atas periode muncul di bawah tanggal yang disebutnya; angka terakhir yang berhasil dimuat tetap tampil.
- **Jumlah "menunggu ditinjau" di dashboard** membuka daftar transaksi pada status itu (`/transaksi?status=PENDING`). Daftar transaksi membaca status dari alamat sekali saat dibuka.
- **Tab halaman proyek:** Ringkasan (dibuka lebih dulu), Transaksi, Anggota. Tab yang tidak aktif tidak dipasang, jadi ringkasan dimuat ulang tiap kali dibuka.
- **Kontrak yang dibayar lebih** ditampilkan apa adanya: persentase di atas 100, batang kemajuan penuh, dan sisa negatif berwarna merah dengan keterangan.
- **Test browser menyiapkan datanya sendiri lewat API** (`e2e/api.ts`), dan data dashboard diletakkan pada bulan yang tidak dipakai file lain supaya angkanya tidak bergantung pada urutan file.
