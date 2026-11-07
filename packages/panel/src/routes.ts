import type { FastifyInstance } from "fastify";
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
  getConsole,
  getDaemonStatus,
  getInstanceRuntime,
  restartInstance,
  startInstance,
  stopInstance,
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
  mapInstance,
  suggestPorts,
  updateCluster,
  updateInstance,
} from "./repos.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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
    return { instance: mapInstance(row, await getInstanceRuntime(row.id)) };
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

  // Stub hooks for ASM-3
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/api/instances/:id/console",
    async (req, reply) => {
      if (!(await requireAuth(req, reply))) return;
      const row = getInstanceRow(req.params.id);
      if (!row) return reply.code(404).send({ error: "Instance not found" });
      const after = Number(req.query.after ?? 0) || 0;
      return { lines: await getConsole(row.id, after) };
    },
  );

  app.get<{ Params: { id: string } }>("/api/instances/:id/files", async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    return reply.code(501).send({
      error: "File browser arrives in ASM-3",
      hint: "Daemon /v1/instances/:id/files is already implemented",
    });
  });
}
