import type {
  CreateClusterInput,
  CreateInstanceInput,
  GameEdition,
  ServerInstance,
  Cluster,
  InstanceGameSettings,
  ModEntry,
} from "@ark-host/shared";
import { DEFAULT_GAME_SETTINGS, parseModsToList } from "@ark-host/shared";
import path from "node:path";
import { getDb } from "./db.js";
import { panelConfig } from "./config.js";

export interface ClusterRow {
  id: string;
  name: string;
  cluster_id: string;
  transfer_inventory: number;
  transfer_dinos: number;
  transfer_tribute: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstanceRow {
  id: string;
  name: string;
  edition: GameEdition;
  map_id: string;
  session_name: string;
  game_port: number;
  query_port: number;
  rcon_port: number;
  max_players: number;
  admin_password: string;
  server_password: string | null;
  cluster_ref: string | null;
  install_path: string;
  extra_args: string;
  auto_start: number;
  settings_json: string;
  created_at: string;
  updated_at: string;
}

type StoredExtras = Partial<InstanceGameSettings> & { mods?: string };

function parseExtras(raw: string | null | undefined): StoredExtras {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoredExtras;
  } catch {
    return {};
  }
}

function pickNum(
  extras: StoredExtras,
  key: keyof InstanceGameSettings,
  fallback: number,
): number {
  const v = extras[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pickBool(
  extras: StoredExtras,
  key: keyof InstanceGameSettings,
  fallback: boolean,
): boolean {
  const v = extras[key];
  return typeof v === "boolean" ? v : fallback;
}

export function buildSettingsFromRow(
  row: InstanceRow,
  cluster: ClusterRow | null,
): InstanceGameSettings {
  const extras = parseExtras(row.settings_json);
  const modList: ModEntry[] =
    extras.modList !== undefined
      ? parseModsToList(extras.modList)
      : parseModsToList(extras.mods);

  return {
    name: row.name,
    sessionName: row.session_name,
    serverPassword: row.server_password ?? "",
    adminPassword: row.admin_password,
    maxPlayers: row.max_players,
    mapId: row.map_id,
    difficultyOffset: pickNum(extras, "difficultyOffset", DEFAULT_GAME_SETTINGS.difficultyOffset),
    overrideOfficialDifficulty: pickNum(
      extras,
      "overrideOfficialDifficulty",
      DEFAULT_GAME_SETTINGS.overrideOfficialDifficulty,
    ),
    xpMultiplier: pickNum(extras, "xpMultiplier", DEFAULT_GAME_SETTINGS.xpMultiplier),
    tamingSpeedMultiplier: pickNum(
      extras,
      "tamingSpeedMultiplier",
      DEFAULT_GAME_SETTINGS.tamingSpeedMultiplier,
    ),
    harvestAmountMultiplier: pickNum(
      extras,
      "harvestAmountMultiplier",
      DEFAULT_GAME_SETTINGS.harvestAmountMultiplier,
    ),
    harvestHealthMultiplier: pickNum(
      extras,
      "harvestHealthMultiplier",
      DEFAULT_GAME_SETTINGS.harvestHealthMultiplier,
    ),
    resourcesRespawnPeriodMultiplier: pickNum(
      extras,
      "resourcesRespawnPeriodMultiplier",
      DEFAULT_GAME_SETTINGS.resourcesRespawnPeriodMultiplier,
    ),
    matingIntervalMultiplier: pickNum(
      extras,
      "matingIntervalMultiplier",
      DEFAULT_GAME_SETTINGS.matingIntervalMultiplier,
    ),
    eggHatchSpeedMultiplier: pickNum(
      extras,
      "eggHatchSpeedMultiplier",
      DEFAULT_GAME_SETTINGS.eggHatchSpeedMultiplier,
    ),
    babyMatureSpeedMultiplier: pickNum(
      extras,
      "babyMatureSpeedMultiplier",
      DEFAULT_GAME_SETTINGS.babyMatureSpeedMultiplier,
    ),
    babyCuddleIntervalMultiplier: pickNum(
      extras,
      "babyCuddleIntervalMultiplier",
      DEFAULT_GAME_SETTINGS.babyCuddleIntervalMultiplier,
    ),
    babyImprintAmountMultiplier: pickNum(
      extras,
      "babyImprintAmountMultiplier",
      DEFAULT_GAME_SETTINGS.babyImprintAmountMultiplier,
    ),
    layEggIntervalMultiplier: pickNum(
      extras,
      "layEggIntervalMultiplier",
      DEFAULT_GAME_SETTINGS.layEggIntervalMultiplier,
    ),
    structureResistanceMultiplier: pickNum(
      extras,
      "structureResistanceMultiplier",
      DEFAULT_GAME_SETTINGS.structureResistanceMultiplier,
    ),
    structureDamageMultiplier: pickNum(
      extras,
      "structureDamageMultiplier",
      DEFAULT_GAME_SETTINGS.structureDamageMultiplier,
    ),
    structurePreventResourceRadiusMultiplier: pickNum(
      extras,
      "structurePreventResourceRadiusMultiplier",
      DEFAULT_GAME_SETTINGS.structurePreventResourceRadiusMultiplier,
    ),
    pveStructureDecayPeriodMultiplier: pickNum(
      extras,
      "pveStructureDecayPeriodMultiplier",
      DEFAULT_GAME_SETTINGS.pveStructureDecayPeriodMultiplier,
    ),
    maxStructuresInRange: pickNum(
      extras,
      "maxStructuresInRange",
      DEFAULT_GAME_SETTINGS.maxStructuresInRange,
    ),
    serverPve: pickBool(extras, "serverPve", DEFAULT_GAME_SETTINGS.serverPve),
    disableStructureDecayPve: pickBool(
      extras,
      "disableStructureDecayPve",
      DEFAULT_GAME_SETTINGS.disableStructureDecayPve,
    ),
    disableDinoDecayPve: pickBool(
      extras,
      "disableDinoDecayPve",
      DEFAULT_GAME_SETTINGS.disableDinoDecayPve,
    ),
    allowCaveBuildingPve: pickBool(
      extras,
      "allowCaveBuildingPve",
      DEFAULT_GAME_SETTINGS.allowCaveBuildingPve,
    ),
    gamePort: row.game_port,
    queryPort: row.query_port,
    rconPort: row.rcon_port,
    rconPassword:
      typeof extras.rconPassword === "string"
        ? extras.rconPassword
        : DEFAULT_GAME_SETTINGS.rconPassword,
    crossplay: pickBool(extras, "crossplay", DEFAULT_GAME_SETTINGS.crossplay),
    battleEye: pickBool(extras, "battleEye", DEFAULT_GAME_SETTINGS.battleEye),
    modList,
    clusterId: row.cluster_ref,
    transferInventory: cluster ? Boolean(cluster.transfer_inventory) : true,
    transferDinos: cluster ? Boolean(cluster.transfer_dinos) : true,
    transferTribute: cluster ? Boolean(cluster.transfer_tribute) : true,
    autoSavePeriodMinutes: pickNum(
      extras,
      "autoSavePeriodMinutes",
      DEFAULT_GAME_SETTINGS.autoSavePeriodMinutes,
    ),
    messageOfTheDay:
      typeof extras.messageOfTheDay === "string"
        ? extras.messageOfTheDay
        : DEFAULT_GAME_SETTINGS.messageOfTheDay,
    extraArgs: row.extra_args,
  };
}

export function extrasJsonFromSettings(settings: InstanceGameSettings): string {
  const {
    name: _n,
    sessionName: _s,
    serverPassword: _sp,
    adminPassword: _ap,
    maxPlayers: _mp,
    mapId: _m,
    gamePort: _gp,
    queryPort: _qp,
    rconPort: _rp,
    clusterId: _c,
    transferInventory: _ti,
    transferDinos: _td,
    transferTribute: _tt,
    extraArgs: _e,
    ...extras
  } = settings;
  return JSON.stringify(extras);
}

export function mapCluster(row: ClusterRow): Cluster {
  return {
    id: row.id,
    name: row.name,
    clusterId: row.cluster_id,
    transferInventory: Boolean(row.transfer_inventory),
    transferDinos: Boolean(row.transfer_dinos),
    transferTribute: Boolean(row.transfer_tribute),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapInstance(
  row: InstanceRow,
  runtime: { status: ServerInstance["status"]; pid: number | null } = {
    status: "stopped",
    pid: null,
  },
): ServerInstance {
  return {
    id: row.id,
    name: row.name,
    edition: row.edition,
    mapId: row.map_id,
    sessionName: row.session_name,
    gamePort: row.game_port,
    queryPort: row.query_port,
    rconPort: row.rcon_port,
    maxPlayers: row.max_players,
    adminPassword: row.admin_password,
    serverPassword: row.server_password,
    clusterId: row.cluster_ref,
    installPath: row.install_path,
    extraArgs: row.extra_args,
    autoStart: Boolean(row.auto_start),
    status: runtime.status,
    pid: runtime.pid,
    lastStartedAt: null,
    lastStoppedAt: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listClusters(): Cluster[] {
  const rows = getDb().prepare("SELECT * FROM clusters ORDER BY name COLLATE NOCASE").all() as ClusterRow[];
  return rows.map(mapCluster);
}

export function getCluster(id: string): ClusterRow | null {
  return (getDb().prepare("SELECT * FROM clusters WHERE id = ?").get(id) as ClusterRow | undefined) ?? null;
}

export function createCluster(input: CreateClusterInput): Cluster {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO clusters
       (id, name, cluster_id, transfer_inventory, transfer_dinos, transfer_tribute, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.clusterId,
      input.transferInventory ? 1 : 0,
      input.transferDinos ? 1 : 0,
      input.transferTribute ? 1 : 0,
      input.notes ?? null,
      now,
      now,
    );
  return mapCluster(getCluster(id)!);
}

export function updateCluster(id: string, input: Partial<CreateClusterInput>): Cluster | null {
  const existing = getCluster(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = {
    name: input.name ?? existing.name,
    clusterId: input.clusterId ?? existing.cluster_id,
    transferInventory: input.transferInventory ?? Boolean(existing.transfer_inventory),
    transferDinos: input.transferDinos ?? Boolean(existing.transfer_dinos),
    transferTribute: input.transferTribute ?? Boolean(existing.transfer_tribute),
    notes: input.notes === undefined ? existing.notes : input.notes,
  };
  getDb()
    .prepare(
      `UPDATE clusters SET name=?, cluster_id=?, transfer_inventory=?, transfer_dinos=?, transfer_tribute=?, notes=?, updated_at=? WHERE id=?`,
    )
    .run(
      next.name,
      next.clusterId,
      next.transferInventory ? 1 : 0,
      next.transferDinos ? 1 : 0,
      next.transferTribute ? 1 : 0,
      next.notes,
      now,
      id,
    );
  return mapCluster(getCluster(id)!);
}

export function deleteCluster(id: string): boolean {
  const info = getDb().prepare("DELETE FROM clusters WHERE id = ?").run(id);
  return info.changes > 0;
}

export function listInstanceRows(): InstanceRow[] {
  return getDb().prepare("SELECT * FROM instances ORDER BY name COLLATE NOCASE").all() as InstanceRow[];
}

export function getInstanceRow(id: string): InstanceRow | null {
  return (getDb().prepare("SELECT * FROM instances WHERE id = ?").get(id) as InstanceRow | undefined) ?? null;
}

export function createInstance(input: CreateInstanceInput): InstanceRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const installPath = path.join(panelConfig.instancesRoot, id);
  getDb()
    .prepare(
      `INSERT INTO instances
       (id, name, edition, map_id, session_name, game_port, query_port, rcon_port, max_players,
        admin_password, server_password, cluster_ref, install_path, extra_args, auto_start,
        settings_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.edition,
      input.mapId,
      input.sessionName,
      input.gamePort,
      input.queryPort,
      input.rconPort,
      input.maxPlayers,
      input.adminPassword,
      input.serverPassword ?? null,
      input.clusterId ?? null,
      installPath,
      input.extraArgs ?? "",
      input.autoStart ? 1 : 0,
      "{}",
      now,
      now,
    );
  return getInstanceRow(id)!;
}

export function updateInstance(id: string, input: Partial<CreateInstanceInput>): InstanceRow | null {
  const existing = getInstanceRow(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE instances SET
        name=?, edition=?, map_id=?, session_name=?, game_port=?, query_port=?, rcon_port=?,
        max_players=?, admin_password=?, server_password=?, cluster_ref=?, extra_args=?, auto_start=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      input.name ?? existing.name,
      input.edition ?? existing.edition,
      input.mapId ?? existing.map_id,
      input.sessionName ?? existing.session_name,
      input.gamePort ?? existing.game_port,
      input.queryPort ?? existing.query_port,
      input.rconPort ?? existing.rcon_port,
      input.maxPlayers ?? existing.max_players,
      input.adminPassword ?? existing.admin_password,
      input.serverPassword === undefined ? existing.server_password : input.serverPassword,
      input.clusterId === undefined ? existing.cluster_ref : input.clusterId,
      input.extraArgs ?? existing.extra_args,
      (input.autoStart ?? Boolean(existing.auto_start)) ? 1 : 0,
      now,
      id,
    );
  return getInstanceRow(id)!;
}

/** Persist Settings tab: core columns + extras JSON. */
export function saveInstanceSettingsRow(
  id: string,
  settings: InstanceGameSettings,
): InstanceRow | null {
  const existing = getInstanceRow(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE instances SET
        name=?, map_id=?, session_name=?, game_port=?, query_port=?, rcon_port=?,
        max_players=?, admin_password=?, server_password=?, cluster_ref=?, extra_args=?,
        settings_json=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      settings.name,
      settings.mapId,
      settings.sessionName,
      settings.gamePort,
      settings.queryPort,
      settings.rconPort,
      settings.maxPlayers,
      settings.adminPassword,
      settings.serverPassword || null,
      settings.clusterId,
      settings.extraArgs,
      extrasJsonFromSettings(settings),
      now,
      id,
    );
  return getInstanceRow(id)!;
}

export function deleteInstance(id: string): boolean {
  const info = getDb().prepare("DELETE FROM instances WHERE id = ?").run(id);
  return info.changes > 0;
}

/** Suggest next free-ish ports based on existing instances. */
export function suggestPorts(): { gamePort: number; queryPort: number; rconPort: number } {
  const rows = listInstanceRows();
  if (rows.length === 0) {
    return { gamePort: 7777, queryPort: 27015, rconPort: 27020 };
  }
  const maxGame = Math.max(...rows.map((r) => r.game_port));
  const maxQuery = Math.max(...rows.map((r) => r.query_port));
  const maxRcon = Math.max(...rows.map((r) => r.rcon_port));
  return {
    gamePort: maxGame + 2,
    queryPort: maxQuery + 1,
    rconPort: maxRcon + 1,
  };
}
