import { z } from "zod";

export const gameEditionSchema = z.enum(["ASA", "ASE"]);

export const createClusterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  clusterId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscore, or hyphen"),
  transferInventory: z.boolean().default(true),
  transferDinos: z.boolean().default(true),
  transferTribute: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateClusterSchema = createClusterSchema.partial();

export const createInstanceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  edition: gameEditionSchema,
  mapId: z.string().trim().min(1).max(64),
  sessionName: z.string().trim().min(1).max(80),
  gamePort: z.number().int().min(1024).max(65535),
  queryPort: z.number().int().min(1024).max(65535),
  rconPort: z.number().int().min(1024).max(65535),
  maxPlayers: z.number().int().min(1).max(200).default(70),
  adminPassword: z.string().min(4).max(128),
  serverPassword: z.string().max(128).nullable().optional(),
  clusterId: z.string().uuid().nullable().optional(),
  extraArgs: z.string().max(2000).optional().default(""),
  autoStart: z.boolean().optional().default(false),
});

export const updateInstanceSchema = createInstanceSchema.partial();

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

const boolish = z.boolean();
const rate = z.number().min(0).max(1000);
const port = z.number().int().min(1024).max(65535);

export const modEntrySchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^\d+$/, "Mod ID must be numeric"),
  enabled: z.boolean().default(true),
  note: z.string().max(120).optional(),
});

/** Full Settings tab payload (identity + GUS/Game.ini + launch flags). */
export const instanceGameSettingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sessionName: z.string().trim().min(1).max(80),
  serverPassword: z.string().max(128).default(""),
  adminPassword: z.string().min(4).max(128),
  maxPlayers: z.number().int().min(1).max(200),
  mapId: z.string().trim().min(1).max(64),
  difficultyOffset: z.number().min(0).max(5).default(1),
  overrideOfficialDifficulty: z.number().min(0).max(100).default(5),
  xpMultiplier: rate.default(1),
  tamingSpeedMultiplier: rate.default(1),
  harvestAmountMultiplier: rate.default(1),
  harvestHealthMultiplier: rate.default(1),
  resourcesRespawnPeriodMultiplier: rate.default(1),
  matingIntervalMultiplier: rate.default(1),
  eggHatchSpeedMultiplier: rate.default(1),
  babyMatureSpeedMultiplier: rate.default(1),
  babyCuddleIntervalMultiplier: rate.default(1),
  babyImprintAmountMultiplier: rate.default(1),
  layEggIntervalMultiplier: rate.default(1),
  structureResistanceMultiplier: rate.default(1),
  structureDamageMultiplier: rate.default(1),
  structurePreventResourceRadiusMultiplier: rate.default(1),
  pveStructureDecayPeriodMultiplier: rate.default(1),
  maxStructuresInRange: z.number().int().min(1).max(1_000_000).default(10500),
  serverPve: boolish.default(false),
  disableStructureDecayPve: boolish.default(false),
  disableDinoDecayPve: boolish.default(false),
  allowCaveBuildingPve: boolish.default(false),
  gamePort: port,
  queryPort: port,
  rconPort: port,
  rconPassword: z.string().max(128).default(""),
  crossplay: boolish.default(true),
  battleEye: boolish.default(false),
  modList: z.array(modEntrySchema).max(200).default([]),
  clusterId: z.string().uuid().nullable().default(null),
  transferInventory: boolish.default(true),
  transferDinos: boolish.default(true),
  transferTribute: boolish.default(true),
  autoSavePeriodMinutes: z.number().int().min(1).max(240).default(15),
  messageOfTheDay: z.string().max(2000).default(""),
  extraArgs: z.string().max(2000).default(""),
});

export const saveInstanceSettingsSchema = z.object({
  settings: instanceGameSettingsSchema,
  /** When true, also overwrite raw INI bodies from preview fields. */
  writeRaw: z.boolean().optional().default(false),
  rawGameUserSettings: z.string().max(500_000).optional(),
  rawGameIni: z.string().max(500_000).optional(),
});

export type CreateClusterInput = z.infer<typeof createClusterSchema>;
export type UpdateClusterInput = z.infer<typeof updateClusterSchema>;
export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InstanceGameSettingsInput = z.infer<typeof instanceGameSettingsSchema>;
export type SaveInstanceSettingsInput = z.infer<typeof saveInstanceSettingsSchema>;

// Re-export for web clients that import update types alongside entities
export type { UpdateClusterInput as ClusterPatch };
