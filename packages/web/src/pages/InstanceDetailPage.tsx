import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Cluster, LaunchPreview, ServerInstance, SteamCmdUpdateResult } from "@ark-host/shared";
import { api, ApiError } from "../api";
import { FileBrowser } from "../components/FileBrowser";
import { LiveConsole } from "../components/LiveConsole";

type Tab = "overview" | "console" | "files" | "launch";

function StatusBadge({ status }: { status: ServerInstance["status"] }) {
  const live = status === "running" || status === "mock";
  return (
    <span className={`badge badge-${status}`}>
      {live && <span className="pulse-dot" />}
      {status}
    </span>
  );
}

export function InstanceDetailPage() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [instance, setInstance] = useState<ServerInstance | null>(null);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [preview, setPreview] = useState<LaunchPreview | null>(null);
  const [steam, setSteam] = useState<SteamCmdUpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getInstance(id);
      setInstance(res.instance);
      setCluster(res.cluster);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load instance");
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (tab !== "launch") return;
    void (async () => {
      try {
        const res = await api.launchPreview(id);
        setPreview(res.preview);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Preview failed");
      }
    })();
  }, [tab, id]);

  async function act(action: "start" | "stop" | "restart") {
    setBusy(true);
    setError(null);
    try {
      if (action === "start") await api.startInstance(id);
      if (action === "stop") await api.stopInstance(id);
      if (action === "restart") await api.restartInstance(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSteamUpdate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.steamCmdUpdate(id);
      setSteam(res.result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "SteamCMD update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onApplyCluster() {
    setBusy(true);
    setError(null);
    try {
      await api.applyInstanceCluster(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Cluster apply failed");
    } finally {
      setBusy(false);
    }
  }

  if (!instance && !error) {
    return <div className="empty">Loading instance…</div>;
  }
  if (!instance) {
    return <div className="error-banner">{error}</div>;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="breadcrumb">
            <Link to="/">Instances</Link> / {instance.name}
          </p>
          <h1>{instance.name}</h1>
          <p>
            {instance.edition} · {instance.mapId} · {instance.sessionName}
          </p>
        </div>
        <div className="btn-row">
          <StatusBadge status={instance.status} />
          <span className={`badge badge-${instance.edition.toLowerCase()}`}>{instance.edition}</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || instance.status === "running" || instance.status === "mock"}
            onClick={() => void act("start")}
          >
            Start
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || instance.status === "stopped"}
            onClick={() => void act("stop")}
          >
            Stop
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act("restart")}>
            Restart
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        {(
          [
            ["overview", "Overview"],
            ["console", "Console"],
            ["files", "Files"],
            ["launch", "Launch"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="panel">
          <div className="meta-row">
            <span>ports {instance.gamePort}/{instance.queryPort}/rcon {instance.rconPort}</span>
            <span>{instance.maxPlayers} slots</span>
            <span>pid {instance.pid ?? "—"}</span>
          </div>
          <div className="field">
            <label>Install path</label>
            <code>{instance.installPath}</code>
          </div>
          <div className="field" style={{ marginTop: "0.75rem" }}>
            <label>Cluster</label>
            {cluster ? (
              <div>
                <div>
                  {cluster.name} (<code>{cluster.clusterId}</code>)
                </div>
                <div className="muted-line">
                  transfers:{" "}
                  {[
                    cluster.transferInventory && "inventory",
                    cluster.transferDinos && "dinos",
                    cluster.transferTribute && "tribute",
                  ]
                    .filter(Boolean)
                    .join(", ") || "none"}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: "0.5rem" }}
                  disabled={busy}
                  onClick={() => void onApplyCluster()}
                >
                  Re-apply GameUserSettings + cluster dir
                </button>
              </div>
            ) : (
              <div className="muted-line">Not attached to a cluster</div>
            )}
          </div>
          <div className="field" style={{ marginTop: "1rem" }}>
            <label>SteamCMD update</label>
            <p className="muted-line">
              Runs anonymous <code>app_update</code> for this edition (stubbed in mock mode).
            </p>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void onSteamUpdate()}>
              Run SteamCMD update
            </button>
            {steam && (
              <pre className="code-block" style={{ marginTop: "0.75rem" }}>
                {JSON.stringify(steam, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {tab === "console" && <LiveConsole instanceId={instance.id} />}
      {tab === "files" && <FileBrowser instanceId={instance.id} />}

      {tab === "launch" && (
        <div className="panel">
          <p className="muted-line">
            Preview of what the daemon would execute (passwords included — treat as sensitive).
          </p>
          {preview ? (
            <>
              <div className="field">
                <label>Working directory</label>
                <code>{preview.cwd}</code>
              </div>
              <div className="field" style={{ marginTop: "0.75rem" }}>
                <label>Command</label>
                <pre className="code-block">{preview.rendered}</pre>
              </div>
              {Object.keys(preview.env).length > 0 && (
                <div className="field" style={{ marginTop: "0.75rem" }}>
                  <label>Environment</label>
                  <pre className="code-block">{JSON.stringify(preview.env, null, 2)}</pre>
                </div>
              )}
            </>
          ) : (
            <div className="empty">Loading launch preview…</div>
          )}
        </div>
      )}
    </div>
  );
}
