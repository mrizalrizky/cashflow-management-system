# Memasang aplikasi di server

Panduan ini memasang aplikasi Arus Kas di satu server, dari nol. Ikuti berurutan.

## Gambaran

```
pengunjung ──HTTPS──> Cloudflare ══tunnel══> cloudflared ──> web (Caddy) ──> api ──> Neon (database)
                                              └────────── di dalam server ──────────┘
```

- **Tidak ada port yang dibuka di server.** Satu-satunya jalan masuk adalah Cloudflare Tunnel: server membuat sambungan keluar ke Cloudflare, dan Cloudflare yang menerima pengunjung lewat HTTPS. Alamat IP server tidak terlihat dari luar.
- **Database berada di Neon** (PostgreSQL terkelola), bukan di server.
- **Berkas bukti transaksi** (foto dan PDF nota) disimpan di server, di volume Docker bernama `cashflow_storage`.
- Yang berjalan di server: `cloudflared` (tunnel), `web` (Caddy: menyajikan aplikasi dan meneruskan `/api`), `api`, dan `backup` (cadangan tiap malam). Sebelum `api` menyala, `migrate` menyiapkan database satu kali lalu berhenti.

## Yang dibutuhkan

1. **Server Linux** dengan Docker Engine dan Docker Compose versi 2 (`docker compose version`). Server boleh berada di balik router; tidak perlu IP publik.
2. **Domain yang DNS-nya dikelola Cloudflare**, mis. `kas.perusahaan.co.id`.
3. **Database Neon** yang masih kosong, dibuat dengan **PostgreSQL 17** (pilihan versi ada saat membuat proyek Neon; cadangan memakai klien versi 17 dan menolak server yang lebih baru), beserta alamat koneksi **langsung**-nya (`postgresql://...?sslmode=require`). Di dasbor Neon, matikan pilihan "Connection pooling" saat menyalin alamat: host yang benar **tidak** memuat `-pooler`. Migrasi dan cadangan tidak berjalan lewat alamat pooled.
4. **Git** untuk mengambil kode.

## Langkah 1: Buat tunnel di Cloudflare

1. Buka dasbor Cloudflare: **Zero Trust > Networks > Tunnels > Create a tunnel**, pilih **Cloudflared**, beri nama (mis. `arus-kas`).
2. Di halaman pemasangan konektor, pilih **Docker**. Dari perintah yang ditampilkan, salin **token**-nya saja (deret panjang setelah `--token`). Perintahnya sendiri tidak perlu dijalankan.
3. Di tab **Public Hostname**, tambahkan:
   - **Subdomain/Domain:** alamat aplikasi, mis. `kas.perusahaan.co.id`
   - **Service:** `HTTP` dengan URL `web:8080`
4. Simpan.

Pengaturan Cloudflare yang dianjurkan untuk domain itu (menu **SSL/TLS > Edge Certificates**):

- **Always Use HTTPS:** aktif.
- **HTTP Strict Transport Security (HSTS):** aktif, 6 bulan atau lebih, **tanpa** "Include subdomains" kecuali semua subdomain perusahaan memang sudah HTTPS.

Unggahan lewat Cloudflare dibatasi 100 MB pada paket gratis; aplikasi sendiri membatasi bukti 10 MB per berkas, jadi tidak ada yang perlu diubah.

## Langkah 2: Ambil kode

```bash
sudo mkdir -p /srv/cashflow && sudo chown "$USER" /srv/cashflow
git clone <alamat repositori> /srv/cashflow/app
cd /srv/cashflow/app
```

## Langkah 3: Isi konfigurasi

```bash
cp deploy/env.example deploy/.env
chmod 600 deploy/.env
sudo mkdir -p /srv/backup/cashflow
```

Buka `deploy/.env` dan isi:

| Variabel | Isi |
|---|---|
| `DATABASE_URL` | Alamat koneksi **langsung** Neon (host tanpa `-pooler`), lengkap dengan `sslmode=require`. |
| `JWT_ACCESS_SECRET` | Hasil `openssl rand -base64 48`. Jangan dipakai ulang dari tempat lain. |
| `TUNNEL_TOKEN` | Token dari Langkah 1. |
| `SEED_ADMIN_EMAIL` | Email admin pertama. |
| `SEED_ADMIN_PASSWORD` | Password sementara admin pertama, minimal 8 karakter. Wajib diganti saat login pertama. |
| `BACKUP_HOST_DIR` | Folder cadangan di server, mis. `/srv/backup/cashflow`. |

Sisanya (`SEED_ADMIN_NAME`, `LOGIN_RATE_LIMIT`, `BACKUP_AT`, `BACKUP_KEEP_DAYS`, `TZ`) boleh dibiarkan.

Nilai yang memuat tanda `# Memasang aplikasi di server

Panduan ini memasang aplikasi Arus Kas di satu server, dari nol. Ikuti berurutan.

## Gambaran

```
pengunjung ──HTTPS──> Cloudflare ══tunnel══> cloudflared ──> web (Caddy) ──> api ──> Neon (database)
                                              └────────── di dalam server ──────────┘
```

- **Tidak ada port yang dibuka di server.** Satu-satunya jalan masuk adalah Cloudflare Tunnel: server membuat sambungan keluar ke Cloudflare, dan Cloudflare yang menerima pengunjung lewat HTTPS. Alamat IP server tidak terlihat dari luar.
- **Database berada di Neon** (PostgreSQL terkelola), bukan di server.
- **Berkas bukti transaksi** (foto dan PDF nota) disimpan di server, di volume Docker bernama `cashflow_storage`.
- Yang berjalan di server: `cloudflared` (tunnel), `web` (Caddy: menyajikan aplikasi dan meneruskan `/api`), `api`, dan `backup` (cadangan tiap malam). Sebelum `api` menyala, `migrate` menyiapkan database satu kali lalu berhenti.

## Yang dibutuhkan

1. **Server Linux** dengan Docker Engine dan Docker Compose versi 2 (`docker compose version`). Server boleh berada di balik router; tidak perlu IP publik.
2. **Domain yang DNS-nya dikelola Cloudflare**, mis. `kas.perusahaan.co.id`.
3. **Database Neon** yang masih kosong, dibuat dengan **PostgreSQL 17** (pilihan versi ada saat membuat proyek Neon; cadangan memakai klien versi 17 dan menolak server yang lebih baru), beserta alamat koneksi **langsung**-nya (`postgresql://...?sslmode=require`). Di dasbor Neon, matikan pilihan "Connection pooling" saat menyalin alamat: host yang benar **tidak** memuat `-pooler`. Migrasi dan cadangan tidak berjalan lewat alamat pooled.
4. **Git** untuk mengambil kode.

## Langkah 1: Buat tunnel di Cloudflare

1. Buka dasbor Cloudflare: **Zero Trust > Networks > Tunnels > Create a tunnel**, pilih **Cloudflared**, beri nama (mis. `arus-kas`).
2. Di halaman pemasangan konektor, pilih **Docker**. Dari perintah yang ditampilkan, salin **token**-nya saja (deret panjang setelah `--token`). Perintahnya sendiri tidak perlu dijalankan.
3. Di tab **Public Hostname**, tambahkan:
   - **Subdomain/Domain:** alamat aplikasi, mis. `kas.perusahaan.co.id`
   - **Service:** `HTTP` dengan URL `web:8080`
4. Simpan.

Pengaturan Cloudflare yang dianjurkan untuk domain itu (menu **SSL/TLS > Edge Certificates**):

- **Always Use HTTPS:** aktif.
- **HTTP Strict Transport Security (HSTS):** aktif, 6 bulan atau lebih, **tanpa** "Include subdomains" kecuali semua subdomain perusahaan memang sudah HTTPS.

Unggahan lewat Cloudflare dibatasi 100 MB pada paket gratis; aplikasi sendiri membatasi bukti 10 MB per berkas, jadi tidak ada yang perlu diubah.

## Langkah 2: Ambil kode

```bash
sudo mkdir -p /srv/cashflow && sudo chown "$USER" /srv/cashflow
git clone <alamat repositori> /srv/cashflow/app
cd /srv/cashflow/app
```

## Langkah 3: Isi konfigurasi

```bash
cp deploy/env.example deploy/.env
chmod 600 deploy/.env
sudo mkdir -p /srv/backup/cashflow
```

Buka `deploy/.env` dan isi:

| Variabel | Isi |
|---|---|
| `DATABASE_URL` | Alamat koneksi **langsung** Neon (host tanpa `-pooler`), lengkap dengan `sslmode=require`. |
| `JWT_ACCESS_SECRET` | Hasil `openssl rand -base64 48`. Jangan dipakai ulang dari tempat lain. |
| `TUNNEL_TOKEN` | Token dari Langkah 1. |
| `SEED_ADMIN_EMAIL` | Email admin pertama. |
| `SEED_ADMIN_PASSWORD` | Password sementara admin pertama, minimal 8 karakter. Wajib diganti saat login pertama. |
| `BACKUP_HOST_DIR` | Folder cadangan di server, mis. `/srv/backup/cashflow`. |

Sisanya (`SEED_ADMIN_NAME`, `LOGIN_RATE_LIMIT`, `BACKUP_AT`, `BACKUP_KEEP_DAYS`, `TZ`) boleh dibiarkan.

 atau spasi harus diapit kutip tunggal, mis. `SEED_ADMIN_PASSWORD='Rahasia$2026'`.

Berkas `deploy/.env` berisi semua rahasia aplikasi. Ia tidak pernah masuk repositori; simpan salinannya di tempat aman (pengelola kata sandi), bukan di server saja.

## Langkah 4: Jalankan

Semua perintah di panduan ini memakai `deploy/dc`: Docker Compose dengan berkas env dan berkas Compose produksi yang sudah benar. Jalankan dari folder aplikasi (`/srv/cashflow/app`). Bila pengguna Anda bukan anggota grup `docker`, awali dengan `sudo` (`sudo deploy/dc ...`).

```bash
deploy/dc up -d --build
```

Pertama kali, ini membangun image (beberapa menit), menyiapkan tabel di database Neon, membuat admin pertama, lalu menyalakan semuanya. Periksa:

```bash
deploy/dc ps
```

`api`, `web`, `cloudflared` dan `backup` harus berstatus `Up` (dan `healthy` untuk yang punya pemeriksaan). `migrate` berstatus `Exited (0)`: itu benar, ia hanya berjalan sekali tiap deploy.

Bila ada nilai wajib yang belum diisi, Compose menolak jalan dan menyebut nama variabelnya.

Lalu jalankan satu cadangan sekarang juga, supaya masalah cadangan ketahuan hari ini dan bukan pada malam pertama:

```bash
deploy/dc exec backup bash deploy/backup-loop.sh --run-once
ls /srv/backup/cashflow
```

Harus muncul satu folder `cashflow-<waktu>`. Bila gagal dengan pesan `server version mismatch`, database Neon dibuat dengan PostgreSQL yang lebih baru dari 17: lihat "Bila ada masalah".

## Langkah 5: Login pertama

1. Buka alamat aplikasi (mis. `https://kas.perusahaan.co.id`).
2. Masuk dengan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD`.
3. Aplikasi langsung meminta password baru. Setelah itu, `SEED_ADMIN_PASSWORD` di `deploy/.env` tidak dipakai lagi (admin hanya dibuat bila belum ada).
4. Sesuaikan akun kas/bank dan kategori awal, lalu buat proyek dan pengguna lain, dari menu Master data dan Pengguna. Akun dan kategori awal hanya dibuat pada pemasangan pertama: yang Anda ganti namanya atau nonaktifkan tidak muncul lagi saat aplikasi diperbarui.

## Di mana data berada

| Data | Tempat | Dicadangkan oleh |
|---|---|---|
| Transaksi, akun, pengguna, log audit | Database Neon | `backup` (dump tiap malam) |
| Berkas bukti | Volume Docker `cashflow_storage` | `backup` (arsip tiap malam) |
| Cadangan | `BACKUP_HOST_DIR` di server | Anda: salin ke luar server |
| Rahasia | `deploy/.env` | Anda: simpan salinannya |

Menghapus container (`deploy/dc down`) **tidak** menghapus data. Yang menghapus berkas bukti adalah `deploy/dc down --volumes`: jangan dipakai di server.

## Memperbarui ke versi baru

```bash
cd /srv/cashflow/app
git pull
deploy/dc up -d --build
```

Image dibangun ulang, migrasi database yang baru diterapkan otomatis sebelum API menyala, dan container diganti. Data tidak tersentuh. Aplikasi tidak bisa dibuka selama beberapa detik saat container diganti.

## Melihat log dan menghentikan

```bash
deploy/dc logs -f api          # log API (Ctrl+C untuk berhenti melihat)
deploy/dc logs --tail 50 backup
deploy/dc restart api          # menyalakan ulang satu layanan
deploy/dc down                 # menghentikan semuanya (data tetap ada)
```

Semua layanan menyala lagi sendiri setelah server dinyalakan ulang.

## Cadangan

Container `backup` mencadangkan database Neon dan berkas bukti **tiap malam pukul `BACKUP_AT`** (bawaan 01.30 WIB) ke `BACKUP_HOST_DIR`, satu folder `cashflow-<waktu UTC>` per cadangan, dan menghapus yang lebih tua dari `BACKUP_KEEP_DAYS` hari. Isi dan cara kerjanya dijelaskan di [backup-restore.md](backup-restore.md).

- **Cadangan sekarang juga:** `deploy/dc exec backup bash deploy/backup-loop.sh --run-once`. Bila berhasil, status `unhealthy` dari cadangan yang gagal sebelumnya ikut hilang.
- **Memeriksa cadangan semalam:** `deploy/dc logs --tail 20 backup` dan `ls /srv/backup/cashflow`. Bila cadangan terakhir gagal, `deploy/dc ps` menampilkan `backup` sebagai `unhealthy` dan sebabnya ada di log.
- **Salin ke luar server.** Cadangan di disk yang sama ikut hilang bila disk itu rusak. Salin `BACKUP_HOST_DIR` secara berkala ke tempat lain; cadangan tidak dienkripsi, jadi enkripsi dulu bila tempatnya tidak sepenuhnya Anda kuasai.

## Memulihkan dari cadangan

1. Hentikan API supaya tidak ada yang menulis: `deploy/dc stop api web`
2. Pulihkan (ganti nama foldernya):
   ```bash
   deploy/dc --profile tools run --rm restore /backups/cashflow-20261007T183000Z
   ```
   Skrip memeriksa cadangan, lalu mencetak database dan folder tujuan. Bila tujuan sudah berisi data, ia menolak; ulangi dengan `--force` di akhir **hanya** bila memang hendak mengganti isinya (database dan berkas bukti dikosongkan lalu diisi dari cadangan).
3. Nyalakan lagi: `deploy/dc up -d`
4. Login dan buka satu transaksi berbukti untuk memastikan buktinya bisa diunduh.

Untuk memulihkan ke database Neon yang baru (mis. cabang atau proyek Neon lain), ubah dulu `DATABASE_URL` di `deploy/.env`.

## Bila ada masalah

| Gejala | Yang diperiksa |
|---|---|
| `deploy/dc up` berhenti dengan `... wajib diisi di berkas env` | Variabel yang disebut belum diisi di `deploy/.env`. |
| `migrate` berstatus `Exited (1)` | `deploy/dc logs migrate`. Biasanya `DATABASE_URL` salah, database Neon tidak terjangkau, atau `SEED_ADMIN_PASSWORD` kurang dari 8 karakter. |
| `api` terus menyala ulang | `deploy/dc logs --tail 30 api`. Pesan `Konfigurasi environment tidak valid` menyebut variabel yang salah (mis. `JWT_ACCESS_SECRET` kurang dari 32 karakter). |
| Alamat aplikasi menampilkan galat Cloudflare 502/1033 | `deploy/dc logs --tail 30 cloudflared`. Token salah, atau Public Hostname tunnel tidak mengarah ke `http://web:8080`. |
| Bisa login, tetapi keluar sendiri saat halaman dimuat ulang | Aplikasi dibuka lewat HTTP, bukan HTTPS. Aktifkan "Always Use HTTPS" di Cloudflare. |
| Semua orang kena "terlalu banyak percobaan login" bersamaan | Ada proxy tambahan di depan aplikasi selain Cloudflare dan Caddy. `TRUST_PROXY_HOPS` di `docker-compose.prod.yml` harus sama dengan jumlah proxy. |
| `backup` berstatus `unhealthy` | `deploy/dc logs --tail 30 backup`. Biasanya database tidak terjangkau atau disk cadangan penuh. Setelah diperbaiki, jalankan cadangan sekarang juga (lihat "Cadangan"). |
| Cadangan gagal dengan `server version mismatch` | Database Neon memakai PostgreSQL yang lebih baru dari klien cadangan. Ubah angka versi di baris `FROM postgres:17-bookworm` pada `deploy/backup.Dockerfile` menjadi versi database, lalu `deploy/dc up -d --build backup`. |
| `migrate` gagal atau macet pada database yang benar | `DATABASE_URL` memakai alamat pooled (host memuat `-pooler`). Ganti dengan alamat langsung. |
| Permintaan pertama setelah lama sepi terasa lambat atau gagal sekali | Neon menidurkan database yang menganggur dan butuh beberapa detik untuk bangun. Ulangi; bila mengganggu, matikan "Scale to zero" di Neon (paket berbayar). |
| Disk penuh | `docker system df` dan `du -sh /srv/backup/cashflow`. Kurangi `BACKUP_KEEP_DAYS`, atau `docker image prune` untuk image lama. |

## Menguji pemasangan tanpa server

`npm run deploy:smoke` membangun image yang sama dan menjalankan seluruh susunan di mesin pengembangan, dengan PostgreSQL sementara sebagai pengganti Neon dan tanpa tunnel, lalu memeriksa login, transaksi, bukti, ekspor, log audit, batas login, nyala ulang, cadangan dan pemulihan. Semua yang dibuatnya dihapus lagi. Jalankan setelah mengubah apa pun di `deploy/`, `Dockerfile`, atau `docker-compose.prod.yml`.

## Terakhir diverifikasi

7 Oktober 2026, dengan Docker 29.1.3 dan Docker Compose v5.0.0, lewat `npm run deploy:smoke` (34 pemeriksaan lulus): image dibangun dari nol, susunan dinyalakan, lalu login, transaksi, bukti, ekspor, log audit, batas login, pembaruan, nyala ulang, cadangan dan pemulihan diperiksa lewat Caddy.

Empat hal di panduan ini bergantung pada akun Anda sendiri dan belum bisa diuji otomatis; pastikan pada pemasangan pertama:

1. **Tunnel tersambung** (Langkah 1 dan 4): alamat aplikasi terbuka lewat HTTPS, dan `deploy/dc logs cloudflared` menampilkan sambungan terdaftar.
2. **Database Neon terjangkau** (Langkah 3 dan 4): `migrate` berstatus `Exited (0)`.
3. **Cadangan dari Neon berhasil** (Langkah 4): cadangan pertama yang dijalankan dengan tangan menghasilkan satu folder di `BACKUP_HOST_DIR`.
4. **Batas login menghitung per pengunjung**: enam kali salah password dari satu perangkat menolak perangkat itu saja; perangkat lain di jaringan berbeda (mis. ponsel dengan data seluler) tetap bisa login.
