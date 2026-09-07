#!/usr/bin/env bash
#
# Nexora Panel — full uninstall script
#
# Removes the Nexora Panel installation, service, Nginx site, panel logs,
# database/backups stored by the panel installer, and the panel service user.
#
# IMPORTANT:
# - This script DOES NOT remove the separate Nexora Node Agent.
# - This script DOES NOT remove Node.js, npm, Nginx, Git, Python, or other
#   system packages because they may be used by other applications.
# - Panel data under /opt/nexora and /opt/nexora-backups will be deleted.
#
# Run:
#   curl -fsSL https://raw.githubusercontent.com/stripathi02123-tech/Nexora-panel3-/main/uninstall-panel.sh | sudo bash
#
# Or:
#   sudo bash uninstall-panel.sh
#
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
SERVICE_USER='nexora'
INSTALL_DIR='/opt/nexora'
BACKUP_DIR='/opt/nexora-backups'
LOG_DIR='/var/log/nexora'
NGINX_SITE='/etc/nginx/sites-available/nexora'
NGINX_LINK='/etc/nginx/sites-enabled/nexora'
PID_FILE="${INSTALL_DIR}/nexora.pid"

line(){ echo -e "${MAGENTA}============================================================${NC}"; }
info(){ echo -e "${CYAN}[INFO]${NC} $*"; }
ok(){ echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARNING]${NC} $*"; }
error(){ echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  error 'Run as root: sudo bash uninstall-panel.sh'
  exit 1
fi

clear 2>/dev/null || true

echo -e "${CYAN}"
cat <<'BANNER'

███╗   ██╗███████╗██╗  ██╗ ██████╗ ██████╗  █████╗
████╗  ██║██╔════╝╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗
██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║██████╔╝███████║
██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██╔══██╗██╔══██║
██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║
╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝

                 NEXORA PANEL UNINSTALLER

BANNER
echo -e "${NC}"
line

warn 'THIS WILL DELETE THE NEXORA PANEL INSTALLATION AND ITS DATA.'
echo
printf 'Panel directory : %s\n' "$INSTALL_DIR"
printf 'Backup directory: %s\n' "$BACKUP_DIR"
printf 'Log directory   : %s\n' "$LOG_DIR"
printf 'Systemd service : %s\n' "$SERVICE_NAME"
printf 'Service user    : %s\n' "$SERVICE_USER"
echo
warn 'The separate Nexora Node Agent at /opt/nexora-node will NOT be removed.'
echo
printf 'Type DELETE-NEXORA-PANEL to continue: '
read -r CONFIRM
if [[ "$CONFIRM" != 'DELETE-NEXORA-PANEL' ]]; then
  echo
  info 'Uninstall cancelled.'
  exit 0
fi

echo
line

info 'Stopping Nexora Panel...'
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
fi

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
  fi
fi
pkill -u "$SERVICE_USER" -f '/opt/nexora/server/dist/index.js' 2>/dev/null || true
ok 'Panel process stopped.'

info 'Removing service definition...'
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload 2>/dev/null || true
  systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
fi
ok 'Service definition removed.'

info 'Removing Nexora Nginx configuration...'
rm -f "$NGINX_LINK" "$NGINX_SITE"
if command -v nginx >/dev/null 2>&1; then
  nginx -t >/dev/null 2>&1 || warn 'Nginx config test failed after removing Nexora site.'
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
  else
    nginx -s reload 2>/dev/null || true
  fi
fi
ok 'Nexora Nginx site removed.'

info 'Removing Nexora Panel files and database...'
rm -rf "$INSTALL_DIR"
ok 'Panel installation directory removed.'

info 'Removing Nexora Panel backups...'
rm -rf "$BACKUP_DIR"
ok 'Panel backup directory removed.'

info 'Removing Nexora Panel logs...'
rm -rf "$LOG_DIR"
ok 'Panel log directory removed.'

info 'Removing Nexora service user...'
if id -u "$SERVICE_USER" >/dev/null 2>&1; then
  userdel "$SERVICE_USER" 2>/dev/null || true
fi
ok 'Panel service user removed.'

line
info 'Final verification...'
[[ ! -e "$INSTALL_DIR" ]] && ok "$INSTALL_DIR removed." || warn "$INSTALL_DIR still exists."
[[ ! -e "$BACKUP_DIR" ]] && ok "$BACKUP_DIR removed." || warn "$BACKUP_DIR still exists."
[[ ! -e "$LOG_DIR" ]] && ok "$LOG_DIR removed." || warn "$LOG_DIR still exists."
[[ ! -e "/etc/systemd/system/${SERVICE_NAME}.service" ]] && ok 'Service file removed.' || warn 'Service file still exists.'
[[ ! -e "$NGINX_SITE" && ! -e "$NGINX_LINK" ]] && ok 'Nexora Nginx site removed.' || warn 'Nexora Nginx site still exists.'
if id -u "$SERVICE_USER" >/dev/null 2>&1; then warn "User $SERVICE_USER still exists."; else ok "User $SERVICE_USER removed."; fi
if [[ -d /opt/nexora-node ]]; then info 'Nexora Node Agent preserved at /opt/nexora-node.'; fi

echo
echo -e "${GREEN}NEXORA PANEL UNINSTALLED ✅${NC}"
line
