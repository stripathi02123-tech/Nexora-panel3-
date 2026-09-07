#!/usr/bin/env bash
#
# Nexora Node Agent — one-shot uninstaller
#
# Removes the Nexora Node Agent, systemd service, service user,
# node installation directory, and the port 4000 firewall rule.
# Node.js itself is intentionally NOT removed.
#
# Run:
#   curl -fsSL https://raw.githubusercontent.com/stripathi02123-tech/Nexora-panel3/main/node-system/uninstall-node.sh | bash
#
set -Eeuo pipefail
IFS=$'\n\t'

NODE_DIR="/opt/nexora-node"
SERVICE_USER="nexoranode"
SERVICE_NAME="nexora-node"
PORT="4000"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

c_green()  { echo -e "\033[32m$*\033[0m"; }
c_yellow() { echo -e "\033[33m$*\033[0m"; }
c_red()    { echo -e "\033[31m$*\033[0m"; }
c_cyan()   { echo -e "\033[36m$*\033[0m"; }
step()     { echo; c_cyan "[$1] $2"; }

fail() {
  c_red "ERROR: $*"
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "Please run this uninstaller as root (sudo bash uninstall-node.sh)."
fi

echo
c_cyan "=============================================="
c_cyan "      NEXORA NODE AGENT UNINSTALLER"
c_cyan "=============================================="
echo

step "1/6" "Stopping Nexora Node Agent..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
fi
c_green "  Service stopped (if it was running)."

step "2/6" "Disabling service..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
fi
c_green "  Service disabled."

step "3/6" "Removing systemd service..."
rm -f "$SERVICE_FILE"
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload 2>/dev/null || true
  systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
fi
c_green "  Systemd service removed."

step "4/6" "Removing Node Agent files..."
if [[ -d "$NODE_DIR" ]]; then
  rm -rf "$NODE_DIR"
  c_green "  Removed ${NODE_DIR}."
else
  c_yellow "  ${NODE_DIR} does not exist."
fi

step "5/6" "Removing service user..."
if id "$SERVICE_USER" >/dev/null 2>&1; then
  userdel "$SERVICE_USER" 2>/dev/null || true
  c_green "  Removed user ${SERVICE_USER}."
else
  c_yellow "  User ${SERVICE_USER} does not exist."
fi

step "6/6" "Removing firewall rule..."
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw delete allow "${PORT}/tcp" >/dev/null 2>&1 || true
  ufw delete allow "${PORT}/tcp" comment "nexora-node" >/dev/null 2>&1 || true
  c_green "  Removed UFW rule for port ${PORT}/tcp (if present)."
elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --remove-port="${PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  c_green "  Removed firewalld rule for port ${PORT}/tcp (if present)."
else
  c_yellow "  No active UFW/firewalld manager detected."
fi

echo
c_green "=============================================="
c_green "   NEXORA NODE AGENT UNINSTALLED ✅"
c_green "=============================================="
echo
printf '%s\n' "Node directory : ${NODE_DIR}" "Service        : ${SERVICE_NAME}" "User           : ${SERVICE_USER}" "Node.js        : NOT removed"
echo
c_green "Uninstallation complete!"
