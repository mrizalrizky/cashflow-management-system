# Dibangun dari akar repositori:  docker build -f apps/api/Dockerfile --target runtime .
# Tidak ada rahasia di sini: semua konfigurasi diberikan saat container dijalankan.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Mesin migrasi Prisma butuh OpenSSL untuk menyambung ke database lewat TLS (Neon).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Workspace npm butuh semua package.json-nya untuk membaca lockfile.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api apps/api

# Dependensi lengkap (termasuk Prisma CLI); `postinstall` menjalankan `prisma generate`.
RUN npm ci --workspace api
RUN npm run build --workspace api

WORKDIR /app/apps/api
# Tahap ini juga dipakai layanan `migrate`: menerapkan migrasi lalu seed (aman diulang).
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]


FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json

# Hanya dependensi produksi. Skrip instalasi tidak dijalankan: `postinstall` milik API butuh
# Prisma CLI (dependensi pengembangan), dan klien Prisma sudah ada di dalam hasil build.
RUN npm ci --workspace api --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist

# Berkas bukti disimpan di volume yang dipasang di sini, milik user tanpa hak root.
RUN mkdir -p /data/storage && chown node:node /data/storage
ENV STORAGE_DIR=/data/storage PORT=3000
VOLUME /data/storage

USER node
WORKDIR /app/apps/api
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/main.js"]
