#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; CYAN='\033[1;36m'; MAGENTA='\033[1;35m'; NC='\033[0m'

NODE_DIR='/opt/nexora-node'
SERVICE_USER='nexoranode'
SERVICE_NAME='nexora-node'
NODE_MAJOR='20'
NODE_PORT="${NODE_PORT:-4000}"
REPO_OWNER='stripathi02123-tech'
REPO_NAME='Nexora-panel3-'
REPO_BRANCH='main'
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.zip"
TEMP_DIR="$(mktemp -d /tmp/nexora-node-install.XXXXXX)"
LOG_FILE='/var/log/nexora-node-install.log'
RUN_LOG="${NODE_DIR}/logs/node-agent.log"
PID_FILE="${NODE_DIR}/nexora-node.pid"

log(){ echo -e "$*"; }
ok(){ log "${GREEN}[OK]${NC} $*"; }
info(){ log "${CYAN}[INFO]${NC} $*"; }
warn(){ log "${YELLOW}[WARNING]${NC} $*"; }
err(){ log "${RED}[ERROR]${NC} $*" >&2; }
line(){ log "${MAGENTA}============================================================${NC}"; }

mkdir -p /var/log
: > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

cleanup(){ rm -rf "$TEMP_DIR" 2>/dev/null || true; }
trap cleanup EXIT

fail(){ local code=$?; err "Installation failed (exit code ${code})."; echo "Installer log: ${LOG_FILE}"; echo "Node log: ${RUN_LOG}"; exit "$code"; }
trap fail ERR

[[ ${EUID:-$(id -u)} -eq 0 ]] || { err 'Run as root: sudo bash install-node.sh'; exit 1; }

clear 2>/dev/null || true
line
log "${CYAN}NEXORA NODE AGENT INSTALLER${NC}"
line
echo "Repository : ${REPO_OWNER}/${REPO_NAME}"
echo "Install to : ${NODE_DIR}"
echo "Service    : ${SERVICE_NAME}"
echo "Port       : ${NODE_PORT}"

line
info 'Detecting system...'
source /etc/os-release
if [[ -f /etc/debian_version ]]; then
  PKG='apt-get'
elif [[ -f /etc/redhat-release ]]; then
  PKG='dnf'
else
  err 'Unsupported OS. Supported: Ubuntu/Debian and RHEL/Fedora/CentOS.'
  exit 1
fi
TOTAL_RAM_MB="$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' | head -1 || true)"
TOTAL_RAM_MB="${TOTAL_RAM_MB:-512}"
TOTAL_CORES="$(nproc 2>/dev/null || echo 1)"
info "OS: ${PRETTY_NAME:-unknown}"
info "Architecture: $(uname -m)"
info "RAM: ${TOTAL_RAM_MB} MB | CPU: ${TOTAL_CORES} cores"

line
info 'Installing required tools...'
export DEBIAN_FRONTEND=noninteractive
if [[ "$PKG" == 'apt-get' ]]; then
  dpkg --configure -a || true
  apt-get update -y
  apt-get install -y --no-upgrade --no-install-recommends ca-certificates curl unzip openssl procps iproute2 sudo iptables
else
  dnf install -y ca-certificates curl unzip openssl procps-ng iproute sudo iptables
fi
for cmd in curl unzip openssl free nproc ss sudo; do command -v "$cmd" >/dev/null 2>&1 || { err "Missing required command: $cmd"; exit 1; }; done
ok 'Required tools ready.'

line
info "Checking Node.js ${NODE_MAJOR}..."
NODE_INSTALLED_MAJOR=''
if command -v node >/dev/null 2>&1; then NODE_INSTALLED_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"; fi
if [[ "$NODE_INSTALLED_MAJOR" =~ ^[0-9]+$ ]] && (( NODE_INSTALLED_MAJOR >= NODE_MAJOR )); then
  ok "Node.js $(node -v) available."
else
  info "Installing Node.js ${NODE_MAJOR}..."
  if [[ "$PKG" == 'apt-get' ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o "$TEMP_DIR/nodesource.sh"
    bash "$TEMP_DIR/nodesource.sh"
    apt-get install -y --no-upgrade nodejs
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" -o "$TEMP_DIR/nodesource.sh"
    bash "$TEMP_DIR/nodesource.sh"
    dnf install -y nodejs
  fi
fi
command -v node >/dev/null 2>&1 || { err 'Node.js unavailable.'; exit 1; }
command -v npm >/dev/null 2>&1 || { err 'npm unavailable.'; exit 1; }
ok "Node: $(node -v) | npm: $(npm -v)"

line
info 'Preparing Node Agent source...'
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home-dir "$NODE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$NODE_DIR" "$NODE_DIR/data" "$NODE_DIR/logs"
OLD_SECRET=''
if [[ -f "$NODE_DIR/.env" ]]; then OLD_SECRET="$(sed -n 's/^NODE_SECRET=//p' "$NODE_DIR/.env" | head -1 || true)"; fi

curl --fail --location --silent --show-error --retry 5 --retry-all-errors --connect-timeout 15 --max-time 180 "$REPO_URL" -o "$TEMP_DIR/repo.zip"
unzip -q "$TEMP_DIR/repo.zip" -d "$TEMP_DIR"
EXTRACTED_DIR="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'Nexora-panel3--*' -print -quit)"
[[ -n "$EXTRACTED_DIR" && -d "$EXTRACTED_DIR/node-system" ]] || { err 'node-system directory missing from downloaded repository.'; exit 1; }

find "$NODE_DIR" -mindepth 1 -maxdepth 1 \
  ! -name '.env' \
  ! -name 'data' \
  ! -name 'logs' \
  ! -name 'NODE_CREDENTIALS.txt' \
  ! -name 'nexora-node.pid' \
  -exec rm -rf {} +
cp -a "$EXTRACTED_DIR/node-system/." "$NODE_DIR/"
rm -f "$NODE_DIR/install-node.sh" "$NODE_DIR/uninstall-node.sh" "$NODE_DIR/install.sh"
rm -rf "$NODE_DIR/node_modules"
mkdir -p "$NODE_DIR/data" "$NODE_DIR/logs"
chown -R "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR"
ok 'Node Agent source ready.'

line
info 'Installing Node Agent dependencies...'
cd "$NODE_DIR"
[[ -f package.json ]] || { err 'package.json missing from node-system.'; exit 1; }
mkdir -p "$NODE_DIR/.npm-cache"
chown -R "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR/.npm-cache"
run_node(){
  if command -v runuser >/dev/null 2>&1; then runuser -u "$SERVICE_USER" -- "$@"; else sudo -u "$SERVICE_USER" -H "$@"; fi
}
run_node env HOME="$NODE_DIR" npm install --omit=dev --no-audit --no-fund --cache "$NODE_DIR/.npm-cache"

PANEL_SECRET="${NODE_SECRET:-}"
if [[ -n "$PANEL_SECRET" ]]; then
  NODE_SECRET="$PANEL_SECRET"
  ok 'Using NODE_SECRET supplied by Nexora Panel.'
elif [[ -n "$OLD_SECRET" ]]; then
  NODE_SECRET="$OLD_SECRET"
  ok 'Preserved existing NODE_SECRET.'
else
  echo
  warn 'A Panel-generated NODE_SECRET is required for a new node.'
  read -r -s -p 'Panel-generated NODE_SECRET: ' NODE_SECRET
  echo
fi
[[ -n "$NODE_SECRET" ]] || { err 'NODE_SECRET is required.'; exit 1; }
(( ${#NODE_SECRET} >= 32 )) || { err 'NODE_SECRET is too short. Use the secret generated by the Panel.'; exit 1; }

SAFE_RAM_MB=$(( TOTAL_RAM_MB * 85 / 100 )); (( SAFE_RAM_MB < 256 )) && SAFE_RAM_MB=256
cat > "$NODE_DIR/.env" <<EOF
PORT=${NODE_PORT}
HOST=0.0.0.0
NODE_ENV=production
NODE_SECRET=${NODE_SECRET}
MAX_TOTAL_RAM_MB=${SAFE_RAM_MB}
MAX_TOTAL_CPU_CORES=${TOTAL_CORES}
METRICS_INTERVAL_MS=5000
LOG_LEVEL=info
LOG_DIR=./logs
EOF
chown "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR/.env"
chmod 600 "$NODE_DIR/.env"

PUBLIC_IP="$(curl -4 -fsSL --max-time 5 https://ifconfig.me 2>/dev/null || true)"
PUBLIC_IP="${PUBLIC_IP:-$(hostname -I 2>/dev/null | awk '{print $1}' || true)}"
cat > "$NODE_DIR/NODE_CREDENTIALS.txt" <<EOF
Nexora Node Agent — Panel connection details
Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')

Type:        AGENT
Host:        ${PUBLIC_IP:-YOUR_SERVER_IP}
Port:        ${NODE_PORT}
Credentials: ${NODE_SECRET}
EOF
chown "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR/NODE_CREDENTIALS.txt"
chmod 600 "$NODE_DIR/NODE_CREDENTIALS.txt"
ok 'Node configuration ready.'

line
info "Opening TCP ${NODE_PORT} where possible..."
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then ufw allow "${NODE_PORT}/tcp" >/dev/null 2>&1 || true; fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --permanent --add-port="${NODE_PORT}/tcp" >/dev/null 2>&1 || true; firewall-cmd --reload >/dev/null 2>&1 || true; fi
if command -v iptables >/dev/null 2>&1; then iptables -C INPUT -p tcp --dport "$NODE_PORT" -j ACCEPT >/dev/null 2>&1 || iptables -I INPUT -p tcp --dport "$NODE_PORT" -j ACCEPT >/dev/null 2>&1 || true; fi

line
info 'Starting Nexora Node Agent...'
NODE_BIN="$(command -v node)"
SYSTEMD_OK=false
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]] && [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" == 'systemd' ]]; then SYSTEMD_OK=true; fi

if $SYSTEMD_OK; then
  touch "$RUN_LOG"; chown "$SERVICE_USER:$SERVICE_USER" "$RUN_LOG"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF_SERVICE
[Unit]
Description=Nexora Node Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${NODE_DIR}
EnvironmentFile=${NODE_DIR}/.env
ExecStart=${NODE_BIN} ${NODE_DIR}/src/index.js
Restart=always
RestartSec=5
LimitNOFILE=65536
NoNewPrivileges=true
StandardOutput=append:${RUN_LOG}
StandardError=append:${RUN_LOG}

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
else
  pkill -u "$SERVICE_USER" -f "${NODE_DIR}/src/index.js" 2>/dev/null || true
  if ss -H -ltn "sport = :${NODE_PORT}" 2>/dev/null | grep -q .; then
    err "Port ${NODE_PORT} is already in use."
    ss -lntp 2>/dev/null | grep ":${NODE_PORT}" || true
    exit 1
  fi
  touch "$RUN_LOG"; chown "$SERVICE_USER:$SERVICE_USER" "$RUN_LOG"
  rm -f "$PID_FILE"
  run_node sh -c "cd '$NODE_DIR' && nohup '$NODE_BIN' '$NODE_DIR/src/index.js' >> '$RUN_LOG' 2>&1 < /dev/null & echo \$! > '$PID_FILE'"
fi

sleep 3

line
info 'Verifying Node Agent...'
if $SYSTEMD_OK; then
  systemctl is-active --quiet "$SERVICE_NAME" || { err 'Node Agent service failed to start.'; journalctl -u "$SERVICE_NAME" -n 100 --no-pager || true; exit 1; }
else
  [[ -f "$PID_FILE" ]] || { err 'Node PID file was not created.'; exit 1; }
  PID="$(cat "$PID_FILE")"
  [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null || { err 'Node Agent process failed to start.'; tail -n 100 "$RUN_LOG" || true; exit 1; }
fi
if ! ss -H -ltn "sport = :${NODE_PORT}" 2>/dev/null | grep -q .; then
  err "Node Agent is not listening on TCP ${NODE_PORT}."
  tail -n 100 "$RUN_LOG" || true
  exit 1
fi

ok "Nexora Node Agent is running on port ${NODE_PORT}."
line
log "${GREEN}INSTALLATION COMPLETE${NC}"
echo "Node URL       : http://${PUBLIC_IP:-YOUR_SERVER_IP}:${NODE_PORT}"
echo "Install Dir    : ${NODE_DIR}"
echo "Service        : ${SERVICE_NAME}"
echo "Node Secret    : stored in ${NODE_DIR}/.env"
echo "Credentials    : ${NODE_DIR}/NODE_CREDENTIALS.txt"
echo "Logs           : ${RUN_LOG}"
log '============================================================'
