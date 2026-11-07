import fs from "node:fs/promises";
import path from "node:path";
import type { GameEdition, InstanceGameSettings } from "@ark-host/shared";
import { ensureInstanceDir, resolveInstancePath } from "./file-sandbox.js";
import { boolIni, upsertIniSectionKeys } from "./ini-merge.js";

export function relativeIniPaths(edition: GameEdition): {
  gameUserSettings: string;
  gameIni: string;
} {
  if (edition === "ASA") {
    return {
      gameUserSettings: "ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini",
      gameIni: "ShooterGame/Saved/Config/WindowsServer/Game.ini",
    };
  }
  return {
    gameUserSettings: "ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini",
    gameIni: "ShooterGame/Saved/Config/LinuxServer/Game.ini",
  };
}

function gusWritePaths(edition: GameEdition, instanceId: string): string[] {
  const root = resolveInstancePath(instanceId);
  const rel = relativeIniPaths(edition);
  const paths = [path.join(root, rel.gameUserSettings), path.join(root, "Config", "GameUserSettings.ini")];
  if (edition === "ASE") {
    paths.push(path.join(root, "ShooterGame", "Saved", "Config", "WindowsServer", "GameUserSettings.ini"));
  }
  return paths;
}

function gameIniWritePaths(edition: GameEdition, instanceId: string): string[] {
  const root = resolveInstancePath(instanceId);
  const rel = relativeIniPaths(edition);
  const paths = [path.join(root, rel.gameIni), path.join(root, "Config", "Game.ini")];
  if (edition === "ASE") {
    paths.push(path.join(root, "ShooterGame", "Saved", "Config", "WindowsServer", "Game.ini"));
  }
  return paths;
}

export function buildGameUserSettingsContent(
  existing: string,
  settings: InstanceGameSettings,
): string {
  const serverSettings: Record<string, string> = {
    SessionName: settings.sessionName,
    ServerPassword: settings.serverPassword || "",
    ServerAdminPassword: settings.adminPassword,
    DifficultyOffset: String(settings.difficultyOffset),
    OverrideOfficialDifficulty: String(settings.overrideOfficialDifficulty),
    XPMultiplier: String(settings.xpMultiplier),
    TamingSpeedMultiplier: String(settings.tamingSpeedMultiplier),
    HarvestAmountMultiplier: String(settings.harvestAmountMultiplier),
    HarvestHealthMultiplier: String(settings.harvestHealthMultiplier),
    ResourcesRespawnPeriodMultiplier: String(settings.resourcesRespawnPeriodMultiplier),
    MatingIntervalMultiplier: String(settings.matingIntervalMultiplier),
    EggHatchSpeedMultiplier: String(settings.eggHatchSpeedMultiplier),
    BabyMatureSpeedMultiplier: String(settings.babyMatureSpeedMultiplier),
    BabyCuddleIntervalMultiplier: String(settings.babyCuddleIntervalMultiplier),
    BabyImprintAmountMultiplier: String(settings.babyImprintAmountMultiplier),
    LayEggIntervalMultiplier: String(settings.layEggIntervalMultiplier),
    StructureResistanceMultiplier: String(settings.structureResistanceMultiplier),
    StructureDamageMultiplier: String(settings.structureDamageMultiplier),
    StructurePreventResourceRadiusMultiplier: String(
      settings.structurePreventResourceRadiusMultiplier,
    ),
    PvEStructureDecayPeriodMultiplier: String(settings.pveStructureDecayPeriodMultiplier),
    TheMaxStructuresInRange: String(settings.maxStructuresInRange),
    ServerPVE: boolIni(settings.serverPve),
    DisableStructureDecayPVE: boolIni(settings.disableStructureDecayPve),
    DisableDinoDecayPvE: boolIni(settings.disableDinoDecayPve),
    AllowCaveBuildingPvE: boolIni(settings.allowCaveBuildingPve),
    AutoSavePeriodMinutes: String(settings.autoSavePeriodMinutes),
    RCONEnabled: "True",
    RCONPort: String(settings.rconPort),
    ShowMapPlayerLocation: "True",
    AllowThirdPersonPlayer: "True",
    PreventDownloadSurvivors: boolIni(!settings.transferTribute),
    PreventDownloadItems: boolIni(!settings.transferInventory),
    PreventDownloadDinos: boolIni(!settings.transferDinos),
    PreventUploadSurvivors: boolIni(!settings.transferTribute),
    PreventUploadItems: boolIni(!settings.transferInventory),
    PreventUploadDinos: boolIni(!settings.transferDinos),
  };

  if (settings.rconPassword.trim()) {
    serverSettings.RCONServerPassword = settings.rconPassword.trim();
  }

  let text = existing.trim() ? existing : "[ServerSettings]\n";
  text = upsertIniSectionKeys(text, "ServerSettings", serverSettings);

  const motd = settings.messageOfTheDay.trim();
  text = upsertIniSectionKeys(text, "MessageOfTheDay", {
    Message: motd,
    Duration: motd ? "20" : "0",
  });

  return text;
}

export function buildGameIniContent(existing: string, settings: InstanceGameSettings): string {
  const keys: Record<string, string> = {
    XPMultiplier: String(settings.xpMultiplier),
    TamingSpeedMultiplier: String(settings.tamingSpeedMultiplier),
    HarvestAmountMultiplier: String(settings.harvestAmountMultiplier),
    MatingIntervalMultiplier: String(settings.matingIntervalMultiplier),
    EggHatchSpeedMultiplier: String(settings.eggHatchSpeedMultiplier),
    BabyMatureSpeedMultiplier: String(settings.babyMatureSpeedMultiplier),
    BabyCuddleIntervalMultiplier: String(settings.babyCuddleIntervalMultiplier),
    BabyImprintAmountMultiplier: String(settings.babyImprintAmountMultiplier),
    LayEggIntervalMultiplier: String(settings.layEggIntervalMultiplier),
  };
  let text = existing.trim() ? existing : "[/script/shootergame.shootergamemode]\n";
  text = upsertIniSectionKeys(text, "/script/shootergame.shootergamemode", keys);
  return text;
}

export async function readPrimaryIni(
  instanceId: string,
  edition: GameEdition,
): Promise<{ gameUserSettings: string; gameIni: string }> {
  await ensureInstanceDir(instanceId);
  const rel = relativeIniPaths(edition);
  const root = resolveInstancePath(instanceId);

  const readOrEmpty = async (relPath: string) => {
    const p = path.join(root, relPath);
    try {
      return await fs.readFile(p, "utf8");
    } catch {
      const fallback = path.join(root, "Config", path.basename(relPath));
      try {
        return await fs.readFile(fallback, "utf8");
      } catch {
        return "";
      }
    }
  };

  return {
    gameUserSettings: await readOrEmpty(rel.gameUserSettings),
    gameIni: await readOrEmpty(rel.gameIni),
  };
}

export async function applyGameSettings(
  instanceId: string,
  edition: GameEdition,
  settings: InstanceGameSettings,
  opts?: { rawGameUserSettings?: string; rawGameIni?: string; writeRaw?: boolean },
): Promise<{ written: string[]; preview: { gameUserSettings: string; gameIni: string } }> {
  await ensureInstanceDir(instanceId);
  const existing = await readPrimaryIni(instanceId, edition);

  const preview = {
    gameUserSettings:
      opts?.writeRaw && typeof opts.rawGameUserSettings === "string"
        ? opts.rawGameUserSettings
        : buildGameUserSettingsContent(existing.gameUserSettings, settings),
    gameIni:
      opts?.writeRaw && typeof opts.rawGameIni === "string"
        ? opts.rawGameIni
        : buildGameIniContent(existing.gameIni, settings),
  };

  const written: string[] = [];
  for (const gus of gusWritePaths(edition, instanceId)) {
    await fs.mkdir(path.dirname(gus), { recursive: true });
    await fs.writeFile(gus, preview.gameUserSettings, "utf8");
    written.push(gus);
  }
  for (const gi of gameIniWritePaths(edition, instanceId)) {
    await fs.mkdir(path.dirname(gi), { recursive: true });
    await fs.writeFile(gi, preview.gameIni, "utf8");
    written.push(gi);
  }

  return { written, preview };
}

export async function previewGameSettings(
  instanceId: string,
  edition: GameEdition,
  settings: InstanceGameSettings,
): Promise<{ gameUserSettings: string; gameIni: string }> {
  const existing = await readPrimaryIni(instanceId, edition);
  return {
    gameUserSettings: buildGameUserSettingsContent(existing.gameUserSettings, settings),
    gameIni: buildGameIniContent(existing.gameIni, settings),
  };
}
