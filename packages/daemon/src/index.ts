import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { DAEMON_VERSION } from "@ark-host/shared";
import { daemonConfig } from "./config.js";
import { processManager, type ManagedSpec } from "./process-manager.js";
import { applyClusterSettings } from "./cluster-config.js";
import {
  ensureInstanceDir,
  listDir,
  mkdirp,
  readFileBounded,
  readFileRaw,
  removePath,
  writeFileBuffer,
  writeFileText,
} from "./file-sandbox.js";
import { runSteamCmdUpdate } from "./steamcmd.js";
import {
  applyGameSettings,
  previewGameSettings,
  relativeIniPaths,
} from "./settings-config.js";
import { instanceGameSettingsSchema, modEntrySchema } from "@ark-host/shared";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  battleEye: z.boolean().optional(),
  crossplay: z.boolean().optional(),
  mods: z.string().optional(),
  modList: z.array(modEntrySchema).optional(),
  gameSettings: instanceGameSettingsSchema.optional(),
});

const clusterApplySchema = z.object({
  edition: z.enum(["ASA", "ASE"]),
  clusterToken: z.string().min(1),
  transferInventory: z.boolean(),
  transferDinos: z.boolean(),
  transferTribute: z.boolean(),
});

const settingsApplySchema = z.object({
  edition: z.enum(["ASA", "ASE"]),
  settings: instanceGameSettingsSchema,
  writeRaw: z.boolean().optional().default(false),
  rawGameUserSettings: z.string().max(500_000).optional(),
  rawGameIni: z.string().max(500_000).optional(),
});

async function main(): Promise<void> {
  fs.mkdirSync(daemonConfig.instancesRoot, { recursive: true });

  const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });
  await app.register(cors, { origin: true });
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    // Allow WS token via query for bridge clients if needed
    const q = req.query as { token?: string };
    const ok = token === daemonConfig.token || q.token === daemonConfig.token;
    if (!ok) {
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
    return processManager.start(spec);
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/stop", async (req) => {
    return processManager.stop(req.params.id);
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/restart", async (req, reply) => {
    const parsed = managedSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid restart spec", details: parsed.error.flatten() });
    }
    return processManager.restart(parsed.data as ManagedSpec);
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/v1/instances/:id/console",
    async (req) => {
      const after = req.query.after !== undefined ? Number(req.query.after) : -1;
      return { lines: processManager.getConsole(req.params.id, Number.isFinite(after) ? after : -1) };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { after?: string; token?: string } }>(
    "/v1/instances/:id/console/ws",
    { websocket: true },
    (socket, req) => {
      const id = req.params.id;
      const afterRaw = req.query.after !== undefined ? Number(req.query.after) : -1;
      let cursor = Number.isFinite(afterRaw) ? afterRaw : -1;

      const send = (payload: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(payload));
        }
      };

      send({ type: "hello", instanceId: id, mockMode: daemonConfig.mockMode });
      const backlog = processManager.getConsole(id, cursor);
      if (backlog.length) {
        send({ type: "lines", lines: backlog });
        cursor = backlog[backlog.length - 1]!.index;
      }

      const onLine = (instanceId: string, line: { index: number }) => {
        if (instanceId !== id) return;
        if (line.index <= cursor) return;
        send({ type: "lines", lines: [line] });
        cursor = line.index;
      };
      const onStatus = (instanceId: string, status: unknown) => {
        if (instanceId !== id) return;
        send({ type: "status", ...((status as object) ?? {}) });
      };

      processManager.on("console", onLine);
      processManager.on("status", onStatus);

      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as { type?: string; after?: number };
          if (msg.type === "ping") send({ type: "pong" });
          if (msg.type === "resync" && typeof msg.after === "number") {
            cursor = msg.after;
            const lines = processManager.getConsole(id, cursor);
            send({ type: "lines", lines });
            if (lines.length) cursor = lines[lines.length - 1]!.index;
          }
        } catch {
          /* ignore bad client frames */
        }
      });

      socket.on("close", () => {
        processManager.off("console", onLine);
        processManager.off("status", onStatus);
      });
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/v1/instances/:id/files",
    async (req, reply) => {
      try {
        await ensureInstanceDir(req.params.id);
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
      if (!req.query.path) return reply.code(400).send({ error: "path required" });
      try {
        return await readFileBounded(req.params.id, req.query.path);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Read failed" });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    "/v1/instances/:id/files/download",
    async (req, reply) => {
      if (!req.query.path) return reply.code(400).send({ error: "path required" });
      try {
        const buf = await readFileRaw(req.params.id, req.query.path);
        const name = path.basename(req.query.path);
        return reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`)
          .send(buf);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Download failed" });
      }
    },
  );

  app.put<{ Params: { id: string }; Body: { path: string; content: string } }>(
    "/v1/instances/:id/files/content",
    async (req, reply) => {
      const body = req.body ?? ({} as { path?: string; content?: string });
      if (!body.path || typeof body.content !== "string") {
        return reply.code(400).send({ error: "path and content required" });
      }
      try {
        return await writeFileText(req.params.id, body.path, body.content);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Write failed" });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { path: string } }>("/v1/instances/:id/files/mkdir", async (req, reply) => {
    const body = req.body ?? ({} as { path?: string });
    if (!body.path) return reply.code(400).send({ error: "path required" });
    try {
      return await mkdirp(req.params.id, body.path);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "mkdir failed" });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { path: string } }>(
    "/v1/instances/:id/files",
    async (req, reply) => {
      if (!req.query.path) return reply.code(400).send({ error: "path required" });
      try {
        await removePath(req.params.id, req.query.path);
        return { ok: true };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Delete failed" });
      }
    },
  );

  app.post<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/v1/instances/:id/files/upload",
    async (req, reply) => {
      const dir = (req.query.path ?? ".").replace(/\\/g, "/");
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "file required" });
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      const safeName = path.basename(file.filename).replace(/[^\w.\- ()[\]]+/g, "_");
      const rel = dir === "." || dir === "" ? safeName : `${dir.replace(/\/$/, "")}/${safeName}`;
      try {
        return await writeFileBuffer(req.params.id, rel, data);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Upload failed" });
      }
    },
  );

  app.post<{ Params: { id: string } }>("/v1/instances/:id/launch-preview", async (req, reply) => {
    const parsed = managedSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid spec", details: parsed.error.flatten() });
    }
    const cmd = processManager.buildLaunchCommand(parsed.data as ManagedSpec);
    return {
      ...cmd,
      rendered: `cd ${cmd.cwd} && ${cmd.command} ${cmd.args.join(" ")}`,
    };
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/cluster-apply", async (req, reply) => {
    const parsed = clusterApplySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid cluster apply", details: parsed.error.flatten() });
    }
    try {
      const result = await applyClusterSettings(req.params.id, parsed.data.edition, parsed.data);
      return result;
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Apply failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/settings/preview", async (req, reply) => {
    const parsed = settingsApplySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid settings", details: parsed.error.flatten() });
    }
    try {
      const preview = await previewGameSettings(
        req.params.id,
        parsed.data.edition,
        parsed.data.settings,
      );
      return {
        preview,
        iniPaths: relativeIniPaths(parsed.data.edition),
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Preview failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/v1/instances/:id/settings/apply", async (req, reply) => {
    const parsed = settingsApplySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid settings", details: parsed.error.flatten() });
    }
    try {
      const result = await applyGameSettings(
        req.params.id,
        parsed.data.edition,
        parsed.data.settings,
        {
          writeRaw: parsed.data.writeRaw,
          rawGameUserSettings: parsed.data.rawGameUserSettings,
          rawGameIni: parsed.data.rawGameIni,
        },
      );
      return {
        ...result,
        iniPaths: relativeIniPaths(parsed.data.edition),
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Apply failed" });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { edition: "ASA" | "ASE"; installPath: string };
  }>("/v1/instances/:id/steamcmd-update", async (req, reply) => {
    const body = req.body ?? ({} as { edition?: "ASA" | "ASE"; installPath?: string });
    if (!body.edition || !body.installPath) {
      return reply.code(400).send({ error: "edition and installPath required" });
    }
    return runSteamCmdUpdate(body.edition, body.installPath);
  });

  await app.listen({ host: daemonConfig.host, port: daemonConfig.port });
  app.log.info(
    `Ark Server Manager daemon ${DAEMON_VERSION} on ${daemonConfig.host}:${daemonConfig.port} mock=${daemonConfig.mockMode}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
