#!/usr/bin/env bash
# Menjalankan scripts/backup.sh sekali sehari pada jam BACKUP_AT (menurut TZ container).
# Cadangan yang gagal dicatat di log dan menandai container tidak sehat sampai ada yang berhasil.
#
#   backup-loop.sh                          berjalan terus (dipakai container `backup`)
#   backup-loop.sh --run-once               satu cadangan sekarang; kode keluar mengikuti hasilnya
#   backup-loop.sh --seconds-until HH:MM [epoch]   jeda sampai jam itu berikutnya (untuk pengujian)

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly FAILED_MARKER="${BACKUP_FAILED_MARKER:-/tmp/backup-failed}"

# Detik dari `now` sampai jam `HH:MM` berikutnya: hari ini bila belum lewat, selain itu besok.
seconds_until() {
  local at="$1" now="${2:-$(date +%s)}"
  [[ "$at" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { echo "BACKUP_AT harus berbentuk HH:MM, mis. 01:30" >&2; return 1; }
  local today target
  today="$(date -d "@$now" +%F)"
  target="$(date -d "$today $at" +%s)"
  [ "$target" -gt "$now" ] || target="$(date -d "$today $at tomorrow" +%s)"
  echo $((target - now))
}

run_backup() {
  if "$here/../scripts/backup.sh"; then
    rm -f "$FAILED_MARKER"
    echo "[$(date '+%F %T')] Cadangan selesai."
  else
    # Tandanya dibaca HEALTHCHECK; sebabnya sudah dicetak skrip cadangan di atas.
    touch "$FAILED_MARKER"
    echo "[$(date '+%F %T')] CADANGAN GAGAL. Periksa pesan di atas; dicoba lagi pada jadwal berikutnya." >&2
    return 1
  fi
}

case "${1:-}" in
  --seconds-until)
    seconds_until "${2:?jam wajib diisi}" "${3:-}"
    ;;
  --run-once)
    run_backup
    ;;
  "")
    at="${BACKUP_AT:-01:30}"
    seconds_until "$at" > /dev/null
    echo "[$(date '+%F %T')] Cadangan harian dijadwalkan pukul $at ($(date +%Z))."
    # Berhenti segera saat container dimatikan, tidak menunggu `sleep` selesai.
    trap 'exit 0' TERM INT
    while true; do
      sleep "$(seconds_until "$at")" &
      wait $!
      run_backup || true
    done
    ;;
  *)
    echo "argumen tidak dikenal: $1" >&2
    exit 2
    ;;
esac
