# SteamCMD, ASA Proton, and ASE native

Ark Host does **not** invent Steam credentials. Dedicated server app IDs support **anonymous** SteamCMD login.

## App IDs

| Edition | App ID | Binary | Linux path |
|---------|--------|--------|------------|
| ASA (Survival Ascended) | `2430930` | Windows `ArkAscendedServer.exe` | Run under **GE-Proton** |
| ASE (Survival Evolved) | `376030` | Linux `ShooterGameServer` | Native |

## Honest requirements (ASA on Ubuntu)

- ASA ships a **Windows** dedicated server only. On Ubuntu 22.04/24.04 the practical approach is **GE-Proton** (GloriousEggroll) plus Vulkan libs.
- Prefer **Ubuntu 24.04** for ASA. Some Docker/Proton setups report pathological CPU use on 22.04 after 2025 package updates.
- Budget roughly **12–16+ GB RAM per map**, NVMe storage, and strong single-thread CPU. A full cluster needs far more.
- Default ports (per instance, offset as you add maps): game **UDP 7777**, query **UDP 27015**, RCON **TCP 27020**.

## Install SteamCMD

```bash
sudo mkdir -p /opt/ark-host/steamcmd
cd /opt/ark-host/steamcmd
sudo curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | sudo tar zxvf -
sudo -u arkhost ./steamcmd.sh +quit
```

## Download ASA into an instance directory

```bash
INSTANCE=/var/lib/ark-host/instances/<instance-uuid>
sudo -u arkhost /opt/ark-host/steamcmd/steamcmd.sh \
  +force_install_dir "$INSTANCE" \
  +login anonymous \
  +app_update 2430930 validate \
  +quit
```

## GE-Proton (ASA)

```bash
# Example — pin a known-good GE-Proton release
VER=GE-Proton10-34
cd /tmp
curl -fsSL "https://github.com/GloriousEggroll/proton-ge-custom/releases/download/${VER}/${VER}.tar.gz" -o proton.tgz
sudo mkdir -p /opt/ark-host/proton
sudo tar -xzf proton.tgz -C /opt/ark-host/proton
sudo ln -sfn "/opt/ark-host/proton/${VER}" /opt/ark-host/proton/current
sudo chown -R arkhost:arkhost /opt/ark-host/proton
```

Set in `/etc/ark-host/ark-host.env`:

```bash
ARK_HOST_PROTON_PATH=/opt/ark-host/proton/current
ARK_HOST_MOCK=0
```

Then `systemctl restart ark-host-daemon ark-host-panel`.

The daemon launches ASA roughly as:

```text
proton run ./ArkAscendedServer.exe Map_WP?listen?SessionName=...?Port=... -server -log -NoBattlEye
```

with `STEAM_COMPAT_CLIENT_INSTALL_PATH` / `STEAM_COMPAT_DATA_PATH` pointing at managed prefixes.

## ASE native

```bash
sudo -u arkhost /opt/ark-host/steamcmd/steamcmd.sh \
  +force_install_dir "$INSTANCE" \
  +login anonymous \
  +app_update 376030 validate \
  +quit
```

Binary path expected by the daemon:

`ShooterGame/Binaries/Linux/ShooterGameServer`

## Mock mode

Default install keeps `ARK_HOST_MOCK=1` so you can exercise the panel without multi‑GB downloads. Mock start/stop streams fake console lines and never execs game binaries.
