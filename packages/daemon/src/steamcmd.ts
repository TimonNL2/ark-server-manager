import { STEAM_APP_IDS, type GameEdition } from "@ark-host/shared";
import { daemonConfig } from "./config.js";
import fs from "node:fs";
import { spawn } from "node:child_process";

export function buildSteamCmdUpdate(
  edition: GameEdition,
  installPath: string,
): { appId: number; commandPreview: string; args: string[] } {
  const appId = STEAM_APP_IDS[edition];
  const bin = daemonConfig.steamcmdPath;
  const args = [
    "+force_install_dir",
    installPath,
    "+login",
    "anonymous",
    "+app_update",
    String(appId),
    "validate",
    "+quit",
  ];
  return {
    appId,
    args,
    commandPreview: `${bin} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
  };
}

export async function runSteamCmdUpdate(
  edition: GameEdition,
  installPath: string,
): Promise<{
  ok: boolean;
  mock: boolean;
  edition: GameEdition;
  appId: number;
  installPath: string;
  message: string;
  commandPreview: string;
}> {
  const built = buildSteamCmdUpdate(edition, installPath);

  if (daemonConfig.mockMode) {
    return {
      ok: true,
      mock: true,
      edition,
      appId: built.appId,
      installPath,
      message: "Mock mode: SteamCMD update was not executed. Disable ARK_HOST_MOCK to run for real.",
      commandPreview: built.commandPreview,
    };
  }

  if (!fs.existsSync(daemonConfig.steamcmdPath)) {
    return {
      ok: false,
      mock: false,
      edition,
      appId: built.appId,
      installPath,
      message: `SteamCMD not found at ${daemonConfig.steamcmdPath}. See docs/steamcmd-and-proton.md.`,
      commandPreview: built.commandPreview,
    };
  }

  fs.mkdirSync(installPath, { recursive: true });

  const code = await new Promise<number>((resolve) => {
    const child = spawn(daemonConfig.steamcmdPath, built.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("exit", (c) => resolve(c ?? 1));
    child.on("error", () => resolve(1));
  });

  return {
    ok: code === 0,
    mock: false,
    edition,
    appId: built.appId,
    installPath,
    message: code === 0 ? "SteamCMD update finished." : `SteamCMD exited with code ${code}`,
    commandPreview: built.commandPreview,
  };
}
