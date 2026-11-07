import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Cluster, GameEdition, MapOption } from "@ark-host/shared";
import { api, ApiError } from "../api";

export function CreateInstancePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [edition, setEdition] = useState<GameEdition>("ASA");
  const [maps, setMaps] = useState<MapOption[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("Island Main");
  const [mapId, setMapId] = useState("the-island");
  const [sessionName, setSessionName] = useState("Ark Server Manager");
  const [gamePort, setGamePort] = useState(7777);
  const [queryPort, setQueryPort] = useState(27015);
  const [rconPort, setRconPort] = useState(27020);
  const [maxPlayers, setMaxPlayers] = useState(70);
  const [adminPassword, setAdminPassword] = useState("ChangeMeNow");
  const [serverPassword, setServerPassword] = useState("");
  const [clusterId, setClusterId] = useState("");
  const [extraArgs, setExtraArgs] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [meta, clusterRes] = await Promise.all([api.meta(), api.listClusters()]);
        setMaps(meta.maps[edition]);
        setClusters(clusterRes.clusters);
        setGamePort(meta.suggestedPorts.gamePort);
        setQueryPort(meta.suggestedPorts.queryPort);
        setRconPort(meta.suggestedPorts.rconPort);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load meta");
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const meta = await api.meta();
      const nextMaps = meta.maps[edition];
      setMaps(nextMaps);
      if (!nextMaps.some((m) => m.id === mapId)) {
        setMapId(nextMaps[0]?.id ?? "the-island");
      }
    })();
  }, [edition]);

  const mapLabel = useMemo(
    () => maps.find((m) => m.id === mapId)?.label ?? mapId,
    [maps, mapId],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createInstance({
        name,
        edition,
        mapId,
        sessionName,
        gamePort,
        queryPort,
        rconPort,
        maxPlayers,
        adminPassword,
        serverPassword: serverPassword || null,
        clusterId: clusterId || null,
        extraArgs,
        autoStart: false,
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wizard">
      <div className="page-head">
        <div>
          <h1>Create instance</h1>
          <p>Wizard for a single ASA or ASE dedicated server.</p>
        </div>
      </div>

      <div className="steps">
        <span className={`step-pill ${step === 1 ? "active" : ""}`}>1 · Edition</span>
        <span className={`step-pill ${step === 2 ? "active" : ""}`}>2 · Map & network</span>
        <span className={`step-pill ${step === 3 ? "active" : ""}`}>3 · Security & cluster</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form className="panel form" onSubmit={(e) => void onSubmit(e)}>
        {step === 1 && (
          <>
            <div className="field">
              <label>Game edition</label>
              <div className="btn-row">
                <button
                  type="button"
                  className={`btn ${edition === "ASA" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setEdition("ASA")}
                >
                  Survival Ascended
                </button>
                <button
                  type="button"
                  className={`btn ${edition === "ASE" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setEdition("ASE")}
                >
                  Survival Evolved
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="name">Instance name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="session">Session name (in-game browser)</label>
              <input
                id="session"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                required
              />
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label htmlFor="map">Map</label>
              <select id="map" value={mapId} onChange={(e) => setMapId(e.target.value)}>
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.launchMap})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="gamePort">Game port</label>
                <input
                  id="gamePort"
                  type="number"
                  value={gamePort}
                  onChange={(e) => setGamePort(Number(e.target.value))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="queryPort">Query port</label>
                <input
                  id="queryPort"
                  type="number"
                  value={queryPort}
                  onChange={(e) => setQueryPort(Number(e.target.value))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="rconPort">RCON port</label>
                <input
                  id="rconPort"
                  type="number"
                  value={rconPort}
                  onChange={(e) => setRconPort(Number(e.target.value))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="maxPlayers">Max players</label>
                <input
                  id="maxPlayers"
                  type="number"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  required
                />
              </div>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="adminPassword">Admin password</label>
                <input
                  id="adminPassword"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  minLength={4}
                />
              </div>
              <div className="field">
                <label htmlFor="serverPassword">Server password (optional)</label>
                <input
                  id="serverPassword"
                  value={serverPassword}
                  onChange={(e) => setServerPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cluster">Attach to cluster (optional)</label>
              <select
                id="cluster"
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
              >
                <option value="">None</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.clusterId})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="extraArgs">Extra launch args</label>
              <input
                id="extraArgs"
                value={extraArgs}
                onChange={(e) => setExtraArgs(e.target.value)}
                placeholder="-ForceAllowCaveFlyers"
              />
            </div>
            <div className="notice">
              Creating <strong>{name}</strong> · {edition} · {mapLabel} · ports {gamePort}/
              {queryPort}/{rconPort}
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>
                Back
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create instance"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
