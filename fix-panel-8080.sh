#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

NODE_ENV_FILE="/opt/nexora/server/.env"
INSTALL_DIR="/opt/nexora"
SERVICE_NAME="nexora-bot"
NGINX_SITE="/etc/nginx/sites-available/nexora"
NGINX_LINK="/etc/nginx/sites-enabled/nexora"
PANEL_PORT=8080

RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; CYAN='\033[1;36m'; NC='\033[0m'
info(){ echo -e "${CYAN}[INFO]${NC} $*"; }
ok(){ echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARNING]${NC} $*"; }
error(){ echo -e "${RED}[ERROR]${NC} $*" >&2; }

systemd_available(){
  command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = "systemd" ]
}

if [[ $EUID -ne 0 ]]; then
  error "Run as root: sudo bash fix-panel-8080.sh"
  exit 1
fi

if [[ ! -d "$INSTALL_DIR" || ! -f "$NODE_ENV_FILE" ]]; then
  error "Nexora Panel installation not found at $INSTALL_DIR"
  exit 1
fi

info "Checking current listeners..."
ss -lntp 2>/dev/null | grep -E ':(80|8080|3000|30[0-9]{2})\\b' || true

auto_backend_port=3000
if grep -q '^PORT=' "$NODE_ENV_FILE"; then
  auto_backend_port="$(sed -n 's/^PORT=//p' "$NODE_ENV_FILE" | head -1)"
fi
if ! [[ "$auto_backend_port" =~ ^[0-9]+$ ]] || (( auto_backend_port < 1 || auto_backend_port > 65535 )); then
  auto_backend_port=3000
fi

info "Backend port: ${auto_backend_port}"
info "Forcing public panel port: ${PANEL_PORT}"

# 8080 is intentionally fixed. Do not silently switch ports.
if ss -H -ltn "sport = :${PANEL_PORT}" 2>/dev/null | grep -q .; then
  if ! ss -H -ltnp "sport = :${PANEL_PORT}" 2>/dev/null | grep -q 'nginx'; then
    warn "Port 8080 is already occupied by another process."
    ss -lntp 2>/dev/null | grep ':8080' || true
    error "Cannot safely take port 8080. Stop the conflicting process and rerun this script."
    exit 1
  fi
fi

info "Writing Nginx configuration..."
cat > "$NGINX_SITE" <<EOF
server {
    listen 0.0.0.0:8080;
    listen [::]:8080;
    server_name _;

    root ${INSTALL_DIR}/client/dist;
    index index.html;
    client_max_body_size 100M;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${auto_backend_port};
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
        proxy_pass http://127.0.0.1:${auto_backend_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sfn "$NGINX_SITE" "$NGINX_LINK"
rm -f /etc/nginx/sites-enabled/default
nginx -t

if systemd_available; then
  systemctl restart "$SERVICE_NAME" || true
  systemctl restart nginx
else
  nginx -s quit >/dev/null 2>&1 || true
  nginx
fi

sleep 2

if ! ss -H -ltn "sport = :8080" 2>/dev/null | grep -q .; then
  error "Nginx still is not listening on TCP 8080."
  nginx -t || true
  if systemd_available; then
    systemctl status nginx --no-pager || true
    journalctl -u nginx -n 50 --no-pager || true
  fi
  exit 1
fi

ok "Nginx is listening on TCP 8080."

if curl -fsS --max-time 5 http://127.0.0.1:8080/ >/dev/null 2>&1; then
  ok "Panel responds locally on http://127.0.0.1:8080"
else
  warn "Port 8080 is listening, but the panel did not return HTTP 200 locally."
fi

# Open host firewall where supported.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 8080/tcp >/dev/null 2>&1 || true
  ok "UFW: allowed 8080/tcp"
elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --add-port=8080/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  ok "firewalld: allowed 8080/tcp"
elif command -v iptables >/dev/null 2>&1; then
  if ! iptables -C INPUT -p tcp --dport 8080 -j ACCEPT >/dev/null 2>&1; then
    iptables -I INPUT -p tcp --dport 8080 -j ACCEPT >/dev/null 2>&1 || true
  fi
  ok "iptables: allowed 8080/tcp where supported"
else
  warn "No host firewall manager detected."
fi

PUBLIC_IP=$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)

printf '\n==============================================\n'
ok "NEXORA PANEL 8080 REPAIR COMPLETE"
printf '==============================================\n'
echo "Local URL : http://127.0.0.1:8080"
echo "Public URL: http://${PUBLIC_IP:-YOUR_PUBLIC_IP}:8080"
echo
warn "If local curl works but the public URL is unreachable, allow TCP 8080 in your VPS provider/cloud security firewall as well."
echo "Test externally from another machine: curl -I http://${PUBLIC_IP:-YOUR_PUBLIC_IP}:8080"
echo
