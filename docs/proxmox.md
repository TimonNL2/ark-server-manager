# Proxmox notes

Target: **Ubuntu Server 24.04** VM (or 22.04 for ASE-only).

## Suggested VM shape (single ASA map)

| Resource | Suggestion |
|----------|------------|
| vCPU | 4+ (prefer host CPU type) |
| RAM | 24 GB+ |
| Disk | 100 GB+ NVMe/virtio SCSI |
| NIC | VirtIO, bridged to LAN |

Add ~12–16 GB RAM per additional ASA map in the same VM.

## Networking

- Forward/open **UDP** game + query ports and **TCP** RCON per instance.
- Panel HTTP: Caddy on **80/443** inside the VM; optionally put Proxmox firewall / reverse proxy in front.
- Do not expose the daemon port (`3920`) off-host — it listens on `127.0.0.1` by default.

## Storage

Keep `/var/lib/ark-host` on fast disk. Cluster transfer directories and saves grow quickly.

## Snapshots

Snapshot before SteamCMD validate/update and before major cluster id changes. Game saves live under each instance directory.
