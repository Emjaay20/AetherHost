#!/usr/bin/env bash
# =============================================================================
# AetherHost Contabo VPS One-Command Bootstrap Script
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
# =============================================================================

set -euo pipefail

echo "=========================================================="
echo "    🚀 Starting AetherHost Contabo VPS Server Setup       "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run this script as root or with sudo:"
  echo "   sudo bash $0"
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. System Package Updates & Essentials
# -----------------------------------------------------------------------------
echo "==> [1/6] Updating system packages..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
apt-get install -y \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  ufw \
  fail2ban \
  htop \
  jq

# -----------------------------------------------------------------------------
# 2. Swap Space Configuration (4 GB)
# Crucial for preventing Out-Of-Memory (OOM) kills during npm / docker builds
# -----------------------------------------------------------------------------
echo "==> [2/6] Configuring 4GB swap space..."
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.d/99-swappiness.conf
  echo "    Swap configured successfully."
else
  echo "    Swap file already exists, skipping."
fi

# -----------------------------------------------------------------------------
# 3. Install Official Docker Engine & Docker Compose Plugin
# -----------------------------------------------------------------------------
echo "==> [3/6] Installing Docker CE & Docker Compose..."
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "    Docker installed: $(docker --version)"
else
  echo "    Docker already installed: $(docker --version)"
fi

# -----------------------------------------------------------------------------
# 4. Firewall Hardening (UFW)
# Open ONLY ports 22 (SSH), 80 (HTTP), and 443 (HTTPS)
# -----------------------------------------------------------------------------
echo "==> [4/6] Hardening Firewall (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Let'\''s Encrypt)'
ufw allow 443/tcp comment 'HTTPS (Web Traffic)'
ufw --force enable

systemctl enable fail2ban
systemctl start fail2ban
echo "    Firewall configured and active."

# -----------------------------------------------------------------------------
# 5. Project Directory & Docker Network Setup
# -----------------------------------------------------------------------------
echo "==> [5/6] Creating deployment directories & networks..."
mkdir -p /opt/aetherhost/deployments
chmod 755 /opt/aetherhost

# Ensure the shared Traefik proxy network exists
docker network inspect aetherhost-net >/dev/null 2>&1 || docker network create aetherhost-net

# -----------------------------------------------------------------------------
# 6. Setup Complete & Next Steps
# -----------------------------------------------------------------------------
echo ""
echo "=========================================================="
echo "    ✅ Contabo VPS Server Bootstrap Complete!              "
echo "=========================================================="
echo ""
echo "Next steps to launch AetherHost on this server:"
echo ""
echo "1. Clone your repository into /opt/aetherhost:"
echo "   git clone <your-repo-url> /opt/aetherhost"
echo "   cd /opt/aetherhost"
echo ""
echo "2. Create your production environment file:"
echo "   cp .env.production.example .env"
echo "   nano .env"
echo "   (Fill in your BASE_DOMAIN, CLERK keys, and GROQ_API_KEY)"
echo ""
echo "3. Run database migrations:"
echo "   docker compose -f docker-compose.prod.yml run --rm api pnpm prisma db push"
echo ""
echo "4. Launch AetherHost:"
echo "   docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "5. Ensure your DNS records point to this VPS IP:"
echo "   A     yourdomain.com       -> $(curl -s ifconfig.me || echo '<VPS_IP>')"
echo "   A     *.yourdomain.com     -> $(curl -s ifconfig.me || echo '<VPS_IP>')"
echo ""
