import type {
  ConsoleLine,
  DaemonStatus,
  DirEntry,
  InstanceGameSettings,
  InstanceStatus,
  LaunchPreview,
  SteamCmdUpdateResult,
} from "@ark-host/shared";
import { panelConfig } from "./config.js";
import { buildSettingsFromRow, type ClusterRow, type InstanceRow } from "./repos.js";

export interface DaemonActionResult {
  status: InstanceStatus;
  pid: number | null;
}

function jsonHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${panelConfig.daemonToken}`,
    "Content-Type": "application/json",
  };
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${panelConfig.daemonToken}` };
}

async function daemonFetch(pathname: string, init?: RequestInit): Promise<Response> {
  const url = `${panelConfig.daemonUrl}${pathname}`;
  return fetch(url, {
    ...init,
    headers: { ...authHeader(), ...(init?.headers ?? {}) },
  });
}

export function toManagedSpec(instance: InstanceRow, cluster: ClusterRow | null) {
  const settings = buildSettingsFromRow(instance, cluster);
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
    transferInventory: settings.transferInventory,
    transferDinos: settings.transferDinos,
    transferTribute: settings.transferTribute,
    installPath: instance.install_path,
    extraArgs: instance.extra_args,
    battleEye: settings.battleEye,
    crossplay: settings.crossplay,
    modList: settings.modList,
    gameSettings: settings,
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
    headers: jsonHeaders(),
    body: JSON.stringify(toManagedSpec(instance, cluster)),
  });
  if (!res.ok) throw new Error(`Start failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DaemonActionResult;
}

export async function stopInstance(id: string): Promise<DaemonActionResult> {
  const res = await daemonFetch(`/v1/instances/${id}/stop`, {
    method: "POST",
    headers: jsonHeaders(),
    body: "{}",
  });
  if (!res.ok) throw new Error(`Stop failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DaemonActionResult;
}

export async function restartInstance(
  instance: InstanceRow,
  cluster: ClusterRow | null,
): Promise<DaemonActionResult> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/restart`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(toManagedSpec(instance, cluster)),
  });
  if (!res.ok) throw new Error(`Restart failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DaemonActionResult;
}

export async function getConsole(id: string, after = -1): Promise<ConsoleLine[]> {
  const res = await daemonFetch(`/v1/instances/${id}/console?after=${after}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { lines: ConsoleLine[] };
  return data.lines;
}

export function daemonConsoleWsUrl(id: string, after = -1): string {
  const base = panelConfig.daemonUrl.replace(/^http/, "ws");
  return `${base}/v1/instances/${id}/console/ws?after=${after}`;
}

export async function listFiles(id: string, relPath = "."): Promise<DirEntry[]> {
  const res = await daemonFetch(
    `/v1/instances/${id}/files?path=${encodeURIComponent(relPath)}`,
  );
  if (!res.ok) throw new Error(`List files failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { entries: DirEntry[] };
  return data.entries;
}

export async function readFileContent(id: string, relPath: string) {
  const res = await daemonFetch(
    `/v1/instances/${id}/files/content?path=${encodeURIComponent(relPath)}`,
  );
  if (!res.ok) throw new Error(`Read failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { content: string; truncated: boolean; size: number };
}

export async function writeFileContent(id: string, relPath: string, content: string) {
  const res = await daemonFetch(`/v1/instances/${id}/files/content`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ path: relPath, content }),
  });
  if (!res.ok) throw new Error(`Write failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { path: string; size: number };
}

export async function mkdirFile(id: string, relPath: string) {
  const res = await daemonFetch(`/v1/instances/${id}/files/mkdir`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ path: relPath }),
  });
  if (!res.ok) throw new Error(`mkdir failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { path: string };
}

export async function deleteFile(id: string, relPath: string) {
  const res = await daemonFetch(
    `/v1/instances/${id}/files?path=${encodeURIComponent(relPath)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Delete failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { ok: boolean };
}

export async function downloadFile(id: string, relPath: string): Promise<Response> {
  const res = await daemonFetch(
    `/v1/instances/${id}/files/download?path=${encodeURIComponent(relPath)}`,
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${await res.text()}`);
  return res;
}

export async function uploadFile(
  id: string,
  relPath: string,
  filename: string,
  data: Buffer,
  contentType: string,
): Promise<{ path: string; size: number }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(data)], { type: contentType || "application/octet-stream" }),
    filename,
  );
  const res = await daemonFetch(
    `/v1/instances/${id}/files/upload?path=${encodeURIComponent(relPath)}`,
    {
      method: "POST",
      headers: authHeader(),
      body: form,
    },
  );
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { path: string; size: number };
}

export async function launchPreview(
  instance: InstanceRow,
  cluster: ClusterRow | null,
): Promise<LaunchPreview> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/launch-preview`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(toManagedSpec(instance, cluster)),
  });
  if (!res.ok) throw new Error(`Launch preview failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as LaunchPreview;
}

export async function applyClusterToInstance(
  instance: InstanceRow,
  cluster: ClusterRow,
): Promise<{ clusterDir: string; written: string[] }> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/cluster-apply`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      edition: instance.edition,
      clusterToken: cluster.cluster_id,
      transferInventory: Boolean(cluster.transfer_inventory),
      transferDinos: Boolean(cluster.transfer_dinos),
      transferTribute: Boolean(cluster.transfer_tribute),
    }),
  });
  if (!res.ok) throw new Error(`Cluster apply failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { clusterDir: string; written: string[] };
}

export async function steamCmdUpdate(
  instance: InstanceRow,
): Promise<SteamCmdUpdateResult> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/steamcmd-update`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      edition: instance.edition,
      installPath: instance.install_path,
    }),
  });
  if (!res.ok) throw new Error(`SteamCMD update failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as SteamCmdUpdateResult;
}

export async function previewInstanceSettings(
  instance: InstanceRow,
  settings: InstanceGameSettings,
): Promise<{
  preview: { gameUserSettings: string; gameIni: string };
  iniPaths: { gameUserSettings: string; gameIni: string };
}> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/settings/preview`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ edition: instance.edition, settings }),
  });
  if (!res.ok) throw new Error(`Settings preview failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    preview: { gameUserSettings: string; gameIni: string };
    iniPaths: { gameUserSettings: string; gameIni: string };
  };
}

export async function applyInstanceSettings(
  instance: InstanceRow,
  settings: InstanceGameSettings,
  opts?: { writeRaw?: boolean; rawGameUserSettings?: string; rawGameIni?: string },
): Promise<{
  written: string[];
  preview: { gameUserSettings: string; gameIni: string };
  iniPaths: { gameUserSettings: string; gameIni: string };
}> {
  const res = await daemonFetch(`/v1/instances/${instance.id}/settings/apply`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      edition: instance.edition,
      settings,
      writeRaw: opts?.writeRaw ?? false,
      rawGameUserSettings: opts?.rawGameUserSettings,
      rawGameIni: opts?.rawGameIni,
    }),
  });
  if (!res.ok) throw new Error(`Settings apply failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    written: string[];
    preview: { gameUserSettings: string; gameIni: string };
    iniPaths: { gameUserSettings: string; gameIni: string };
  };
}

export { panelConfig };
