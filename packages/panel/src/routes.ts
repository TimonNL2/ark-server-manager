import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import {
  ASA_MAPS,
  ASE_MAPS,
  createClusterSchema,
  createInstanceSchema,
  findMap,
  loginSchema,
  updateClusterSchema,
  updateInstanceSchema,
} from "@ark-host/shared";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  requireAuth,
  setSessionCookie,
  verifyLogin,
} from "./auth.js";
import { panelConfig } from "./config.js";
import {
  applyClusterToInstance,
  deleteFile,
  downloadFile,
  getConsole,
  getDaemonStatus,
  getInstanceRuntime,
  launchPreview,
  listFiles,
  mkdirFile,
  readFileContent,
  restartInstance,
  startInstance,
  steamCmdUpdate,
  stopInstance,
  uploadFile,
  writeFileContent,
} from "./daemon-client.js";
import {
  createCluster,
  createInstance,
  deleteCluster,
  deleteInstance,
  getCluster,
  getInstanceRow,
  listClusters,
  listInstanceRows,
  mapCluster,
  mapInstance,
  suggestPorts,
  updateCluster,
  updateInstance,
} from "./repos.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  app.get("/api/health", async () => ({
    ok: true,
    version: panelConfig.version,
    mockMode: panelConfig.mockMode,
  }));

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid credentials payload" });
    }
    const user = verifyLogin(parsed.data.username, parsed.data.password);
    if (!user) {
      return reply.code(401).send({ error: "Invalid username or password" });
    }
    const sessionId = createSession(user.id);
    setSessionCookie(reply, sessionId);
    return { user };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const sid = req.cookies[panelConfig.cookieName];
    if (sid) destroySession(sid);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    return { user };
  });

  app.get("/api/meta", async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    let daemon = null;
    try {
      daemon = await getDaemonStatus();
    } catch {
      daemon = null;
    }
    return {
      version: panelConfig.version,
      mockMode: panelConfig.mockMode,
      maps: { ASA: ASA_MAPS, ASE: ASE_MAPS },
      suggestedPorts: suggestPorts(),
      daemon,
    };
  });

  // Clusters
  app.get("/api/clusters", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    return { clusters: listClusters() };
  });

  app.get<{ Params: { id: string } }>("/api/clusters/:id", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getCluster(req.params.id);
    if (!row) return reply.code(404).send({ error: "Cluster not found" });
    const members = listInstanceRows().filter((i) => i.cluster_ref === row.id);
    return {
      cluster: mapCluster(row),
      members: await Promise.all(
        members.map(async (m) => mapInstance(m, await getInstanceRuntime(m.id))),
      ),
      sharedDirHint: `${panelConfig.instancesRoot}/_cluster/${row.cluster_id}`,
    };
  });

  app.post("/api/clusters", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const parsed = createClusterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    try {
      const cluster = createCluster(parsed.data);
      return reply.code(201).send({ cluster });
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : "Create failed" });
    }
  });

  app.patch<{ Params: { id: string } }>("/api/clusters/:id", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const parsed = updateClusterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const cluster = updateCluster(req.params.id, parsed.data);
    if (!cluster) return reply.code(404).send({ error: "Cluster not found" });
    return { cluster };
  });

  app.post<{ Params: { id: string } }>("/api/clusters/:id/apply", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getCluster(req.params.id);
    if (!row) return reply.code(404).send({ error: "Cluster not found" });
    const members = listInstanceRows().filter((i) => i.cluster_ref === row.id);
    const results = [];
    for (const member of members) {
      try {
        const applied = await applyClusterToInstance(member, row);
        results.push({ instanceId: member.id, ok: true, ...applied });
      } catch (err) {
        results.push({
          instanceId: member.id,
          ok: false,
          error: err instanceof Error ? err.message : "failed",
        });
      }
    }
    return { results, sharedDirHint: `${panelConfig.instancesRoot}/_cluster/${row.cluster_id}` };
  });

  app.delete<{ Params: { id: string } }>("/api/clusters/:id", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    if (!deleteCluster(req.params.id)) return reply.code(404).send({ error: "Cluster not found" });
    return { ok: true };
  });

  // Instances
  app.get("/api/instances", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const rows = listInstanceRows();
    const instances = await Promise.all(
      rows.map(async (row) => mapInstance(row, await getInstanceRuntime(row.id))),
    );
    return { instances };
  });

  app.get<{ Params: { id: string } }>("/api/instances/:id", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    const cluster = row.cluster_ref ? getCluster(row.cluster_ref) : null;
    return {
      instance: mapInstance(row, await getInstanceRuntime(row.id)),
      cluster: cluster ? mapCluster(cluster) : null,
    };
  });

  app.post("/api/instances", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const parsed = createInstanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    if (!findMap(parsed.data.edition, parsed.data.mapId)) {
      return reply.code(400).send({ error: `Unknown map '${parsed.data.mapId}' for ${parsed.data.edition}` });
    }
    if (parsed.data.clusterId && !getCluster(parsed.data.clusterId)) {
      return reply.code(400).send({ error: "Cluster not found" });
    }
    const row = createInstance(parsed.data);
    if (row.cluster_ref) {
      const cluster = getCluster(row.cluster_ref);
      if (cluster) {
        try {
          await applyClusterToInstance(row, cluster);
        } catch {
          /* non-fatal at create */
        }
      }
    }
    return reply.code(201).send({ instance: mapInstance(row, { status: "stopped", pid: null }) });
  });

  app.patch<{ Params: { id: string } }>("/api/instances/:id", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const parsed = updateInstanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const row = updateInstance(req.params.id, parsed.data);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    return { instance: mapInstance(row, await getInstanceRuntime(row.id)) };
  });

  app.delete<{ Params: { id: string } }>("/api/instances/:id", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    try {
      await stopInstance(row.id);
    } catch {
      /* best effort */
    }
    deleteInstance(row.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/instances/:id/start", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    const cluster = row.cluster_ref ? getCluster(row.cluster_ref) : null;
    try {
      const runtime = await startInstance(row, cluster);
      return { instance: mapInstance(row, runtime) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Start failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/instances/:id/stop", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    try {
      const runtime = await stopInstance(row.id);
      return { instance: mapInstance(row, runtime) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Stop failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/instances/:id/restart", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    const cluster = row.cluster_ref ? getCluster(row.cluster_ref) : null;
    try {
      const runtime = await restartInstance(row, cluster);
      return { instance: mapInstance(row, runtime) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Restart failed" });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/api/instances/:id/console",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      const after = req.query.after !== undefined ? Number(req.query.after) : -1;
      return { lines: await getConsole(row.id, Number.isFinite(after) ? after : -1) };
    },
  );

  app.get<{ Params: { id: string } }>("/api/instances/:id/launch-preview", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    const cluster = row.cluster_ref ? getCluster(row.cluster_ref) : null;
    try {
      return { preview: await launchPreview(row, cluster) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Preview failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/instances/:id/steamcmd-update", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    try {
      return { result: await steamCmdUpdate(row) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Update failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/instances/:id/cluster-apply", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const row = getInstanceRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Instance not found" });
    if (!row.cluster_ref) return reply.code(400).send({ error: "Instance has no cluster" });
    const cluster = getCluster(row.cluster_ref);
    if (!cluster) return reply.code(400).send({ error: "Cluster not found" });
    try {
      return await applyClusterToInstance(row, cluster);
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Apply failed" });
    }
  });

  // Files
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/instances/:id/files",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      try {
        return { entries: await listFiles(row.id, req.query.path ?? ".") };
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "List failed" });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    "/api/instances/:id/files/content",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      if (!req.query.path) return reply.code(400).send({ error: "path required" });
      try {
        return await readFileContent(row.id, req.query.path);
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Read failed" });
      }
    },
  );

  app.put<{ Params: { id: string }; Body: { path: string; content: string } }>(
    "/api/instances/:id/files/content",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      const body = req.body ?? ({} as { path?: string; content?: string });
      if (!body.path || typeof body.content !== "string") {
        return reply.code(400).send({ error: "path and content required" });
      }
      try {
        return await writeFileContent(row.id, body.path, body.content);
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Write failed" });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { path: string } }>(
    "/api/instances/:id/files/mkdir",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      const body = req.body ?? ({} as { path?: string });
      if (!body.path) return reply.code(400).send({ error: "path required" });
      try {
        return await mkdirFile(row.id, body.path);
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "mkdir failed" });
      }
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { path: string } }>(
    "/api/instances/:id/files",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      if (!req.query.path) return reply.code(400).send({ error: "path required" });
      try {
        return await deleteFile(row.id, req.query.path);
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Delete failed" });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    "/api/instances/:id/files/download",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      if (!req.query.path) return reply.code(400).send({ error: "path required" });
      try {
        const upstream = await downloadFile(row.id, req.query.path);
        const buf = Buffer.from(await upstream.arrayBuffer());
        const name = req.query.path.split("/").pop() ?? "download";
        return reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`)
          .send(buf);
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Download failed" });
      }
    },
  );

  app.post<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/instances/:id/files/upload",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "file required" });
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      try {
        return await uploadFile(
          row.id,
          req.query.path ?? ".",
          file.filename,
          Buffer.concat(chunks),
          file.mimetype,
        );
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Upload failed" });
      }
    },
  );
}
