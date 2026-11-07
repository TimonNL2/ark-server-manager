import type {
  Cluster,
  CreateClusterInput,
  CreateInstanceInput,
  MapOption,
  ServerInstance,
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
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return data as T;
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
  listClusters() {
    return request<{ clusters: Cluster[] }>("/api/clusters");
  },
  createCluster(input: CreateClusterInput) {
    return request<{ cluster: Cluster }>("/api/clusters", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  deleteCluster(id: string) {
    return request<{ ok: boolean }>(`/api/clusters/${id}`, { method: "DELETE" });
  },
};
