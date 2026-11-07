import type {
  Cluster,
  CreateClusterInput,
  CreateInstanceInput,
  DirEntry,
  LaunchPreview,
  MapOption,
  ServerInstance,
  SteamCmdUpdateResult,
  UpdateClusterInput,
  UserPublic,
} from "@ark-host/shared";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });
  if (res.headers.get("content-type")?.includes("application/json") || path.includes("/api/")) {
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new ApiError(res.status, data.error ?? res.statusText);
    }
    return data as T;
  }
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return undefined as T;
}

export const api = {
  login(username: string, password: string) {
    return request<{ user: UserPublic }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },
  me() {
    return request<{ user: UserPublic }>("/api/auth/me");
  },
  meta() {
    return request<{
      version: string;
      mockMode: boolean;
      maps: { ASA: MapOption[]; ASE: MapOption[] };
      suggestedPorts: { gamePort: number; queryPort: number; rconPort: number };
      daemon: { mockMode: boolean; version: string; host: string; instancesRoot: string } | null;
    }>("/api/meta");
  },
  listInstances() {
    return request<{ instances: ServerInstance[] }>("/api/instances");
  },
  getInstance(id: string) {
    return request<{ instance: ServerInstance; cluster: Cluster | null }>(`/api/instances/${id}`);
  },
  createInstance(input: CreateInstanceInput) {
    return request<{ instance: ServerInstance }>("/api/instances", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  deleteInstance(id: string) {
    return request<{ ok: boolean }>(`/api/instances/${id}`, { method: "DELETE" });
  },
  startInstance(id: string) {
    return request<{ instance: ServerInstance }>(`/api/instances/${id}/start`, { method: "POST" });
  },
  stopInstance(id: string) {
    return request<{ instance: ServerInstance }>(`/api/instances/${id}/stop`, { method: "POST" });
  },
  restartInstance(id: string) {
    return request<{ instance: ServerInstance }>(`/api/instances/${id}/restart`, {
      method: "POST",
    });
  },
  launchPreview(id: string) {
    return request<{ preview: LaunchPreview }>(`/api/instances/${id}/launch-preview`);
  },
  steamCmdUpdate(id: string) {
    return request<{ result: SteamCmdUpdateResult }>(`/api/instances/${id}/steamcmd-update`, {
      method: "POST",
    });
  },
  applyInstanceCluster(id: string) {
    return request<{ clusterDir: string; written: string[] }>(
      `/api/instances/${id}/cluster-apply`,
      { method: "POST" },
    );
  },
  listFiles(id: string, path = ".") {
    return request<{ entries: DirEntry[] }>(
      `/api/instances/${id}/files?path=${encodeURIComponent(path)}`,
    );
  },
  readFile(id: string, path: string) {
    return request<{ content: string; truncated: boolean; size: number }>(
      `/api/instances/${id}/files/content?path=${encodeURIComponent(path)}`,
    );
  },
  writeFile(id: string, path: string, content: string) {
    return request<{ path: string; size: number }>(`/api/instances/${id}/files/content`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    });
  },
  mkdir(id: string, path: string) {
    return request<{ path: string }>(`/api/instances/${id}/files/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  },
  deleteFile(id: string, path: string) {
    return request<{ ok: boolean }>(
      `/api/instances/${id}/files?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    );
  },
  uploadFile(id: string, dir: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{ path: string; size: number }>(
      `/api/instances/${id}/files/upload?path=${encodeURIComponent(dir)}`,
      { method: "POST", body: form },
    );
  },
  listClusters() {
    return request<{ clusters: Cluster[] }>("/api/clusters");
  },
  getCluster(id: string) {
    return request<{
      cluster: Cluster;
      members: ServerInstance[];
      sharedDirHint: string;
    }>(`/api/clusters/${id}`);
  },
  createCluster(input: CreateClusterInput) {
    return request<{ cluster: Cluster }>("/api/clusters", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateCluster(id: string, input: UpdateClusterInput) {
    return request<{ cluster: Cluster }>(`/api/clusters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  applyCluster(id: string) {
    return request<{
      results: Array<{ instanceId: string; ok: boolean; error?: string }>;
      sharedDirHint: string;
    }>(`/api/clusters/${id}/apply`, { method: "POST" });
  },
  deleteCluster(id: string) {
    return request<{ ok: boolean }>(`/api/clusters/${id}`, { method: "DELETE" });
  },
};
