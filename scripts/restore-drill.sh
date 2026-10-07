#!/usr/bin/env bash
# Uji pulih: membuktikan bahwa cadangan buatan backup.sh benar-benar bisa dipulihkan oleh
# restore.sh. Membuat database dan folder sementara, mengisinya, mencadangkan, memulihkan ke
# tempat sementara kedua, lalu membandingkan keduanya. Tidak menyentuh data sungguhan:
# hanya database yang namanya diakhiri `_drill` dan folder buatan `mktemp`.
#
# Variabel:
#   DRILL_SERVER_URL  alamat server PostgreSQL tanpa nama database,
#                     mis. postgresql://cashflow:cashflow_dev@localhost:5432
#   PG_PREFIX         opsional, lihat scripts/lib.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_env DRILL_SERVER_URL
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
server="${DRILL_SERVER_URL%/}"
source_db="cashflow_source_drill"
target_db="cashflow_target_drill"
source_url="$server/$source_db"
target_url="$server/$target_db"
admin_url="$server/postgres"

for url in "$source_url" "$target_url"; do
  [[ "$(database_name "$url")" == *_drill ]] || die "uji pulih hanya boleh memakai database berakhiran _drill"
done

work="$(mktemp -d)"
source_files="$work/source-files"
target_files="$work/target-files"
backups="$work/backups"
mkdir -p "$source_files" "$target_files" "$backups"

drop_databases() {
  query "$admin_url" "DROP DATABASE IF EXISTS $source_db" > /dev/null
  query "$admin_url" "DROP DATABASE IF EXISTS $target_db" > /dev/null
}
cleanup() {
  drop_databases || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "1/7 Menyiapkan database dan berkas sumber..."
drop_databases
query "$admin_url" "CREATE DATABASE $source_db" > /dev/null
query "$admin_url" "CREATE DATABASE $target_db" > /dev/null
# DATABASE_URL diberikan eksplisit supaya .env pengembangan tidak pernah terpakai di sini.
(cd "$root/apps/api" && DATABASE_URL="$source_url" npx prisma migrate deploy > /dev/null)
(cd "$root/apps/api" && DATABASE_URL="$source_url" STORAGE_DIR="$source_files" npx tsx scripts/drill-seed.ts)

echo "2/7 Mencadangkan..."
DATABASE_URL="$source_url" STORAGE_DIR="$source_files" BACKUP_DIR="$backups" "$root/scripts/backup.sh"
backup="$(find "$backups" -mindepth 1 -maxdepth 1 -type d -name 'cashflow-*')"

echo "3/7 Memulihkan ke tujuan kosong..."
DATABASE_URL="$target_url" STORAGE_DIR="$target_files" "$root/scripts/restore.sh" "$backup"

echo "4/7 Memastikan pemulihan menolak menimpa tanpa --force, dan mau dengan --force..."
if DATABASE_URL="$target_url" STORAGE_DIR="$target_files" "$root/scripts/restore.sh" "$backup" > /dev/null 2>&1; then
  die "restore.sh menimpa tujuan yang berisi tanpa --force"
fi
DATABASE_URL="$target_url" STORAGE_DIR="$target_files" "$root/scripts/restore.sh" "$backup" --force > /dev/null

echo "5/7 Memastikan --force tidak menghapus apa pun bila cadangannya tidak bisa dipulihkan..."
tables_before="$(query "$target_url" "SELECT count(*) FROM transactions")"
broken="$work/broken/$(basename "$backup")"
mkdir -p "$broken"
cp "$backup/attachments.tar.gz" "$broken/"
echo "ini bukan hasil pg_dump" > "$broken/database.dump"
(cd "$broken" && sha256sum database.dump attachments.tar.gz > SHA256SUMS)
if DATABASE_URL="$target_url" STORAGE_DIR="$target_files" "$root/scripts/restore.sh" "$broken" --force > /dev/null 2>&1; then
  die "restore.sh menerima cadangan yang tidak bisa dibaca"
fi
[ "$(query "$target_url" "SELECT count(*) FROM transactions")" = "$tables_before" ] ||
  die "restore.sh --force mengosongkan database sebelum tahu cadangannya bisa dipulihkan"
[ "$(find "$target_files" -type f | wc -l | tr -d ' ')" -gt 0 ] ||
  die "restore.sh --force mengosongkan folder bukti sebelum tahu cadangannya bisa dipulihkan"

echo "6/7 Memastikan cadangan yang berada di dalam folder bukti tidak ikut terhapus..."
nested_files="$work/nested-files"
mkdir -p "$nested_files"
cp -r "$backup" "$nested_files/"
nested="$nested_files/$(basename "$backup")"
if DATABASE_URL="$target_url" STORAGE_DIR="$nested_files" "$root/scripts/restore.sh" "$nested" --force > /dev/null 2>&1; then
  die "restore.sh mau memulihkan dari cadangan yang berada di dalam folder tujuannya"
fi
[ -f "$nested/database.dump" ] || die "restore.sh --force menghapus cadangan yang sedang dipakainya"
[ "$(query "$target_url" "SELECT count(*) FROM transactions")" = "$tables_before" ] ||
  die "restore.sh --force mengosongkan database walau menolak memulihkan"

echo "7/7 Membandingkan sumber dan hasil pemulihan..."
# Jumlah baris tiap tabel, lalu sidik isi transaksi dan bukti.
fingerprint() {
  local url="$1"
  for table in users accounts categories projects project_members transactions attachments audit_logs; do
    echo "$table=$(query "$url" "SELECT count(*) FROM $table")"
  done
  echo "transactions:$(query "$url" "SELECT md5(string_agg(id || ':' || amount || ':' || status, ',' ORDER BY id)) FROM transactions")"
  echo "attachments:$(query "$url" "SELECT md5(string_agg(storage_key || ':' || size_bytes, ',' ORDER BY storage_key)) FROM attachments")"
}
files_fingerprint() {
  (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
}

expected="$(fingerprint "$source_url")"
actual="$(fingerprint "$target_url")"
[ "$expected" = "$actual" ] || die "isi database berbeda setelah dipulihkan:
--- sumber
$expected
--- hasil
$actual"

[ "$(files_fingerprint "$source_files")" = "$(files_fingerprint "$target_files")" ] ||
  die "berkas bukti berbeda setelah dipulihkan"

# Tiap baris bukti harus menunjuk berkas yang benar-benar ada di folder hasil pemulihan.
keys="$(query "$target_url" "SELECT storage_key FROM attachments")"
[ -n "$keys" ] || die "tidak ada baris bukti untuk diperiksa"
missing=0
while IFS= read -r key; do
  [ -f "$target_files/$key" ] || { echo "berkas hilang: $key" >&2; missing=1; }
done <<< "$keys"
[ "$missing" -eq 0 ] || die "ada bukti yang berkasnya tidak ikut pulih"

echo "$expected" | sed 's/^/   /'
echo "UJI PULIH BERHASIL: database dan $(find "$target_files" -type f | wc -l | tr -d ' ') berkas bukti pulih sama persis."
