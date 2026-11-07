import { DAEMON_DEFAULT_PORT, DAEMON_VERSION } from "@ark-host/shared";
import os from "node:os";
import path from "node:path";

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const daemonConfig = {
  version: DAEMON_VERSION,
  host: process.env.ARK_HOST_DAEMON_HOST ?? "127.0.0.1",
  port: Number(process.env.ARK_HOST_DAEMON_PORT ?? DAEMON_DEFAULT_PORT),
  token: process.env.ARK_HOST_DAEMON_TOKEN ?? "dev-daemon-token",
  mockMode: envBool("ARK_HOST_MOCK", true),
  instancesRoot:
    process.env.ARK_HOST_INSTANCES_ROOT ??
    path.join(os.homedir(), ".ark-host", "instances"),
  protonPath: process.env.ARK_HOST_PROTON_PATH ?? "/opt/ark-host/proton/current",
  steamcmdPath: process.env.ARK_HOST_STEAMCMD_PATH ?? "/opt/ark-host/steamcmd/steamcmd.sh",
};
