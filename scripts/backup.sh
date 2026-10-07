#!/usr/bin/env bash
# Membuat satu cadangan utuh: database dan folder berkas bukti, yang harus selalu dipulihkan
# bersama. Lihat docs/backup-restore.md.
#
# Variabel:
#   DATABASE_URL      database yang dicadangkan
#   STORAGE_DIR       folder berkas bukti
#   BACKUP_DIR        folder tujuan; tiap cadangan menjadi subfolder cashflow-<waktu UTC>
#   BACKUP_KEEP_DAYS  cadangan yang lebih tua dari ini dihapus (bawaan 14; 0 = jangan hapus)
#   PG_PREFIX         opsional, lihat scripts/lib.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Cadangan memuat seluruh data keuangan dan hash password: hanya pemiliknya yang boleh membaca.
umask 077

require_env DATABASE_URL STORAGE_DIR BACKUP_DIR
[ -d "$STORAGE_DIR" ] || die "STORAGE_DIR bukan folder: $STORAGE_DIR"
keep_days="${BACKUP_KEEP_DAYS:-14}"
[[ "$keep_days" =~ ^[0-9]+$ ]] || die "BACKUP_KEEP_DAYS harus angka"

name="cashflow-$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/$name"
partial="$BACKUP_DIR/.partial-$name"
[ ! -e "$final" ] || die "cadangan $final sudah ada"

mkdir -p "$partial"
# Cadangan yang gagal di tengah jalan tidak boleh tertinggal dan disangka utuh.
trap 'rm -rf "$partial"' EXIT

# Database lebih dulu, baru berkas: bukti yang diunggah di antaranya ikut terarsip tanpa
# barisnya (tidak berbahaya). Bukti yang DIHAPUS di antaranya masih punya baris di cadangan
# tetapi berkasnya tidak; karena itu cadangan terjadwal dijalankan saat aplikasi sepi.
pg pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" > "$partial/database.dump"
[ -s "$partial/database.dump" ] || die "hasil pg_dump kosong"

tar -czf "$partial/attachments.tar.gz" -C "$STORAGE_DIR" .

(cd "$partial" && sha256sum database.dump attachments.tar.gz > SHA256SUMS)

mv "$partial" "$final"
trap - EXIT
echo "Cadangan dibuat: $final"

# Hanya subfolder buatan skrip ini, langsung di bawah BACKUP_DIR, yang pernah dihapus.
if [ "$keep_days" -gt 0 ]; then
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
    -name 'cashflow-????????T??????Z' -mtime "+$keep_days" -print -exec rm -rf {} + |
    sed 's/^/Cadangan lama dihapus: /'
fi
