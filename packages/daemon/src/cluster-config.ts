import fs from "node:fs/promises";
import path from "node:path";
import { ensureClusterDir, ensureInstanceDir, resolveInstancePath } from "./file-sandbox.js";
import type { GameEdition } from "@ark-host/shared";

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
  const preventItems = settings.transferInventory ? "False" : "True";
  const preventDinos = settings.transferDinos ? "False" : "True";
  // Tribute / character closely follows survivor transfer; keep paired with inventory for MVP.
  const preventSurvivors = settings.transferTribute ? "False" : "True";

  const keys: Record<string, string> = {
    PreventDownloadSurvivors: preventSurvivors,
    PreventDownloadItems: preventItems,
    PreventDownloadDinos: preventDinos,
    PreventUploadSurvivors: preventSurvivors,
    PreventUploadItems: preventItems,
    PreventUploadDinos: preventDinos,
  };

  let text = existing.replace(/\r\n/g, "\n");
  if (!/\[ServerSettings\]/i.test(text)) {
    text = `[ServerSettings]\n${text}`.trimStart();
  }

  for (const [key, value] of Object.entries(keys)) {
    const re = new RegExp(`^${key}=.*$`, "im");
    if (re.test(text)) {
      text = text.replace(re, `${key}=${value}`);
    } else {
      text = text.replace(/\[ServerSettings\]/i, `[ServerSettings]\n${key}=${value}`);
    }
  }

  if (!text.endsWith("\n")) text += "\n";
  return text;
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
