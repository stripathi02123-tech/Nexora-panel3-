#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; CYAN='\033[1;36m'; MAGENTA='\033[1;35m'; NC='\033[0m'

APP_NAME='Nexora Panel'
SERVICE_NAME='nexora-panel'
INSTALL_DIR='/opt/nexora'
SOURCE_TARBALL_URL='https://codeload.github.com/stripathi02123-tech/Nexora-panel3-/tar.gz/refs/heads/main'
NODE_MAJOR='22'
BACKEND_PORT="${BACKEND_PORT:-3000}"
PANEL_PORT="${PANEL_PORT:-8080}"
SERVER_DIR="${INSTALL_DIR}/server"
ENV_FILE="${SERVER_DIR}/.env"
DB_FILE="${SERVER_DIR}/prisma/dev.db"
LOG_DIR='/var/log/nexora'
LOG_FILE="${LOG_DIR}/app.log"
PID_FILE="${INSTALL_DIR}/nexora.pid"
RUNNER_FILE="${INSTALL_DIR}/run.sh"
NGINX_SITE='/etc/nginx/sites-available/nexora'
NGINX_LINK='/etc/nginx/sites-enabled/nexora'
BACKUP_DIR='/opt/nexora-backups'

line(){ echo -e "${MAGENTA}============================================================${NC}"; }
info(){ echo -e "${CYAN}[INFO]${NC} $*"; }
ok(){ echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARNING]${NC} $*"; }
error(){ echo -e "${RED}[ERROR]${NC} $*" >&2; }

systemd_available(){ command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = 'systemd' ]; }
port_in_use(){ ss -H -ltn "sport = :$1" 2>/dev/null | grep -q .; }
choose_free_port(){ local start="$1" max="$2" p; for ((p=start; p<=max; p++)); do ! port_in_use "$p" && { echo "$p"; return 0; }; done; return 1; }
random_hex(){ openssl rand -hex 32; }
random_password(){ openssl rand -base64 32 | tr -dc 'A-Za-z0-9@#%+=_' | cut -c1-24; }

set_env(){
  local key="$1" value="$2"
  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "$key" "$value" >> "${ENV_FILE}"
  fi
}
set_env_if_missing(){
  local key="$1" value="$2"
  if ! grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then printf '%s=%s\n' "$key" "$value" >> "${ENV_FILE}"; fi
}
ask(){
  local prompt="$1" default="$2" reply=''
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then printf '%b' "${CYAN}[?]${NC} ${prompt}" >/dev/tty; read -r reply </dev/tty || reply=''; fi
  echo "${reply:-$default}"
}

stop_existing_app(){
  local pid=''
  if [ -f "${PID_FILE}" ]; then
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      info "Stopping existing Nexora process ${pid}..."
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  pkill -u nexora -f "${INSTALL_DIR}/server/dist/index.js" 2>/dev/null || true
  rm -f "${PID_FILE}"
}

on_error(){
  local code=$?
  error "Installation stopped (exit code ${code})."
  if [ -f "${LOG_FILE}" ]; then echo "sudo tail -n 100 ${LOG_FILE}"; fi
  exit "$code"
}
trap on_error ERR

clear || true
printf '%b' "$CYAN"
cat <<'BANNER'

███╗   ██╗███████╗██╗  ██╗ ██████╗ ██████╗  █████╗
████╗  ██║██╔════╝╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗
██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║██████╔╝███████║
██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██╔══██╗██╔══██║
██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║
╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝

                    NEXORA PANEL INSTALLER
BANNER
printf '%b' "$NC"
line

[ "$EUID" -eq 0 ] || { error 'Run as root: sudo bash nexora--install.sh'; exit 1; }
source /etc/os-release
info "OS: ${PRETTY_NAME:-unknown}"
info "Architecture: $(uname -m)"
command -v apt-get >/dev/null 2>&1 || { error 'Debian/Ubuntu apt-get is required.'; exit 1; }
line

export DEBIAN_FRONTEND=noninteractive
info 'Preparing package manager...'
dpkg --configure -a || true

BASE_PACKAGES=(ca-certificates curl nginx openssl build-essential python3 python3-pip unzip jq iproute2 iptables tar gzip)
apt-get update -y
apt-get install -y --no-upgrade --no-install-recommends "${BASE_PACKAGES[@]}"

command -v curl >/dev/null 2>&1 || { error 'curl is required'; exit 1; }
command -v nginx >/dev/null 2>&1 || { error 'nginx is required'; exit 1; }
command -v openssl >/dev/null 2>&1 || { error 'openssl is required'; exit 1; }
command -v ss >/dev/null 2>&1 || { error 'ss is required'; exit 1; }
ok 'System dependencies ready.'
line

info "Checking Node.js ${NODE_MAJOR}..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" != "${NODE_MAJOR}" ]]; then
  info "Installing Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash
  apt-get install -y --no-upgrade --no-install-recommends nodejs
fi
command -v node >/dev/null 2>&1 || { error 'Node.js is unavailable'; exit 1; }
command -v npm >/dev/null 2>&1 || { error 'npm is unavailable'; exit 1; }
info "Node: $(node -v)"
info "npm:  $(npm -v)"
ok 'Node.js ready.'
line

PANEL_DOMAIN="${PANEL_DOMAIN:-$(ask 'Panel domain (blank = use public IP): ' '')}"
ADMIN_EMAIL="${ADMIN_EMAIL:-$(ask 'Admin email [admin@nexora.local]: ' 'admin@nexora.local')}"
ADMIN_PASSWORD_INPUT="${ADMIN_PASSWORD:-$(ask 'Admin password (blank = generate): ' '')}"
RESET_ADMIN_PASSWORD="${RESET_ADMIN_PASSWORD:-false}"
FRONTEND_API_URL="${FRONTEND_API_URL:-}"
FRONTEND_SOCKET_URL="${FRONTEND_SOCKET_URL:-}"
[ -z "$PANEL_DOMAIN" ] || PANEL_DOMAIN="$(printf '%s' "$PANEL_DOMAIN" | sed 's#^https\?://##; s#/$##')"
line

stop_existing_app
mkdir -p /opt "${BACKUP_DIR}" "${LOG_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ENV_BACKUP=''; DB_BACKUP=''; UPLOADS_BACKUP=''
[ -f "${ENV_FILE}" ] && ENV_BACKUP="${BACKUP_DIR}/server.env.${STAMP}.bak" && cp -a "${ENV_FILE}" "${ENV_BACKUP}" && info "Environment backup: ${ENV_BACKUP}"
[ -f "${DB_FILE}" ] && DB_BACKUP="${BACKUP_DIR}/dev.db.${STAMP}.bak" && cp -a "${DB_FILE}" "${DB_BACKUP}" && info "Database backup: ${DB_BACKUP}"
[ -d "${SERVER_DIR}/uploads" ] && UPLOADS_BACKUP="${BACKUP_DIR}/uploads.${STAMP}" && cp -a "${SERVER_DIR}/uploads" "${UPLOADS_BACKUP}" && info "Uploads backup: ${UPLOADS_BACKUP}"

info 'Downloading Nexora source from GitHub...'
TMP_ROOT="$(mktemp -d /tmp/nexora-install.XXXXXX)"
trap 'rm -rf "${TMP_ROOT}"' EXIT
curl --fail --location --silent --show-error --retry 6 --retry-all-errors --connect-timeout 15 --max-time 180 "${SOURCE_TARBALL_URL}" -o "${TMP_ROOT}/nexora.tar.gz"
tar -tzf "${TMP_ROOT}/nexora.tar.gz" >/dev/null
rm -rf "${INSTALL_DIR}"
tar -xzf "${TMP_ROOT}/nexora.tar.gz" -C "${TMP_ROOT}"
SOURCE_DIR="$(find "${TMP_ROOT}" -mindepth 1 -maxdepth 1 -type d | head -n1)"
[ -n "$SOURCE_DIR" ] || { error 'Source archive is empty'; exit 1; }
mv "$SOURCE_DIR" "${INSTALL_DIR}"
SERVER_DIR="${INSTALL_DIR}/server"; ENV_FILE="${SERVER_DIR}/.env"; DB_FILE="${SERVER_DIR}/prisma/dev.db"
mkdir -p "${SERVER_DIR}/prisma"
[ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ] && cp -a "$ENV_BACKUP" "$ENV_FILE"
[ -n "$DB_BACKUP" ] && [ -f "$DB_BACKUP" ] && cp -a "$DB_BACKUP" "$DB_FILE"
[ -n "$UPLOADS_BACKUP" ] && [ -d "$UPLOADS_BACKUP" ] && { rm -rf "${SERVER_DIR}/uploads"; cp -a "$UPLOADS_BACKUP" "${SERVER_DIR}/uploads"; }
ok 'Source ready.'
line

if port_in_use "${BACKEND_PORT}"; then BACKEND_PORT="$(choose_free_port 3000 3099)" || { error 'No free backend port.'; exit 1; }; fi
if port_in_use "${PANEL_PORT}"; then ORIGINAL_PANEL_PORT="$PANEL_PORT"; PANEL_PORT="$(choose_free_port $((ORIGINAL_PANEL_PORT+1)) 8099)" || { error 'No free panel port.'; exit 1; }; fi
info "Backend: ${BACKEND_PORT} | Panel: ${PANEL_PORT}"
line

info 'Configuring environment...'
PUBLIC_IP="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
PUBLIC_IP="${PUBLIC_IP:-$(hostname -I 2>/dev/null | awk '{print $1}') }"
PUBLIC_IP="$(printf '%s' "$PUBLIC_IP" | xargs || true)"
PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"
if [ -n "$PANEL_DOMAIN" ]; then APP_URL_VALUE="https://${PANEL_DOMAIN}"; DEFAULT_CORS="https://${PANEL_DOMAIN},http://${PANEL_DOMAIN},http://${PUBLIC_IP}:${PANEL_PORT}"; else APP_URL_VALUE="http://${PUBLIC_IP}:${PANEL_PORT}"; DEFAULT_CORS="http://${PUBLIC_IP}:${PANEL_PORT}"; fi

if [ ! -f "${ENV_FILE}" ]; then
cat > "${ENV_FILE}" <<EOF_ENV
NODE_ENV=production
PORT=${BACKEND_PORT}
DATABASE_URL=file:${DB_FILE}
JWT_SECRET=$(random_hex)
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=$(random_hex)
APP_URL=${APP_URL_VALUE}
CORS_ORIGIN=${DEFAULT_CORS}
PROXMOX_TIMEOUT=30000
DOCKER_TIMEOUT=30000
LICENSE_REQUIRED=false
LICENSE_SERVER_URL=http://localhost:8080
EOF_ENV
else
  set_env NODE_ENV production
  set_env PORT "${BACKEND_PORT}"
  set_env DATABASE_URL "file:${DB_FILE}"
  set_env APP_URL "${APP_URL_VALUE}"
  set_env_if_missing CORS_ORIGIN "${DEFAULT_CORS}"
  set_env_if_missing LICENSE_REQUIRED false
  set_env_if_missing LICENSE_SERVER_URL http://localhost:8080
fi
chmod 600 "${ENV_FILE}"
ok 'Environment configured.'

if [ -n "$FRONTEND_API_URL" ] || [ -n "$FRONTEND_SOCKET_URL" ]; then
  : > "${INSTALL_DIR}/client/.env.production"
  [ -z "$FRONTEND_API_URL" ] || printf 'VITE_API_URL=%s\n' "$FRONTEND_API_URL" >> "${INSTALL_DIR}/client/.env.production"
  [ -z "$FRONTEND_SOCKET_URL" ] || printf 'VITE_SOCKET_URL=%s\n' "$FRONTEND_SOCKET_URL" >> "${INSTALL_DIR}/client/.env.production"
fi
line

# =========================================================
# SAFE NPM INSTALL
# =========================================================

info 'Installing application dependencies...'

npm_install(){
  local dir="$1" label="$2" registry cache
  local registries=(
    'https://registry.npmjs.org/'
    'https://registry.npmmirror.com/'
    'https://registry.yarnpkg.com/'
  )
  cd "$dir"
  rm -rf node_modules
  for registry in "${registries[@]}"; do
    cache="$(mktemp -d /tmp/nexora-npm.XXXXXX)"
    info "${label}: trying ${registry}"
    npm cache clean --force --cache "$cache" >/dev/null 2>&1 || true
    if [ -f package-lock.json ] && npm ci --no-audit --no-fund --prefer-online --registry "$registry" --cache "$cache"; then
      rm -rf "$cache"; return 0
    fi
    rm -rf node_modules
    npm cache clean --force --cache "$cache" >/dev/null 2>&1 || true
    if npm install --no-audit --no-fund --prefer-online --package-lock=false --registry "$registry" --cache "$cache"; then
      rm -rf "$cache"; return 0
    fi
    rm -rf "$cache" "$dir/node_modules"
    warn "${label}: registry ${registry} failed; trying the next clean registry."
  done
  error "${label}: dependency installation failed on all configured registries."
  return 1
}

npm_install "${INSTALL_DIR}" 'Root dependencies'
npm_install "${SERVER_DIR}" 'Server dependencies'
npm_install "${INSTALL_DIR}/client" 'Client dependencies'
ok 'Application dependencies installed.'
line

# =========================================================
# DATABASE / SERVICE USER
# =========================================================

info 'Preparing service account and database...'
if ! id -u nexora >/dev/null 2>&1; then useradd --system --home-dir "${INSTALL_DIR}" --shell /usr/sbin/nologin nexora; fi
chown -R nexora:nexora "${INSTALL_DIR}" "${LOG_DIR}"
mkdir -p "${SERVER_DIR}/prisma"
chmod 770 "${SERVER_DIR}/prisma"
[ -f "${DB_FILE}" ] && chmod 660 "${DB_FILE}" || true

cd "${SERVER_DIR}"
sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" npx --no-install prisma generate
sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" npx --no-install prisma db push --skip-generate
chown -R nexora:nexora "${SERVER_DIR}/prisma"
chmod 770 "${SERVER_DIR}/prisma"
chmod 660 "${DB_FILE}" 2>/dev/null || true

cat > /tmp/nexora-prisma-test.js <<'NODE'
const { PrismaClient } = require('/opt/nexora/server/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "__nexora_write_test" (id INTEGER PRIMARY KEY)');
  await prisma.$executeRawUnsafe('INSERT INTO "__nexora_write_test" DEFAULT VALUES');
  await prisma.$executeRawUnsafe('DROP TABLE "__nexora_write_test"');
  console.log('PRISMA SQLITE WRITE OK');
  await prisma.$disconnect();
})().catch(async e => { console.error('PRISMA SQLITE WRITE FAILED:', e.message); await prisma.$disconnect(); process.exit(1); });
NODE
sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" node /tmp/nexora-prisma-test.js
rm -f /tmp/nexora-prisma-test.js
ok 'SQLite write test passed.'
line

# =========================================================
# ADMIN ACCOUNT
# =========================================================

ADMIN_EMAIL="$(printf '%s' "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
[ -n "$ADMIN_EMAIL" ] || { error 'Admin email cannot be empty.'; exit 1; }
ADMIN_PASSWORD_NEW=''
RESET_NORMALIZED="$(printf '%s' "$RESET_ADMIN_PASSWORD" | tr '[:upper:]' '[:lower:]')"
ADMIN_EXISTS="$(sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" ADMIN_EMAIL="$ADMIN_EMAIL" node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async()=>{try{const u=await p.user.findUnique({where:{email:process.env.ADMIN_EMAIL}});process.stdout.write(u?'yes':'no')}finally{await p.$disconnect()}})();
NODE
)"

if [ "$ADMIN_EXISTS" != 'yes' ]; then
  ADMIN_PASSWORD_NEW="${ADMIN_PASSWORD_INPUT:-$(random_password)}"
elif [[ "$RESET_NORMALIZED" =~ ^(true|1|yes|y)$ ]]; then
  ADMIN_PASSWORD_NEW="${ADMIN_PASSWORD_INPUT:-$(random_password)}"
fi

if [ -n "$ADMIN_PASSWORD_NEW" ]; then
  if [ "$ADMIN_EXISTS" = 'yes' ]; then
    sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD_NEW" node <<'NODE'
const { PrismaClient } = require('@prisma/client'); const bcrypt = require('bcryptjs'); const p = new PrismaClient();
(async()=>{const email=process.env.ADMIN_EMAIL; const password=process.env.ADMIN_PASSWORD; const hash=await bcrypt.hash(password,12); await p.user.update({where:{email},data:{password:hash,isActive:true,role:'ADMIN'}}); console.log(`Admin password reset: ${email}`); await p.$disconnect()})().catch(async e=>{console.error(e.message);await p.$disconnect();process.exit(1)});
NODE
  else
    sudo -u nexora env NODE_ENV=production DATABASE_URL="file:${DB_FILE}" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD_NEW" node <<'NODE'
const { PrismaClient } = require('@prisma/client'); const bcrypt = require('bcryptjs'); const p = new PrismaClient();
(async()=>{const email=process.env.ADMIN_EMAIL; const password=process.env.ADMIN_PASSWORD; const hash=await bcrypt.hash(password,12); await p.user.upsert({where:{email},update:{password:hash,isActive:true,role:'ADMIN'},create:{email,password:hash,name:'Administrator',role:'ADMIN',isActive:true}}); console.log(`Admin account ready: ${email}`); await p.$disconnect()})().catch(async e=>{console.error(e.message);await p.$disconnect();process.exit(1)});
NODE
  fi
  CREDENTIALS_FILE="${INSTALL_DIR}/ADMIN_CREDENTIALS.txt"
  cat > "${CREDENTIALS_FILE}" <<EOF_CREDS
Nexora Panel — Administrator Credentials
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

Email    : ${ADMIN_EMAIL}
Password : ${ADMIN_PASSWORD_NEW}

Change this password after first login and delete this file.
EOF_CREDS
  chmod 600 "${CREDENTIALS_FILE}"
else
  info "Admin account already exists: ${ADMIN_EMAIL}"
fi
line

# =========================================================
# BUILD
# =========================================================

cd "${INSTALL_DIR}"
info 'Building application...'
npm run build:server
npm run build:client
ok 'Application build complete.'

# =========================================================
# DETACHED RUNNER / SYSTEMD
# =========================================================

chown -R nexora:nexora "${INSTALL_DIR}" "${LOG_DIR}"
cat > "${RUNNER_FILE}" <<EOF_RUNNER
#!/usr/bin/env bash
set -e
cd ${SERVER_DIR}
exec env NODE_ENV=production DATABASE_URL=file:${DB_FILE} /usr/bin/node ${SERVER_DIR}/dist/index.js
EOF_RUNNER
chmod 750 "${RUNNER_FILE}"
chown nexora:nexora "${RUNNER_FILE}"

start_app(){
  rm -f "${PID_FILE}"
  if systemd_available; then
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF_SERVICE
[Unit]
Description=Nexora Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nexora
Group=nexora
WorkingDirectory=${SERVER_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${SERVER_DIR}/dist/index.js
Restart=always
RestartSec=3
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF_SERVICE
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
    systemctl restart "${SERVICE_NAME}"
    return 0
  fi
  local pid
  pid="$(runuser -u nexora -- sh -c 'nohup /opt/nexora/run.sh >> /var/log/nexora/app.log 2>&1 </dev/null & echo $!')"
  echo "$pid" > "${PID_FILE}"
  sleep 2
  kill -0 "$pid" 2>/dev/null || { error 'Nexora backend failed to start.'; tail -n 100 "${LOG_FILE}" || true; return 1; }
}

start_app
ok 'Nexora backend started.'
line

# =========================================================
# NGINX
# =========================================================

info 'Configuring Nginx...'
cat > "${NGINX_SITE}" <<EOF_NGINX
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
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF_NGINX
ln -sf "${NGINX_SITE}" "${NGINX_LINK}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
if systemd_available; then systemctl enable nginx >/dev/null 2>&1 || true; systemctl restart nginx; else nginx -s quit >/dev/null 2>&1 || true; nginx; fi
sleep 2
port_in_use "${PANEL_PORT}" || { error "Nginx is not listening on ${PANEL_PORT}."; nginx -t || true; exit 1; }
ok "Nginx is listening on ${PANEL_PORT}."
line

# =========================================================
# FINAL HEALTH CHECKS
# =========================================================

info 'Running final health checks...'
BACKEND_OK='false'
PANEL_OK='false'
for _ in {1..10}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then BACKEND_OK='true'; break; fi
  sleep 1
done
for _ in {1..10}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PANEL_PORT}/" >/dev/null 2>&1; then PANEL_OK='true'; break; fi
  sleep 1
done
[ "$BACKEND_OK" = 'true' ] || { error 'Backend health check failed.'; tail -n 100 "${LOG_FILE}" || true; exit 1; }
[ "$PANEL_OK" = 'true' ] || { error 'Panel health check failed.'; exit 1; }
ok 'Backend health check passed.'
ok 'Panel health check passed.'

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q active; then ufw allow "${PANEL_PORT}/tcp" >/dev/null 2>&1 || true; elif command -v iptables >/dev/null 2>&1; then iptables -C INPUT -p tcp --dport "${PANEL_PORT}" -j ACCEPT >/dev/null 2>&1 || iptables -I INPUT -p tcp --dport "${PANEL_PORT}" -j ACCEPT >/dev/null 2>&1 || true; fi

clear || true
printf '%b' "$GREEN"
cat <<EOF_DONE

╔══════════════════════════════════════════════════════════╗
║             NEXORA PANEL INSTALLATION COMPLETE           ║
╚══════════════════════════════════════════════════════════╝

✅ STATUS            : VERIFIED & RUNNING
🌐 PANEL URL         : http://${PUBLIC_IP}:${PANEL_PORT}
⚙️  BACKEND PORT      : ${BACKEND_PORT}
📁 INSTALL DIR       : ${INSTALL_DIR}
🔧 SERVICE           : ${SERVICE_NAME}
📋 LOG FILE          : ${LOG_FILE}

EOF_DONE
if [ -n "$ADMIN_PASSWORD_NEW" ]; then
  echo "👤 ADMIN CREDENTIALS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Email    : ${ADMIN_EMAIL}"
  echo "Password : ${ADMIN_PASSWORD_NEW}"
  echo
fi
if systemd_available; then
  cat <<EOF_COMMANDS
📖 SERVICE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  systemctl status ${SERVICE_NAME} --no-pager
  systemctl restart ${SERVICE_NAME}
  systemctl stop ${SERVICE_NAME}
  journalctl -u ${SERVICE_NAME} -f
EOF_COMMANDS
else
  cat <<EOF_COMMANDS
📖 SERVICE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  cat ${PID_FILE}
  ps -fp \$(cat ${PID_FILE})
  tail -f ${LOG_FILE}
  kill \$(cat ${PID_FILE})
EOF_COMMANDS
fi
echo
echo "✨ Installation verified successfully."
printf '%b' "$NC"
