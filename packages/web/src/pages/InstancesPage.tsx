import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ServerInstance } from "@ark-host/shared";
import { api, ApiError } from "../api";

function StatusBadge({ status }: { status: ServerInstance["status"] }) {
  const live = status === "running" || status === "mock";
  return (
    <span className={`badge badge-${status}`}>
      {live && <span className="pulse-dot" />}
      {status}
    </span>
  );
}

export function InstancesPage() {
  const [instances, setInstances] = useState<ServerInstance[]>([]);
  const [mockMode, setMockMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, meta] = await Promise.all([api.listInstances(), api.meta()]);
      setInstances(list.instances);
      setMockMode(meta.mockMode || Boolean(meta.daemon?.mockMode));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load instances");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(id: string, action: "start" | "stop" | "restart" | "delete") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "start") await api.startInstance(id);
      if (action === "stop") await api.stopInstance(id);
      if (action === "restart") await api.restartInstance(id);
      if (action === "delete") {
        if (!confirm("Delete this instance record? Running process will be stopped.")) return;
        await api.deleteInstance(id);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Instances</h1>
          <p>ASA and ASE dedicated servers on this host.</p>
        </div>
        <Link className="btn btn-primary" to="/instances/new">
          New instance
        </Link>
      </div>

      {mockMode && (
        <div className="notice">
          Mock mode is on — start/stop simulates processes without downloading multi‑GB game
          servers. Set <code>ARK_HOST_MOCK=0</code> after SteamCMD install for real launches.
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}

      {instances.length === 0 ? (
        <div className="empty">
          <p>No instances yet.</p>
          <p>
            <Link to="/instances/new">Create your first ASA or ASE server</Link>
          </p>
        </div>
      ) : (
        <div className="grid instance-grid">
          {instances.map((inst) => (
            <article className="panel" key={inst.id}>
              <div className="panel-title">
                <h2>{inst.name}</h2>
                <div className="btn-row">
                  <span className={`badge badge-${inst.edition.toLowerCase()}`}>{inst.edition}</span>
                  <StatusBadge status={inst.status} />
                </div>
              </div>
              <div className="meta-row">
                <span>{inst.sessionName}</span>
                <span>map {inst.mapId}</span>
                <span>
                  :{inst.gamePort}/:{inst.queryPort}/rcon {inst.rconPort}
                </span>
                <span>{inst.maxPlayers} slots</span>
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busyId === inst.id || inst.status === "running" || inst.status === "mock"}
                  onClick={() => void act(inst.id, "start")}
                >
                  Start
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busyId === inst.id || inst.status === "stopped"}
                  onClick={() => void act(inst.id, "stop")}
                >
                  Stop
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busyId === inst.id}
                  onClick={() => void act(inst.id, "restart")}
                >
                  Restart
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={busyId === inst.id}
                  onClick={() => void act(inst.id, "delete")}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
