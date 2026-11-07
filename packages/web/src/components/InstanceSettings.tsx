import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  Cluster,
  InstanceGameSettings,
  MapOption,
  ModEntry,
  ServerInstance,
} from "@ark-host/shared";
import { api, ApiError } from "../api";

interface Props {
  instanceId: string;
  onSaved?: (instance: ServerInstance) => void;
}

type SectionId =
  | "identity"
  | "world"
  | "rates"
  | "breeding"
  | "structures"
  | "mode"
  | "network"
  | "mods"
  | "cluster"
  | "ops"
  | "config";

const RATE_FIELDS: Array<{ key: keyof InstanceGameSettings; label: string }> = [
  { key: "xpMultiplier", label: "XP" },
  { key: "tamingSpeedMultiplier", label: "Taming speed" },
  { key: "harvestAmountMultiplier", label: "Harvest amount" },
  { key: "harvestHealthMultiplier", label: "Harvest health" },
  { key: "resourcesRespawnPeriodMultiplier", label: "Resource respawn" },
];

const BREEDING_FIELDS: Array<{ key: keyof InstanceGameSettings; label: string }> = [
  { key: "matingIntervalMultiplier", label: "Mating interval" },
  { key: "eggHatchSpeedMultiplier", label: "Egg hatch speed" },
  { key: "babyMatureSpeedMultiplier", label: "Baby mature speed" },
  { key: "babyCuddleIntervalMultiplier", label: "Cuddle interval" },
  { key: "babyImprintAmountMultiplier", label: "Imprint amount" },
  { key: "layEggIntervalMultiplier", label: "Lay egg interval" },
];

const STRUCTURE_FIELDS: Array<{ key: keyof InstanceGameSettings; label: string }> = [
  { key: "structureResistanceMultiplier", label: "Structure resistance" },
  { key: "structureDamageMultiplier", label: "Structure damage" },
  { key: "structurePreventResourceRadiusMultiplier", label: "Prevent resource radius" },
  { key: "pveStructureDecayPeriodMultiplier", label: "PvE structure decay period" },
];

export function InstanceSettings({ instanceId, onSaved }: Props) {
  const [settings, setSettings] = useState<InstanceGameSettings | null>(null);
  const [maps, setMaps] = useState<MapOption[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [edition, setEdition] = useState<"ASA" | "ASE">("ASA");
  const [previewGus, setPreviewGus] = useState("");
  const [previewGame, setPreviewGame] = useState("");
  const [iniPaths, setIniPaths] = useState<{ gameUserSettings: string; gameIni: string } | null>(
    null,
  );
  const [showRawEdit, setShowRawEdit] = useState(false);
  const [writeRaw, setWriteRaw] = useState(false);
  const [modDraft, setModDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    identity: true,
    world: true,
    rates: true,
    breeding: true,
    structures: true,
    mode: true,
    network: true,
    mods: true,
    cluster: true,
    ops: true,
    config: true,
  });

  const load = useCallback(async () => {
    try {
      const [res, meta, clusterRes] = await Promise.all([
        api.getInstanceSettings(instanceId),
        api.meta(),
        api.listClusters(),
      ]);
      setSettings(res.settings);
      setPreviewGus(res.preview.gameUserSettings);
      setPreviewGame(res.preview.gameIni);
      setIniPaths(res.iniPaths);
      setEdition(res.instance.edition);
      setMaps(meta.maps[res.instance.edition]);
      setClusters(clusterRes.clusters);
      setError(null);
      setWriteRaw(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings");
    }
  }, [instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function patch<K extends keyof InstanceGameSettings>(key: K, value: InstanceGameSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSuccess(null);
  }

  function patchNum(key: keyof InstanceGameSettings, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    patch(key, n as never);
  }

  function toggleSection(id: SectionId) {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function setModList(next: ModEntry[]) {
    patch("modList", next);
  }

  function addMod() {
    if (!settings) return;
    const id = modDraft.trim();
    if (!/^\d+$/.test(id)) {
      setError("Mod ID must be numeric");
      return;
    }
    if (settings.modList.some((m) => m.id === id)) {
      setError("Mod already in list");
      return;
    }
    setError(null);
    setModList([...settings.modList, { id, enabled: true }]);
    setModDraft("");
  }

  function moveMod(index: number, dir: -1 | 1) {
    if (!settings) return;
    const target = index + dir;
    if (target < 0 || target >= settings.modList.length) return;
    const next = [...settings.modList];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    setModList(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.saveInstanceSettings(instanceId, {
        settings,
        writeRaw,
        rawGameUserSettings: writeRaw ? previewGus : undefined,
        rawGameIni: writeRaw ? previewGame : undefined,
      });
      setSettings(res.settings);
      setPreviewGus(res.preview.gameUserSettings);
      setPreviewGame(res.preview.gameIni);
      setIniPaths(res.iniPaths);
      setSuccess(res.message);
      onSaved?.(res.instance);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!settings && !error) {
    return <div className="empty">Loading settings…</div>;
  }
  if (!settings) {
    return <div className="error-banner">{error}</div>;
  }

  const modPlatform = edition === "ASA" ? "CurseForge project IDs" : "Steam Workshop IDs";

  return (
    <form className="settings-form" onSubmit={(e) => void onSubmit(e)}>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <p className="muted-line settings-lead">
        Panel-managed values are written to GameUserSettings.ini / Game.ini on Save and again on
        every Start so ARK cannot silently overwrite them.
      </p>

      <Section
        id="identity"
        title="Identity"
        open={open.identity}
        onToggle={() => toggleSection("identity")}
      >
        <div className="form-grid">
          <Field label="Instance name" htmlFor="set-name">
            <input
              id="set-name"
              value={settings.name}
              onChange={(e) => patch("name", e.target.value)}
              required
            />
          </Field>
          <Field label="Session name" htmlFor="set-session">
            <input
              id="set-session"
              value={settings.sessionName}
              onChange={(e) => patch("sessionName", e.target.value)}
              required
            />
          </Field>
          <Field label="Server password" htmlFor="set-pw">
            <input
              id="set-pw"
              value={settings.serverPassword}
              onChange={(e) => patch("serverPassword", e.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </Field>
          <Field label="Admin password" htmlFor="set-admin">
            <input
              id="set-admin"
              value={settings.adminPassword}
              onChange={(e) => patch("adminPassword", e.target.value)}
              required
              minLength={4}
              autoComplete="off"
            />
          </Field>
        </div>
      </Section>

      <Section id="world" title="World" open={open.world} onToggle={() => toggleSection("world")}>
        <div className="form-grid">
          <Field label="Map" htmlFor="set-map">
            <select
              id="set-map"
              value={settings.mapId}
              onChange={(e) => patch("mapId", e.target.value)}
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.launchMap})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Max players" htmlFor="set-slots">
            <input
              id="set-slots"
              type="number"
              min={1}
              max={200}
              value={settings.maxPlayers}
              onChange={(e) => patchNum("maxPlayers", e.target.value)}
            />
          </Field>
          <Field label="Difficulty offset" htmlFor="set-diff">
            <input
              id="set-diff"
              type="number"
              step="0.1"
              min={0}
              max={5}
              value={settings.difficultyOffset}
              onChange={(e) => patchNum("difficultyOffset", e.target.value)}
            />
          </Field>
          <Field label="OverrideOfficialDifficulty" htmlFor="set-ood">
            <input
              id="set-ood"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={settings.overrideOfficialDifficulty}
              onChange={(e) => patchNum("overrideOfficialDifficulty", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section id="rates" title="Rates" open={open.rates} onToggle={() => toggleSection("rates")}>
        <div className="form-grid">
          {RATE_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`set-${f.key}`}>
              <input
                id={`set-${f.key}`}
                type="number"
                step="0.1"
                min={0}
                value={settings[f.key] as number}
                onChange={(e) => patchNum(f.key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section
        id="breeding"
        title="Breeding"
        open={open.breeding}
        onToggle={() => toggleSection("breeding")}
      >
        <div className="form-grid">
          {BREEDING_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`set-${f.key}`}>
              <input
                id={`set-${f.key}`}
                type="number"
                step="0.1"
                min={0}
                value={settings[f.key] as number}
                onChange={(e) => patchNum(f.key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section
        id="structures"
        title="Structures"
        open={open.structures}
        onToggle={() => toggleSection("structures")}
      >
        <div className="form-grid">
          {STRUCTURE_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`set-${f.key}`}>
              <input
                id={`set-${f.key}`}
                type="number"
                step="0.1"
                min={0}
                value={settings[f.key] as number}
                onChange={(e) => patchNum(f.key, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Max structures in range" htmlFor="set-maxstruct">
            <input
              id="set-maxstruct"
              type="number"
              min={1}
              value={settings.maxStructuresInRange}
              onChange={(e) => patchNum("maxStructuresInRange", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section
        id="mode"
        title="Mode & decay"
        open={open.mode}
        onToggle={() => toggleSection("mode")}
      >
        <div className="toggle-grid">
          <Toggle
            label="PvE mode (ServerPVE)"
            checked={settings.serverPve}
            onChange={(v) => patch("serverPve", v)}
          />
          <Toggle
            label="Allow cave building (PvE)"
            checked={settings.allowCaveBuildingPve}
            onChange={(v) => patch("allowCaveBuildingPve", v)}
          />
          <Toggle
            label="Disable structure decay (PvE)"
            checked={settings.disableStructureDecayPve}
            onChange={(v) => patch("disableStructureDecayPve", v)}
          />
          <Toggle
            label="Disable dino decay (PvE)"
            checked={settings.disableDinoDecayPve}
            onChange={(v) => patch("disableDinoDecayPve", v)}
          />
        </div>
      </Section>

      <Section
        id="network"
        title="Network & RCON"
        open={open.network}
        onToggle={() => toggleSection("network")}
      >
        <div className="form-grid">
          <Field label="Game port" htmlFor="set-gport">
            <input
              id="set-gport"
              type="number"
              value={settings.gamePort}
              onChange={(e) => patchNum("gamePort", e.target.value)}
            />
          </Field>
          <Field label="Query port" htmlFor="set-qport">
            <input
              id="set-qport"
              type="number"
              value={settings.queryPort}
              onChange={(e) => patchNum("queryPort", e.target.value)}
            />
          </Field>
          <Field label="RCON port" htmlFor="set-rport">
            <input
              id="set-rport"
              type="number"
              value={settings.rconPort}
              onChange={(e) => patchNum("rconPort", e.target.value)}
            />
          </Field>
          <Field label="RCON password" htmlFor="set-rpw">
            <input
              id="set-rpw"
              value={settings.rconPassword}
              onChange={(e) => patch("rconPassword", e.target.value)}
              placeholder="Optional — admin password used if empty"
              autoComplete="off"
            />
          </Field>
        </div>
      </Section>

      <Section
        id="mods"
        title={`Mods · ${modPlatform}`}
        open={open.mods}
        onToggle={() => toggleSection("mods")}
      >
        <div className="toggle-grid">
          {edition === "ASA" && (
            <Toggle
              label="Crossplay (ServerPlatform=All)"
              checked={settings.crossplay}
              onChange={(v) => patch("crossplay", v)}
            />
          )}
          <Toggle
            label="BattlEye enabled"
            checked={settings.battleEye}
            onChange={(v) => patch("battleEye", v)}
          />
        </div>
        <p className="muted-line">
          Load order is top → bottom. Enabled IDs become <code>-mods=id1,id2,…</code> on launch.
        </p>
        <div className="mod-add-row">
          <input
            value={modDraft}
            onChange={(e) => setModDraft(e.target.value)}
            placeholder={edition === "ASA" ? "CurseForge ID" : "Workshop ID"}
            aria-label="New mod ID"
          />
          <button type="button" className="btn btn-ghost" onClick={addMod}>
            Add mod
          </button>
        </div>
        {settings.modList.length === 0 ? (
          <div className="empty compact">No mods yet</div>
        ) : (
          <ul className="mod-list">
            {settings.modList.map((mod, index) => (
              <li key={`${mod.id}-${index}`} className="mod-row">
                <span className="mod-order">{index + 1}</span>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={mod.enabled}
                    onChange={(e) => {
                      const next = [...settings.modList];
                      next[index] = { ...mod, enabled: e.target.checked };
                      setModList(next);
                    }}
                  />
                  <code>{mod.id}</code>
                </label>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost btn-tiny"
                    disabled={index === 0}
                    onClick={() => moveMod(index, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-tiny"
                    disabled={index === settings.modList.length - 1}
                    onClick={() => moveMod(index, 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-tiny"
                    onClick={() => setModList(settings.modList.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="cluster"
        title="Cluster transfers"
        open={open.cluster}
        onToggle={() => toggleSection("cluster")}
      >
        <Field label="Attached cluster" htmlFor="set-cluster">
          <select
            id="set-cluster"
            value={settings.clusterId ?? ""}
            onChange={(e) => patch("clusterId", e.target.value || null)}
          >
            <option value="">None</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clusterId})
              </option>
            ))}
          </select>
        </Field>
        <div className="toggle-grid" style={{ marginTop: "0.75rem" }}>
          <Toggle
            label="Transfer inventory / items"
            checked={settings.transferInventory}
            onChange={(v) => patch("transferInventory", v)}
            disabled={!settings.clusterId}
          />
          <Toggle
            label="Transfer dinos"
            checked={settings.transferDinos}
            onChange={(v) => patch("transferDinos", v)}
            disabled={!settings.clusterId}
          />
          <Toggle
            label="Transfer tribute / survivors"
            checked={settings.transferTribute}
            onChange={(v) => patch("transferTribute", v)}
            disabled={!settings.clusterId}
          />
        </div>
      </Section>

      <Section id="ops" title="Ops" open={open.ops} onToggle={() => toggleSection("ops")}>
        <div className="form-grid">
          <Field label="Auto-save interval (minutes)" htmlFor="set-autosave">
            <input
              id="set-autosave"
              type="number"
              min={1}
              max={240}
              value={settings.autoSavePeriodMinutes}
              onChange={(e) => patchNum("autoSavePeriodMinutes", e.target.value)}
            />
          </Field>
          <Field label="Extra launch args" htmlFor="set-extra">
            <input
              id="set-extra"
              value={settings.extraArgs}
              onChange={(e) => patch("extraArgs", e.target.value)}
              placeholder="-ForceAllowCaveFlyers"
            />
          </Field>
        </div>
        <Field label="Message of the day" htmlFor="set-motd">
          <textarea
            id="set-motd"
            rows={3}
            value={settings.messageOfTheDay}
            onChange={(e) => patch("messageOfTheDay", e.target.value)}
            placeholder="Welcome to the server"
          />
        </Field>
      </Section>

      <Section
        id="config"
        title="Config editor"
        open={open.config}
        onToggle={() => toggleSection("config")}
      >
        <div className="btn-row" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowRawEdit((v) => !v)}
          >
            {showRawEdit ? "Lock editors (preview)" : "Unlock raw edit"}
          </button>
          <label className="check-line">
            <input
              type="checkbox"
              checked={writeRaw}
              onChange={(e) => setWriteRaw(e.target.checked)}
              disabled={!showRawEdit}
            />
            Save raw text (overwrite generated INI)
          </label>
        </div>
        {iniPaths && (
          <p className="muted-line">
            Primary: <code>{iniPaths.gameUserSettings}</code> · <code>{iniPaths.gameIni}</code>
          </p>
        )}
        <Field label="GameUserSettings.ini" htmlFor="set-gus">
          <textarea
            id="set-gus"
            className="code-area"
            rows={14}
            value={previewGus}
            readOnly={!showRawEdit}
            onChange={(e) => setPreviewGus(e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="Game.ini" htmlFor="set-gameini">
          <textarea
            id="set-gameini"
            className="code-area"
            rows={10}
            value={previewGame}
            readOnly={!showRawEdit}
            onChange={(e) => setPreviewGame(e.target.value)}
            spellCheck={false}
          />
        </Field>
      </Section>

      <div className="settings-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load()}>
          Reload
        </button>
      </div>
    </form>
  );
}

function Section({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`settings-section ${open ? "open" : ""}`} data-section={id}>
      <button type="button" className="settings-section-head" onClick={onToggle}>
        <span>{title}</span>
        <span className="chev">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="settings-section-body">{children}</div>}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`check-line ${disabled ? "disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
