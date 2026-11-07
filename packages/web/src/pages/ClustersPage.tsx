import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Cluster } from "@ark-host/shared";
import { api, ApiError } from "../api";

export function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Home Cluster");
  const [clusterId, setClusterId] = useState("home-cluster");
  const [busy, setBusy] = useState(false);

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
    try {
      await api.createCluster({
        name,
        clusterId,
        transferInventory: true,
        transferDinos: true,
        transferTribute: true,
      });
      setName("");
      setClusterId("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this cluster? Instances stay, but lose the cluster attachment.")) return;
    try {
      await api.deleteCluster(id);
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
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <code>{c.clusterId}</code>
                  </td>
                  <td>
                    {[
                      c.transferInventory && "inventory",
                      c.transferDinos && "dinos",
                      c.transferTribute && "tribute",
                    ]
                      .filter(Boolean)
                      .join(", ") || "none"}
                  </td>
                  <td>
                    <button className="btn btn-danger" type="button" onClick={() => void onDelete(c.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
