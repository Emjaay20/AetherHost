#!/usr/bin/env bash
# =============================================================================
# AetherHost Enterprise Linux Production Hardening & SRE Blueprint
# Target: Ubuntu 24.04 LTS / Contabo Cloud VPS
# Architect: Principal Systems & Infrastructure Engineering
# =============================================================================

set -euo pipefail

# Color palette for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log_info() {
    echo -e "${CYAN}[INFO]${NC} $(date +'%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date +'%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date +'%Y-%m-%d %H:%M:%S') - $1"
}

log_stage() {
    echo ""
    echo -e "${BOLD}${BLUE}===================================================================${NC}"
    echo -e "${BOLD}${GREEN}  >> STAGE $1: $2${NC}"
    echo -e "${BOLD}${BLUE}===================================================================${NC}"
}

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] This hardening script must be executed as root.${NC}"
    exit 1
fi

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
     ___       _______ _______ __    __ _______ _____  _____ _____ _____ 
    /   \     |  _____|__   __|  |  |  |  _____|  _  \/  _  /  ___|_   _|
   /  _  \    | |____    | |  |  |__|  | |____ | |_| || | | \ `--.  | |  
  /  /_\  \   |  ____|   | |  |   __   |  ____||     /| | | |`--. \ | |  
 /  _____  \  | |_____   | |  |  |  |  | |_____| |\ \ | |_| /\___/ / | |  
/__/     \__\ |_______|  |_|  |__|  |__|_______|_| \_|\_____/|____/  |_|  
         ENGINEERING PLATFORM - PRODUCTION HARDENING RUNTIME
EOF
echo -e "${NC}"

# =============================================================================
# STAGE 1: System Package Updates & Advanced Observability Toolchain
# =============================================================================
log_stage "1/10" "Upgrading System & Installing SRE Toolchain"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# Core DevOps & Observability Tooling
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    ufw \
    fail2ban \
    unattended-upgrades \
    logrotate \
    htop \
    iotop \
    sysstat \
    iftop \
    ncdu \
    jq \
    lsof \
    net-tools \
    dnsutils \
    tcpdump \
    strace \
    rsync \
    restic \
    rclone

log_success "Base system upgraded and diagnostic toolchain installed."

# =============================================================================
# STAGE 2: Swap Space Allocation (4GB NVMe)
# =============================================================================
log_stage "2/10" "Configuring NVMe Swap Space & Memory Resiliency"

if [ ! -f /swapfile ]; then
    log_info "Creating 4GB swap space at /swapfile..."
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    
    if ! grep -q '/swapfile none swap' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    log_success "4GB swap file created and mounted permanently."
else
    log_info "Swap file already exists, verifying permissions..."
    chmod 600 /swapfile
    swapon /swapfile 2>/dev/null || true
fi

# =============================================================================
# STAGE 3: Linux Kernel & High-Concurrency Network Tuning (sysctl)
# =============================================================================
log_stage "3/10" "Tuning Linux Kernel & TCP BBR Congestion Control"

cat > /etc/sysctl.d/99-systems-engineer.conf << 'EOF'
# =============================================================================
# Production Kernel & Network Parameters - AetherHost SRE Blueprint
# =============================================================================

# --- Virtual Memory & OOM Protection ---
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
# Required for Redis background persistence without OOM failure
vm.overcommit_memory = 1

# --- TCP BBR Congestion Control (Google High-Performance Algorithm) ---
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# --- High-Throughput Ingress & Reverse Proxy Socket Tuning ---
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.ip_local_port_range = 1024 65535

# Buffer memory allocation for high network bandwidth
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# --- Network Layer Security (Anti-Spoofing & DoS Mitigation) ---
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1

# --- File Descriptor & Inotify Watcher Expansion ---
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 8192
EOF

sysctl --system > /dev/null 2>&1
log_success "Kernel parameters loaded. TCP Congestion Control: $(sysctl -n net.ipv4.tcp_congestion_control)"

# =============================================================================
# STAGE 4: Security Limits & File Descriptor Thresholds
# =============================================================================
log_stage "4/10" "Configuring Security Limits (nofile & nproc)"

cat > /etc/security/limits.d/99-limits.conf << 'EOF'
* soft nofile 65535
* hard nofile 65535
* soft nproc 65535
* hard nproc 65535
root soft nofile 65535
root hard nofile 65535
root soft nproc 65535
root hard nproc 65535
EOF

log_success "Process and file descriptor limits expanded to 65535."

# =============================================================================
# STAGE 5: Administrative Engineer User & SSH Access Management
# =============================================================================
log_stage "5/10" "Provisioning Dedicated SRE User ('engineer')"

if ! id "engineer" &>/dev/null; then
    useradd -m -s /bin/bash -G sudo engineer
    log_info "Created user 'engineer' with sudo privileges."
else
    log_info "User 'engineer' already exists."
fi

# Passwordless sudo for engineer
echo "engineer ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/99-engineer
chmod 440 /etc/sudoers.d/99-engineer

# Sync authorized keys from root to engineer
mkdir -p /home/engineer/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys /home/engineer/.ssh/authorized_keys
fi
chmod 700 /home/engineer/.ssh
chmod 600 /home/engineer/.ssh/authorized_keys 2>/dev/null || true
chown -R engineer:engineer /home/engineer/.ssh

log_success "User 'engineer' provisioned with authorized SSH access and sudo."

# =============================================================================
# STAGE 6: Official Docker CE Engine & Enterprise Daemon Hardening
# =============================================================================
log_stage "6/10" "Installing Docker CE & Hardening Daemon Runtime"

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
fi

# Add engineer to docker group
usermod -aG docker engineer 2>/dev/null || true

# Production Docker daemon configuration:
# 1. log-driver caps logs to 20MB * 3 = 60MB per container (PREVENTS DISK FULL)
# 2. live-restore keeps containers alive during daemon restarts
# 3. userland-proxy false routes via iptables directly for low latency
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "storage-driver": "overlay2"
}
EOF

systemctl daemon-reload
systemctl enable docker
systemctl restart docker

log_success "Docker Engine hardened and running: $(docker --version)"

# =============================================================================
# STAGE 7: Network Edge & Firewall Hardening (UFW & Fail2Ban)
# =============================================================================
log_stage "7/10" "Hardening Edge Ingress (UFW & Fail2Ban)"

# Reset UFW rules safely
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH Administration'
ufw allow 80/tcp comment 'HTTP Let Encrypt Ingress'
ufw allow 443/tcp comment 'HTTPS Secure Web Ingress'
ufw --force enable

# Configure Fail2Ban for SSH protection
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 4
EOF

systemctl enable fail2ban
systemctl restart fail2ban

log_success "Firewall active (ports 22, 80, 443 open only). Fail2ban monitoring active."

# =============================================================================
# STAGE 8: Automated Security Patching (Unattended Upgrades)
# =============================================================================
log_stage "8/10" "Configuring Automated Security CVE Patching"

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

systemctl enable unattended-upgrades
systemctl restart unattended-upgrades

log_success "Unattended security updates enabled for automated zero-day patching."

# =============================================================================
# STAGE 9: Dynamic Interactive SRE MOTD Terminal Dashboard
# =============================================================================
log_stage "9/10" "Deploying SRE Telemetry Terminal MOTD"

# Silence default noisy Ubuntu news
sed -i 's/ENABLED=1/ENABLED=0/' /etc/default/motd-news 2>/dev/null || true
chmod -x /etc/update-motd.d/10-help-text 2>/dev/null || true
chmod -x /etc/update-motd.d/50-motd-news 2>/dev/null || true

cat > /etc/update-motd.d/99-sre-status << 'EOF'
#!/usr/bin/env bash

CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
RESET='\033[0m'

echo -e "${CYAN}================================================================================${RESET}"
echo -e "${GREEN}      ⚡ AETHERHOST PRODUCTION NODE | SYSTEMS & INFRASTRUCTURE ENGINEERING       ${RESET}"
echo -e "${CYAN}================================================================================${RESET}"
echo -e "  ${WHITE}Hostname:${RESET} $(hostname) | ${WHITE}OS:${RESET} $(lsb_release -ds 2>/dev/null || uname -s) (${WHITE}Kernel:${RESET} $(uname -r))"
echo -e "  ${WHITE}Uptime:${RESET}   $(uptime -p) | ${WHITE}TCP Congestion:${RESET} $(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo 'cubic')"
echo -e "  ${WHITE}Memory:${RESET}   $(free -h | awk '/Mem:/ {print $3 "/" $2}') (${WHITE}Swap:${RESET} $(free -h | awk '/Swap:/ {print $3 "/" $2}') - 4GB NVMe)"
echo -e "  ${WHITE}Storage:${RESET}  $(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 " used)"}')"
echo -e "  ${WHITE}Docker:${RESET}   $(docker ps -q 2>/dev/null | wc -l | tr -d ' ') running container(s) | ${WHITE}Daemon:${RESET} live-restore, overlay2, 60MB log-cap"
echo -e "  ${WHITE}Firewall:${RESET} $(ufw status | head -n 1) | ${WHITE}Intrusion Guard:${RESET} Fail2ban active"
echo -e "  ${WHITE}Ingress:${RESET}  Traefik v3 (Let's Encrypt TLS) -> *.aetherhost.com.ng"
echo -e "${CYAN}================================================================================${RESET}"
EOF

chmod +x /etc/update-motd.d/99-sre-status
log_success "Interactive SRE MOTD banner installed."

# =============================================================================
# STAGE 10: Platform Directories, Maintenance Timers, and Docker Network
# =============================================================================
log_stage "10/10" "Configuring AetherHost Directory & Automated Cron Jobs"

mkdir -p /opt/aetherhost/deployments
mkdir -p /opt/aetherhost/backups
chmod 755 /opt/aetherhost
chmod 700 /opt/aetherhost/backups

# Shared Traefik Ingress Network
docker network inspect aetherhost-net >/dev/null 2>&1 || docker network create aetherhost-net

# Additive operational timers: bounded BuildKit cache (10GB), encrypted
# off-host backup, and a weekly non-destructive restore drill. Backup timers
# remain inactive until /etc/aetherhost/backup.env is configured.
if [ -x /opt/aetherhost/deploy/install-operations-timers.sh ]; then
    /opt/aetherhost/deploy/install-operations-timers.sh
fi

echo ""
echo -e "${BOLD}${GREEN}===================================================================${NC}"
echo -e "${BOLD}${GREEN}  ✅ ENTERPRISE HARDENING & SRE SUITE COMPLETED SUCCESSFULLY!       ${NC}"
echo -e "${BOLD}${GREEN}===================================================================${NC}"
echo ""
