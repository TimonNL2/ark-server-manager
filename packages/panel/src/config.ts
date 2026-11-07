import { PANEL_DEFAULT_PORT, PANEL_VERSION } from "@ark-host/shared";
import os from "node:os";
import path from "node:path";

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

const dataDir =
  process.env.ARK_HOST_DATA_DIR ?? path.join(os.homedir(), ".ark-host", "data");

export const panelConfig = {
  version: PANEL_VERSION,
  host: process.env.ARK_HOST_PANEL_HOST ?? "0.0.0.0",
  port: Number(process.env.ARK_HOST_PANEL_PORT ?? PANEL_DEFAULT_PORT),
  dataDir,
  dbPath: process.env.ARK_HOST_DB_PATH ?? path.join(dataDir, "ark-host.db"),
  sessionSecret: process.env.ARK_HOST_SESSION_SECRET ?? "dev-session-secret-change-me",
  cookieName: "ark_host_session",
  cookieSecure: envBool("ARK_HOST_COOKIE_SECURE", false),
  mockMode: envBool("ARK_HOST_MOCK", true),
  daemonUrl: process.env.ARK_HOST_DAEMON_URL ?? "http://127.0.0.1:3920",
  daemonToken: process.env.ARK_HOST_DAEMON_TOKEN ?? "dev-daemon-token",
  instancesRoot:
    process.env.ARK_HOST_INSTANCES_ROOT ??
    path.join(os.homedir(), ".ark-host", "instances"),
  adminUsername: process.env.ARK_HOST_ADMIN_USER ?? "admin",
  adminPassword: process.env.ARK_HOST_ADMIN_PASSWORD ?? "changeme",
  webDist:
    process.env.ARK_HOST_WEB_DIST ??
    path.resolve(new URL("../../../web/dist", import.meta.url).pathname),
};
