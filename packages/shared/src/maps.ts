import type { GameEdition } from "./types.js";

export interface MapOption {
  id: string;
  label: string;
  /** Map token passed to the dedicated server launch args. */
  launchMap: string;
  edition: GameEdition;
}

export const ASA_MAPS: MapOption[] = [
  { id: "the-island", label: "The Island", launchMap: "TheIsland_WP", edition: "ASA" },
  { id: "scorched-earth", label: "Scorched Earth", launchMap: "ScorchedEarth_WP", edition: "ASA" },
  { id: "the-center", label: "The Center", launchMap: "TheCenter_WP", edition: "ASA" },
  { id: "aberration", label: "Aberration", launchMap: "Aberration_WP", edition: "ASA" },
  { id: "extinction", label: "Extinction", launchMap: "Extinction_WP", edition: "ASA" },
  { id: "ragnarok", label: "Ragnarok", launchMap: "Ragnarok_WP", edition: "ASA" },
  { id: "valguero", label: "Valguero", launchMap: "Valguero_WP", edition: "ASA" },
  { id: "astraeos", label: "Astraeos", launchMap: "Astraeos_WP", edition: "ASA" },
];

export const ASE_MAPS: MapOption[] = [
  { id: "the-island", label: "The Island", launchMap: "TheIsland", edition: "ASE" },
  { id: "the-center", label: "The Center", launchMap: "TheCenter", edition: "ASE" },
  { id: "scorched-earth", label: "Scorched Earth", launchMap: "ScorchedEarth_P", edition: "ASE" },
  { id: "ragnarok", label: "Ragnarok", launchMap: "Ragnarok", edition: "ASE" },
  { id: "aberration", label: "Aberration", launchMap: "Aberration_P", edition: "ASE" },
  { id: "extinction", label: "Extinction", launchMap: "Extinction", edition: "ASE" },
  { id: "valguero", label: "Valguero", launchMap: "Valguero_P", edition: "ASE" },
  { id: "genesis", label: "Genesis Part 1", launchMap: "Genesis", edition: "ASE" },
  { id: "genesis2", label: "Genesis Part 2", launchMap: "Gen2", edition: "ASE" },
  { id: "crystal-isles", label: "Crystal Isles", launchMap: "CrystalIsles", edition: "ASE" },
  { id: "lost-island", label: "Lost Island", launchMap: "LostIsland", edition: "ASE" },
  { id: "fjordur", label: "Fjordur", launchMap: "Fjordur", edition: "ASE" },
];

export function mapsForEdition(edition: GameEdition): MapOption[] {
  return edition === "ASA" ? ASA_MAPS : ASE_MAPS;
}

export function findMap(edition: GameEdition, mapId: string): MapOption | undefined {
  return mapsForEdition(edition).find((m) => m.id === mapId);
}
