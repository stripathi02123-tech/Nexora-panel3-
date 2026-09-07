#!/usr/bin/env bash

# =========================================================
# NEXORA BOT INSTALLER (FIXED)
# Source installer for Nexora Panel
# Supports real Ubuntu/Debian VPS and container-style environments
# =========================================================

set -Eeuo pipefail
IFS=$'\n\t'

RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'
NC='\033[0m'

APP_NAME='Nexora Bot'
SERVICE_NAME='nexora-bot'
INSTALL_DIR='/opt/nexora'
REPO_URL='https://github.com/stripathi02123-tech/Nexora-panel3-.git'
BRANCH='main'
NODE_MAJOR='22'

BACKEND_PORT=3000
PANEL_PORT="${PANEL_PORT:-8080}"

ENV_FILE="${INSTALL_DIR}/server/.env"

LOG_DIR='/var/log/nexora'
LOG_FILE="${LOG_DIR}/app.log"

PID_FILE="${INSTALL_DIR}/nexora.pid"

NGINX_SITE='/etc/nginx/sites-available/nexora'
NGINX_LINK='/etc/nginx/sites-enabled/nexora'

BACKUP_DIR='/opt/nexora-backups'

# =========================================================
# OUTPUT HELPERS
# =========================================================

line() {
  echo -e "${MAGENTA}============================================================${NC}"
}

info() {
  echo -e "${CYAN}[INFO]${NC} $*"
}

ok() {
  echo -e "${GREEN}[OK]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARNING]${NC} $*"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

# =========================================================
# SYSTEMD DETECTION
# =========================================================

systemd_available() {
  command -v systemctl >/dev/null 2>&1 &&
  [ -d /run/systemd/system ] &&
  [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = "systemd" ]
}

# =========================================================
# ERROR HANDLER
# =========================================================

on_error() {
  local code=$?

  error "Installation stopped due to an error (exit code ${code})."

  if systemd_available; then
    echo "sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    echo "sudo journalctl -u nginx -n 100 --no-pager"
  else
    echo "tail -n 100 ${LOG_FILE}"
  fi

  exit "$code"
}

trap on_error ERR

# =========================================================
# PORT HELPERS
# =========================================================

port_in_use() {
  ss -H -ltn "sport = :$1" 2>/dev/null | grep -q . || return 1
}

choose_free_port() {
  local start="$1"
  local max="$2"
  local p

  for ((p=start; p<=max; p++)); do
    if ! port_in_use "$p"; then
      echo "$p"
      return 0
    fi
  done

  return 1
}

# =========================================================
# RANDOM VALUES
# =========================================================

random_hex() {
  openssl rand -hex 32
}

random_password() {
  openssl rand -base64 24 |
    tr -dc 'A-Za-z0-9@#%+=_' |
    cut -c1-20
}

# =========================================================
# ENVIRONMENT HELPERS
# =========================================================

set_env() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "$key" "$value" >> "${ENV_FILE}"
  fi
}

# =========================================================
# TERMINAL INPUT
# =========================================================

ask() {
  local prompt="$1"
  local default="$2"
  local reply=''

  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b' "${CYAN}[?]${NC} ${prompt}" > /dev/tty
    read -r reply < /dev/tty || reply=''
  fi

  echo "${reply:-$default}"
}

ask_yes_no() {
  local prompt="$1"
  local default="$2"
  local reply=''

  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b' "${CYAN}[?]${NC} ${prompt}" > /dev/tty
    read -r reply < /dev/tty || reply=''
  fi

  reply="${reply:-$default}"

  [[ "$reply" =~ ^[Yy] ]]
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

                    NEXORA BOT INSTALLER

BANNER

printf '%b' "$NC"

line

# =========================================================
# ROOT CHECK
# =========================================================

if [ "$EUID" -ne 0 ]; then
  error 'Run as root: sudo bash install.sh'
  exit 1
fi

# =========================================================
# OS INFORMATION
# =========================================================

source /etc/os-release

ARCH=$(uname -m)

info "OS: ${PRETTY_NAME:-unknown}"
info "Architecture: ${ARCH}"

line

# =========================================================
# SYSTEM DEPENDENCIES
# =========================================================

export DEBIAN_FRONTEND=noninteractive

info 'Installing system dependencies...'

dpkg --configure -a ||
  warn 'dpkg has pending configuration work; continuing with dependency installation.'

apt-get update -y

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
)

apt-get install -y \
  --no-upgrade \
  --no-install-recommends \
  "${BASE_PACKAGES[@]}"

if ! command -v git >/dev/null 2>&1; then
  apt-get install -y \
    --no-upgrade \
    --no-install-recommends \
    git
fi

ok 'System dependencies ready.'

line

# =========================================================
# NODE.JS
# =========================================================

info "Installing Node.js ${NODE_MAJOR}..."

if command -v node >/dev/null 2>&1 &&
   [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" == "${NODE_MAJOR}" ]]; then

  info "Node.js ${NODE_MAJOR} already present: $(node -v)"

else

  curl -fsSL \
    "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" |
    bash

  apt-get install -y nodejs
fi

command -v node >/dev/null 2>&1 || {
  error 'Node.js is unavailable'
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  error 'npm is unavailable'
  exit 1
}

info "Node: $(node -v)"
info "npm:  $(npm -v)"

ok 'Node.js ready.'

line

# =========================================================
# SOURCE PREPARATION
# =========================================================

info "Preparing ${APP_NAME} source..."

mkdir -p \
  /opt \
  "${BACKUP_DIR}"

DB_FILE="${INSTALL_DIR}/server/prisma/dev.db"
DB_BACKUP=''

if [ -d "${INSTALL_DIR}/.git" ]; then

  info 'Updating existing installation...'

  if [ -f "${DB_FILE}" ]; then

    DB_BACKUP="${BACKUP_DIR}/dev.db.$(date +%Y%m%d-%H%M%S).bak"

    cp -a \
      "${DB_FILE}" \
      "${DB_BACKUP}"

    info "Database backup: ${DB_BACKUP}"

  fi

  cd "${INSTALL_DIR}"

  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"

  if [ -n "${DB_BACKUP}" ] &&
     [ -f "${DB_BACKUP}" ]; then

    cp -a \
      "${DB_BACKUP}" \
      "${DB_FILE}"

    info 'Database restored.'

  fi

else

  warn "Fresh installation to ${INSTALL_DIR}"

  rm -rf "${INSTALL_DIR}"

  git clone \
    --branch "${BRANCH}" \
    --depth 1 \
    "${REPO_URL}" \
    "${INSTALL_DIR}"

fi

cd "${INSTALL_DIR}"

ok 'Source ready.'

line

# =========================================================
# PORT SELECTION
# =========================================================

info 'Selecting ports...'

BACKEND_PORT=3000

if port_in_use "$BACKEND_PORT"; then

  BACKEND_PORT=$(choose_free_port 3000 3099) || {
    error 'No free backend port found in 3000-3099'
    exit 1
  }

  warn "Port 3000 busy → using ${BACKEND_PORT}"

fi

if port_in_use "$PANEL_PORT"; then

  ORIGINAL_PANEL_PORT="$PANEL_PORT"

  PANEL_PORT=$(choose_free_port \
    $((ORIGINAL_PANEL_PORT + 1)) \
    8099) || {

    error 'No free panel port found'
    exit 1
  }

  warn "Port ${ORIGINAL_PANEL_PORT} busy → using ${PANEL_PORT}"

fi

info "Backend: ${BACKEND_PORT} | Panel: ${PANEL_PORT}"

line

# =========================================================
# INSTALLATION OPTIONS
# =========================================================

info 'Installation options'
info '(press Enter to accept the default shown in brackets — works fine over curl | bash too)'

PANEL_DOMAIN="${PANEL_DOMAIN:-$(ask \
  "Domain pointed at this server (blank = use raw IP): " \
  "")}"

ADMIN_EMAIL="${ADMIN_EMAIL:-$(ask \
  "Admin login email [admin@nexora.local]: " \
  "admin@nexora.local")}"

ADMIN_PASSWORD_INPUT="${ADMIN_PASSWORD:-$(ask \
  "Admin password (blank = auto-generate a strong one): " \
  "")}"

ENABLE_SSL='false'

if [ -n "${PANEL_DOMAIN}" ]; then

  if ask_yes_no \
    "Issue a free HTTPS certificate for ${PANEL_DOMAIN} via Let's Encrypt? [y/N]: " \
    "N"; then

    ENABLE_SSL='true'

  fi
fi

RESET_ADMIN_PASSWORD="${RESET_ADMIN_PASSWORD:-false}"

line

# =========================================================
# NPM DEPENDENCIES
# =========================================================

info 'Installing npm dependencies...'

rm -rf \
  node_modules \
  server/node_modules \
  client/node_modules

npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set strict-ssl true

install_with_fallback() {

  local label="$1"
  local tmp_cache

  tmp_cache=$(mktemp -d)

  if npm install \
    --no-audit \
    --no-fund \
    --registry https://registry.npmjs.org/ \
    --cache "${tmp_cache}"; then

    rm -rf "${tmp_cache}"

    return 0
  fi

  rm -rf "${tmp_cache}"

  warn "${label}: attempt failed, retrying with a clean cache..."

  tmp_cache=$(mktemp -d)

  if npm install \
    --no-audit \
    --no-fund \
    --registry https://registry.npmjs.org/ \
    --cache "${tmp_cache}" \
    --prefer-online; then

    rm -rf "${tmp_cache}"

    return 0
  fi

  rm -rf "${tmp_cache}"

  warn "${label}: same failure persists — package-lock.json is likely pinning a stale/incorrect hash. Dropping the lockfile and re-resolving..."

  if [ -f package-lock.json ]; then

    mv \
      package-lock.json \
      "package-lock.json.bak.$(date +%s)"

  fi

  rm -rf node_modules

  tmp_cache=$(mktemp -d)

  if npm install \
    --no-audit \
    --no-fund \
    --registry https://registry.npmjs.org/ \
    --cache "${tmp_cache}"; then

    rm -rf "${tmp_cache}"

    return 0
  fi

  rm -rf "${tmp_cache}"

  return 1
}

install_with_fallback 'Root dependencies' || {
  error 'Root dependencies failed'
  exit 1
}

(
  cd server
  install_with_fallback 'Server dependencies'
) || {
  error 'Server dependencies failed'
  exit 1
}

(
  cd client
  install_with_fallback 'Client dependencies'
) || {
  error 'Client dependencies failed'
  exit 1
}

ok 'Dependencies installed.'

line

# =========================================================
# PUBLIC IP
# =========================================================

info 'Detecting public IP...'

PUBLIC_IP=$(
  curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null ||
  curl -4 -fsS --max-time 5 https://icanhazip.com 2>/dev/null ||
  true
)

PUBLIC_IP=${PUBLIC_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}
PUBLIC_IP=${PUBLIC_IP:-localhost}

info "Public IP: ${PUBLIC_IP}"

# =========================================================
# CORS / APP URL
# =========================================================

CORS_ORIGIN_LIST="http://${PUBLIC_IP}:${PANEL_PORT}"
APP_URL_VALUE="http://${PUBLIC_IP}:${PANEL_PORT}"

if [ -n "${PANEL_DOMAIN}" ]; then

  CORS_ORIGIN_LIST="${CORS_ORIGIN_LIST},https://${PANEL_DOMAIN},http://${PANEL_DOMAIN}"
  APP_URL_VALUE="https://${PANEL_DOMAIN}"

  info "Using domain: ${PANEL_DOMAIN}"

fi

# =========================================================
# SERVER ENVIRONMENT
# =========================================================

info 'Creating server environment...'

mkdir -p "${LOG_DIR}"

if [ ! -f "${ENV_FILE}" ]; then

  cat > "${ENV_FILE}" <<EOF_ENV
NODE_ENV=production
PORT=${BACKEND_PORT}
DATABASE_URL=file:./dev.db
JWT_SECRET=$(random_hex)
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=$(random_hex)
APP_URL=${APP_URL_VALUE}
CORS_ORIGIN=${CORS_ORIGIN_LIST}
PROXMOX_TIMEOUT=30000
DOCKER_TIMEOUT=30000
EOF_ENV

else

  set_env NODE_ENV production
  set_env PORT "${BACKEND_PORT}"
  set_env APP_URL "${APP_URL_VALUE}"
  set_env CORS_ORIGIN "${CORS_ORIGIN_LIST}"

fi

chmod 600 "${ENV_FILE}"

ok 'Environment ready.'

line

# =========================================================
# DATABASE SETUP
# =========================================================

cd "${INSTALL_DIR}/server"

info 'Database setup...'

npx --no-install prisma generate || {
  error 'Prisma schema generation failed'
  exit 1
}

npx --no-install prisma db push --skip-generate || {
  error 'Prisma database push failed'
  exit 1
}

# =========================================================
# ADMIN ACCOUNT DETECTION
# =========================================================

ADMIN_EMAIL="$(printf '%s' "${ADMIN_EMAIL}" | tr '[:upper:]' '[:lower:]' | xargs)"

if [ -z "${ADMIN_EMAIL}" ]; then
  error 'Admin email cannot be empty.'
  exit 1
fi

ADMIN_EXISTS=$(
  ADMIN_EMAIL="${ADMIN_EMAIL}" \
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    const email = String(
      process.env.ADMIN_EMAIL || ''
    ).trim().toLowerCase();

    if (!email) {
      process.stdout.write('no');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    process.stdout.write(user ? 'yes' : 'no');

  } catch {
    process.stdout.write('no');

  } finally {
    await prisma.$disconnect();
  }
})();
NODE
)

# =========================================================
# NORMALIZE RESET FLAG
# =========================================================

RESET_ADMIN_PASSWORD="$(printf '%s' "${RESET_ADMIN_PASSWORD}" | tr '[:upper:]' '[:lower:]')"

FORCE_ADMIN_RESET='false'

if [[ "${RESET_ADMIN_PASSWORD}" =~ ^(true|1|yes|y)$ ]]; then
  FORCE_ADMIN_RESET='true'
fi

# =========================================================
# ADMIN ACCOUNT SETUP
# =========================================================

NEW_ADMIN_PASSWORD=''

if [ "${ADMIN_EXISTS}" != 'yes' ]; then

  info "Creating admin account: ${ADMIN_EMAIL}"

  NEW_ADMIN_PASSWORD="${ADMIN_PASSWORD_INPUT:-${ADMIN_PASSWORD:-$(random_password)}}"

  if [ -z "${NEW_ADMIN_PASSWORD}" ]; then
    error 'Admin password cannot be empty.'
    exit 1
  fi

  # Run the project's seed first when available.
  npx --no-install prisma db seed ||
    warn 'Seed script unavailable or failed; continuing with direct admin setup.'

  ADMIN_EMAIL="${ADMIN_EMAIL}" \
  ADMIN_PASSWORD="${NEW_ADMIN_PASSWORD}" \
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

(async () => {
  const email = String(
    process.env.ADMIN_EMAIL || ''
  ).trim().toLowerCase();

  const password = process.env.ADMIN_PASSWORD;

  if (!email) {
    throw new Error('ADMIN_EMAIL is required');
  }

  if (!password) {
    throw new Error('ADMIN_PASSWORD is required');
  }

  const hash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },

    update: {
      password: hash,
      isActive: true,
      role: 'ADMIN'
    },

    create: {
      email,
      password: hash,
      name: 'Administrator',
      role: 'ADMIN',
      isActive: true
    }
  });

  console.log(`Admin account ready: ${email}`);

})()
  .catch((e) => {
    console.error('Admin setup failed:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE

  ok "Admin account created: ${ADMIN_EMAIL}"

elif [ "${FORCE_ADMIN_RESET}" = 'true' ]; then

  info "Forced password reset requested for ${ADMIN_EMAIL}"

  NEW_ADMIN_PASSWORD="${ADMIN_PASSWORD_INPUT:-${ADMIN_PASSWORD:-$(random_password)}}"

  if [ -z "${NEW_ADMIN_PASSWORD}" ]; then
    error 'Admin password cannot be empty during forced reset.'
    exit 1
  fi

  ADMIN_EMAIL="${ADMIN_EMAIL}" \
  ADMIN_PASSWORD="${NEW_ADMIN_PASSWORD}" \
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

(async () => {
  const email = String(
    process.env.ADMIN_EMAIL || ''
  ).trim().toLowerCase();

  const password = process.env.ADMIN_PASSWORD;

  if (!email) {
    throw new Error('ADMIN_EMAIL is required');
  }

  if (!password) {
    throw new Error('ADMIN_PASSWORD is required');
  }

  const existing = await prisma.user.findUnique({
    where: { email }
  });

  if (!existing) {
    throw new Error(
      `Admin account not found: ${email}`
    );
  }

  const hash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { email },

    data: {
      password: hash,
      isActive: true,
      role: 'ADMIN'
    }
  });

  console.log(`Admin password reset: ${email}`);

})()
  .catch((e) => {
    console.error('Admin reset failed:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE

  ok "Admin password forcibly reset: ${ADMIN_EMAIL}"

else

  info "Admin account already exists: ${ADMIN_EMAIL}"
  info 'Password unchanged.'
  info 'Use RESET_ADMIN_PASSWORD=true to force a password reset.'

fi

# =========================================================
# SAVE GENERATED / RESET CREDENTIALS
# =========================================================

if [ -n "${NEW_ADMIN_PASSWORD}" ]; then

  CREDENTIALS_FILE="${INSTALL_DIR}/ADMIN_CREDENTIALS.txt"

  cat > "${CREDENTIALS_FILE}" <<EOF_CREDS
Nexora Panel — Administrator Credentials
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

Email    : ${ADMIN_EMAIL}
Password : ${NEW_ADMIN_PASSWORD}

IMPORTANT:
- Change this password after first login.
- Delete this file after saving the credentials.
EOF_CREDS

  chmod 600 "${CREDENTIALS_FILE}"

  ok "Administrator credentials saved to ${CREDENTIALS_FILE}"

fi

# =========================================================
# BUILD APPLICATION
# =========================================================

cd "${INSTALL_DIR}"

line

info 'Building application...'

npm run build:server || {
  error 'Backend build failed'
  exit 1
}

npm run build:client || {
  error 'Frontend build failed'
  exit 1
}

ok 'Build complete.'

line

# =========================================================
# SERVICE ACCOUNT
# =========================================================

info 'Setting up service account...'

if ! id -u nexora >/dev/null 2>&1; then
  useradd \
    --system \
    --home-dir "${INSTALL_DIR}" \
    --shell /usr/sbin/nologin \
    nexora
fi

chown -R nexora:nexora \
  "${INSTALL_DIR}" \
  "${LOG_DIR}"

chmod 600 "${ENV_FILE}"

ok 'Service account ready.'

line

# =========================================================
# SYSTEMD SERVICE
# =========================================================

if systemd_available; then

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF_SERVICE
[Unit]
Description=Nexora Bot / Nexora Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nexora
Group=nexora
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=$(command -v node) ${INSTALL_DIR}/server/dist/index.js
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

else

  if [ -f "${PID_FILE}" ]; then

    old_pid=$(cat "${PID_FILE}" 2>/dev/null || true)

    if [ -n "${old_pid}" ] &&
       kill -0 "${old_pid}" 2>/dev/null; then

      kill "${old_pid}" 2>/dev/null || true

    fi

  fi

  runuser -u nexora -- \
    env NODE_ENV=production \
    /usr/bin/node \
    "${INSTALL_DIR}/server/dist/index.js" \
    >> "${LOG_FILE}" 2>&1 &

  echo $! > "${PID_FILE}"

fi

sleep 3

# =========================================================
# SERVICE HEALTH
# =========================================================

if systemd_available; then

  systemctl is-active --quiet "${SERVICE_NAME}" || {

    error "Backend service failed to start."

    systemctl status \
      "${SERVICE_NAME}" \
      --no-pager || true

    journalctl \
      -u "${SERVICE_NAME}" \
      -n 100 \
      --no-pager || true

    exit 1
  }

else

  test -f "${PID_FILE}" || {
    error 'Backend PID file was not created'
    exit 1
  }

  pid=$(cat "${PID_FILE}")

  kill -0 "${pid}" 2>/dev/null || {

    error 'Backend process failed to start'

    tail -n 100 \
      "${LOG_FILE}" || true

    exit 1
  }

fi

line

# =========================================================
# NGINX CONFIGURATION
# =========================================================

info 'Configuring Nginx reverse proxy...'

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

ln -sf \
  "${NGINX_SITE}" \
  "${NGINX_LINK}"

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

port_in_use "$PANEL_PORT" || {

  error "Nginx is not listening on ${PANEL_PORT}."

  nginx -t || true

  if systemd_available; then

    systemctl status nginx \
      --no-pager || true

    journalctl \
      -u nginx \
      -n 50 \
      --no-pager || true

  fi

  exit 1
}

ok "Nginx is listening on ${PANEL_PORT}."

line

# =========================================================
# HEALTH CHECKS
# =========================================================

info 'Health checks...'

if curl \
  -fsS \
  --max-time 5 \
  "http://127.0.0.1:${BACKEND_PORT}/api/health" \
  >/dev/null; then

  ok 'Backend health endpoint responding.'

else

  error "Backend is not responding on http://127.0.0.1:${BACKEND_PORT}/api/health"

  if systemd_available; then

    journalctl \
      -u "${SERVICE_NAME}" \
      -n 100 \
      --no-pager || true

  else

    tail -n 100 \
      "${LOG_FILE}" || true

  fi

  exit 1

fi

if curl \
  -fsS \
  --max-time 5 \
  "http://127.0.0.1:${PANEL_PORT}/" \
  >/dev/null; then

  ok "Panel responding on port ${PANEL_PORT}."

else

  error "Panel HTTP check failed on port ${PANEL_PORT}."

  exit 1

fi

# =========================================================
# FIREWALL
# =========================================================

if command -v ufw >/dev/null 2>&1 &&
   ufw status 2>/dev/null | grep -q active; then

  ufw allow \
    "${PANEL_PORT}/tcp" \
    >/dev/null 2>&1 || true

  ufw allow \
    443/tcp \
    >/dev/null 2>&1 || true

elif command -v firewall-cmd >/dev/null 2>&1 &&
     firewall-cmd --state >/dev/null 2>&1; then

  firewall-cmd \
    --permanent \
    --add-port="${PANEL_PORT}/tcp" \
    >/dev/null 2>&1 || true

  firewall-cmd \
    --reload \
    >/dev/null 2>&1 || true

elif command -v iptables >/dev/null 2>&1; then

  iptables \
    -C INPUT \
    -p tcp \
    --dport "${PANEL_PORT}" \
    -j ACCEPT \
    >/dev/null 2>&1 ||
  iptables \
    -I INPUT \
    -p tcp \
    --dport "${PANEL_PORT}" \
    -j ACCEPT \
    >/dev/null 2>&1 || true

fi

# =========================================================
# FINAL BANNER
# =========================================================

clear || true

printf '%b' "$GREEN"

cat <<EOF_DONE

╔══════════════════════════════════════════════════════════╗
║             NEXORA BOT INSTALLATION COMPLETE             ║
╚══════════════════════════════════════════════════════════╝

✅ STATUS            : VERIFIED & RUNNING
🌐 PANEL URL         : http://${PUBLIC_IP}:${PANEL_PORT}
⚙️  BACKEND PORT      : ${BACKEND_PORT}
📁 INSTALL DIR       : ${INSTALL_DIR}
🔧 SERVICE           : ${SERVICE_NAME}
📋 LOG FILE          : ${LOG_FILE}

EOF_DONE

echo "🔗 OPEN: http://${PUBLIC_IP}:${PANEL_PORT}"
echo

# =========================================================
# ADMIN CREDENTIALS OUTPUT
# =========================================================

if [ -n "${NEW_ADMIN_PASSWORD}" ]; then

  echo "👤 ADMIN CREDENTIALS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Email    : ${ADMIN_EMAIL}"
  echo "Password : ${NEW_ADMIN_PASSWORD}"
  echo
  echo "⚠️  Save these credentials and change password after first login!"

else

  echo "👤 ADMIN ACCOUNT"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Email    : ${ADMIN_EMAIL}"
  echo "Password : unchanged"
  echo
  echo "Use RESET_ADMIN_PASSWORD=true to force a password reset."

fi

cat <<EOF_COMMANDS

📖 SERVICE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF_COMMANDS

if systemd_available; then

  cat <<EOF_COMMANDS
  systemctl status ${SERVICE_NAME} --no-pager
  systemctl restart ${SERVICE_NAME}
  systemctl stop ${SERVICE_NAME}
  systemctl start ${SERVICE_NAME}
  journalctl -u ${SERVICE_NAME} -f
EOF_COMMANDS

else

  cat <<EOF_COMMANDS
  cat ${PID_FILE}
  tail -f ${LOG_FILE}
  kill \$(cat ${PID_FILE})
EOF_COMMANDS

fi

echo
echo "✨ Installation verified successfully."

printf '%b' "$NC"
