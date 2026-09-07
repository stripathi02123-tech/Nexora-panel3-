Write-Output "=== Nexora Panel - Docker TCP Setup (Windows) ==="

# Check if Docker is installed
$dockerPath = Get-Command "docker" -ErrorAction SilentlyContinue
if (-not $dockerPath) {
    Write-Output "Docker is not installed or not in PATH."
    Write-Output "Please install Docker Desktop from https://www.docker.com/products/docker-desktop/"
    exit 1
}

Write-Output "Docker found at: $($dockerPath.Source)"

# Check if Docker Desktop is running
$dockerPs = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerPs) {
    Write-Output "Docker Desktop does not appear to be running."
    Write-Output "Please start Docker Desktop and enable TCP in Settings > General > 'Expose daemon on tcp://localhost:2375 without TLS'"
    exit 1
}

# Test TCP connection
try {
    $response = Invoke-WebRequest -Uri "http://localhost:2375/info" -TimeoutSec 5 -UseBasicParsing
    $info = $response.Content | ConvertFrom-Json
    Write-Output "SUCCESS: Docker TCP is already listening on port 2375"
    Write-Output "Docker version: $($info.ServerVersion)"
} catch {
    Write-Output "Docker TCP on port 2375 is NOT available."
    Write-Output ""
    Write-Output "To enable Docker TCP:"
    Write-Output "  1. Open Docker Desktop"
    Write-Output "  2. Go to Settings > General"
    Write-Output "  3. Check 'Expose daemon on tcp://localhost:2375 without TLS'"
    Write-Output "  4. Click 'Apply & Restart'"
    Write-Output ""
    Write-Output "After enabling, run this script again to verify."
    exit 1
}
