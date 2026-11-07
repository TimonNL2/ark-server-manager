import { Fragment, FormEvent, useCallback, useEffect, useState } from "react";
import type { Cluster } from "@ark-host/shared";
import { api, ApiError } from "../api";

export function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("Home Cluster");
  const [clusterId, setClusterId] = useState("home-cluster");
  const [transferInventory, setTransferInventory] = useState(true);
  const [transferDinos, setTransferDinos] = useState(true);
  const [transferTribute, setTransferTribute] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    members: { id: string; name: string; edition: string; mapId: string }[];
    sharedDirHint: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listClusters();
      setClusters(res.clusters);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load clusters");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.createCluster({
        name,
        clusterId,
        transferInventory,
        transferDinos,
        transferTribute,
      });
      setName("");
      setClusterId("");
      await refresh();
      setNotice("Cluster created. Attach instances in the create wizard, then Apply to write configs.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(
    c: Cluster,
    field: "transferInventory" | "transferDinos" | "transferTribute",
  ) {
    try {
      await api.updateCluster(c.id, { [field]: !c[field] });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function onApply(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.applyCluster(id);
      const failed = res.results.filter((r) => !r.ok);
      setNotice(
        failed.length
          ? `Applied with ${failed.length} failure(s). Shared dir: ${res.sharedDirHint}`
          : `Applied to ${res.results.length} instance(s). Shared dir: ${res.sharedDirHint}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  async function onExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    try {
      const res = await api.getCluster(id);
      setExpanded(id);
      setDetail({
        members: res.members.map((m) => ({
          id: m.id,
          name: m.name,
          edition: m.edition,
          mapId: m.mapId,
        })),
        sharedDirHint: res.sharedDirHint,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load cluster");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this cluster? Instances stay, but lose the cluster attachment.")) return;
    try {
      await api.deleteCluster(id);
      if (expanded === id) {
        setExpanded(null);
        setDetail(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Clusters</h1>
          <p>Share a cluster id so players can transfer across maps.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <form className="panel form" style={{ marginBottom: "1.25rem" }} onSubmit={(e) => void onCreate(e)}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cname">Display name</label>
            <input id="cname" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="cid">Cluster id token</label>
            <input
              id="cid"
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              required
              pattern="[a-zA-Z0-9_-]+"
            />
          </div>
        </div>
        <div className="btn-row">
          <label className="console-check">
            <input
              type="checkbox"
              checked={transferInventory}
              onChange={(e) => setTransferInventory(e.target.checked)}
            />
            Transfer inventory
          </label>
          <label className="console-check">
            <input
              type="checkbox"
              checked={transferDinos}
              onChange={(e) => setTransferDinos(e.target.checked)}
            />
            Transfer dinos
          </label>
          <label className="console-check">
            <input
              type="checkbox"
              checked={transferTribute}
              onChange={(e) => setTransferTribute(e.target.checked)}
            />
            Transfer tribute / survivors
          </label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create cluster"}
        </button>
      </form>

      {clusters.length === 0 ? (
        <div className="empty">No clusters yet. Create one, then attach instances in the wizard.</div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Cluster id</th>
                <th>Transfers</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td>{c.name}</td>
                    <td>
                      <code>{c.clusterId}</code>
                    </td>
                    <td>
                      <div className="btn-row">
                        <label className="console-check">
                          <input
                            type="checkbox"
                            checked={c.transferInventory}
                            onChange={() => void onToggle(c, "transferInventory")}
                          />
                          inv
                        </label>
                        <label className="console-check">
                          <input
                            type="checkbox"
                            checked={c.transferDinos}
                            onChange={() => void onToggle(c, "transferDinos")}
                          />
                          dinos
                        </label>
                        <label className="console-check">
                          <input
                            type="checkbox"
                            checked={c.transferTribute}
                            onChange={() => void onToggle(c, "transferTribute")}
                          />
                          tribute
                        </label>
                      </div>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button type="button" className="btn btn-ghost" onClick={() => void onExpand(c.id)}>
                          {expanded === c.id ? "Hide" : "Details"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => void onApply(c.id)}
                        >
                          Apply
                        </button>
                        <button className="btn btn-danger" type="button" onClick={() => void onDelete(c.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && detail && (
                    <tr>
                      <td colSpan={4}>
                        <div className="muted-line">Shared dir: <code>{detail.sharedDirHint}</code></div>
                        <div className="muted-line" style={{ marginTop: "0.35rem" }}>
                          Members:{" "}
                          {detail.members.length
                            ? detail.members.map((m) => `${m.name} (${m.edition}/${m.mapId})`).join(", ")
                            : "none yet"}
                        </div>
                        <p className="muted-line" style={{ marginTop: "0.5rem" }}>
                          Apply writes PreventDownload/Upload* keys into each member&apos;s GameUserSettings.ini
                          and ensures the shared cluster directory exists for -ClusterDirOverride.
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
