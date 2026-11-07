import type { ConsoleLine, DaemonStatus, InstanceStatus } from "@ark-host/shared";
import { panelConfig } from "./config.js";
import type { InstanceRow } from "./repos.js";
import type { ClusterRow } from "./repos.js";

export interface DaemonActionResult {
  status: InstanceStatus;
  pid: number | null;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${panelConfig.daemonToken}`,
    "Content-Type": "application/json",
  };
}

async function daemonFetch(pathname: string, init?: RequestInit): Promise<Response> {
  const url = `${panelConfig.daemonUrl}${pathname}`;
  return fetch(url, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
}

export function toManagedSpec(instance: InstanceRow, cluster: ClusterRow | null) {
  return {
    id: instance.id,
    name: instance.name,
    edition: instance.edition,
    mapId: instance.map_id,
    sessionName: instance.session_name,
    gamePort: instance.game_port,
    queryPort: instance.query_port,
    rconPort: instance.rcon_port,
    maxPlayers: instance.max_players,
    adminPassword: instance.admin_password,
    serverPassword: instance.server_password,
    clusterId: instance.cluster_ref,
    clusterToken: cluster?.cluster_id ?? null,
    transferInventory: cluster ? Boolean(cluster.transfer_inventory) : true,
    transferDinos: cluster ? Boolean(cluster.transfer_dinos) : true,
    transferTribute: cluster ? Boolean(cluster.transfer_tribute) : true,
    installPath: instance.install_path,
    extraArgs: instance.extra_args,
  };
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  const res = await daemonFetch("/v1/status");
  if (!res.ok) throw new Error(`Daemon status failed: ${res.status}`);
  return (await res.json()) as DaemonStatus;
}

export async function getInstanceRuntime(
  id: string,
): Promise<{ status: InstanceStatus; pid: number | null }> {
  try {
    const res = await daemonFetch(`/v1/instances/${id}/status`);
    if (!res.ok) return { status: "unknown", pid: null };
    return (await res.json()) as { status: InstanceStatus; pid: number | null };
  } catch {
    return { status: "unknown", pid: null };
  }
}

export async function startInstance(
  instance: InstanceRow,
  cluster: ClusterRow | null,
): Promise<DaemonActionResult> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/start`, {
    method: "POST",
    body: JSON.stringify(toManagedSpec(instance, cluster)),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Start failed: ${res.status} ${body}`);
  }
  return (await res.json()) as DaemonActionResult;
}

export async function stopInstance(id: string): Promise<DaemonActionResult> {
  const res = await daemonFetch(`/v1/instances/${id}/stop`, {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stop failed: ${res.status} ${body}`);
  }
  return (await res.json()) as DaemonActionResult;
}

export async function restartInstance(
  instance: InstanceRow,
  cluster: ClusterRow | null,
): Promise<DaemonActionResult> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/restart`, {
    method: "POST",
    body: JSON.stringify(toManagedSpec(instance, cluster)),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Restart failed: ${res.status} ${body}`);
  }
  return (await res.json()) as DaemonActionResult;
}

export async function getConsole(id: string, after = 0): Promise<ConsoleLine[]> {
  const res = await daemonFetch(`/v1/instances/${id}/console?after=${after}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { lines: ConsoleLine[] };
  return data.lines;
}
