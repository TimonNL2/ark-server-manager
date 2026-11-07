#!/usr/bin/env bash
# Ark Host — one-shot Ubuntu bootstrap (22.04 / 24.04)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<org>/ark-host/main/install.sh | sudo bash
#   or: sudo ./install.sh
set -euo pipefail

ARK_HOST_VERSION="${ARK_HOST_VERSION:-0.1.0}"
INSTALL_ROOT="${ARK_HOST_INSTALL_ROOT:-/opt/ark-host}"
DATA_ROOT="${ARK_HOST_DATA_ROOT:-/var/lib/ark-host}"
CONFIG_DIR="${ARK_HOST_CONFIG_DIR:-/etc/ark-host}"
SERVICE_USER="${ARK_HOST_USER:-arkhost}"
REPO_URL="${ARK_HOST_REPO_URL:-}"
PANEL_PORT="${ARK_HOST_PANEL_PORT:-3000}"
MOCK_DEFAULT="${ARK_HOST_MOCK:-1}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./install.sh" >&2
  exit 1
fi

log() { printf '\n==> %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

detect_src() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${script_dir}/package.json" && -d "${script_dir}/packages" ]]; then
    echo "${script_dir}"
    return
  fi
  echo ""
}

require_ubuntu() {
  if [[ -r /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *"ubuntu"* && "${ID:-}" != "debian" ]]; then
      echo "This installer targets Ubuntu/Debian. Detected: ${PRETTY_NAME:-unknown}" >&2
      exit 1
    fi
  fi
}

install_packages() {
  log "Installing system packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y \
    ca-certificates curl git build-essential python3 \
    ufw caddy \
    libvulkan1 mesa-vulkan-drivers \
    lib32gcc-s1 || apt-get install -y libgcc-s1
}

install_node() {
  if have node; then
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "${major}" -ge 20 ]]; then
      log "Node.js $(node -v) already present"
      return
    fi
  fi
  log "Installing Node.js 22.x"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
}

ensure_user() {
  log "Ensuring service user ${SERVICE_USER}"
  if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
    useradd --system --home "${DATA_ROOT}" --shell /usr/sbin/nologin --create-home "${SERVICE_USER}"
  fi
  mkdir -p "${DATA_ROOT}/data" "${DATA_ROOT}/instances" "${CONFIG_DIR}" "${INSTALL_ROOT}"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DATA_ROOT}"
}

sync_code() {
  local src
  src="$(detect_src)"
  if [[ -n "${src}" ]]; then
    log "Syncing local tree from ${src} → ${INSTALL_ROOT}"
    mkdir -p "${INSTALL_ROOT}"
    # Prefer rsync if available; fall back to tar
    if have rsync; then
      rsync -a --delete \
        --exclude '.git' \
        --exclude 'node_modules' \
        --exclude '**/dist' \
        --exclude '*.db' \
        "${src}/" "${INSTALL_ROOT}/"
    else
      tar -C "${src}" \
        --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='*.db' \
        -cf - . | tar -C "${INSTALL_ROOT}" -xf -
    fi
  elif [[ -n "${REPO_URL}" ]]; then
    log "Cloning ${REPO_URL}"
    if [[ -d "${INSTALL_ROOT}/.git" ]]; then
      git -C "${INSTALL_ROOT}" fetch --depth 1 origin
      git -C "${INSTALL_ROOT}" reset --hard origin/HEAD
    else
      rm -rf "${INSTALL_ROOT}"
      git clone --depth 1 "${REPO_URL}" "${INSTALL_ROOT}"
    fi
  else
    echo "No local source and ARK_HOST_REPO_URL unset. Clone the repo first or set ARK_HOST_REPO_URL." >&2
    exit 1
  fi
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_ROOT}"
}

build_app() {
  log "Installing npm workspaces and building"
  cd "${INSTALL_ROOT}"
  # better-sqlite3 needs build tools (already installed)
  sudo -u "${SERVICE_USER}" npm install
  sudo -u "${SERVICE_USER}" npm run build
}

gen_secret() {
  if have openssl; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 256
  fi
}

write_env() {
  local env_file="${CONFIG_DIR}/ark-host.env"
  if [[ -f "${env_file}" ]]; then
    log "Keeping existing ${env_file}"
    return
  fi
  log "Writing ${env_file}"
  local daemon_token session_secret admin_password
  daemon_token="$(gen_secret)"
  session_secret="$(gen_secret)"
  admin_password="${ARK_HOST_ADMIN_PASSWORD:-$(gen_secret | head -c 16)}"
  umask 077
  cat >"${env_file}" <<EOF
ARK_HOST_MOCK=${MOCK_DEFAULT}
ARK_HOST_PANEL_HOST=127.0.0.1
ARK_HOST_PANEL_PORT=${PANEL_PORT}
ARK_HOST_DAEMON_HOST=127.0.0.1
ARK_HOST_DAEMON_PORT=3920
ARK_HOST_DAEMON_URL=http://127.0.0.1:3920
ARK_HOST_DAEMON_TOKEN=${daemon_token}
ARK_HOST_SESSION_SECRET=${session_secret}
ARK_HOST_COOKIE_SECURE=0
ARK_HOST_DATA_DIR=${DATA_ROOT}/data
ARK_HOST_DB_PATH=${DATA_ROOT}/data/ark-host.db
ARK_HOST_INSTANCES_ROOT=${DATA_ROOT}/instances
ARK_HOST_WEB_DIST=${INSTALL_ROOT}/packages/web/dist
ARK_HOST_ADMIN_USER=${ARK_HOST_ADMIN_USER:-admin}
ARK_HOST_ADMIN_PASSWORD=${admin_password}
ARK_HOST_PROTON_PATH=/opt/ark-host/proton/current
ARK_HOST_STEAMCMD_PATH=/opt/ark-host/steamcmd/steamcmd.sh
EOF
  chown root:"${SERVICE_USER}" "${env_file}"
  chmod 640 "${env_file}"
  printf '%s\n' "${admin_password}" >"${CONFIG_DIR}/admin-password.txt"
  chmod 600 "${CONFIG_DIR}/admin-password.txt"
  chown root:root "${CONFIG_DIR}/admin-password.txt"
  log "Admin password saved to ${CONFIG_DIR}/admin-password.txt"
}

install_steamcmd_stub() {
  log "Preparing SteamCMD directory (download is optional / documented)"
  mkdir -p /opt/ark-host/steamcmd /opt/ark-host/proton
  if [[ ! -x /opt/ark-host/steamcmd/steamcmd.sh ]]; then
    cat >/opt/ark-host/steamcmd/README.md <<'EOF'
# SteamCMD

Install SteamCMD here when you leave mock mode:

```bash
cd /opt/ark-host/steamcmd
curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf -
./steamcmd.sh +quit
```

ASA dedicated server app id: **2430930** (Windows binary; run via GE-Proton)
ASE dedicated server app id: **376030** (Linux native)

Anonymous login works for these dedicated server app ids:
`./steamcmd.sh +force_install_dir /var/lib/ark-host/instances/<id> +login anonymous +app_update 2430930 validate +quit`
EOF
  fi
  chown -R "${SERVICE_USER}:${SERVICE_USER}" /opt/ark-host/steamcmd /opt/ark-host/proton
}

install_units() {
  log "Installing systemd units and Caddy site"
  cp "${INSTALL_ROOT}/install/ark-host-daemon.service" /etc/systemd/system/
  cp "${INSTALL_ROOT}/install/ark-host-panel.service" /etc/systemd/system/
  if [[ ! -f /etc/caddy/Caddyfile.ark-host.bak ]] && [[ -f /etc/caddy/Caddyfile ]]; then
    cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.ark-host.bak || true
  fi
  cp "${INSTALL_ROOT}/install/Caddyfile" /etc/caddy/Caddyfile
  systemctl daemon-reload
  systemctl enable --now ark-host-daemon.service ark-host-panel.service caddy.service
  systemctl restart ark-host-daemon.service ark-host-panel.service caddy.service
}

configure_firewall() {
  log "Opening HTTP and common Ark ports in UFW (if active)"
  if have ufw && ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true
    ufw allow 7777:7790/udp || true
    ufw allow 27015:27030/udp || true
    ufw allow 27020:27040/tcp || true
  else
    log "UFW not active — skip firewall rules (configure Proxmox/host firewall yourself)"
  fi
}

print_summary() {
  local admin_pw_file="${CONFIG_DIR}/admin-password.txt"
  local pw="(see ${admin_pw_file} or existing env)"
  if [[ -f "${admin_pw_file}" ]]; then
    pw="$(cat "${admin_pw_file}")"
  fi
  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ark Host ${ARK_HOST_VERSION} installed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Panel (via Caddy):  http://<server-ip>/
  Direct panel:       http://127.0.0.1:${PANEL_PORT}/
  Admin user:         ${ARK_HOST_ADMIN_USER:-admin}
  Admin password:     ${pw}
  Data:               ${DATA_ROOT}
  Config:             ${CONFIG_DIR}/ark-host.env
  Mock mode:          ${MOCK_DEFAULT}  (set ARK_HOST_MOCK=0 after SteamCMD)

  Services:
    systemctl status ark-host-panel ark-host-daemon caddy

  Next:
    1. Open the panel and create a cluster + instances.
    2. Read ${INSTALL_ROOT}/docs/steamcmd-and-proton.md before real launches.
    3. For Proxmox: bridge NIC, forward game UDP ports, give the VM ≥24GB RAM for ASA.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

main() {
  require_ubuntu
  install_packages
  install_node
  ensure_user
  sync_code
  build_app
  write_env
  install_steamcmd_stub
  install_units
  configure_firewall
  print_summary
}

main "$@"
