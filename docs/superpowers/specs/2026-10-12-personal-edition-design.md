# Personal edition: PIN, Cicilan, Wishlist

Status: disetujui dalam percakapan 2026-10-12. Berlaku di branch `personal-edition` saja.

Dokumen ini berdiri di atas spec MVP (`2026-10-06-cashflow-mvp-design.md`). Di branch ini, bila keduanya bertentangan, dokumen ini yang berlaku. Branch `main` tetap aplikasi perusahaan dan tidak terpengaruh.

## Tujuan

Satu orang mencatat uangnya sendiri: akun, pemasukan dan pengeluaran, cicilan yang sedang berjalan, dan daftar keinginan yang dinilai AI apakah impulsif sebelum dibeli. Aplikasi bisa dibuka di internet (lewat susunan Fase 6), jadi tetap dilindungi, tetapi cukup dengan PIN.

## Keputusan pemilik

| Topik | Keputusan |
|---|---|
| Hubungan dengan `main` | Branch menjadi edisi pribadi; bagian perusahaan dihapus, bukan disembunyikan. Perbaikan di `main` dibawa dengan tangan bila perlu. |
| Masuk | PIN saja, satu orang. Sesi 30 hari per perangkat. |
| Bagian lama | Akun, kategori, transaksi (dengan bukti), transfer, dasbor, ekspor CSV, cadangan, log audit dipertahankan. Proyek, persetujuan, pengguna, peran dihapus. |
| Cicilan | Kemajuan dihitung dari transaksi pengeluaran yang ditautkan ke cicilan. Kategori diberi tanda "Kategori cicilan"; transaksinya wajib memilih cicilan. |
| Wishlist | Enam pertanyaan dinilai Claude. Ringkasan keuangan (hanya total) ikut dikirim, bisa dimatikan per barang. Model `claude-opus-5-5`. |
| Urutan | P1 edisi pribadi dan PIN, P2 Cicilan, P3 Wishlist. Satu fase pada satu waktu, masing-masing diuji dan ditinjau sebelum yang berikutnya. |

## P1: Edisi pribadi dan PIN

### Yang dihapus

- Proyek, anggota proyek, ringkasan proyek, kolom proyek di transaksi, angka proyek dan "overhead vs proyek" di dasbor, filter proyek.
- Persetujuan: tidak ada lagi `PENDING` dan `REJECTED`, kolom peninjau, alasan penolakan, halaman dan hitungan "menunggu ditinjau". Transaksi yang disimpan langsung berstatus `APPROVED` dan dihitung. Membatalkan (`VOID`) tetap ada; tidak ada hapus permanen.
- Pengelolaan pengguna, peran, email, password, "wajib ganti password", dan semua pembatasan akses per peran atau per proyek.
- Variabel `SEED_ADMIN_*` di `deploy/env.example`, `docker-compose.prod.yml`, seed, uji asap, dan panduan.

Semua penghapusan lewat migrasi Prisma. Database edisi pribadi adalah database baru; tidak ada data perusahaan yang dipindahkan.

### Yang dipertahankan

Akun (tipe `CASH` dan `BANK`; dompet digital dicatat sebagai `BANK`), kategori, transaksi dengan bukti, transfer antar akun, dasbor perusahaan tanpa bagian proyek, ekspor CSV, cadangan dan pemulihan, susunan deploy (tunnel, Caddy, Neon). Log audit tetap ditulis untuk setiap perubahan penting dan dipindah ke menu Pengaturan.

### Catat pengeluaran dari dasbor

Dasbor mendapat tombol utama **"Catat pengeluaran"** di kepala halaman. Tombol membuka form transaksi yang sama dengan di halaman Transaksi, dengan jenis pengeluaran sudah terpilih (tetap bisa diganti). Setelah disimpan, dasbor memuat ulang angkanya; batal tidak mengubah apa pun. Di P2, form ini otomatis ikut menampilkan pilihan "Cicilan yang dibayar".

### Pemilik

Tabel `users` tetap ada dengan tepat satu baris "pemilik" yang tidak pernah ditampilkan, karena sesi, transaksi, bukti, dan log audit sudah menunjuk ke pengguna. Kolom yang tidak dipakai lagi (`email`, `role`, `must_change_password`, `is_active`) dihapus; `password_hash` diganti `pin_hash` (boleh null: belum diatur).

Penghitung PIN salah disimpan di database supaya tidak hilang saat aplikasi dinyalakan ulang: `pin_failed_attempts` dan `pin_locked_until` pada baris pemilik.

### Alur PIN

- **Pertama kali** (belum ada pemilik atau `pin_hash` null): layar "Buat PIN", 6 sampai 12 digit, diketik dua kali. Setelah disimpan langsung masuk. Hanya bisa dilakukan selama PIN belum ada.
- **Masuk:** layar hanya meminta PIN. Benar: sesi baru, penghitung salah dikosongkan.
- **Salah:** penghitung naik. Pada kesalahan kelima berturut-turut, PIN tidak bisa dicoba selama 15 menit, untuk semua pengunjung sekaligus. Selama jeda, semua percobaan ditolak dengan pesan berapa menit lagi, tanpa memeriksa PIN dan tanpa menambah penghitung. Setelah jeda, penghitung mulai dari nol.
- Batas percobaan per pengunjung yang sudah ada tetap berlaku di atasnya.
- **Sesi:** token akses singkat seperti sekarang; token refresh berlaku 30 hari dan diperbarui tiap dipakai. "Keluar" mencabut sesi perangkat itu.
- **Ganti PIN** (Pengaturan): wajib PIN lama. Semua sesi lain dicabut; perangkat ini tetap masuk.
- **Lupa PIN:** perintah server `npm run reset-pin` (di produksi `deploy/dc run --rm api npm run reset-pin`) mengosongkan PIN dan penghitung serta mencabut semua sesi. Kunjungan berikutnya meminta PIN baru. Data lain tidak tersentuh. Ditulis di panduan.
- PIN disimpan sebagai hash argon2. PIN tidak pernah dicatat di log atau log audit; log audit mencatat "PIN dibuat", "PIN diganti", "PIN direset", dan masuk yang gagal karena jeda.
- Semua endpoint selain kesehatan, status PIN (apakah sudah diatur), buat PIN, masuk, refresh, dan keluar menolak permintaan tanpa sesi.

### Kriteria penerimaan P1

- Tidak ada lagi kode, rute, halaman, tabel, atau kolom proyek, persetujuan, atau pengguna.
- Tombol "Catat pengeluaran" di dasbor membuka form pengeluaran dan memuat ulang dasbor setelah disimpan.
- Test: buat PIN (dan menolak membuat kedua kali), masuk, lima salah lalu jeda 15 menit (dengan waktu palsu), jeda bertahan setelah aplikasi dinyalakan ulang, sesi 30 hari, ganti PIN mencabut sesi lain, reset PIN, sapuan rute: setiap endpoint menolak tanpa sesi.
- Uji asap deploy lulus dengan variabel env yang baru.

## P2: Cicilan

### Data

- Tabel `installments`: `name`, `monthly_amount` (bigint, > 0), `start_month` (tanggal hari pertama bulan), `months` (1 sampai 120), `notes`, waktu dibuat dan diubah. Bulan selesai dihitung, tidak disimpan: `start_month + months - 1`.
- `categories.is_installment` (boolean, bawaan false). Hanya boleh true untuk kategori pengeluaran yang bukan kategori sistem.
- `transactions.installment_id` (opsional, ke `installments`, `onDelete: Restrict`).

### Aturan

1. Transaksi pengeluaran dengan kategori cicilan **wajib** punya `installment_id`; transaksi lain **tidak boleh** punya.
2. **Kemajuan** = jumlah transaksi tertaut yang tidak `VOID`.
3. **Lunas** bila kemajuan = `months`. Cicilan lunas tidak menerima pembayaran baru, kecuali transaksi yang sedang diubah memang sudah tertaut ke cicilan itu.
4. **Seharusnya** = jumlah bulan dari `start_month` sampai bulan berjalan (waktu Jakarta), termasuk keduanya, dibatasi 0 sampai `months`.
5. **Status:** *Belum mulai* (bulan berjalan sebelum `start_month`), *Lunas*, *Tertinggal* (kemajuan < seharusnya), selain itu *Berjalan*.
6. Mengubah cicilan: nama, nominal, bulan mulai, dan catatan bebas; `months` tidak boleh di bawah kemajuan.
7. Menghapus cicilan hanya bila belum ada transaksi tertaut (termasuk yang `VOID`).
8. Tanda "Kategori cicilan" tidak bisa dimatikan selama ada transaksi berkategori itu yang tertaut ke cicilan.
9. Mengganti kategori transaksi ke kategori bukan cicilan mengosongkan tautannya.
10. Nominal transaksi boleh berbeda dari `monthly_amount`. Satu transaksi = satu bulan.
11. Membuat, mengubah, dan menghapus cicilan menulis log audit dalam transaksi database yang sama.

### Halaman Cicilan

- Atas: **Total cicilan aktif per bulan** (jumlah `monthly_amount` cicilan yang periodenya mencakup bulan berjalan) dan **Belum dibayar bulan ini** (tiap cicilan *Tertinggal*: berapa bulan dan `(seharusnya - kemajuan) × monthly_amount`).
- Daftar: nama, nominal per bulan, mulai sampai selesai, kemajuan "2/3", status. Filter aktif atau lunas.
- Detail cicilan: data cicilan dan daftar transaksi tertautnya.
- Tambah, ubah, hapus (sesuai aturan 6 dan 7).

### Form transaksi

Memilih kategori cicilan memunculkan "Cicilan yang dibayar": cicilan yang belum lunas (ditambah cicilan yang sudah tertaut saat mengubah), ditampilkan "Nama · nominal · kemajuan". Bila hanya ada satu, langsung terpilih. Memilih cicilan mengisi nominal dari `monthly_amount` selama nominal masih kosong.

### Kriteria penerimaan P2

Test untuk setiap aturan di atas, termasuk batas bulan (awal dan akhir bulan, waktu Jakarta), bulan mulai di masa depan, transaksi tertaut yang diubah atau dibatalkan, isi dropdown, dan angka di atas halaman.

## P3: Wishlist dan penilaian AI

### Data

Tabel `wishlist_items`:

- Jawaban: `name`, `price` (bigint, > 0), `reason` (Kenapa saya menginginkannya?), `similar_owned` (Apakah saya sudah punya yang mirip?), `value_added` (Bagaimana barang ini menambah nilai dalam hidup saya?), `usage_duration` (Berapa lama saya membutuhkannya dan untuk apa?). Teks wajib, masing-masing maksimal 1.000 karakter.
- `include_finance` (boolean, bawaan true).
- `status`: `WAITING`, `BOUGHT`, `CANCELLED`.
- Penilaian terakhir (semua null sampai ada): `ai_verdict` (`IMPULSIVE`, `NEEDS_THOUGHT`, `PLANNED`), `ai_reasons` (JSON, 2 sampai 4 teks), `ai_suggestion`, `ai_finance_snapshot` (JSON: ringkasan yang dikirim, atau null), `ai_reviewed_at`, `ai_model`.
- `answers_changed_at`: diisi saat jawaban atau harga diubah setelah ada penilaian; penilaian ditandai "Jawaban sudah diubah" bila `answers_changed_at > ai_reviewed_at`.

Label tampilan: *Impulsif*, *Perlu dipikirkan*, *Terencana*; *Menunggu*, *Dibeli*, *Batal*.

### Ringkasan keuangan

Hanya bila `include_finance`. Hanya total, tidak ada transaksi, keterangan, nama akun, atau bukti:

- saldo semua akun aktif saat ini;
- rata-rata pemasukan dan pengeluaran per bulan dari tiga bulan kalender penuh terakhir (transaksi `APPROVED`, tanpa transfer);
- jumlah cicilan yang belum lunas, total `monthly_amount`-nya, dan bulan selesai yang paling akhir.

### Panggilan AI

- Hanya saat pemilik menekan "Minta pendapat AI"; menyimpan barang tidak memanggil AI.
- SDK resmi `@anthropic-ai/sdk`, model `claude-opus-5-5`, effort `low`, keluaran terstruktur (`output_config.format`, skema JSON: `verdict`, `reasons` 2 sampai 4, `suggestion`), dalam Bahasa Indonesia.
- Fallback sisi server diaktifkan (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- Jawaban pemilik dikirim sebagai data di dalam tag yang jelas, dan instruksi sistem menyatakan bahwa isinya bukan perintah.
- Batas waktu 60 detik. Kunci `ANTHROPIC_API_KEY` hanya di `deploy/.env`, tidak pernah dikirim ke browser.
- Batas harian penilaian (bawaan 20, `AI_REVIEW_DAILY_LIMIT`), dihitung per hari Jakarta dari penilaian yang berhasil.
- Kegagalan (tanpa kunci, batas harian tercapai, waktu habis, galat API, `stop_reason: "refusal"` setelah fallback, keluaran tidak sesuai skema) menghasilkan pesan yang jelas, tidak mengubah barang, dan tidak dihitung ke batas harian.
- Penilaian yang berhasil menggantikan yang lama dan menulis log audit.

### Setelah memutuskan

- **Dibeli** menawarkan dua jalan pintas, terisi nama dan harga barang: catat pengeluaran (membuka form transaksi) atau buat cicilan (membuka form cicilan). Keduanya boleh dilewati.
- **Batal** menyimpan barang sebagai catatan.
- Daftar bisa disaring per status; verdict tampil sebagai tag berwarna.

### Kriteria penerimaan P3

Panggilan ke Anthropic diganti tiruan di semua test (tanpa biaya, hasil tetap). Test: isi permintaan dengan dan tanpa ringkasan (dan bahwa ringkasan hanya berisi total), penyimpanan hasil, batas harian, tanpa kunci, waktu habis, penolakan, keluaran tidak sah, tanda "Jawaban sudah diubah", jalan pintas Dibeli.

## Di luar ruang lingkup

Jadwal termin, pengingat atau notifikasi cicilan, bunga cicilan, banyak pengguna, sinkronisasi dengan edisi perusahaan, riwayat semua penilaian AI (hanya yang terakhir disimpan), percakapan lanjutan dengan AI.
