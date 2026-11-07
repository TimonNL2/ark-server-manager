# Local development

## Prerequisites

- Node.js 20+ (22 recommended)
- npm 10+
- Build tools for `better-sqlite3` (`build-essential` / Xcode CLT)

## Run (mock mode)

```bash
cd ark-host
npm install
npm run build -w @ark-host/shared
ARK_HOST_MOCK=1 npm run dev
```

Open http://127.0.0.1:5173 — default admin `admin` / `changeme`.

## Packages

| Workspace | Command | Port |
|-----------|---------|------|
| `@ark-host/shared` | `tsc --watch` | — |
| `@ark-host/daemon` | `tsx watch` | 3920 |
| `@ark-host/panel` | `tsx watch` | 3000 |
| `@ark-host/web` | `vite` | 5173 |

## Environment

Useful variables (all optional for local mock):

```bash
export ARK_HOST_MOCK=1
export ARK_HOST_ADMIN_USER=admin
export ARK_HOST_ADMIN_PASSWORD=changeme
export ARK_HOST_DAEMON_TOKEN=dev-daemon-token
export ARK_HOST_SESSION_SECRET=dev-session-secret-change-me
export ARK_HOST_DATA_DIR=$HOME/.ark-host/data
export ARK_HOST_INSTANCES_ROOT=$HOME/.ark-host/instances
```

## API smoke

```bash
curl -s http://127.0.0.1:3000/api/health
curl -s -c /tmp/ark.ck -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"changeme"}'
curl -s -b /tmp/ark.ck http://127.0.0.1:3000/api/instances
```
