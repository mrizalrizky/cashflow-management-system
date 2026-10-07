#!/usr/bin/env bash
# Bagian bersama skrip backup dan restore. Di-source, tidak dijalankan sendiri.

set -euo pipefail

die() {
  echo "GAGAL: $*" >&2
  exit 1
}

require_env() {
  local name
  for name in "$@"; do
    [ -n "${!name:-}" ] || die "variabel $name wajib diisi"
  done
}

# Perintah PostgreSQL (pg_dump, pg_restore, psql) dijalankan langsung, atau lewat PG_PREFIX
# bila alatnya hanya ada di dalam container, mis. PG_PREFIX="docker exec -i cashflow-postgres".
# Dengan PG_PREFIX, alamat di DATABASE_URL harus bisa dijangkau dari dalam container itu.
pg() {
  # shellcheck disable=SC2086  # PG_PREFIX sengaja dipecah menjadi beberapa kata.
  ${PG_PREFIX:-} "$@"
}

# Nama database dari sebuah URL koneksi (bagian setelah garis miring terakhir, tanpa parameter).
database_name() {
  local url="${1%%\?*}"
  echo "${url##*/}"
}

# Menjalankan satu query dan mencetak hasilnya apa adanya (tanpa hiasan), untuk dibandingkan.
query() {
  local url="$1" sql="$2"
  pg psql --dbname="$url" --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$sql"
}
