# Backup dan restore

## Apa yang dicadangkan

Data aplikasi ada di dua tempat, dan keduanya harus selalu dicadangkan dan dipulihkan **bersama**:

1. **Database PostgreSQL**: transaksi, akun, proyek, pengguna, log audit.
2. **Folder berkas bukti** (`STORAGE_DIR`): foto dan PDF nota. Database hanya menyimpan nama berkasnya.

Database tanpa foldernya berarti bukti tidak bisa dibuka. Folder tanpa databasenya berarti berkas tanpa pemilik. Karena itu satu cadangan selalu berisi keduanya, dari waktu yang sama.

Satu cadangan adalah satu folder `cashflow-<waktu UTC>` berisi:

| Berkas | Isi |
|--------|-----|
| `database.dump` | hasil `pg_dump --format=custom` |
| `attachments.tar.gz` | seluruh isi `STORAGE_DIR` |
| `SHA256SUMS` | sidik kedua berkas di atas; diperiksa sebelum memulihkan |

## Yang dibutuhkan

- Bash, `tar`, `sha256sum`, `find` (ada di semua server Linux).
- `pg_dump`, `pg_restore` dan `psql` versi 16. Bila alat itu hanya ada di dalam container PostgreSQL, isi `PG_PREFIX`, mis. `PG_PREFIX="docker exec -i cashflow-postgres"`. Dengan `PG_PREFIX`, alamat di `DATABASE_URL` harus bisa dijangkau dari dalam container itu.

## Membuat cadangan

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/cashflow" \
STORAGE_DIR="/srv/cashflow/storage" \
BACKUP_DIR="/srv/backup/cashflow" \
scripts/backup.sh
```

- Boleh dijalankan selagi aplikasi berjalan, tetapi jadwalkan saat sepi (malam hari). Database dicadangkan lebih dulu, baru berkas, sehingga bukti yang diunggah di antaranya tetap utuh. Dua hal yang bisa terjadi bila ada yang bekerja tepat saat itu: bukti yang **dihapus** di antara kedua langkah akan punya baris di cadangan tanpa berkasnya, dan `tar` bisa gagal bila sebuah berkas sedang ditulis (cadangan itu batal, tanpa meninggalkan apa pun; jalankan lagi).
- Folder cadangan hanya bisa dibaca pemiliknya (`umask 077`): isinya seluruh data keuangan dan hash password.
- Password di `DATABASE_URL` terlihat di daftar proses selagi skrip berjalan. Di server bersama, simpan password di `~/.pgpass` dan tulis `DATABASE_URL` tanpa password.
- Bila gagal di tengah jalan, tidak ada folder cadangan setengah jadi yang tertinggal, dan skrip keluar dengan kode bukan nol.
- Cadangan yang lebih tua dari `BACKUP_KEEP_DAYS` hari (bawaan 14) dihapus. Yang dihapus hanya subfolder `cashflow-...` buatan skrip ini di dalam `BACKUP_DIR`. Isi `0` untuk tidak pernah menghapus.

### Terjadwal tiap malam

Contoh baris cron (pukul 01.30 waktu server), dengan variabel disimpan di berkas yang hanya bisa dibaca pemiliknya:

```cron
30 1 * * * . /etc/cashflow/backup.env && /srv/cashflow/app/scripts/backup.sh >> /var/log/cashflow-backup.log 2>&1
```

`/etc/cashflow/backup.env` berisi `export DATABASE_URL=...`, `export STORAGE_DIR=...`, `export BACKUP_DIR=...` (dan `export PG_PREFIX=...` bila perlu), dengan izin `chmod 600`.

Di pemasangan dengan Docker (lihat [deployment.md](deployment.md)) baris cron ini tidak diperlukan: layanan `backup` menjalankan cadangan tiap malam pukul `BACKUP_AT`, dan databasenya adalah Neon.

### Simpan salinan di tempat lain

Cadangan di disk yang sama dengan aplikasi ikut hilang bila disk itu rusak. Salin `BACKUP_DIR` secara berkala ke tempat lain (disk lain, NAS, atau penyimpanan awan), mis. dengan `rsync`. Cadangan tidak dienkripsi; enkripsi dulu sebelum menyimpannya di tempat yang tidak sepenuhnya Anda kuasai.

## Di pemasangan dengan Docker

Skrip yang sama berjalan di dalam container, dengan variabelnya sudah diisi oleh Compose:

```bash
alias dc='docker compose --env-file deploy/.env -f docker-compose.prod.yml'
dc run --rm backup scripts/backup.sh                              # cadangan sekarang
dc stop api web
dc --profile tools run --rm restore /backups/<nama cadangan>      # tambahkan --force untuk mengganti isi
dc up -d
```

Bagian di bawah menjelaskan skripnya sendiri, untuk dijalankan langsung tanpa Docker.

## Memulihkan

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/cashflow" \
STORAGE_DIR="/srv/cashflow/storage" \
scripts/restore.sh /srv/backup/cashflow/cashflow-20261007T013000Z
```

Langkah demi langkah:

1. **Hentikan aplikasi** (API), supaya tidak ada yang menulis selagi data diganti.
2. Jalankan perintah di atas **sebagai user database yang dipakai aplikasi** dan dengan `STORAGE_DIR` berupa jalur lengkap. Skrip memeriksa `SHA256SUMS`, memastikan cadangan bisa dibaca dan tidak berada di dalam folder tujuan, lalu mencetak cadangan mana yang dipakai dan database serta folder mana yang menjadi tujuan. Semua pemeriksaan itu terjadi sebelum ada yang diubah.
3. Bila database tujuan sudah berisi tabel atau folder tujuan sudah berisi berkas, skrip **menolak**. Periksa tujuan yang dicetak. Bila memang itu yang hendak diganti, ulangi dengan `--force` di akhir: database dan folder tujuan **dikosongkan** lalu diisi dari cadangan.
4. Jalankan `npx prisma migrate deploy` di `apps/api` bila versi aplikasi lebih baru daripada cadangan (migrasi yang belum ada di cadangan akan diterapkan).
5. Jalankan lagi aplikasi, login, dan buka satu transaksi yang punya bukti untuk memastikan buktinya bisa diunduh.

## Uji pulih

Cadangan yang belum pernah dipulihkan belum terbukti. `scripts/restore-drill.sh` menguji seluruh alur tanpa menyentuh data sungguhan: ia membuat dua database sementara (namanya selalu diakhiri `_drill`) dan folder sementara, mengisi yang pertama dengan transaksi dan berkas bukti, mencadangkannya, memulihkan ke yang kedua, memastikan `restore.sh` menolak menimpa tanpa `--force`, memastikan `--force` tidak menghapus apa pun bila cadangannya rusak atau berada di dalam folder tujuan, lalu membandingkan jumlah baris tiap tabel, sidik isi transaksi, dan sidik tiap berkas bukti. Semua yang dibuatnya dihapus lagi di akhir.

```bash
DRILL_SERVER_URL="postgresql://cashflow:cashflow_dev@localhost:5432" \
PG_PREFIX="docker exec -i cash-flow-management-postgres-1" \
npm run backup:drill
```

Jalankan setelah mengubah skrip backup, setelah menaikkan versi PostgreSQL, dan sesekali di server. Uji ini membutuhkan dependensi pengembangan (`npm ci` tanpa `--omit=dev`), karena mengisi datanya lewat Prisma. Yang diuji adalah pemulihan utuh dari cadangan yang diam; cadangan yang diambil selagi ada yang menulis tidak diuji di sini.

### Hasil uji terakhir

Dijalankan 7 Oktober 2026 terhadap PostgreSQL 16 (container pengembangan), keluar dengan kode 0:

```
1/7 Menyiapkan database dan berkas sumber...
2/7 Mencadangkan...
3/7 Memulihkan ke tujuan kosong...
4/7 Memastikan pemulihan menolak menimpa tanpa --force, dan mau dengan --force...
5/7 Memastikan --force tidak menghapus apa pun bila cadangannya tidak bisa dipulihkan...
6/7 Memastikan cadangan yang berada di dalam folder bukti tidak ikut terhapus...
7/7 Membandingkan sumber dan hasil pemulihan...
   users=1
   accounts=1
   categories=1
   projects=0
   project_members=0
   transactions=5
   attachments=2
   audit_logs=1
   transactions:<sidik sama di sumber dan hasil>
   attachments:<sidik sama di sumber dan hasil>
UJI PULIH BERHASIL: database dan 2 berkas bukti pulih sama persis.
```

Data ujinya memuat nominal di atas 2^53 (9.007.199.254.740.993), yang pulih tanpa berubah.
