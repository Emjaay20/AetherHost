#!/usr/bin/env bash
set -e

# AetherHost CLI Installer
# Usage: curl -fsSL https://console.aetherhost.com.ng/install.sh | bash

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}⚡ AetherHost Developer CLI Installer${NC}"
echo -e "Installing official 'aether' command-line tool..."
echo ""

# Check for cargo / rust
if command -v cargo >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Found Cargo (Rust toolchain)${NC}"
    echo -e "Compiling and installing latest ${BOLD}aether-cli${NC} from source..."
    cargo install --git https://github.com/Emjaay20/AetherHost.git aether-cli --force
else
    echo -e "${YELLOW}Notice: Cargo was not found on your system.${NC}"
    echo -e "AetherHost CLI is built with Rust for high-performance memory safety."
    echo -e "To install Rust and Cargo, run:"
    echo -e "  ${BOLD}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${NC}"
    echo ""
    echo -e "Once installed, rerun this installer or run:"
    echo -e "  ${BOLD}cargo install --git https://github.com/Emjaay20/AetherHost.git aether-cli${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}${BOLD}✓ Success! AetherHost CLI is installed.${NC}"
echo ""
echo -e "${BOLD}Next Steps:${NC}"
echo -e "  1. Generate your personal API Key at: ${CYAN}https://console.aetherhost.com.ng/settings${NC}"
echo -e "  2. Log in from your terminal:"
echo -e "     ${BOLD}aether login --token <YOUR_API_KEY>${NC}"
echo -e "  3. Verify connection:"
echo -e "     ${BOLD}aether status${NC}"
echo -e "  4. List or launch applications:"
echo -e "     ${BOLD}aether list${NC}"
echo -e "     ${BOLD}aether create my-app --runtime nodejs${NC}"
echo ""
