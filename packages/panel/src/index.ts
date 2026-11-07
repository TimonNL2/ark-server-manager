import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { ensureAdminUser } from "./auth.js";
import { panelConfig } from "./config.js";
import { initDb } from "./db.js";
import { registerRoutes } from "./routes.js";

async function main(): Promise<void> {
  fs.mkdirSync(panelConfig.dataDir, { recursive: true });
  fs.mkdirSync(panelConfig.instancesRoot, { recursive: true });
  initDb();
  ensureAdminUser();

  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(cookie, {
    secret: panelConfig.sessionSecret,
  });

  await registerRoutes(app);

  const webDist = panelConfig.webDist;
  if (fs.existsSync(path.join(webDist, "index.html"))) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  } else {
    app.log.warn(`Web dist not found at ${webDist} — API-only mode`);
  }

  await app.listen({ host: panelConfig.host, port: panelConfig.port });
  app.log.info(
    `Ark Host panel ${panelConfig.version} on ${panelConfig.host}:${panelConfig.port} mock=${panelConfig.mockMode}`,
  );
  app.log.info(`Admin user ready: ${panelConfig.adminUsername}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
