#!/usr/bin/env bash
# Uji asap deployment: membangun image produksi, menjalankan seluruh susunan dari nol, dan
# memeriksa bahwa semuanya bekerja seperti di server.
#
# Dua hal yang tidak ada di mesin uji diganti (deploy/compose.smoke.yml): database Neon oleh
# PostgreSQL sementara, dan Cloudflare Tunnel oleh port di loopback, tempat skrip ini berbicara
# kepada Caddy seperti tunnel (dengan header X-Forwarded-*).
#
# Skrip ini hanya menyentuh apa yang dibuatnya sendiri: project Compose `cashflow-smoke`,
# container dan image berawalan `cashflow-smoke`, dan satu folder sementara. Semuanya dihapus di
# akhir, juga bila gagal. Berkas env milik Anda, database Anda dan container lain tidak disentuh.
#
# Pemakaian: bash deploy/smoke.sh        (atau: npm run deploy:smoke)

set -euo pipefail
# Git Bash di Windows tidak boleh mengubah argumen seperti `/app/...` menjadi jalur Windows.
export MSYS_NO_PATHCONV=1

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

readonly PROJECT="cashflow-smoke"
readonly API_IMAGE="$PROJECT/api:test"
readonly WEB_IMAGE="$PROJECT/web:test"
readonly BACKUP_IMAGE="$PROJECT/backup:test"
readonly NETWORK="$PROJECT-net"
readonly STUB="$PROJECT-stub"
readonly WEB_ALONE="$PROJECT-web-alone"
readonly WEB_ALONE_PORT=18081
readonly STACK_PORT=18080
readonly BASE="http://127.0.0.1:$STACK_PORT"
# Alamat "pengunjung" yang dikirim sebagai X-Forwarded-For, seperti yang dilakukan Cloudflare.
readonly VISITOR="198.51.100.10"

passed=0
step() { echo; echo "== $*"; }
ok() { passed=$((passed + 1)); echo "  ok  $*"; }
fail() { echo "  GAGAL  $*" >&2; exit 1; }

# Tempat membuang keluaran curl. Di Git Bash (Windows) curl adalah program Windows dan, karena
# konversi jalur dimatikan di atas, tidak mengenal /dev/null.
if command -v cygpath > /dev/null 2>&1; then readonly NULL="NUL"; else readonly NULL="/dev/null"; fi

# Jalur yang dimengerti Docker Desktop di Windows; di Linux tidak diubah.
hostpath() {
  if command -v cygpath > /dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi
}

work="$(mktemp -d)"
work_host="$(hostpath "$work")"
env_file="$work/env"
mkdir -p "$work/backups"

compose() {
  docker compose -p "$PROJECT" --env-file "$work_host/env" \
    -f docker-compose.prod.yml -f deploy/compose.smoke.yml "$@"
}
# Hanya berkas produksi, untuk memeriksa konfigurasi yang sebenarnya dipakai di server.
compose_prod() {
  docker compose -p "$PROJECT" --env-file "$(hostpath "$1")" -f docker-compose.prod.yml "${@:2}"
}

cleanup() {
  status=$?
  set +e
  if [ "$status" -ne 0 ] && [ -f "$env_file" ]; then
    echo; echo "-- log terakhir api:"; compose logs --tail 25 api 2> /dev/null | cut -c1-220
    echo "-- log terakhir migrate:"; compose logs --tail 15 migrate 2> /dev/null | cut -c1-220
  fi
  [ -f "$env_file" ] && compose --profile tools down --volumes --remove-orphans --rmi local > /dev/null 2>&1
  docker rm -f "$STUB" "$WEB_ALONE" > /dev/null 2>&1
  docker network rm "$NETWORK" > /dev/null 2>&1
  docker image rm -f "$API_IMAGE" "$WEB_IMAGE" "$BACKUP_IMAGE" > /dev/null 2>&1
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

# Menjalankan perintah di dalam sebuah image, tanpa memakai entrypoint-nya.
in_image() {
  local image="$1"; shift
  docker run --rm --entrypoint sh "$image" -c "$*"
}

# Nilai sebuah field dari JSON di stdin, mis. `json .user.id`.
json() {
  node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const v=JSON.parse(s);const out=eval("v"+process.argv[1]);console.log(out===undefined?"":out)})' "$1"
}

random_secret() {
  node -e 'console.log(require("node:crypto").randomBytes(36).toString("base64url"))'
}

# Permintaan ke Caddy seperti yang datang dari tunnel: HTTPS di sisi pengunjung, alamat pengunjung
# di X-Forwarded-For. Argumen pertama alamat pengunjung, sisanya argumen curl.
as_visitor() {
  local visitor="$1"; shift
  curl --silent --show-error --max-time 60 \
    -H "X-Forwarded-Proto: https" -H "X-Forwarded-For: $visitor" "$@"
}
api() { as_visitor "$VISITOR" "$@"; }
authed() { api -H "Authorization: Bearer $token" "$@"; }
status_of() { "$@" --output "$NULL" --write-out '%{http_code}'; }

wait_healthy() {
  compose up --detach --wait --wait-timeout 180 "$@" > "$work/up.log" 2>&1 || {
    cat "$work/up.log" | tail -n 20 >&2
    fail "layanan tidak menjadi sehat: $*"
  }
}

# =======================================================================================
step "1. Image API"

docker build --quiet -f apps/api/Dockerfile --target runtime -t "$API_IMAGE" . > /dev/null
ok "image runtime terbangun"

[ "$(in_image "$API_IMAGE" 'id -u')" != "0" ] || fail "container API berjalan sebagai root"
ok "berjalan sebagai user tanpa hak root"

in_image "$API_IMAGE" 'test -f /app/apps/api/dist/main.js' || fail "dist/main.js tidak ada di image"
[ "$(docker inspect --format '{{json .Config.Cmd}}' "$API_IMAGE")" = '["node","dist/main.js"]' ] ||
  fail "perintah bawaan bukan aplikasi hasil build"
ok "berisi aplikasi hasil build dan menjalankannya"

for unwanted in \
  /app/apps/api/.env /app/.env /app/apps/api/src /app/apps/api/test /app/apps/api/storage \
  /app/apps/api/prisma /app/node_modules/vitest /app/node_modules/@nestjs/cli /app/node_modules/oxlint; do
  in_image "$API_IMAGE" "test ! -e $unwanted" || fail "$unwanted ikut masuk ke image"
done
ok "tanpa .env, kode sumber, test, berkas bukti, dan alat pengembangan"

no_secret_in_history() {
  if docker history --no-trunc --format '{{.CreatedBy}}' "$1" |
    grep -E -i '(secret|password|token|database_url)=' > /dev/null; then
    fail "riwayat image $1 memuat sesuatu yang tampak seperti rahasia"
  fi
}
no_secret_in_history "$API_IMAGE"
ok "riwayat image tidak memuat rahasia"

set +e
output="$(docker run --rm -e DATABASE_URL=postgresql://x:y@127.0.0.1:1/z "$API_IMAGE" 2>&1)"
status=$?
set -e
[ "$status" -ne 0 ] || fail "API tetap menyala tanpa JWT_ACCESS_SECRET"
echo "$output" | grep -q 'JWT_ACCESS_SECRET' || fail "pesan kegagalan tidak menyebut JWT_ACCESS_SECRET"
ok "menolak menyala tanpa JWT_ACCESS_SECRET, dan menyebut namanya"

# =======================================================================================
step "2. Image web dan proxy"

docker build --quiet -f apps/web/Dockerfile -t "$WEB_IMAGE" . > /dev/null
ok "image web terbangun"

[ "$(in_image "$WEB_IMAGE" 'id -u')" != "0" ] || fail "container web berjalan sebagai root"
in_image "$WEB_IMAGE" 'test -f /srv/index.html && test ! -e /srv/node_modules && test ! -e /app' ||
  fail "image web berisi lebih dari hasil build"
no_secret_in_history "$WEB_IMAGE"
ok "tanpa hak root, hanya berisi Caddy dan web hasil build"

# API tiruan: menjawab apa yang diterimanya, supaya terlihat apa yang diteruskan proxy.
docker network create "$NETWORK" > /dev/null
docker run --detach --name "$STUB" --network "$NETWORK" node:24-bookworm-slim node -e '
  require("node:http").createServer((req, res) => {
    let bytes = 0;
    req.on("data", (chunk) => (bytes += chunk.length)).on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Security-Policy", "dari-api");
      res.end(JSON.stringify({ path: req.url, forwardedFor: req.headers["x-forwarded-for"] ?? "", bytes }));
    });
  }).listen(3000);' > /dev/null
docker run --detach --name "$WEB_ALONE" --network "$NETWORK" -e "API_UPSTREAM=$STUB:3000" \
  -p "127.0.0.1:$WEB_ALONE_PORT:8080" "$WEB_IMAGE" > /dev/null
alone="http://127.0.0.1:$WEB_ALONE_PORT"
for _ in $(seq 1 30); do curl --silent --output "$NULL" "$alone/" && break; sleep 1; done

index="$(curl --silent "$alone/")"
echo "$index" | grep -q '<div id="app"' || fail "halaman utama bukan aplikasi"
for deep in /transaksi/abc /audit-log /proyek/x/y; do
  [ "$(curl --silent "$alone$deep")" = "$index" ] || fail "alamat dalam $deep tidak menyajikan aplikasi"
done
[ "$(status_of curl --silent "$alone/assets/tidak-ada.js")" = "404" ] ||
  fail "berkas /assets yang tidak ada tidak dijawab 404"
ok "alamat dalam menyajikan aplikasi; berkas hasil build yang hilang dijawab 404"

script="$(echo "$index" | grep -o '/assets/index-[^"]*\.js' | head -n 1)"
[ -n "$script" ] || fail "skrip utama tidak ditemukan di index.html"
headers_of() { curl --silent --output "$NULL" --dump-header - "$@" | tr -d '\r'; }
# Benar bila jawaban untuk permintaan itu punya header yang cocok dengan pola (tanpa beda huruf besar).
# Header ditampung dulu: `curl | grep -q` di bawah pipefail bisa gagal palsu karena SIGPIPE.
has_header() {
  local pattern="$1" headers
  shift
  headers="$(headers_of "$@")"
  grep -qi "$pattern" <<< "$headers"
}
has_header '^cache-control: no-cache' "$alone/" || fail "index.html tidak dikirim no-cache"
has_header '^cache-control:.*immutable' "$alone$script" || fail "berkas /assets tidak immutable"
ok "index.html selalu diperiksa ulang; berkas hasil build disimpan lama"

has_header '^content-encoding: gzip' -H 'Accept-Encoding: gzip' "$alone$script" ||
  fail "skrip utama tidak dikompresi"
if has_header '^content-encoding:' "$alone$script"; then
  fail "skrip dikompresi walau browser tidak memintanya"
fi
plain="$(curl --silent "$alone$script" | wc -c)"
packed="$(curl --silent -H 'Accept-Encoding: gzip' "$alone$script" | wc -c)"
[ "$packed" -lt $((plain / 2)) ] || fail "kompresi tidak mengecilkan skrip ($plain -> $packed byte)"
ok "kompresi gzip aktif bila diminta ($plain -> $packed byte)"

page_headers="$(headers_of "$alone/")"
for expected in 'x-content-type-options: nosniff' 'x-frame-options: DENY' 'referrer-policy: no-referrer' \
  "content-security-policy: default-src 'self'"; do
  echo "$page_headers" | grep -qi "^$expected" || fail "header halaman tidak ada: $expected"
done
echo "$page_headers" | grep -qi "frame-ancestors 'none'" || fail "CSP halaman mengizinkan pembingkaian"
if echo "$page_headers" | grep -qi '^server:'; then fail "header Server masih dikirim"; fi
ok "halaman membawa header keamanan dan tidak menyebut servernya"

forwarded="$(curl --silent -H 'X-Forwarded-For: 203.0.113.7' "$alone/api/v1/health")"
[ "$(echo "$forwarded" | json .path)" = "/api/v1/health" ] || fail "/api tidak diteruskan apa adanya"
echo "$forwarded" | json .forwardedFor | grep -q '^203\.0\.113\.7, ' ||
  fail "X-Forwarded-For dari tunnel tidak dipertahankan: $(echo "$forwarded" | json .forwardedFor)"
has_header '^content-security-policy: dari-api' "$alone/api/v1/health" ||
  fail "header milik API ditimpa proxy"
ok "/api diteruskan dengan alamat pengunjung, dan header API tidak ditimpa"

eleven="$(head -c 11534336 /dev/zero | curl --silent --data-binary @- "$alone/api/v1/x" | json .bytes)"
[ "$eleven" = "11534336" ] || fail "badan 11 MB tidak sampai ke API ($eleven)"
fifty="$(head -c 52428800 /dev/zero | status_of curl --silent --data-binary @- "$alone/api/v1/x" || true)"
[ "$fifty" = "413" ] || fail "badan 50 MB tidak ditolak proxy (status $fifty)"
ok "badan 11 MB sampai ke API (API yang menolaknya); 50 MB ditolak proxy"

docker rm -f "$STUB" "$WEB_ALONE" > /dev/null

# =======================================================================================
step "3. Konfigurasi Compose dan cadangan"

smoke_secret="$(random_secret)"
admin_email="admin@example.com"
admin_temp="sementara-$(random_secret | cut -c1-12)"
admin_password="tetap-$(random_secret | cut -c1-16)"
cat > "$env_file" << EOF
DATABASE_URL=postgresql://smoke:smoke@postgres:5432/cashflow
JWT_ACCESS_SECRET=$smoke_secret
TUNNEL_TOKEN=bukan-token-sungguhan
SEED_ADMIN_NAME=Admin Uji Asap
SEED_ADMIN_EMAIL=$admin_email
SEED_ADMIN_PASSWORD=$admin_temp
LOGIN_RATE_LIMIT=5
BACKUP_HOST_DIR=$work_host/backups
BACKUP_AT=01:30
BACKUP_KEEP_DAYS=14
TZ=Asia/Jakarta
SMOKE_PORT=$STACK_PORT
EOF

for required in DATABASE_URL JWT_ACCESS_SECRET TUNNEL_TOKEN SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD BACKUP_HOST_DIR; do
  grep -v "^$required=" "$env_file" > "$work/env-missing"
  set +e
  # Nilai dari lingkungan pemanggil tidak boleh menambal yang hilang.
  output="$(env -u "$required" docker compose -p "$PROJECT" --env-file "$work_host/env-missing" \
    -f docker-compose.prod.yml config 2>&1)"
  status=$?
  set -e
  [ "$status" -ne 0 ] || fail "Compose tetap jalan tanpa $required"
  echo "$output" | grep -q "$required" || fail "pesan Compose tidak menyebut $required"
done
ok "Compose menolak jalan, dengan menyebut namanya, bila satu nilai wajib tidak diisi"

compose_prod "$env_file" --profile tools config --format json > "$work/config.json"
node -e '
  const config = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  const s = config.services;
  const problems = [];
  const check = (condition, message) => condition || problems.push(message);
  for (const [name, service] of Object.entries(s)) {
    check(!service.ports || service.ports.length === 0, `${name} membuka port`);
  }
  check(s.api.environment.NODE_ENV === "production", "api tidak berjalan sebagai production");
  check(s.api.environment.TRUST_PROXY_HOPS === "2", "TRUST_PROXY_HOPS bukan 2");
  check(s.api.depends_on.migrate.condition === "service_completed_successfully", "api tidak menunggu migrate selesai");
  check(s.web.depends_on.api.condition === "service_healthy", "web tidak menunggu api sehat");
  for (const name of ["api", "web", "cloudflared", "backup"]) {
    check(s[name].restart === "unless-stopped", `${name} tidak menyala lagi sendiri`);
  }
  const mount = (service) => service.volumes.find((v) => v.target === "/data/storage");
  check(mount(s.api) && !mount(s.api).read_only, "api tidak bisa menulis berkas bukti");
  check(mount(s.backup)?.read_only === true, "backup bisa mengubah berkas bukti");
  check(s.restore.profiles.includes("tools"), "restore ikut menyala bersama yang lain");
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
' "$(hostpath "$work/config.json")" || fail "konfigurasi produksi tidak seperti yang dijanjikan"
ok "produksi: tanpa port terbuka, NODE_ENV=production, dua proxy, urutan mulai, dan volume benar"

if grep -E '^\s+[A-Z_]*(PASSWORD|SECRET|TOKEN|DATABASE_URL): [^$ ]' docker-compose.prod.yml; then
  fail "ada nilai rahasia tertulis di docker-compose.prod.yml"
fi
used="$(grep -o '\${[A-Z_]*' docker-compose.prod.yml | tr -d '${' | sort -u)"
listed="$(grep -o '^[A-Z_]*=' deploy/env.example | tr -d '=' | sort -u)"
[ "$used" = "$listed" ] || fail "deploy/env.example dan docker-compose.prod.yml tidak menyebut variabel yang sama:
dipakai: $(echo $used)
contoh : $(echo $listed)"
ok "tanpa rahasia di berkas Compose; env.example memuat persis variabel yang dipakai"

docker build --quiet -f deploy/backup.Dockerfile -t "$BACKUP_IMAGE" . > /dev/null
waits="$(docker run --rm -e TZ=UTC "$BACKUP_IMAGE" bash -c '
  early=$(date -d "2026-10-07 00:00" +%s); late=$(date -d "2026-10-07 02:00" +%s)
  echo "$(deploy/backup-loop.sh --seconds-until 01:30 $early) $(deploy/backup-loop.sh --seconds-until 01:30 $late)"')"
[ "$waits" = "5400 84600" ] || fail "jeda sampai jam cadangan salah: $waits"
if docker run --rm "$BACKUP_IMAGE" bash deploy/backup-loop.sh --seconds-until 25:00 > /dev/null 2>&1; then
  fail "jam cadangan yang tidak ada diterima"
fi
ok "jadwal cadangan: hari ini bila belum lewat, selain itu besok; jam yang salah ditolak"

docker run --rm -e DATABASE_URL=postgresql://x:y@127.0.0.1:1/z "$BACKUP_IMAGE" bash -c '
  mkdir -p /data/storage /backups
  if deploy/backup-loop.sh --run-once > /tmp/out 2>&1; then echo "cadangan berhasil padahal database tidak ada"; exit 1; fi
  test -f /tmp/backup-failed || { echo "tanda gagal tidak dibuat"; exit 1; }
  grep -q "CADANGAN GAGAL" /tmp/out || { echo "kegagalan tidak dicatat"; exit 1; }
  test -z "$(ls -A /backups)" || { echo "cadangan setengah jadi tertinggal"; exit 1; }
' || fail "cadangan yang gagal tidak ditangani dengan benar"
ok "cadangan yang gagal tercatat, menandai container tidak sehat, dan tidak meninggalkan sisa"

# =======================================================================================
step "4. Susunan lengkap dari nol"

compose build --quiet > "$work/build.log" 2>&1 || { tail -n 20 "$work/build.log" >&2; fail "image gagal dibangun"; }
wait_healthy api web backup
[ "$(docker inspect --format '{{.State.ExitCode}}' "$PROJECT-migrate-1")" = "0" ] || fail "migrate tidak selesai dengan baik"
ok "migrasi dan seed selesai; api, web dan backup sehat"

page="$(api "$BASE/")"
grep -q '<div id="app"' <<< "$page" || fail "halaman aplikasi tidak tersaji"
[ "$(status_of api "$BASE/api/v1/health")" = "200" ] || fail "health tidak menjawab"
[ "$(status_of api "$BASE/api/docs")" = "404" ] || fail "dokumentasi API terbuka di produksi"
[ "$(status_of api "$BASE/api/docs-json")" = "404" ] || fail "dokumen OpenAPI terbuka di produksi"
ok "aplikasi tersaji, API menjawab, dokumentasi API tertutup"

login() { # email password -> badan jawaban; header disimpan di $work/login-headers
  api --dump-header "$work_host/login-headers" -H 'Content-Type: application/json' \
    --data "{\"email\":\"$1\",\"password\":\"$2\"}" "$BASE/api/v1/auth/login"
}
session="$(login "$admin_email" "$admin_temp")"
token="$(echo "$session" | json .accessToken)"
[ -n "$token" ] || fail "admin awal tidak bisa login: $session"
[ "$(echo "$session" | json .user.mustChangePassword)" = "true" ] || fail "admin awal tidak diwajibkan ganti password"
cookie_line="$(grep -i '^set-cookie: refresh_token=' "$work/login-headers" | tr -d '\r')"
for attribute in HttpOnly Secure 'SameSite=Strict' 'Path=/api/v1/auth'; do
  echo "$cookie_line" | grep -qi "$attribute" || fail "cookie sesi tanpa $attribute"
done
ok "admin awal login; cookie sesi HttpOnly, Secure, SameSite=Strict"

changed="$(authed -H 'Content-Type: application/json' \
  --data "{\"currentPassword\":\"$admin_temp\",\"newPassword\":\"$admin_password\"}" \
  "$BASE/api/v1/auth/change-password")"
[ "$(echo "$changed" | json .user.mustChangePassword)" = "false" ] || fail "ganti password gagal: $changed"
session="$(login "$admin_email" "$admin_password")"
token="$(echo "$session" | json .accessToken)"
admin_id="$(echo "$session" | json .user.id)"
refresh_cookie="$(grep -i '^set-cookie: refresh_token=' "$work/login-headers" | sed -E 's/^[^:]*: ([^;]*);.*/\1/' | tr -d '\r')"
refreshed="$(api -X POST -H "Cookie: $refresh_cookie" "$BASE/api/v1/auth/refresh" | json .accessToken)"
[ -n "$refreshed" ] || fail "sesi tidak bisa diperpanjang dengan cookie"
token="$refreshed"
ok "ganti password berhasil; sesi diperpanjang dengan cookie"

post() { authed -H 'Content-Type: application/json' --data "$2" "$BASE/api/v1$1"; }
account_id="$(post /accounts '{"name":"Kas Uji Asap","type":"CASH","openingBalance":"1000000"}' | json .id)"
category_id="$(post /categories '{"name":"Bahan Uji Asap","type":"OUT"}' | json .id)"
[ -n "$account_id" ] && [ -n "$category_id" ] || fail "akun atau kategori gagal dibuat"
transaction_id="$(post /transactions "{\"type\":\"OUT\",\"amount\":\"125000\",\"transactionDate\":\"2026-10-01\",\"description\":\"Uji asap\",\"accountId\":\"$account_id\",\"categoryId\":\"$category_id\",\"projectId\":null}" | json .id)"
[ -n "$transaction_id" ] || fail "transaksi gagal dicatat"

printf '%%PDF-1.4\n%% bukti uji asap\n%%%%EOF\n' > "$work/nota.pdf"
attachment_id="$(cd "$work" && authed -F 'file=@nota.pdf;type=application/pdf' \
  "$BASE/api/v1/transactions/$transaction_id/attachments" | json .id)"
[ -n "$attachment_id" ] || fail "bukti gagal diunggah"
[ "$(post "/transactions/$transaction_id/approve" '{}' | json .status)" = "APPROVED" ] || fail "persetujuan gagal"
ok "akun, kategori, transaksi, bukti dan persetujuan berjalan lewat proxy"

(cd "$work" && { printf '%%PDF-1.4\n'; head -c 11534336 /dev/zero; } > besar.pdf)
too_big="$(cd "$work" && authed --write-out '\n%{http_code}' -F 'file=@besar.pdf;type=application/pdf' \
  "$BASE/api/v1/transactions/$transaction_id/attachments")"
[ "$(echo "$too_big" | tail -n 1)" = "413" ] || fail "unggahan 11 MB tidak ditolak dengan 413"
echo "$too_big" | head -n 1 | json .message | grep -q 'Berkas terlalu besar' ||
  fail "unggahan 11 MB tidak dijawab dengan pesan API: $too_big"
rm -f "$work/besar.pdf"
ok "unggahan 11 MB ditolak oleh API sendiri, dengan pesannya, bukan oleh proxy"

# Lima ribu baris lagi langsung di database, supaya ekspor benar-benar mengalir lewat proxy.
compose exec -T postgres psql -U smoke -d cashflow --quiet -c "
  INSERT INTO transactions (id, type, amount, transaction_date, description, status, account_id, category_id, created_by_id, created_at, updated_at)
  SELECT gen_random_uuid(), 'OUT'::tx_type, 1000 + g, DATE '2026-09-01', 'muatan ' || g, 'PENDING'::tx_status,
         '$account_id', '$category_id', '$admin_id', now(), now()
  FROM generate_series(1, 5000) AS g" > /dev/null
authed -H 'Accept-Encoding: gzip' --dump-header "$work_host/export-headers" --output "$work_host/export.gz" \
  "$BASE/api/v1/transactions/export"
grep -qi '^content-encoding: gzip' "$work/export-headers" || fail "ekspor tidak dikompresi dalam perjalanan"
grep -qi '^content-disposition: attachment; filename="transaksi-' "$work/export-headers" || fail "ekspor tanpa nama berkas"
lines="$(node -e '
  const text = require("node:zlib").gunzipSync(require("node:fs").readFileSync(process.argv[1])).toString("utf8");
  if (text.charCodeAt(0) !== 0xfeff) process.exit(3);
  console.log(text.split("\r\n").filter(Boolean).length);' "$(hostpath "$work/export.gz")")" || fail "ekspor rusak atau tanpa BOM"
[ "$lines" = "5002" ] || fail "ekspor tidak utuh: $lines baris, seharusnya 5002"
ok "ekspor 5.001 transaksi tiba utuh dan terkompresi"

[ "$(authed "$BASE/api/v1/audit-logs?action=EXPORT" | json .meta.total)" = "1" ] || fail "ekspor tidak tercatat di log audit"
ok "log audit mencatat ekspor"

node deploy/smoke-browser.mjs "$BASE" "$admin_email" "$admin_password" || fail "aplikasi tidak berjalan benar di browser"
ok "di browser: login, halaman dan gaya berjalan dengan aturan keamanan produksi"

wrong_login() { status_of as_visitor "$1" -H 'Content-Type: application/json' \
  --data '{"email":"siapa@example.com","password":"salah-salah"}' "$BASE/api/v1/auth/login"; }
for _ in 1 2 3 4 5; do [ "$(wrong_login 203.0.113.50)" = "401" ] || fail "login salah tidak dijawab 401"; done
[ "$(wrong_login 203.0.113.50)" = "429" ] || fail "percobaan login keenam dari satu alamat tidak dibatasi"
[ "$(wrong_login 203.0.113.51)" = "401" ] || fail "pengunjung lain ikut terblokir: batas dihitung per proxy, bukan per pengunjung"
ok "batas percobaan login dihitung per alamat pengunjung, menembus dua proxy"

# =======================================================================================
step "5. Pembaruan dan nyala ulang"

before="$(authed "$BASE/api/v1/attachments/$attachment_id/download" | sha256sum)"
compose build --quiet > "$work/build.log" 2>&1
wait_healthy api web backup
compose restart api web > /dev/null 2>&1
wait_healthy api web
[ "$(docker inspect --format '{{.State.ExitCode}}' "$PROJECT-migrate-1")" = "0" ] || fail "migrate gagal saat dijalankan lagi"
token="$(login "$admin_email" "$admin_password" | json .accessToken)"
[ "$(authed "$BASE/api/v1/transactions/$transaction_id" | json .status)" = "APPROVED" ] || fail "transaksi hilang setelah nyala ulang"
[ "$(authed "$BASE/api/v1/attachments/$attachment_id/download" | sha256sum)" = "$before" ] || fail "bukti berubah atau hilang setelah nyala ulang"
ok "setelah dibangun ulang dan dinyalakan ulang, transaksi dan buktinya tetap ada"

# =======================================================================================
step "6. Cadangan dan pemulihan di dalam container"

compose run --rm --no-deps backup bash deploy/backup-loop.sh --run-once > "$work/backup.log" 2>&1 ||
  { cat "$work/backup.log" >&2; fail "cadangan gagal"; }
backup_name="$(ls "$work/backups" | grep '^cashflow-' | head -n 1)"
[ -n "$backup_name" ] || fail "cadangan tidak muncul di folder host"
for file in database.dump attachments.tar.gz SHA256SUMS; do
  [ -s "$work/backups/$backup_name/$file" ] || fail "cadangan tanpa $file"
done
ok "cadangan muncul di folder host dengan ketiga berkasnya"

compose exec -T postgres psql -U smoke -d postgres --quiet -c 'CREATE DATABASE restore_check' > /dev/null
# Dibangun lebih dulu, dan pesan Docker dipisahkan, supaya yang dibandingkan hanya hasil pemulihan.
compose --profile tools build --quiet restore > /dev/null 2>&1
restored="$(compose --profile tools run --rm --no-deps \
  -e DATABASE_URL=postgresql://smoke:smoke@postgres:5432/restore_check -e STORAGE_DIR=/tmp/restored \
  --entrypoint bash restore -c "
    scripts/restore.sh /backups/$backup_name > /tmp/restore.log 2>&1 || { cat /tmp/restore.log; exit 1; }
    psql \"\$DATABASE_URL\" -At -c \"SELECT count(*) || ' ' || (SELECT status FROM transactions WHERE id = '$transaction_id') FROM transactions\"
    find /tmp/restored -type f | wc -l" 2> "$work/restore.err")" ||
  fail "pemulihan gagal: $restored $(cat "$work/restore.err")"
[ "$(echo "$restored" | tr '\n' ' ' | tr -s ' ' | sed 's/ $//')" = "5001 APPROVED 1" ] ||
  fail "hasil pemulihan tidak sama dengan aslinya: $restored"
ok "cadangan itu pulih ke database dan folder kosong: 5.001 transaksi dan 1 bukti"

# =======================================================================================
step "7. Konfigurasi yang salah"

set +e
output="$(compose run --rm --no-deps -e JWT_ACCESS_SECRET=pendek1234 api 2>&1)"
status=$?
set -e
[ "$status" -ne 0 ] || fail "API menyala dengan JWT_ACCESS_SECRET 10 karakter"
echo "$output" | grep -q 'JWT_ACCESS_SECRET' || fail "alasan kegagalan tidak disebut"
ok "API menolak menyala dengan kunci sesi yang terlalu pendek, dan menyebut sebabnya"

echo
echo "UJI ASAP BERHASIL: $passed pemeriksaan lulus."
