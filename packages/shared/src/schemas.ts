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

export type CreateClusterInput = z.infer<typeof createClusterSchema>;
export type UpdateClusterInput = z.infer<typeof updateClusterSchema>;
export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
