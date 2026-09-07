#!/usr/bin/env bash
#
# Nexora Node Agent — production installer
#
# The Nexora Panel is the source of truth for NODE_SECRET.
#
# Fresh install with Panel-generated secret:
#   sudo env NODE_SECRET='<PANEL_GENERATED_SECRET>' bash install-node.sh
#
# Download then run:
#   curl -fsSL "https://raw.githubusercontent.com/stripathi02123-tech/Nexora-panel3/main/node-system/install-node.sh?$(date +%s)" -o /tmp/nexora-node-install.sh
#   sudo env NODE_SECRET='<PANEL_GENERATED_SECRET>' bash /tmp/nexora-node-install.sh
#
set -Eeuo pipefail
IFS=$'\n\t'

NODE_DIR="/opt/nexora-node"
SERVICE_USER="nexoranode"
SERVICE_NAME="nexora-node"
NODE_MAJOR="20"
NODE_PORT="4000"
REPO_OWNER="stripathi02123-tech"
REPO_NAME="Nexora-panel3"
REPO_BRANCH="main"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/${REPO_BRANCH}.zip"
TEMP_DIR="$(mktemp -d)"
LOG_FILE="/var/log/nexora-node-install.log"
RUN_LOG="${NODE_DIR}/logs/node-agent.log"
PID_FILE="${NODE_DIR}/nexora-node.pid"

RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; CYAN='\033[1;36m'; MAGENTA='\033[1;35m'; NC='\033[0m'

c_green(){ echo -e "${GREEN}$*${NC}"; }
c_yellow(){ echo -e "${YELLOW}$*${NC}"; }
c_red(){ echo -e "${RED}$*${NC}" >&2; }
c_cyan(){ echo -e "${CYAN}$*${NC}"; }
step(){ echo; echo -e "${CYAN}[$1]${NC} $2"; }
line(){ echo -e "${MAGENTA}============================================================${NC}"; }

mkdir -p /var/log 2>/dev/null || true
touch "$LOG_FILE" 2>/dev/null || true
exec > >(tee -a "$LOG_FILE") 2>&1

cleanup(){ rm -rf "$TEMP_DIR" 2>/dev/null || true; }
trap cleanup EXIT

on_error(){
  local code=$?
  c_red "Installation failed (exit code ${code})."
  echo "Installer log: ${LOG_FILE}"
  echo "Node log: ${RUN_LOG}"
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    echo "Service log: journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
  else
    echo "Use: tail -n 100 ${RUN_LOG}"
  fi
  exit "$code"
}
trap on_error ERR

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  c_red "Run as root: sudo bash install-node.sh"
  exit 1
fi

clear 2>/dev/null || true
line
c_cyan "NEXORA NODE AGENT INSTALLER"
line
echo "Repository : ${REPO_OWNER}/${REPO_NAME}"
echo "Install to : ${NODE_DIR}"
echo "Service    : ${SERVICE_NAME}"
echo "Port       : ${NODE_PORT}"

# ── 1. System detection ─────────────────────────────────────────────────────
step "1/8" "Detecting system..."
if [[ ! -f /etc/os-release ]]; then
  c_red "/etc/os-release not found."
  exit 1
fi
# shellcheck disable=SC1091
source /etc/os-release

if [[ -f /etc/debian_version ]]; then
  PKG="apt-get"
elif [[ -f /etc/redhat-release ]]; then
  PKG="dnf"
else
  c_red "Unsupported OS. Supported: Ubuntu/Debian and RHEL/Fedora/CentOS."
  exit 1
fi

TOTAL_RAM_MB="$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' | head -1 || true)"
TOTAL_CORES="$(nproc 2>/dev/null || echo 1)"
TOTAL_RAM_MB="${TOTAL_RAM_MB:-512}"
TOTAL_CORES="${TOTAL_CORES:-1}"

get_public_ip(){
  local ip=""
  ip="$(curl -4 -fsSL --max-time 5 https://ifconfig.me 2>/dev/null || true)"
  [[ -n "$ip" ]] || ip="$(curl -4 -fsSL --max-time 5 https://icanhazip.com 2>/dev/null || true)"
  [[ -n "$ip" ]] || ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  printf '%s' "${ip:-YOUR_SERVER_IP}"
}

c_green "OS: ${PRETTY_NAME:-unknown}"
c_green "Architecture: $(uname -m)"
c_green "RAM: ${TOTAL_RAM_MB} MB | CPU: ${TOTAL_CORES} cores"

# ── 2. Required tools ───────────────────────────────────────────────────────
step "2/8" "Installing required tools..."
export DEBIAN_FRONTEND=noninteractive

if [[ "$PKG" == "apt-get" ]]; then
  dpkg --configure -a || true
  apt-get update -y
  apt-get install -y --no-install-recommends ca-certificates curl unzip openssl procps iproute2 sudo iptables
else
  dnf install -y ca-certificates curl unzip openssl procps-ng iproute sudo iptables
fi

for cmd in curl unzip openssl free nproc ss sudo; do
  command -v "$cmd" >/dev/null 2>&1 || { c_red "Missing required command: $cmd"; exit 1; }
done

# ── 3. Node.js ──────────────────────────────────────────────────────────────
step "3/8" "Checking Node.js ${NODE_MAJOR}..."
NODE_MAJOR_INSTALLED=""
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR_INSTALLED="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
fi

if [[ "$NODE_MAJOR_INSTALLED" =~ ^[0-9]+$ ]] && (( NODE_MAJOR_INSTALLED >= NODE_MAJOR )); then
  c_green "Node.js $(node -v) available."
else
  c_yellow "Installing Node.js ${NODE_MAJOR}.x..."
  if [[ "$PKG" == "apt-get" ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o "$TEMP_DIR/nodesource.sh"
    bash "$TEMP_DIR/nodesource.sh"
    apt-get install -y nodejs
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" -o "$TEMP_DIR/nodesource.sh"
    bash "$TEMP_DIR/nodesource.sh"
    dnf install -y nodejs
  fi
fi

command -v node >/dev/null 2>&1 || { c_red "Node.js unavailable."; exit 1; }
command -v npm >/dev/null 2>&1 || { c_red "npm unavailable."; exit 1; }
c_green "Node: $(node -v) | npm: $(npm -v)"

# ── 4. Account + source ─────────────────────────────────────────────────────
step "4/8" "Preparing Node Agent source..."
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home-dir "$NODE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$NODE_DIR"

OLD_SECRET=""
if [[ -f "$NODE_DIR/.env" ]]; then
  OLD_SECRET="$(sed -n 's/^NODE_SECRET=//p' "$NODE_DIR/.env" | head -1 || true)"
fi

curl -fsSL "$REPO_URL" -o "$TEMP_DIR/repo.zip"
unzip -q "$TEMP_DIR/repo.zip" -d "$TEMP_DIR"
EXTRACTED_DIR="$TEMP_DIR/${REPO_NAME}-${REPO_BRANCH}"
[[ -d "$EXTRACTED_DIR/node-system" ]] || { c_red "node-system directory missing from repository."; exit 1; }

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
c_green "Node Agent source ready."

# ── 5. Dependencies + Panel secret ─────────────────────────────────────────
step "5/8" "Installing dependencies and configuring Panel-generated secret..."
cd "$NODE_DIR"
[[ -f package.json ]] || { c_red "package.json missing."; exit 1; }
mkdir -p "$NODE_DIR/.npm-cache"
chown -R "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR/.npm-cache"

run_as_node_user(){
  if command -v runuser >/dev/null 2>&1; then
    runuser -u "$SERVICE_USER" -- "$@"
  else
    sudo -u "$SERVICE_USER" -H "$@"
  fi
}

run_as_node_user env HOME="$NODE_DIR" npm install --omit=dev --no-audit --no-fund --cache "$NODE_DIR/.npm-cache"

# Priority: Panel-provided secret > existing secret on this node > prompt.
PANEL_SECRET="${NODE_SECRET:-}"
if [[ -n "$PANEL_SECRET" ]]; then
  NODE_SECRET="$PANEL_SECRET"
  c_green "Using NODE_SECRET generated by Nexora Panel."
elif [[ -n "$OLD_SECRET" ]]; then
  NODE_SECRET="$OLD_SECRET"
  c_green "Preserved existing NODE_SECRET."
else
  echo
  c_yellow "A Panel-generated NODE_SECRET is required for a new Node."
  echo "Create an AGENT node in Nexora Panel first."
  echo "Then paste the generated secret below."
  echo
  read -r -s -p "Panel-generated NODE_SECRET: " NODE_SECRET
  echo
fi

if [[ -z "$NODE_SECRET" ]]; then
  c_red "NODE_SECRET is required."
  exit 1
fi
if [[ ${#NODE_SECRET} -lt 32 ]]; then
  c_red "NODE_SECRET is too short. Use the secret generated by the Nexora Panel."
  exit 1
fi

SAFE_RAM_MB=$(( TOTAL_RAM_MB * 85 / 100 ))
(( SAFE_RAM_MB < 256 )) && SAFE_RAM_MB=256

cat > "$NODE_DIR/.env" <<EOF_ENV
PORT=${NODE_PORT}
HOST=0.0.0.0
NODE_ENV=production
NODE_SECRET=${NODE_SECRET}
MAX_TOTAL_RAM_MB=${SAFE_RAM_MB}
MAX_TOTAL_CPU_CORES=${TOTAL_CORES}
METRICS_INTERVAL_MS=5000
LOG_LEVEL=info
LOG_DIR=./logs
EOF_ENV

chown "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR/.env"
chmod 600 "$NODE_DIR/.env"
chown -R "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR/data" "$NODE_DIR/logs"

PUBLIC_IP="$(get_public_ip)"
if [[ "$PUBLIC_IP" == "YOUR_SERVER_IP" ]]; then
  c_yellow "Could not auto-detect this server's public IP (outbound curl to ifconfig.me/icanhazip.com failed and no local IP was found)."
  c_yellow "Do NOT paste 'YOUR_SERVER_IP' into the Panel — enter this VPS's real public IP or hostname as the node Host instead."
fi
cat > "$NODE_DIR/NODE_CREDENTIALS.txt" <<EOF_CREDS
Nexora Node Agent — Panel connection details
Generated: $(date)

Type:        AGENT
Host:        ${PUBLIC_IP}
Port:        ${NODE_PORT}
Credentials: ${NODE_SECRET}

Same-machine panel:
Host:        127.0.0.1
Port:        ${NODE_PORT}
Credentials: ${NODE_SECRET}
EOF_CREDS
chown "$SERVICE_USER:$SERVICE_USER" "$NODE_DIR/NODE_CREDENTIALS.txt"
chmod 600 "$NODE_DIR/NODE_CREDENTIALS.txt"
c_green "Configuration ready."

# ── 6. Firewall ─────────────────────────────────────────────────────────────
step "6/8" "Opening TCP ${NODE_PORT} where possible..."
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow "${NODE_PORT}/tcp" comment "nexora-node" >/dev/null 2>&1 || true
  c_green "UFW allows ${NODE_PORT}/tcp."
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="${NODE_PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  c_green "firewalld allows ${NODE_PORT}/tcp."
fi
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "$NODE_PORT" -j ACCEPT >/dev/null 2>&1 || \
    iptables -I INPUT -p tcp --dport "$NODE_PORT" -j ACCEPT >/dev/null 2>&1 || true
  c_green "iptables checked for ${NODE_PORT}/tcp."
fi

# ── 7. Start ────────────────────────────────────────────────────────────────
step "7/8" "Starting Nexora Node Agent..."
NODE_BIN="$(command -v node)"
SYSTEMD_OK=false
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]] && [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" == "systemd" ]]; then
  SYSTEMD_OK=true
fi

if $SYSTEMD_OK; then
  touch "$RUN_LOG"
  chown "$SERVICE_USER:$SERVICE_USER" "$RUN_LOG"
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
TimeoutStartSec=30
TimeoutStopSec=15
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=${NODE_DIR}
StandardOutput=append:${RUN_LOG}
StandardError=append:${RUN_LOG}

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
else
  c_yellow "systemd unavailable; using background process mode."
  if [[ -f "$PID_FILE" ]]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ "$OLD_PID" =~ ^[0-9]+$ ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi
  if ss -H -ltn "sport = :${NODE_PORT}" 2>/dev/null | grep -q .; then
    c_red "Port ${NODE_PORT} is already in use."
    ss -lntp 2>/dev/null | grep ":${NODE_PORT}" || true
    exit 1
  fi
  touch "$RUN_LOG"
  chown "$SERVICE_USER:$SERVICE_USER" "$RUN_LOG"
  rm -f "$PID_FILE"
  run_as_node_user sh -c "cd '$NODE_DIR' && nohup '$NODE_BIN' '$NODE_DIR/src/index.js' >> '$RUN_LOG' 2>&1 < /dev/null & echo \$! > '$PID_FILE'"
  chown "$SERVICE_USER:$SERVICE_USER" "$PID_FILE" 2>/dev/null || true
fi

# ── 8. Verify ───────────────────────────────────────────────────────────────
step "8/8" "Verifying Node Agent..."
sleep 3
SERVICE_OK=0
if $SYSTEMD_OK; then
  systemctl is-active --quiet "$SERVICE_NAME" && SERVICE_OK=1 || true
else
  if [[ -f "$PID_FILE" ]]; then
    PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null && SERVICE_OK=1 || true
  fi
fi
LISTEN_OK=0
ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)4000$' && LISTEN_OK=1 || true
HEALTH_OK=0
HEALTH_BODY=""
if HEALTH_BODY="$(curl -fsS --max-time 5 "http://127.0.0.1:${NODE_PORT}/health" 2>/dev/null)"; then
  HEALTH_OK=1
fi

if (( SERVICE_OK == 0 || LISTEN_OK == 0 || HEALTH_OK == 0 )); then
  c_red "Node Agent verification FAILED."
  echo "Process : $SERVICE_OK"
  echo "Port    : $LISTEN_OK"
  echo "Health  : $HEALTH_OK"
  echo
  if $SYSTEMD_OK; then
    systemctl status "$SERVICE_NAME" --no-pager || true
    journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
  else
    tail -n 80 "$RUN_LOG" 2>/dev/null || true
  fi
  exit 1
fi

line
echo
echo "NEXORA NODE AGENT INSTALLED SUCCESSFULLY"
echo "Service : RUNNING ✅"
echo "Port    : ${NODE_PORT} ✅"
echo "Health  : ${HEALTH_BODY}"
echo "Host    : ${PUBLIC_IP}"
echo
echo "Panel → Admin → Nodes → Add Node"
echo "  Type:        AGENT"
echo "  Host:        ${PUBLIC_IP}"
echo "  Port:        ${NODE_PORT}"
echo "  Credentials: ${NODE_SECRET}"
echo
echo "Same-machine panel: use Host=127.0.0.1"
echo "Credentials file: ${NODE_DIR}/NODE_CREDENTIALS.txt"
echo "Logs: ${RUN_LOG}"
line
exit 0
