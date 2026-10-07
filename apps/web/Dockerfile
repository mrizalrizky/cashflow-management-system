# Dibangun dari akar repositori:  docker build -f apps/web/Dockerfile .
# Hasilnya: Caddy berisi web hasil build dan aturan proxy ke API. Tanpa rahasia.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Workspace npm butuh semua package.json-nya untuk membaca lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web apps/web

# Paket bawaan platform (mis. lightningcss) diunduh sebagai dependensi opsional; npm melewatinya
# diam-diam bila unduhannya gagal. Diperiksa di langkah yang sama supaya kegagalan itu terlihat
# dan lapisan yang rusak tidak tersimpan di cache.
RUN npm ci --workspace web && node -e "require('lightningcss')"
# Pemeriksaan tipe sudah dijalankan `npm run build` saat pengembangan; di sini cukup membangun.
RUN npm run build-only --workspace web


FROM caddy:2-alpine AS runtime

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

# Tanpa hak root: mendengarkan di port 8080, dan tidak menulis apa pun selain ke /tmp.
ENV XDG_DATA_HOME=/tmp/caddy-data XDG_CONFIG_HOME=/tmp/caddy-config
USER 65534:65534
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
  CMD ["wget", "--quiet", "--spider", "http://127.0.0.1:8080/"]
