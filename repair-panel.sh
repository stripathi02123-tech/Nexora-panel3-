#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

INSTALL_DIR='/opt/nexora'
ENV_FILE="${INSTALL_DIR}/server/.env"
SERVICE_NAME='nexora-panel'
LEGACY_SERVICE_NAME='nexora-bot'
NGINX_SITE='/etc/nginx/sites-available/nexora'
NGINX_LINK='/etc/nginx/sites-enabled/nexora'
PANEL_PORT="${PANEL_PORT:-8080}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
SOURCE_TARBALL_URL='https://codeload.github.com/stripathi02123-tech/Nexora-panel3-/tar.gz/refs/heads/main'

RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; CYAN='\033[1;36m'; NC='\033[0m'
info(){ echo -e "${CYAN}[INFO]${NC} $*"; }
ok(){ echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARNING]${NC} $*"; }
error(){ echo -e "${RED}[ERROR]${NC} $*" >&2; }
systemd_available(){
  command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = 'systemd'
}
set_env(){
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
set_env_if_missing(){
  local key="$1" value="$2"
  if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  error 'Run as root: sudo bash repair-panel.sh'
  exit 1
fi
[[ -d "$INSTALL_DIR/server" ]] || { error "Nexora installation not found at ${INSTALL_DIR}"; exit 1; }
[[ -f "$ENV_FILE" ]] || { error "Environment file not found at ${ENV_FILE}"; exit 1; }

info 'Repairing production configuration...'
if ! command -v openssl >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y --no-upgrade --no-install-recommends openssl curl tar
fi

JWT_SECRET=''; ENCRYPTION_KEY=''
JWT_SECRET="$(sed -n 's/^JWT_SECRET=//p' "$ENV_FILE" | head -1 || true)"
ENCRYPTION_KEY="$(sed -n 's/^ENCRYPTION_KEY=//p' "$ENV_FILE" | head -1 || true)"
if [[ ${#JWT_SECRET} -lt 32 ]]; then set_env JWT_SECRET "$(openssl rand -hex 32)"; ok 'Generated a new strong JWT_SECRET.'; else ok 'JWT_SECRET is present.'; fi
if [[ ${#ENCRYPTION_KEY} -lt 32 ]]; then set_env ENCRYPTION_KEY "$(openssl rand -hex 32)"; ok 'Generated a new strong ENCRYPTION_KEY.'; else ok 'ENCRYPTION_KEY is present.'; fi
set_env NODE_ENV production
set_env_if_missing DATABASE_URL "file:${INSTALL_DIR}/server/prisma/dev.db"
set_env_if_missing PORT "$BACKEND_PORT"
set_env_if_missing LICENSE_REQUIRED false
set_env_if_missing LICENSE_SERVER_URL http://localhost:8080

PUBLIC_IP="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
PUBLIC_IP="${PUBLIC_IP:-$(hostname -I 2>/dev/null | awk '{print $1}' || true)}"
PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"
PANEL_DOMAIN="${PANEL_DOMAIN:-}"
if [[ -z "$(sed -n 's/^APP_URL=//p' "$ENV_FILE" | head -1)" ]]; then
  if [[ -n "$PANEL_DOMAIN" ]]; then
    PANEL_DOMAIN="$(printf '%s' "$PANEL_DOMAIN" | sed 's#^https\?://##; s#/$##')"
    set_env APP_URL "https://${PANEL_DOMAIN}"
  else
    set_env APP_URL "http://${PUBLIC_IP}:${PANEL_PORT}"
  fi
fi
# Do not overwrite an existing CORS_ORIGIN: the server now has dedicated
# handling for regenerated CodeSandbox preview origins and admins may have a
# deliberate production allowlist here.
if ! grep -q '^CORS_ORIGIN=' "$ENV_FILE" 2>/dev/null; then
  set_env CORS_ORIGIN "http://${PUBLIC_IP}:${PANEL_PORT}"
fi
chmod 600 "$ENV_FILE"

info 'Refreshing source and rebuilding...'
TMP_ROOT="$(mktemp -d /tmp/nexora-repair.XXXXXX)"
trap 'rm -rf "${TMP_ROOT}"' EXIT
curl --fail --location --silent --show-error --retry 6 --retry-all-errors --connect-timeout 15 --max-time 180 "$SOURCE_TARBALL_URL" -o "$TMP_ROOT/nexora.tar.gz"
tar -tzf "$TMP_ROOT/nexora.tar.gz" >/dev/null
SOURCE_DIR="$(tar -tzf "$TMP_ROOT/nexora.tar.gz" | head -1 | cut -d/ -f1)"
[[ -n "$SOURCE_DIR" ]] || { error 'Downloaded source archive is empty.'; exit 1; }
tar -xzf "$TMP_ROOT/nexora.tar.gz" -C "$TMP_ROOT"

mkdir -p /opt/nexora-backups
STAMP="$(date +%Y%m%d-%H%M%S)"
cp -a "$ENV_FILE" "/opt/nexora-backups/server.env.repair.${STAMP}.bak"
DB_FILE="${INSTALL_DIR}/server/prisma/dev.db"
if [[ -f "$DB_FILE" ]]; then cp -a "$DB_FILE" "/opt/nexora-backups/dev.db.repair.${STAMP}.bak"; fi

find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
  ! -name 'server' ! -name 'client' ! -name '.env' -exec rm -rf {} + 2>/dev/null || true
# Preserve the current server/client data while refreshing source files.
rm -rf "${INSTALL_DIR}/.repair-source"
mkdir -p "${INSTALL_DIR}/.repair-source"
cp -a "$TMP_ROOT/$SOURCE_DIR/." "${INSTALL_DIR}/.repair-source/"

rsync_available=false
if command -v rsync >/dev/null 2>&1; then rsync_available=true; fi
if $rsync_available; then
  rsync -a --delete --exclude 'server/.env' --exclude 'server/prisma/dev.db' --exclude 'server/uploads/' "${INSTALL_DIR}/.repair-source/" "${INSTALL_DIR}/"
else
  # Copy source files without touching live data files.
  cp -a "${INSTALL_DIR}/.repair-source/client" "${INSTALL_DIR}/client.new"
  cp -a "${INSTALL_DIR}/.repair-source/server" "${INSTALL_DIR}/server.new"
  rm -rf "${INSTALL_DIR}/client" "${INSTALL_DIR}/server/src" "${INSTALL_DIR}/server/package.json" "${INSTALL_DIR}/server/tsconfig.json" "${INSTALL_DIR}/server/prisma/migrations" "${INSTALL_DIR}/server/prisma/schema.prisma" "${INSTALL_DIR}/server/prisma/seed.ts"
  mv "${INSTALL_DIR}/client.new" "${INSTALL_DIR}/client"
  mkdir -p "${INSTALL_DIR}/server"
  cp -a "${INSTALL_DIR}/server.new/." "${INSTALL_DIR}/server/"
  rm -rf "${INSTALL_DIR}/server.new"
fi
rm -rf "${INSTALL_DIR}/.repair-source"
# Restore env/data after source refresh.
cp -a "/opt/nexora-backups/server.env.repair.${STAMP}.bak" "$ENV_FILE"
if [[ -f "/opt/nexora-backups/dev.db.repair.${STAMP}.bak" ]]; then
  mkdir -p "${INSTALL_DIR}/server/prisma"
  cp -a "/opt/nexora-backups/dev.db.repair.${STAMP}.bak" "$DB_FILE"
fi

mkdir -p "${INSTALL_DIR}/server/prisma"
if [[ -d "${INSTALL_DIR}/server/uploads" ]]; then :; fi
if ! id -u nexora >/dev/null 2>&1; then useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin nexora; fi
chown -R nexora:nexora "$INSTALL_DIR"
chmod 770 "${INSTALL_DIR}/server/prisma"
chmod 660 "$DB_FILE" 2>/dev/null || true

npm_install(){
  local dir="$1" label="$2" cache registry
  local registries=(https://registry.npmjs.org/ https://registry.npmmirror.com/ https://registry.yarnpkg.com/)
  cd "$dir"
  rm -rf node_modules
  for registry in "${registries[@]}"; do
    cache="$(mktemp -d /tmp/nexora-repair-npm.XXXXXX)"
    info "${label}: ${registry}"
    if npm install --no-audit --no-fund --prefer-online --package-lock=false --registry "$registry" --cache "$cache"; then
      rm -rf "$cache"
      return 0
    fi
    rm -rf "$cache" "$dir/node_modules"
  done
  error "${label} dependency installation failed."
  return 1
}

npm_install "$INSTALL_DIR" 'Root dependencies'
npm_install "${INSTALL_DIR}/server" 'Server dependencies'
npm_install "${INSTALL_DIR}/client" 'Client dependencies'

cd "${INSTALL_DIR}/server"
sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" npx --no-install prisma generate
sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" npx --no-install prisma db push --skip-generate
cd "$INSTALL_DIR"
npm run build:server
npm run build:client

info 'Repairing Nginx configuration...'
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
cat > "$NGINX_SITE" <<EOF_NGINX
server {
    listen ${PANEL_PORT};
    listen [::]:${PANEL_PORT};
    server_name _;
    root ${INSTALL_DIR}/client/dist;
    index index.html;
    client_max_body_size 100M;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF_NGINX
ln -sfn "$NGINX_SITE" "$NGINX_LINK"
rm -f /etc/nginx/sites-enabled/default
nginx -t

if systemd_available; then
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"
  systemctl restart nginx
  systemctl is-active --quiet "$SERVICE_NAME" || { error 'Nexora service failed to start.'; journalctl -u "$SERVICE_NAME" -n 100 --no-pager || true; exit 1; }
else
  pkill -f '/opt/nexora/server/dist/index.js' 2>/dev/null || true
  rm -f "${INSTALL_DIR}/nexora.pid"
  touch /var/log/nexora/app.log
  chown nexora:nexora /var/log/nexora/app.log
  runuser -u nexora -- sh -c "cd '$INSTALL_DIR/server' && nohup /usr/bin/node '$INSTALL_DIR/server/dist/index.js' >> /var/log/nexora/app.log 2>&1 < /dev/null & echo \$! > '$INSTALL_DIR/nexora.pid'"
  sleep 3
  PID="$(cat "${INSTALL_DIR}/nexora.pid" 2>/dev/null || true)"
  [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null || { error 'Nexora process failed to start.'; tail -n 100 /var/log/nexora/app.log || true; exit 1; }
fi

sleep 2
curl -fsS --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null || { error 'Backend health check failed.'; exit 1; }
curl -fsS --max-time 5 "http://127.0.0.1:${PANEL_PORT}/" >/dev/null || { error "Panel HTTP check failed on ${PANEL_PORT}."; exit 1; }

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q active; then
  ufw allow "${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
elif command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "$PANEL_PORT" -j ACCEPT >/dev/null 2>&1 || iptables -I INPUT -p tcp --dport "$PANEL_PORT" -j ACCEPT >/dev/null 2>&1 || true
fi

PUBLIC_IP="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
printf '\n==============================================\n'
ok 'NEXORA PANEL REPAIR COMPLETE'
printf '==============================================\n'
echo "Panel  : http://${PUBLIC_IP:-YOUR_PUBLIC_IP}:${PANEL_PORT}"
echo "Backend: http://127.0.0.1:${BACKEND_PORT}/api/health"
echo "Service: ${SERVICE_NAME}"
printf '\n'
