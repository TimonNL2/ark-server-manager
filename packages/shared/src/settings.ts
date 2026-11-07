/** One mod entry with explicit load order (index in array = order). */
export interface ModEntry {
  /** CurseForge project ID (ASA) or Steam Workshop ID (ASE). */
  id: string;
  enabled: boolean;
  note?: string;
}

/** Structured game settings editable in the instance Settings UI. */
export interface InstanceGameSettings {
  /** Display / ops name in the panel. */
  name: string;
  sessionName: string;
  serverPassword: string;
  adminPassword: string;
  maxPlayers: number;
  mapId: string;
  difficultyOffset: number;
  overrideOfficialDifficulty: number;

  // Classic rates
  xpMultiplier: number;
  tamingSpeedMultiplier: number;
  harvestAmountMultiplier: number;
  harvestHealthMultiplier: number;
  resourcesRespawnPeriodMultiplier: number;

  // Breeding
  matingIntervalMultiplier: number;
  eggHatchSpeedMultiplier: number;
  babyMatureSpeedMultiplier: number;
  babyCuddleIntervalMultiplier: number;
  babyImprintAmountMultiplier: number;
  layEggIntervalMultiplier: number;

  // Structures
  structureResistanceMultiplier: number;
  structureDamageMultiplier: number;
  structurePreventResourceRadiusMultiplier: number;
  pveStructureDecayPeriodMultiplier: number;
  maxStructuresInRange: number;

  // Mode / decay
  serverPve: boolean;
  disableStructureDecayPve: boolean;
  disableDinoDecayPve: boolean;
  allowCaveBuildingPve: boolean;

  // Network
  gamePort: number;
  queryPort: number;
  rconPort: number;
  rconPassword: string;

  // Platform / anti-cheat / mods
  crossplay: boolean;
  battleEye: boolean;
  /** Ordered mod list — index is load order. */
  modList: ModEntry[];

  // Cluster
  clusterId: string | null;
  transferInventory: boolean;
  transferDinos: boolean;
  transferTribute: boolean;

  // Ops
  autoSavePeriodMinutes: number;
  messageOfTheDay: string;
  extraArgs: string;
}

export const DEFAULT_GAME_SETTINGS: Omit<
  InstanceGameSettings,
  | "name"
  | "sessionName"
  | "serverPassword"
  | "adminPassword"
  | "maxPlayers"
  | "mapId"
  | "gamePort"
  | "queryPort"
  | "rconPort"
  | "clusterId"
  | "transferInventory"
  | "transferDinos"
  | "transferTribute"
  | "extraArgs"
> = {
  difficultyOffset: 1,
  overrideOfficialDifficulty: 5,
  xpMultiplier: 1,
  tamingSpeedMultiplier: 1,
  harvestAmountMultiplier: 1,
  harvestHealthMultiplier: 1,
  resourcesRespawnPeriodMultiplier: 1,
  matingIntervalMultiplier: 1,
  eggHatchSpeedMultiplier: 1,
  babyMatureSpeedMultiplier: 1,
  babyCuddleIntervalMultiplier: 1,
  babyImprintAmountMultiplier: 1,
  layEggIntervalMultiplier: 1,
  structureResistanceMultiplier: 1,
  structureDamageMultiplier: 1,
  structurePreventResourceRadiusMultiplier: 1,
  pveStructureDecayPeriodMultiplier: 1,
  maxStructuresInRange: 10500,
  serverPve: false,
  disableStructureDecayPve: false,
  disableDinoDecayPve: false,
  allowCaveBuildingPve: false,
  rconPassword: "",
  crossplay: true,
  battleEye: false,
  modList: [],
  autoSavePeriodMinutes: 15,
  messageOfTheDay: "",
};

/** Normalize legacy `mods` string into ordered modList. */
export function parseModsToList(mods: string | ModEntry[] | undefined | null): ModEntry[] {
  if (Array.isArray(mods)) {
    return mods
      .map((m) => ({
        id: String(m.id ?? "").trim(),
        enabled: m.enabled !== false,
        note: m.note,
      }))
      .filter((m) => /^\d+$/.test(m.id));
  }
  if (!mods || typeof mods !== "string") return [];
  return mods
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map((id) => ({ id, enabled: true }));
}

export function modListToLaunchArg(modList: ModEntry[]): string | null {
  const ids = modList.filter((m) => m.enabled && /^\d+$/.test(m.id)).map((m) => m.id);
  return ids.length ? ids.join(",") : null;
}

export interface InstanceSettingsResponse {
  settings: InstanceGameSettings;
  /** Relative paths written under the instance root. */
  iniPaths: {
    gameUserSettings: string;
    gameIni: string;
  };
  preview: {
    gameUserSettings: string;
    gameIni: string;
  };
}

export interface SaveInstanceSettingsResult extends InstanceSettingsResponse {
  written: string[];
  message: string;
}
