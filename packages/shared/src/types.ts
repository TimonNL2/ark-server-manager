export type GameEdition = "ASA" | "ASE";

export type InstanceStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed"
  | "unknown"
  | "mock";

export interface Cluster {
  id: string;
  name: string;
  clusterId: string;
  transferInventory: boolean;
  transferDinos: boolean;
  transferTribute: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerInstance {
  id: string;
  name: string;
  edition: GameEdition;
  mapId: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  maxPlayers: number;
  adminPassword: string;
  serverPassword: string | null;
  clusterId: string | null;
  installPath: string;
  extraArgs: string;
  autoStart: boolean;
  status: InstanceStatus;
  pid: number | null;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
  createdAt: string;
}

export interface DaemonStatus {
  mockMode: boolean;
  version: string;
  host: string;
  instancesRoot: string;
}

export interface ConsoleLine {
  ts: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
