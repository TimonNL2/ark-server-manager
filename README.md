# Ark Host

Simple web panel for **ARK: Survival Ascended** and **ARK: Survival Evolved** dedicated servers. Pelican-inspired UX (instances, clusters, live console, file browser) without generic game eggs or a marketplace.

> English UI only. Ubuntu Server on Proxmox is the primary deploy target. One `install.sh` bootstraps the stack.

## Features (ASM-2 + ASM-3)

- Local admin auth (session cookie)
- CRUD for **ServerInstance** (ASA \| ASE) and **Cluster**
- Start / stop / restart via host **daemon**
- Create-instance wizard (edition, map, ports, cluster attach)
- **Instance detail**: live WebSocket console, sandboxed file browser, launch-command preview
- **Cluster apply**: shared cluster dir + `GameUserSettings.ini` transfer flags
- SteamCMD update action (anonymous app ids; mocked when `ARK_HOST_MOCK=1`)
- **Mock mode** so the UI works without downloading multi‑GB servers
- Idempotent-ish Ubuntu **install.sh** (Node, Caddy, systemd, secrets, admin user)

## Architecture

```
┌────────────┐   cookie    ┌─────────────┐  localhost   ┌────────────┐
│  React UI  │ ──────────► │ Panel API   │ ───────────► │  Daemon    │
│  (Vite)    │             │ Fastify+SQLite│             │ processes  │
└────────────┘             └─────────────┘             └────────────┘
```

- **`packages/web`** — React ops UI (dark teal, IBM Plex)
- **`packages/panel`** — REST API, SQLite metadata, session auth
- **`packages/daemon`** — start/stop, console buffer, path-sandboxed file hooks
- **`packages/shared`** — types, Zod schemas, map catalogs, Steam app IDs
- **`install/`** — systemd units, Caddyfile, env example

ASA on Linux uses **GE-Proton** (Windows server binary). ASE uses the **Linux native** dedicated server. See [`docs/steamcmd-and-proton.md`](docs/steamcmd-and-proton.md).

## One-command install (Ubuntu)

From a clone on the server:

```bash
sudo ./install.sh
```

Or once published to GitHub:

```bash
sudo ARK_HOST_REPO_URL=https://github.com/<you>/ark-host.git bash -c \
  'curl -fsSL "$ARK_HOST_REPO_URL/raw/main/install.sh" -o /tmp/ark-host-install.sh && bash /tmp/ark-host-install.sh'
```

The installer:

1. Installs Node 22, build tools, Caddy, Vulkan libs
2. Creates `arkhost` user and `/var/lib/ark-host`
3. Builds the monorepo into `/opt/ark-host`
4. Writes secrets + admin password under `/etc/ark-host/`
5. Enables `ark-host-daemon`, `ark-host-panel`, and Caddy

Default credentials are printed at the end (password also in `/etc/ark-host/admin-password.txt`).

## Ports

| Service | Default | Notes |
|---------|---------|-------|
| Panel (Caddy) | 80 | Reverse-proxies to panel |
| Panel API | 3000 | Bound to localhost in production env |
| Daemon | 3920 | Localhost only |
| ASA/ASE game | 7777/UDP | Per instance; stride +2 |
| Query | 27015/UDP | Per instance |
| RCON | 27020/TCP | Per instance |

## Local development

```bash
git clone <repo> && cd ark-host
npm install
ARK_HOST_MOCK=1 npm run dev
```

- UI: http://127.0.0.1:5173 (proxies `/api` → panel)
- Panel: http://127.0.0.1:3000
- Daemon: http://127.0.0.1:3920
- Login: `admin` / `changeme` (override with `ARK_HOST_ADMIN_*`)

## SteamCMD notes

- **Do not** put Steam account passwords in the panel. Dedicated servers use `+login anonymous`.
- ASA app id `2430930`, ASE app id `376030`.
- Keep `ARK_HOST_MOCK=1` until binaries are installed; then set `0` and restart services.

## Proxmox

See [`docs/proxmox.md`](docs/proxmox.md). Bridge networking, forward game UDP ports, size RAM for ASA (~24 GB+ for one map).

## Roadmap (next)

- RCON input in the live console
- Backups / scheduled restarts
- Update-job progress UI beyond the SteamCMD stub

## License

MIT
