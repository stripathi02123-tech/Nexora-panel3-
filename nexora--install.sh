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
SERVICE_NAME='nexora-bot'
INSTALL_DIR='/opt/nexora'
REPO_URL='https://github.com/stripathi02123-tech/Nexora-panel3-.git'
BRANCH='main'
NODE_MAJOR='22'

BACKEND_PORT_DEFAULT=3000
PANEL_PORT_DEFAULT=8080
BACKEND_PORT="${BACKEND_PORT:-$BACKEND_PORT_DEFAULT}"
PANEL_PORT="${PANEL_PORT:-$PANEL_PORT_DEFAULT}"

SERVER_DIR="${INSTALL_DIR}/server"
CLIENT_DIR="${INSTALL_DIR}/client"
ENV_FILE="${SERVER_DIR}/.env"
DB_FILE="${SERVER_DIR}/prisma/dev.db"
PID_FILE="${INSTALL_DIR}/nexora.pid"
LOG_DIR='/var/log/nexora'
LOG_FILE="${LOG_DIR}/app.log"
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
random_password(){
  local password
  password="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9@#%+=_' | head -c 20 || true)"
  [ "${#password}" -ge 12 ] || password="Nexora$(openssl rand -hex 8)!"
  printf '%s' "$password"
}

set_env(){
  local key="$1" value="$2"
  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "$key" "$value" >> "${ENV_FILE}"
  fi
}

get_env(){
  local key="$1"
  sed -n "s/^${key}=//p" "${ENV_FILE}" 2>/dev/null | head -n1 || true
}

ask(){
  local prompt="$1" default="$2" reply=''
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b' "${CYAN}[?]${NC} ${prompt}" > /dev/tty
    read -r reply < /dev/tty || reply=''
  fi
  echo "${reply:-$default}"
}

ask_secret(){
  local prompt="$1" default="$2" reply=''
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%b' "${CYAN}[?]${NC} ${prompt}" > /dev/tty
    read -rs reply < /dev/tty || reply=''
    printf '\n' > /dev/tty
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
  [[ "$reply" =~ ^[Yy] ]]
}

stop_existing(){
  local pids pid

  if [ -f "${PID_FILE}" ]; then
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      info "Stopping Nexora process ${pid}..."
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  pids="$(pgrep -f "${SERVER_DIR}/dist/index.js" 2>/dev/null || true)"
  for pid in $pids; do
    [ "$pid" = "$$" ] && continue
    kill "$pid" 2>/dev/null || true
  done

  rm -f "${PID_FILE}"
}

start_non_systemd(){
  stop_existing
  touch "${LOG_FILE}"
  chown nexora:nexora "${LOG_FILE}"

  runuser -u nexora -- bash -lc '
    cd /opt/nexora/server
    nohup env NODE_ENV=production DATABASE_URL="file:/opt/nexora/server/prisma/dev.db" /usr/bin/node /opt/nexora/server/dist/index.js >> /var/log/nexora/app.log 2>&1 < /dev/null &
    echo $! > /opt/nexora/nexora.pid
  '

  local pid
  pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    error 'Nexora PID was not created.'
    return 1
  fi

  for _ in {1..20}; do
    if kill -0 "$pid" 2>/dev/null; then return 0; fi
    sleep 0.25
  done

  error 'Nexora process failed to stay running.'
  tail -n 100 "${LOG_FILE}" || true
  return 1
}

start_systemd(){
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
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
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
  systemctl restart "${SERVICE_NAME}"
}

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

if [ "$EUID" -ne 0 ]; then
  error 'Run as root: sudo bash nexora--install.sh'
  exit 1
fi

source /etc/os-release
info "OS: ${PRETTY_NAME:-unknown}"
info "Architecture: $(uname -m)"
line

export DEBIAN_FRONTEND=noninteractive
info 'Installing required packages...'
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl nginx openssl build-essential python3 python3-pip unzip jq iproute2 iptables git util-linux
ok 'System dependencies ready.'
line

info "Preparing Node.js ${NODE_MAJOR}..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//' | cut -d. -f1)" != "${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash
  apt-get install -y nodejs
fi
command -v node >/dev/null || { error 'Node.js is unavailable'; exit 1; }
command -v npm >/dev/null || { error 'npm is unavailable'; exit 1; }
info "Node: $(node -v)"
info "npm:  $(npm -v)"
ok 'Node.js ready.'
line

info "Preparing ${APP_NAME} source..."
mkdir -p /opt "${BACKUP_DIR}" "${LOG_DIR}"

# Stop old instances before touching the database/source.
if [ -d "${INSTALL_DIR}" ]; then
  stop_existing || true
fi

DB_BACKUP=''
if [ -f "${DB_FILE}" ]; then
  DB_BACKUP="${BACKUP_DIR}/dev.db.$(date +%Y%m%d-%H%M%S).bak"
  cp -a "${DB_FILE}" "${DB_BACKUP}"
  info "Database backup: ${DB_BACKUP}"
fi

if [ -d "${INSTALL_DIR}/.git" ]; then
  cd "${INSTALL_DIR}"
  git remote set-url origin "${REPO_URL}"
  git fetch --prune origin "${BRANCH}"
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
else
  if [ -e "${INSTALL_DIR}" ]; then
    mv "${INSTALL_DIR}" "${BACKUP_DIR}/nexora-source-$(date +%Y%m%d-%H%M%S)"
  fi
  git clone --depth 1 --branch "${BRANCH}" --no-tags "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"
[ -f package.json ] || { error 'Invalid Nexora repository: root package.json missing.'; exit 1; }
[ -d server ] || { error 'Invalid Nexora repository: server directory missing.'; exit 1; }
[ -d client ] || { error 'Invalid Nexora repository: client directory missing.'; exit 1; }

if [ -n "${DB_BACKUP}" ] && [ -f "${DB_BACKUP}" ]; then
  mkdir -p "${SERVER_DIR}/prisma"
  cp -a "${DB_BACKUP}" "${DB_FILE}"
  info 'Existing database restored.'
fi

ok 'Source ready.'
line

info 'Selecting ports...'
if port_in_use "$BACKEND_PORT"; then
  BACKEND_PORT="$(choose_free_port 3000 3099)" || { error 'No free backend port in 3000-3099'; exit 1; }
  warn "Backend port was busy; using ${BACKEND_PORT}."
fi
if port_in_use "$PANEL_PORT"; then
  PANEL_PORT="$(choose_free_port 8080 8099)" || { error 'No free panel port in 8080-8099'; exit 1; }
  warn "Panel port was busy; using ${PANEL_PORT}."
fi
info "Backend: ${BACKEND_PORT} | Panel: ${PANEL_PORT}"
line

info 'Installation options'
PANEL_DOMAIN="${PANEL_DOMAIN:-$(ask 'Domain pointed at this server (blank = raw IP): ' '')}"
ADMIN_EMAIL="${ADMIN_EMAIL:-$(ask 'Admin login email [admin@nexora.local]: ' 'admin@nexora.local')}"
ADMIN_EMAIL="$(printf '%s' "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
ADMIN_PASSWORD_INPUT="${ADMIN_PASSWORD:-$(ask_secret 'Admin password (blank = auto-generate): ' '')}"
RESET_ADMIN_PASSWORD="${RESET_ADMIN_PASSWORD:-false}"

ENABLE_SSL='false'
if [ -n "${PANEL_DOMAIN}" ] && ask_yes_no "Enable HTTPS with Let’s Encrypt for ${PANEL_DOMAIN}? [y/N]: " 'N'; then
  ENABLE_SSL='true'
fi

CLIENT_API_URL="${CLIENT_API_URL:-/api}"
CLIENT_SOCKET_URL="${CLIENT_SOCKET_URL:-}"
line

info 'Installing application dependencies...'
rm -rf node_modules server/node_modules client/node_modules
npm install --no-audit --no-fund --registry https://registry.npmjs.org/
(cd server && npm install --no-audit --no-fund --registry https://registry.npmjs.org/)
(cd client && npm install --no-audit --no-fund --registry https://registry.npmjs.org/)
ok 'Application dependencies installed.'
line

info 'Configuring environment...'
mkdir -p "${LOG_DIR}" "${SERVER_DIR}/prisma"
touch "${LOG_FILE}"

PUBLIC_IP="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
PUBLIC_IP="${PUBLIC_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"

APP_URL_VALUE="http://${PUBLIC_IP}:${PANEL_PORT}"
if [ -n "${PANEL_DOMAIN}" ]; then
  APP_URL_VALUE="http://${PANEL_DOMAIN}"
  if [ "${ENABLE_SSL}" = 'true' ]; then APP_URL_VALUE="https://${PANEL_DOMAIN}"; fi
fi

# Preserve an existing CORS override. Otherwise use the panel URL. The backend
# separately permits supported CodeSandbox preview origins.
EXISTING_CORS="$(get_env CORS_ORIGIN)"
REQUESTED_CORS="${CORS_ORIGIN:-${EXISTING_CORS:-${APP_URL_VALUE}}}"

if [ ! -f "${ENV_FILE}" ]; then
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${BACKEND_PORT}
DATABASE_URL=file:${DB_FILE}
JWT_SECRET=$(random_hex)
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=$(random_hex)
APP_URL=${APP_URL_VALUE}
CORS_ORIGIN=${REQUESTED_CORS}
PROXMOX_TIMEOUT=30000
DOCKER_TIMEOUT=30000
EOF
else
  set_env NODE_ENV production
  set_env PORT "${BACKEND_PORT}"
  set_env DATABASE_URL "file:${DB_FILE}"
  set_env APP_URL "${APP_URL_VALUE}"
  set_env CORS_ORIGIN "${REQUESTED_CORS}"
  if ! grep -q '^JWT_SECRET=' "${ENV_FILE}"; then set_env JWT_SECRET "$(random_hex)"; fi
  if ! grep -q '^ENCRYPTION_KEY=' "${ENV_FILE}"; then set_env ENCRYPTION_KEY "$(random_hex)"; fi
  if ! grep -q '^JWT_EXPIRES_IN=' "${ENV_FILE}"; then set_env JWT_EXPIRES_IN 7d; fi
  if ! grep -q '^PROXMOX_TIMEOUT=' "${ENV_FILE}"; then set_env PROXMOX_TIMEOUT 30000; fi
  if ! grep -q '^DOCKER_TIMEOUT=' "${ENV_FILE}"; then set_env DOCKER_TIMEOUT 30000; fi
fi
chmod 600 "${ENV_FILE}"

# Vite production configuration. /api remains the safe same-origin default;
# set CLIENT_API_URL to an absolute HTTPS API URL for separately hosted frontends.
cat > "${CLIENT_DIR}/.env.production" <<EOF
VITE_API_URL=${CLIENT_API_URL}
VITE_SOCKET_URL=${CLIENT_SOCKET_URL}
EOF

ok 'Environment configured.'
line

info 'Preparing database...'
(cd "${SERVER_DIR}" && npx --no-install prisma generate)
(cd "${SERVER_DIR}" && npx --no-install prisma db push --skip-generate)

if ! id -u nexora >/dev/null 2>&1; then
  useradd --system --home-dir "${INSTALL_DIR}" --shell /usr/sbin/nologin nexora
fi

chown -R nexora:nexora "${SERVER_DIR}/prisma" "${LOG_DIR}"
chmod 770 "${SERVER_DIR}/prisma"
[ -f "${DB_FILE}" ] && chmod 660 "${DB_FILE}" || true

# Prisma write smoke test using exactly the configured absolute database.
runuser -u nexora -- env DATABASE_URL="file:${DB_FILE}" node <<'NODE'
const { PrismaClient } = require('/opt/nexora/server/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "__nexora_install_test" (id INTEGER PRIMARY KEY)');
    await prisma.$executeRawUnsafe('INSERT INTO "__nexora_install_test" DEFAULT VALUES');
    await prisma.$executeRawUnsafe('DROP TABLE "__nexora_install_test"');
    console.log('Prisma SQLite write test: OK');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
NODE

ok 'Database ready and writable.'
line

# =========================================================
# ADMIN ACCOUNT
# =========================================================

ADMIN_EXISTS=$(
  runuser -u nexora -- env ADMIN_EMAIL="${ADMIN_EMAIL}" DATABASE_URL="file:${DB_FILE}" \
  node <<'NODE'
const { PrismaClient } = require('/opt/nexora/server/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    process.stdout.write(user ? 'yes' : 'no');
  } catch {
    process.stdout.write('no');
  } finally {
    await prisma.$disconnect();
  }
})();
NODE
)

NEW_ADMIN_PASSWORD=''
RESET_FLAG="$(printf '%s' "${RESET_ADMIN_PASSWORD}" | tr '[:upper:]' '[:lower:]')"
FORCE_RESET='false'
[[ "$RESET_FLAG" =~ ^(true|1|yes|y)$ ]] && FORCE_RESET='true'

if [ "${ADMIN_EXISTS}" != 'yes' ]; then
  NEW_ADMIN_PASSWORD="${ADMIN_PASSWORD_INPUT:-$(random_password)}"
  info "Creating administrator: ${ADMIN_EMAIL}"

  ADMIN_EMAIL="${ADMIN_EMAIL}" ADMIN_PASSWORD="${NEW_ADMIN_PASSWORD}" DATABASE_URL="file:${DB_FILE}" \
  runuser -u nexora -- node <<'NODE'
const { PrismaClient } = require('/opt/nexora/server/node_modules/@prisma/client');
const bcrypt = require('/opt/nexora/server/node_modules/bcryptjs');
const prisma = new PrismaClient();
(async () => {
  try {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: { password: hash, isActive: true, role: 'ADMIN' },
      create: { email, password: hash, name: 'Administrator', role: 'ADMIN', isActive: true },
    });
    console.log(`Admin account ready: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
NODE
elif [ "${FORCE_RESET}" = 'true' ]; then
  NEW_ADMIN_PASSWORD="${ADMIN_PASSWORD_INPUT:-$(random_password)}"
  info "Resetting administrator password: ${ADMIN_EMAIL}"

  ADMIN_EMAIL="${ADMIN_EMAIL}" ADMIN_PASSWORD="${NEW_ADMIN_PASSWORD}" DATABASE_URL="file:${DB_FILE}" \
  runuser -u nexora -- node <<'NODE'
const { PrismaClient } = require('/opt/nexora/server/node_modules/@prisma/client');
const bcrypt = require('/opt/nexora/server/node_modules/bcryptjs');
const prisma = new PrismaClient();
(async () => {
  try {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`Admin account not found: ${email}`);
    await prisma.user.update({ where: { email }, data: { password: hash, isActive: true, role: 'ADMIN' } });
    console.log(`Admin password reset: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
NODE
else
  info "Admin account already exists: ${ADMIN_EMAIL}"
fi

if [ -n "${NEW_ADMIN_PASSWORD}" ]; then
  CREDENTIALS_FILE="${INSTALL_DIR}/ADMIN_CREDENTIALS.txt"
  cat > "${CREDENTIALS_FILE}" <<EOF
Nexora Panel — Administrator Credentials
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

Email    : ${ADMIN_EMAIL}
Password : ${NEW_ADMIN_PASSWORD}

Delete this file after saving the credentials.
EOF
  chmod 600 "${CREDENTIALS_FILE}"
fi

line
info 'Building server and client...'
npm run build:server
npm run build:client
ok 'Build complete.'

# Ensure build artifacts remain readable by the service and Nginx.
chown -R nexora:nexora "${SERVER_DIR}" "${CLIENT_DIR}"
chmod 600 "${ENV_FILE}"
line

info 'Starting Nexora...'
if systemd_available; then
  start_systemd
  systemctl is-active --quiet "${SERVICE_NAME}" || {
    systemctl status "${SERVICE_NAME}" --no-pager || true
    journalctl -u "${SERVICE_NAME}" -n 100 --no-pager || true
    exit 1
  }
else
  start_non_systemd
fi

line

info 'Configuring Nginx...'
cat > "${NGINX_SITE}" <<EOF
server {
    listen ${PANEL_PORT};
    listen [::]:${PANEL_PORT};
    server_name _;

    root ${CLIENT_DIR}/dist;
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
        proxy_read_timeout 3600s;
    }
}
EOF

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

if ! port_in_use "${PANEL_PORT}"; then
  error "Nginx is not listening on ${PANEL_PORT}."
  exit 1
fi
ok "Nginx listening on ${PANEL_PORT}."

if [ "${ENABLE_SSL}" = 'true' ]; then
  info "Installing Certbot..."
  apt-get install -y --no-install-recommends certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos --redirect -m "${ADMIN_EMAIL}" -d "${PANEL_DOMAIN}"
  ok "HTTPS enabled for ${PANEL_DOMAIN}."
fi

line
info 'Running health checks...'

HEALTH_OK='false'
for _ in {1..20}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
    HEALTH_OK='true'
    break
  fi
  sleep 1
done

[ "${HEALTH_OK}" = 'true' ] || {
  error "Backend health check failed on port ${BACKEND_PORT}."
  if systemd_available; then journalctl -u "${SERVICE_NAME}" -n 100 --no-pager || true; else tail -n 100 "${LOG_FILE}" || true; fi
  exit 1
}
ok 'Backend health check passed.'

curl -fsS --max-time 5 "http://127.0.0.1:${PANEL_PORT}/" >/dev/null || {
  error "Panel HTTP check failed on port ${PANEL_PORT}."
  exit 1
}
ok 'Panel health check passed.'

# Verify the actual dynamic CodeSandbox CORS rule without storing a changing
# CodeSandbox origin in .env.
TEST_CSB_ORIGIN='https://nexora-test-8080.csb.app'
CSB_HEADER="$(curl -si --max-time 5 -H "Origin: ${TEST_CSB_ORIGIN}" "http://127.0.0.1:${BACKEND_PORT}/api/health" | grep -i '^Access-Control-Allow-Origin:' || true)"
if echo "${CSB_HEADER}" | grep -qi "${TEST_CSB_ORIGIN}"; then
  ok 'CodeSandbox CORS check passed.'
else
  warn 'CodeSandbox CORS header was not observed; verify the built server is the current main branch.'
fi

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

line
clear || true
printf '%b' "$GREEN"
cat <<EOF

╔══════════════════════════════════════════════════════════╗
║             NEXORA PANEL INSTALLATION COMPLETE           ║
╚══════════════════════════════════════════════════════════╝

✅ STATUS            : VERIFIED & RUNNING
🌐 PANEL URL         : ${APP_URL_VALUE}
⚙️  BACKEND PORT      : ${BACKEND_PORT}
📁 INSTALL DIR       : ${INSTALL_DIR}
🔧 SERVICE           : ${SERVICE_NAME}
📋 LOG FILE          : ${LOG_FILE}

EOF

if [ -n "${NEW_ADMIN_PASSWORD}" ]; then
  echo "👤 ADMIN CREDENTIALS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Email    : ${ADMIN_EMAIL}"
  echo "Password : ${NEW_ADMIN_PASSWORD}"
  echo
  echo "Credentials file: ${INSTALL_DIR}/ADMIN_CREDENTIALS.txt"
elif [ -n "${ADMIN_EMAIL}" ]; then
  echo "👤 ADMIN ACCOUNT"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Email    : ${ADMIN_EMAIL}"
  echo "Password : unchanged"
fi

echo
echo "📖 SERVICE COMMANDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if systemd_available; then
  echo "systemctl status ${SERVICE_NAME} --no-pager"
  echo "systemctl restart ${SERVICE_NAME}"
  echo "journalctl -u ${SERVICE_NAME} -f"
else
  echo "cat ${PID_FILE}"
  echo "tail -f ${LOG_FILE}"
  echo "kill \$(cat ${PID_FILE})"
fi

echo
echo "✨ Installation verified successfully."
printf '%b' "$NC"
