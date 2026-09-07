#!/bin/bash
set -e

echo "=== Nexora Panel - Docker TCP Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root (use sudo)."
  exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo "Docker is not installed. Please install Docker first."
  exit 1
fi

DOCKER_CONFIG="/etc/docker/daemon.json"

# Ensure /etc/docker exists
mkdir -p /etc/docker

# Read existing config or create new
if [ -f "$DOCKER_CONFIG" ]; then
  EXISTING=$(cat "$DOCKER_CONFIG")
  echo "Existing daemon.json found. Merging TCP host config..."
else
  EXISTING="{}"
  echo "No existing daemon.json found. Creating new..."
fi

# Write config with TCP host enabled (merge with existing config)
# Using python3 for JSON merging to avoid jq dependency
python3 -c "
import json
config = json.loads('''$EXISTING''')
hosts = config.get('hosts', [])
if 'unix:///var/run/docker.sock' not in hosts:
    hosts.append('unix:///var/run/docker.sock')
if 'tcp://0.0.0.0:2375' not in hosts:
    hosts.append('tcp://0.0.0.0:2375')
config['hosts'] = hosts
# Remove deprecated host setting
config.pop('host', None)
print(json.dumps(config, indent=2))
" > "$DOCKER_CONFIG"

echo "daemon.json updated:"
cat "$DOCKER_CONFIG"

# Restart Docker
echo ""
echo "Restarting Docker daemon..."
systemctl restart docker

sleep 2

# Verify TCP is listening
if ss -tlnp | grep -q ":2375 "; then
  echo "SUCCESS: Docker TCP is now listening on port 2375"
else
  echo "WARNING: Docker TCP may not be listening yet. Checking again..."
  sleep 3
  if ss -tlnp | grep -q ":2375 "; then
    echo "SUCCESS: Docker TCP is now listening on port 2375"
  else
    echo "FAILED: Could not verify Docker TCP on port 2375."
    echo "Check 'systemctl status docker' for details."
    exit 1
  fi
fi

# Test connection
echo ""
echo "Testing Docker API via TCP..."
curl -s http://localhost:2375/info | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Docker version: {d.get(\"ServerVersion\",\"unknown\")}')"

echo ""
echo "=== Docker TCP setup complete ==="
