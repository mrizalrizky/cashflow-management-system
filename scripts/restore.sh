#!/usr/bin/env bash
# Memulihkan satu cadangan buatan scripts/backup.sh: database dan folder berkas bukti sekaligus.
# Lihat docs/backup-restore.md.
#
# Pemakaian: scripts/restore.sh <folder cadangan> [--force]
#
# Variabel:
#   DATABASE_URL  database tujuan
#   STORAGE_DIR   folder berkas bukti tujuan
#   PG_PREFIX     opsional, lihat scripts/lib.sh
#
# Tanpa --force, skrip menolak bila database tujuan sudah berisi tabel atau folder tujuan
# sudah berisi berkas. Dengan --force, keduanya DIKOSONGKAN lebih dulu.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

backup="${1:-}"
force="${2:-}"
[ -n "$backup" ] || die "pemakaian: scripts/restore.sh <folder cadangan> [--force]"
[ -z "$force" ] || [ "$force" = "--force" ] || die "argumen tidak dikenal: $force"
require_env DATABASE_URL STORAGE_DIR

for file in database.dump attachments.tar.gz SHA256SUMS; do
  [ -f "$backup/$file" ] || die "bukan cadangan yang utuh, $file tidak ada di $backup"
done
(cd "$backup" && sha256sum --check --quiet SHA256SUMS) || die "isi cadangan tidak cocok dengan SHA256SUMS"

mkdir -p "$STORAGE_DIR"
# Jalur mutlak, supaya yang dicetak dan yang dibandingkan adalah folder yang sebenarnya.
backup="$(cd "$backup" && pwd -P)"
storage="$(cd "$STORAGE_DIR" && pwd -P)"

# Mengosongkan folder tujuan tidak boleh ikut menghapus cadangan yang sedang dipakai.
case "$backup/" in "$storage"/*) die "cadangan berada di dalam folder tujuan ($storage); pindahkan dulu ke luar" ;; esac
case "$storage/" in "$backup"/*) die "folder tujuan berada di dalam folder cadangan ($backup)" ;; esac

# Dipastikan terbaca oleh pg_restore yang akan dipakai SEBELUM ada yang dikosongkan.
pg pg_restore --list < "$backup/database.dump" > /dev/null 2>&1 ||
  die "database.dump tidak bisa dibaca pg_restore ini (rusak, atau versinya lebih baru)"
tar -tzf "$backup/attachments.tar.gz" > /dev/null 2>&1 || die "attachments.tar.gz tidak bisa dibaca"
tables="$(query "$DATABASE_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
files="$(find "$storage/" -mindepth 1 | wc -l | tr -d ' ')"

echo "Cadangan : $backup"
echo "Database : $(database_name "$DATABASE_URL") ($tables tabel saat ini)"
echo "Berkas   : $storage ($files berkas atau folder saat ini)"

if [ "$tables" -gt 0 ] || [ "$files" -gt 0 ]; then
  [ "$force" = "--force" ] ||
    die "tujuan tidak kosong. Periksa tujuan di atas; ulangi dengan --force untuk MENGGANTI isinya"
  echo "Mengosongkan tujuan (--force)..."
  query "$DATABASE_URL" 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' > /dev/null
  find "$storage/" -mindepth 1 -delete
fi

# Dalam satu transaksi: bila gagal di tengah, database tidak tertinggal setengah terisi.
pg pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
  --dbname="$DATABASE_URL" < "$backup/database.dump"
tar -xzf "$backup/attachments.tar.gz" -C "$storage"

echo "Pemulihan selesai."
