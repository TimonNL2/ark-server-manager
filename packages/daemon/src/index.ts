import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { DAEMON_VERSION } from "@ark-host/shared";
import { daemonConfig } from "./config.js";
import { processManager, type ManagedSpec } from "./process-manager.js";
import { ensureInstanceDir, listDir, readFileBounded } from "./file-sandbox.js";
import fs from "node:fs";
import os from "node:os";

const managedSpecSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  edition: z.enum(["ASA", "ASE"]),
  mapId: z.string(),
  sessionName: z.string(),
  gamePort: z.number().int(),
  queryPort: z.number().int(),
  rconPort: z.number().int(),
  maxPlayers: z.number().int(),
  adminPassword: z.string(),
  serverPassword: z.string().nullable(),
  clusterId: z.string().nullable(),
  clusterToken: z.string().nullable(),
  transferInventory: z.boolean(),
  transferDinos: z.boolean(),
  transferTribute: z.boolean(),
  installPath: z.string(),
  extraArgs: z.string(),
});

async function main(): Promise<void> {
  fs.mkdirSync(daemonConfig.instancesRoot, { recursive: true });

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (token !== daemonConfig.token) {
      return reply.code(401).send({ error: "Unauthorized daemon token" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    version: DAEMON_VERSION,
    mockMode: daemonConfig.mockMode,
  }));

  app.get("/v1/status", async () => ({
    mockMode: daemonConfig.mockMode,
    version: DAEMON_VERSION,
    host: os.hostname(),
    instancesRoot: daemonConfig.instancesRoot,
  }));

  app.get<{ Params: { id: string } }>("/v1/instances/:id/status", async (req) => {
    return processManager.getStatus(req.params.id);
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/start", async (req, reply) => {
    const parsed = managedSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid start spec", details: parsed.error.flatten() });
    }
    const spec = parsed.data as ManagedSpec;
    await ensureInstanceDir(spec.id);
    const result = await processManager.start(spec);
    return result;
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/stop", async (req) => {
    return processManager.stop(req.params.id);
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/restart", async (req, reply) => {
    const parsed = managedSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid restart spec", details: parsed.error.flatten() });
    }
    const result = await processManager.restart(parsed.data as ManagedSpec);
    return result;
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/v1/instances/:id/console",
    async (req) => {
      const after = Number(req.query.after ?? 0) || 0;
      return { lines: processManager.getConsole(req.params.id, after) };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/v1/instances/:id/files",
    async (req, reply) => {
      try {
        const entries = await listDir(req.params.id, req.query.path ?? ".");
        return { entries };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "List failed" });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    "/v1/instances/:id/files/content",
    async (req, reply) => {
      if (!req.query.path) {
        return reply.code(400).send({ error: "path required" });
      }
      try {
        return await readFileBounded(req.params.id, req.query.path);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Read failed" });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: ManagedSpec }>("/v1/instances/:id/launch-preview", async (req, reply) => {
    const parsed = managedSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid spec", details: parsed.error.flatten() });
    }
    return processManager.buildLaunchCommand(parsed.data as ManagedSpec);
  });

  await app.listen({ host: daemonConfig.host, port: daemonConfig.port });
  app.log.info(
    `Ark Host daemon ${DAEMON_VERSION} on ${daemonConfig.host}:${daemonConfig.port} mock=${daemonConfig.mockMode}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
