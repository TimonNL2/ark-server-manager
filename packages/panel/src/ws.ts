import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { getUserFromSession } from "./auth.js";
import { panelConfig } from "./config.js";
import { daemonConsoleWsUrl } from "./daemon-client.js";
import { getInstanceRow } from "./repos.js";

export async function registerWebsocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/api/instances/:id/console/ws",
    { websocket: true },
    (socket, req) => {
      const sessionId = req.cookies[panelConfig.cookieName];
      const user = getUserFromSession(sessionId);
      if (!user) {
        socket.close(4401, "Unauthorized");
        return;
      }

      const row = getInstanceRow(req.params.id);
      if (!row) {
        socket.close(4404, "Not found");
        return;
      }

      const afterRaw = req.query.after !== undefined ? Number(req.query.after) : -1;
      const after = Number.isFinite(afterRaw) ? afterRaw : -1;
      const upstreamUrl = daemonConsoleWsUrl(row.id, after);

      let upstream: WebSocket;
      try {
        upstream = new WebSocket(upstreamUrl, {
          headers: { Authorization: `Bearer ${panelConfig.daemonToken}` },
        });
      } catch (err) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: err instanceof Error ? err.message : "Upstream connect failed",
          }),
        );
        socket.close(1011, "Upstream failed");
        return;
      }

      const closeBoth = () => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        try {
          upstream.close();
        } catch {
          /* ignore */
        }
      };

      upstream.on("open", () => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "bridge", status: "connected" }));
        }
      });

      upstream.on("message", (data) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data.toString());
        }
      });

      upstream.on("close", () => closeBoth());
      upstream.on("error", () => closeBoth());

      socket.on("message", (data) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data.toString());
        }
      });

      socket.on("close", () => {
        try {
          upstream.close();
        } catch {
          /* ignore */
        }
      });
    },
  );
}
