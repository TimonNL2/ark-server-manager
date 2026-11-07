import fs from "node:fs/promises";
import path from "node:path";
import { ensureClusterDir, ensureInstanceDir, resolveInstancePath } from "./file-sandbox.js";
import type { GameEdition } from "@ark-host/shared";
import { boolIni, upsertIniSectionKeys } from "./ini-merge.js";

export interface ClusterTransferSettings {
  clusterToken: string;
  transferInventory: boolean;
  transferDinos: boolean;
  transferTribute: boolean;
}

/**
 * Minimal INI merge: set keys under [ServerSettings] related to transfers.
 * Ark uses PreventDownload / PreventUpload boolean-ish flags (True/False).
 */
export function mergeGameUserSettings(
  existing: string,
  settings: ClusterTransferSettings,
): string {
  const keys: Record<string, string> = {
    PreventDownloadSurvivors: boolIni(!settings.transferTribute),
    PreventDownloadItems: boolIni(!settings.transferInventory),
    PreventDownloadDinos: boolIni(!settings.transferDinos),
    PreventUploadSurvivors: boolIni(!settings.transferTribute),
    PreventUploadItems: boolIni(!settings.transferInventory),
    PreventUploadDinos: boolIni(!settings.transferDinos),
  };

  let text = existing.trim() ? existing : "[ServerSettings]\n";
  return upsertIniSectionKeys(text, "ServerSettings", keys);
}

function gusPaths(edition: GameEdition, instanceId: string): string[] {
  const root = resolveInstancePath(instanceId);
  if (edition === "ASA") {
    return [
      path.join(root, "ShooterGame", "Saved", "Config", "WindowsServer", "GameUserSettings.ini"),
      path.join(root, "Config", "GameUserSettings.ini"),
    ];
  }
  return [
    path.join(root, "ShooterGame", "Saved", "Config", "LinuxServer", "GameUserSettings.ini"),
    path.join(root, "ShooterGame", "Saved", "Config", "WindowsServer", "GameUserSettings.ini"),
    path.join(root, "Config", "GameUserSettings.ini"),
  ];
}

export async function applyClusterSettings(
  instanceId: string,
  edition: GameEdition,
  settings: ClusterTransferSettings,
): Promise<{ clusterDir: string; written: string[] }> {
  await ensureInstanceDir(instanceId);
  const clusterDir = await ensureClusterDir(settings.clusterToken);
  const written: string[] = [];

  for (const gus of gusPaths(edition, instanceId)) {
    await fs.mkdir(path.dirname(gus), { recursive: true });
    let existing = "";
    try {
      existing = await fs.readFile(gus, "utf8");
    } catch {
      existing = "[ServerSettings]\n";
    }
    const next = mergeGameUserSettings(existing, settings);
    await fs.writeFile(gus, next, "utf8");
    written.push(gus);
  }

  // Marker file in cluster dir for operators
  await fs.writeFile(
    path.join(clusterDir, "ark-host-cluster.json"),
    JSON.stringify(
      {
        clusterToken: settings.clusterToken,
        transferInventory: settings.transferInventory,
        transferDinos: settings.transferDinos,
        transferTribute: settings.transferTribute,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return { clusterDir, written };
}
