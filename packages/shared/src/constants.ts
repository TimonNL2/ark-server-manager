/** SteamCMD dedicated server app IDs (anonymous download). */
export const STEAM_APP_IDS = {
  ASA: 2430930,
  ASE: 376030,
} as const;

export const DEFAULT_PORTS = {
  game: 7777,
  query: 27015,
  rcon: 27020,
} as const;

/** Port spacing between sequential instances. */
export const PORT_STRIDE = {
  game: 2,
  query: 1,
  rcon: 1,
} as const;

export const PANEL_DEFAULT_PORT = 3000;
export const DAEMON_DEFAULT_PORT = 3920;

export const PANEL_VERSION = "0.2.0";
export const DAEMON_VERSION = "0.2.0";
