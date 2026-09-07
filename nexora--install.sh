#!/usr/bin/env bash

# =========================================================
# NEXORA PANEL INSTALLER
# Production installer for Ubuntu/Debian VPS and containers
# =========================================================

set -Eeuo pipefail
IFS=$'\n\t'

RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'
NC='\033[0m'

APP_NAME='Nexora Panel'
SERVICE_NAME='nexora-panel'
INSTALL_DIR='/opt/nexora'
SOURCE_TARBALL_URL='https://codeload.github.com/stripathi02123-tech/Nexora-panel3-/tar.gz/refs/heads/main'
BRANCH='main'
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

systemd_available(){
  command -v systemctl >/dev/null 2>&1 &&
  [ -d /run/systemd/system ] &&
  [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = 'systemd' ]
}

on_error(){
  local code=$?
  error "Installation stopped (exit code ${code})."
  if systemd_available; then
    echo "sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    echo "sudo journalctl -u nginx -n 100 --no-pager"
  else
    echo "sudo tail -n 100 ${LOG_FILE}"
  fi
  exit "$code"
}
trap on_error ERR

port_in_use(){
  ss -H -ltn "sport = :$1" 2>/dev/null | grep -q .
}

choose_free_port(){
  local start="$1" max="$2" p
  for ((p=start; p<=max; p++)); do
    if ! port_in_use "$p"; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

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
  if ! grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    printf '%s=%s\n' "$key" "$value" >> "${ENV_FILE}"
  fi
}

ask(){
  local prompt="$1" default="$2" reply=''
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b' "${CYAN}[?]${NC} ${prompt}" > /dev/tty
    read -r reply < /dev/tty || reply=''
  fi
  echo "${reply:-$default}"
}

ask_yes_no(){
  local prompt="$1" default="$2" reply=''
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b' "${CYAN}[?]${NC} ${prompt}" > /dev/tty
    read -r reply < /dev/tty || reply=''
  fi
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy]$ ]]
}

stop_existing_app(){
  local pid=''

  if [ -f "${PID_FILE}" ]; then
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      info "Stopping existing Nexora process ${pid}..."
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  pkill -u nexora -f "${INSTALL_DIR}/server/dist/index.js" 2>/dev/null || true
  rm -f "${PID_FILE}"
}

# =========================================================
# BANNER
# =========================================================

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

# =========================================================
# ROOT / OS
# =========================================================

if [ "$EUID" -ne 0 ]; then
  error 'Run as root: sudo bash nexora--install.sh'
  exit 1
fi

source /etc/os-release
ARCH="$(uname -m)"
info "OS: ${PRETTY_NAME:-unknown}"
info "Architecture: ${ARCH}"

if ! command -v apt-get >/dev/null 2>&1; then
  error 'This installer requires Debian/Ubuntu apt-get.'
  exit 1
fi

line

# =========================================================
# DEPENDENCIES
# =========================================================

export DEBIAN_FRONTEND=noninteractive
info 'Installing required packages (without upgrading existing packages)...'

BASE_PACKAGES=(
  ca-certificates
  curl
  nginx
  openssl
  build-essential
  python3
  python3-pip
  unzip
  jq
  iproute2
  iptables
  tar
  gzip
)

apt-get update -y
apt-get install -y --no-upgrade --no-install-recommends "${BASE_PACKAGES[@]}"

# Git is intentionally NOT installed by this script. The source is downloaded
# directly from GitHub as a tarball, avoiding dpkg/git cross-device failures in
# container environments.
command -v curl >/dev/null 2>&1 || { error 'curl is required'; exit 1; }
command -v nginx >/dev/null 2>&1 || { error 'nginx is required'; exit 1; }
command -v openssl >/dev/null 2>&1 || { error 'openssl is required'; exit 1; }
command -v tar >/dev/null 2>&1 || { error 'tar is required'; exit 1; }
command -v ss >/dev/null 2>&1 || { error 'iproute2/ss is required'; exit 1; }

ok 'System dependencies ready.'
line

# =========================================================
# NODE.JS
# =========================================================

info "Checking Node.js ${NODE_MAJOR}..."

if ! command -v node >/dev/null 2>&1 ||
   [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" != "${NODE_MAJOR}" ]]; then
  info "Installing Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash
  apt-get install -y --no-upgrade nodejs
fi

command -v node >/dev/null 2>&1 || { error 'Node.js is unavailable'; exit 1; }
command -v npm >/dev/null 2>&1 || { error 'npm is unavailable'; exit 1; }

info "Node: $(node -v)"
info "npm:  $(npm -v)"
ok 'Node.js ready.'
line

# =========================================================
# INPUTS
# =========================================================

PANEL_DOMAIN="${PANEL_DOMAIN:-$(ask 'Panel domain (blank = use public IP): ' '')}"
ADMIN_EMAIL="${ADMIN_EMAIL:-$(ask 'Admin email [admin@nexora.local]: ' 'admin@nexora.local')}"
ADMIN_PASSWORD_INPUT="${ADMIN_PASSWORD:-$(ask 'Admin password (blank = generate): ' '')}"
RESET_ADMIN_PASSWORD="${RESET_ADMIN_PASSWORD:-false}"

if [ -n "${PANEL_DOMAIN}" ]; then
  PANEL_DOMAIN="$(printf '%s' "${PANEL_DOMAIN}" | sed 's#^https\?://##; s#/$##')"
fi

line

# =========================================================
# STOP OLD INSTANCE / BACKUP PERSISTENT DATA
# =========================================================

stop_existing_app

mkdir -p /opt "${BACKUP_DIR}" "${LOG_DIR}"

BACKUP_STAMP="$(date +%Y%m%d-%H%M%S)"
ENV_BACKUP=''
DB_BACKUP=''
UPLOADS_BACKUP=''

if [ -f "${ENV_FILE}" ]; then
  ENV_BACKUP="${BACKUP_DIR}/server.env.${BACKUP_STAMP}.bak"
  cp -a "${ENV_FILE}" "${ENV_BACKUP}"
  info "Environment backup: ${ENV_BACKUP}"
fi

if [ -f "${DB_FILE}" ]; then
  DB_BACKUP="${BACKUP_DIR}/dev.db.${BACKUP_STAMP}.bak"
  cp -a "${DB_FILE}" "${DB_BACKUP}"
  info "Database backup: ${DB_BACKUP}"
fi

if [ -d "${SERVER_DIR}/uploads" ]; then
  UPLOADS_BACKUP="${BACKUP_DIR}/uploads.${BACKUP_STAMP}"
  cp -a "${SERVER_DIR}/uploads" "${UPLOADS_BACKUP}"
  info "Uploads backup: ${UPLOADS_BACKUP}"
fi

# =========================================================
# DOWNLOAD SOURCE WITHOUT GIT
# =========================================================

info 'Downloading Nexora source from GitHub...'

TMP_ROOT="$(mktemp -d /tmp/nexora-install.XXXXXX)"
TMP_TARBALL="${TMP_ROOT}/nexora.tar.gz"

cleanup(){ rm -rf "${TMP_ROOT}"; }
trap cleanup EXIT

curl --fail --location --silent --show-error --retry 5 --retry-all-errors \
  --connect-timeout 15 --max-time 180 \
  "${SOURCE_TARBALL_URL}" -o "${TMP_TARBALL}"

tar -tzf "${TMP_TARBALL}" >/dev/null
rm -rf "${INSTALL_DIR}"
tar -xzf "${TMP_TARBALL}" -C "${TMP_ROOT}"

SOURCE_DIR="$(find "${TMP_ROOT}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -n "${SOURCE_DIR}" ] || { error 'Downloaded source archive is empty'; exit 1; }

mv "${SOURCE_DIR}" "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# Restore persistent files after replacing source.
mkdir -p "${SERVER_DIR}/prisma"

if [ -n "${ENV_BACKUP}" ] && [ -f "${ENV_BACKUP}" ]; then
  cp -a "${ENV_BACKUP}" "${ENV_FILE}"
fi

if [ -n "${DB_BACKUP}" ] && [ -f "${DB_BACKUP}" ]; then
  cp -a "${DB_BACKUP}" "${DB_FILE}"
fi

if [ -n "${UPLOADS_BACKUP}" ] && [ -d "${UPLOADS_BACKUP}" ]; then
  rm -rf "${SERVER_DIR}/uploads"
  cp -a "${UPLOADS_BACKUP}" "${SERVER_DIR}/uploads"
fi

ok 'Source ready.'
line

# =========================================================
# PORTS
# =========================================================

if port_in_use "${BACKEND_PORT}"; then
  BACKEND_PORT="$(choose_free_port 3000 3099)" || {
    error 'No free backend port found in 3000-3099.'
    exit 1
  }
  warn "Backend port was busy; using ${BACKEND_PORT}."
fi

if port_in_use "${PANEL_PORT}"; then
  ORIGINAL_PANEL_PORT="${PANEL_PORT}"
  PANEL_PORT="$(choose_free_port $((ORIGINAL_PANEL_PORT + 1)) 8099)" || {
    error 'No free panel port found in requested range.'
    exit 1
  }
  warn "Panel port ${ORIGINAL_PANEL_PORT} was busy; using ${PANEL_PORT}."
fi

info "Backend: ${BACKEND_PORT} | Panel: ${PANEL_PORT}"
line

# =========================================================
# PUBLIC URL / CORS
# =========================================================

info 'Detecting public IP...'
PUBLIC_IP="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
PUBLIC_IP="${PUBLIC_IP:-$(hostname -I 2>/dev/null | awk '{print $1}') }"
PUBLIC_IP="$(printf '%s' "${PUBLIC_IP}" | xargs || true)"
PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"

if [ -n "${PANEL_DOMAIN}" ]; then
  APP_URL_VALUE="https://${PANEL_DOMAIN}"
  DEFAULT_CORS="https://${PANEL_DOMAIN},http://${PANEL_DOMAIN},http://${PUBLIC_IP}:${PANEL_PORT}"
else
  APP_URL_VALUE="http://${PUBLIC_IP}:${PANEL_PORT}"
  DEFAULT_CORS="http://${PUBLIC_IP}:${PANEL_PORT}"
fi

info "Public IP: ${PUBLIC_IP}"

# =========================================================
# ENVIRONMENT
# =========================================================

info 'Configuring server environment...'

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
line

# =========================================================
# DEPENDENCIES
# =========================================================

info 'Installing application dependencies...'

npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set strict-ssl true

npm_install(){
  local dir="$1"
  local label="$2"
  cd "$dir"
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund --prefer-offline || {
      warn "${label}: npm ci failed; retrying with npm install..."
      npm install --no-audit --no-fund
    }
  else
    npm install --no-audit --no-fund
  fi
}

npm_install "${INSTALL_DIR}" 'Root dependencies'
npm_install "${SERVER_DIR}" 'Server dependencies'
npm_install "${INSTALL_DIR}/client" 'Client dependencies'

ok 'Application dependencies installed.'
line

# =========================================================
# DATABASE
# =========================================================

cd "${SERVER_DIR}"
info 'Generating Prisma client and synchronizing database...'

npx --no-install prisma generate
npx --no-install prisma db push --skip-generate

# Make SQLite and its journal files writable before the service account starts.
mkdir -p "$(dirname "${DB_FILE}")"
chown -R nexora:nexora "${SERVER_DIR}/prisma" 2>/dev/null || true
chmod 770 "${SERVER_DIR}/prisma"
chmod 660 "${DB_FILE}" 2>/dev/null || true

# =========================================================
# PRISMA WRITE TEST
# =========================================================

info 'Testing database write access as the Nexora service user...'

if ! id -u nexora >/dev/null 2>&1; then
  useradd --system --home-dir "${INSTALL_DIR}" --shell /usr/sbin/nologin nexora
fi

chown -R nexora:nexora "${INSTALL_DIR}" "${LOG_DIR}"
chmod 600 "${ENV_FILE}"

cat > /tmp/nexora-prisma-write-test.js <<'NODE'
const { PrismaClient } = require('/opt/nexora/server/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "__nexora_write_test" (id INTEGER PRIMARY KEY)');
    await prisma.$executeRawUnsafe('INSERT INTO "__nexora_write_test" DEFAULT VALUES');
    await prisma.$executeRawUnsafe('DROP TABLE "__nexora_write_test"');
    console.log('PRISMA SQLITE WRITE OK');
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error('PRISMA SQLITE WRITE FAILED:', error.message || error);
  process.exit(1);
});
NODE

if ! sudo -u nexora env \
  DATABASE_URL="file:${DB_FILE}" \
  NODE_ENV=production \
  node /tmp/nexora-prisma-write-test.js; then
  rm -f /tmp/nexora-prisma-write-test.js
  error 'Prisma cannot write to the configured SQLite database.'
  exit 1
fi

rm -f /tmp/nexora-prisma-write-test.js
ok 'Database write test passed.'
line

# =========================================================
# ADMIN ACCOUNT
# =========================================================

ADMIN_EMAIL="$(printf '%s' "${ADMIN_EMAIL}" | tr '[:upper:]' '[:lower:]' | xargs)"
[ -n "${ADMIN_EMAIL}" ] || { error 'Admin email cannot be empty.'; exit 1; }

ADMIN_EXISTS=$(
  sudo -u nexora env DATABASE_URL="file:${DB_FILE}" ADMIN_EMAIL="${ADMIN_EMAIL}" \
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    process.stdout.write(user ? 'yes' : 'no');
  } finally {
    await prisma.$disconnect();
  }
})().catch(() => process.stdout.write('no'));
NODE
)

RESET_ADMIN_PASSWORD="$(printf '%s' "${RESET_ADMIN_PASSWORD}" | tr '[:upper:]' '[:lower:]')"
FORCE_ADMIN_RESET='false'
[[ "${RESET_ADMIN_PASSWORD}" =~ ^(true|1|yes|y)$ ]] && FORCE_ADMIN_RESET='true'

NEW_ADMIN_PASSWORD=''

if [ "${ADMIN_EXISTS}" != 'yes' ]; then
  info "Creating administrator account: ${ADMIN_EMAIL}"
  NEW_ADMIN_PASSWORD="${ADMIN_PASSWORD_INPUT:-$(random_password)}"

  ADMIN_EMAIL="${ADMIN_EMAIL}" ADMIN_PASSWORD="${NEW_ADMIN_PASSWORD}" DATABASE_URL="file:${DB_FILE}" \
  sudo -u nexora node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Admin email/password missing');
  const hash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { password: hash, isActive: true, role: 'ADMIN' },
    create: { email, password: hash, name: 'Administrator', role: 'ADMIN', isActive: true },
  });
  console.log(`Admin account ready: ${email}`);
})().finally(() => prisma.$disconnect());
NODE

  ok "Administrator account created: ${ADMIN_EMAIL}"

elif [ "${FORCE_ADMIN_RESET}" = 'true' ]; then
  info "Forcing administrator password reset: ${ADMIN_EMAIL}"
  NEW_ADMIN_PASSWORD="${ADMIN_PASSWORD_INPUT:-$(random_password)}"

  ADMIN_EMAIL="${ADMIN_EMAIL}" ADMIN_PASSWORD="${NEW_ADMIN_PASSWORD}" DATABASE_URL="file:${DB_FILE}" \
  sudo -u nexora node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Admin account not found: ${email}`);
  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { email }, data: { password: hash, isActive: true, role: 'ADMIN' } });
  console.log(`Admin password reset: ${email}`);
})().finally(() => prisma.$disconnect());
NODE

  ok "Administrator password reset: ${ADMIN_EMAIL}"
else
  info "Administrator already exists: ${ADMIN_EMAIL}"
  info 'Password unchanged.'
fi

if [ -n "${NEW_ADMIN_PASSWORD}" ]; then
  CREDENTIALS_FILE="${INSTALL_DIR}/ADMIN_CREDENTIALS.txt"
  cat > "${CREDENTIALS_FILE}" <<EOF_CREDS
Nexora Panel — Administrator Credentials
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

Email    : ${ADMIN_EMAIL}
Password : ${NEW_ADMIN_PASSWORD}

Change the password after first login and delete this file afterwards.
EOF_CREDS
  chown nexora:nexora "${CREDENTIALS_FILE}"
  chmod 600 "${CREDENTIALS_FILE}"
fi

line

# =========================================================
# BUILD
# =========================================================

cd "${INSTALL_DIR}"
info 'Building Nexora...'
npm run build:server
npm run build:client
ok 'Build complete.'
line

# =========================================================
# SERVICE RUNNER
# =========================================================

cat > "${RUNNER_FILE}" <<EOF_RUNNER
#!/usr/bin/env bash
set -Eeuo pipefail
cd "${SERVER_DIR}"
exec /usr/bin/node "${SERVER_DIR}/dist/index.js"
EOF_RUNNER

chown nexora:nexora "${RUNNER_FILE}"
chmod 750 "${RUNNER_FILE}"

# =========================================================
# START APPLICATION
# =========================================================

start_non_systemd(){
  rm -f "${PID_FILE}"

  sudo -u nexora setsid nohup "${RUNNER_FILE}" \
    >> "${LOG_FILE}" 2>&1 < /dev/null &

  sleep 2

  local pid=''
  for _ in {1..20}; do
    pid="$(pgrep -u nexora -f "${SERVER_DIR}/dist/index.js" | head -n1 || true)"
    [ -n "${pid}" ] && break
    sleep 0.25
  done

  [ -n "${pid}" ] || {
    error 'Nexora backend failed to start.'
    tail -n 100 "${LOG_FILE}" || true
    exit 1
  }

  echo "${pid}" > "${PID_FILE}"
  chown nexora:nexora "${PID_FILE}"
}

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
ExecStart=${RUNNER_FILE}
Restart=always
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF_SERVICE

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
  systemctl restart "${SERVICE_NAME}"

  systemctl is-active --quiet "${SERVICE_NAME}" || {
    error 'Nexora systemd service failed to start.'
    journalctl -u "${SERVICE_NAME}" -n 100 --no-pager || true
    exit 1
  }
else
  start_non_systemd
fi

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
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF_NGINX

ln -sf "${NGINX_SITE}" "${NGINX_LINK}"
rm -f /etc/nginx/sites-enabled/default
nginx -t

if systemd_available; then
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl restart nginx
else
  nginx -s quit >/dev/null 2>&1 || true
  nginx
fi

sleep 2
port_in_use "${PANEL_PORT}" || {
  error "Nginx is not listening on ${PANEL_PORT}."
  nginx -t || true
  exit 1
}
ok "Nginx listening on ${PANEL_PORT}."
line

# =========================================================
# HEALTH CHECKS
# =========================================================

info 'Running health checks...'

if curl -fsS --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
  ok 'Backend health endpoint: OK'
else
  error 'Backend health endpoint failed.'
  if systemd_available; then
    journalctl -u "${SERVICE_NAME}" -n 100 --no-pager || true
  else
    tail -n 100 "${LOG_FILE}" || true
  fi
  exit 1
fi

if curl -fsS --max-time 5 "http://127.0.0.1:${PANEL_PORT}/" >/dev/null; then
  ok 'Panel HTTP endpoint: OK'
else
  error 'Panel HTTP endpoint failed.'
  exit 1
fi

# CORS test for the configured server origin.
CORS_TEST_ORIGIN="${APP_URL_VALUE}"
CORS_TEST_HEADERS="$(curl -si --max-time 5 -H "Origin: ${CORS_TEST_ORIGIN}" "http://127.0.0.1:${BACKEND_PORT}/api/health" || true)"
if printf '%s\n' "${CORS_TEST_HEADERS}" | grep -qi "Access-Control-Allow-Origin: ${CORS_TEST_ORIGIN}"; then
  ok 'Configured CORS origin: OK'
else
  warn "Configured CORS origin was not echoed for ${CORS_TEST_ORIGIN}; inspect CORS_ORIGIN in ${ENV_FILE}."
fi

# =========================================================
# FIREWALL
# =========================================================

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q active; then
  ufw allow "${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
elif command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "${PANEL_PORT}" -j ACCEPT >/dev/null 2>&1 || \
    iptables -I INPUT -p tcp --dport "${PANEL_PORT}" -j ACCEPT >/dev/null 2>&1 || true
fi

# =========================================================
# FINAL OUTPUT
# =========================================================

clear || true
printf '%b' "$GREEN"
cat <<EOF_DONE

╔══════════════════════════════════════════════════════════╗
║               NEXORA INSTALLATION COMPLETE               ║
╚══════════════════════════════════════════════════════════╝

✅ STATUS            : VERIFIED & RUNNING
🌐 PANEL URL         : ${APP_URL_VALUE}
🔌 PANEL PORT        : ${PANEL_PORT}
⚙️  BACKEND PORT      : ${BACKEND_PORT}
📁 INSTALL DIR       : ${INSTALL_DIR}
🔧 SERVICE           : ${SERVICE_NAME}
📋 LOG FILE          : ${LOG_FILE}
🗄️  DATABASE          : ${DB_FILE}

EOF_DONE

echo "🔗 OPEN: ${APP_URL_VALUE}"
echo

if [ -n "${NEW_ADMIN_PASSWORD}" ]; then
  echo '👤 ADMIN CREDENTIALS'
  echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  echo "Email    : ${ADMIN_EMAIL}"
  echo "Password : ${NEW_ADMIN_PASSWORD}"
  echo
  echo '⚠️  Save these credentials and change the password after first login.'
else
  echo '👤 ADMIN ACCOUNT'
  echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  echo "Email    : ${ADMIN_EMAIL}"
  echo 'Password : unchanged'
fi

echo
echo '📖 COMMANDS'
echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
if systemd_available; then
  echo "  systemctl status ${SERVICE_NAME} --no-pager"
  echo "  systemctl restart ${SERVICE_NAME}"
  echo "  systemctl stop ${SERVICE_NAME}"
  echo "  journalctl -u ${SERVICE_NAME} -f"
else
  echo "  cat ${PID_FILE}"
  echo "  tail -f ${LOG_FILE}"
  echo "  kill \$(cat ${PID_FILE})"
fi

echo
echo 'CodeSandbox / external frontend:'
echo "  VITE_API_URL=${APP_URL_VALUE}"
echo "  VITE_SOCKET_URL=${APP_URL_VALUE}"
echo
echo '✨ Installation verified successfully.'
printf '%b' "$NC"
