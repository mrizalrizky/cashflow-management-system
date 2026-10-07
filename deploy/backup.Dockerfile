# Image untuk cadangan dan pemulihan: alat klien PostgreSQL, Bash, dan skrip dari scripts/.
# Klien versi 17 bisa mencadangkan server versi 16 maupun 17.
FROM postgres:17-bookworm

WORKDIR /opt/cashflow
COPY scripts scripts
COPY deploy/backup-loop.sh deploy/backup-loop.sh

ENV STORAGE_DIR=/data/storage BACKUP_DIR=/backups

# Tidak sehat selama cadangan terakhir gagal; lihat deploy/backup-loop.sh.
HEALTHCHECK --interval=60s --timeout=5s --retries=1 --start-period=30s --start-interval=2s CMD ["test", "!", "-f", "/tmp/backup-failed"]

# Bukan server database: entrypoint bawaan image PostgreSQL tidak dipakai.
ENTRYPOINT []
CMD ["bash", "deploy/backup-loop.sh"]
