import {
  findMap,
  type ConsoleLine,
  type GameEdition,
  type InstanceStatus,
} from "@ark-host/shared";
import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { daemonConfig } from "./config.js";

export interface ManagedSpec {
  id: string;
  name: string;
  edition: GameEdition;
  mapId: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  maxPlayers: number;
  adminPassword: string;
  serverPassword: string | null;
  clusterId: string | null;
  /** On-disk cluster token shared across maps. */
  clusterToken: string | null;
  transferInventory: boolean;
  transferDinos: boolean;
  transferTribute: boolean;
  installPath: string;
  extraArgs: string;
}

interface RuntimeState {
  status: InstanceStatus;
  pid: number | null;
  child: ChildProcess | null;
  mockTimer: NodeJS.Timeout | null;
  startedAt: string | null;
  lines: ConsoleLine[];
}

const MAX_LINES = 500;

export class ProcessManager extends EventEmitter {
  private readonly states = new Map<string, RuntimeState>();

  getStatus(id: string): { status: InstanceStatus; pid: number | null } {
    const s = this.states.get(id);
    return {
      status: s?.status ?? "stopped",
      pid: s?.pid ?? null,
    };
  }

  getConsole(id: string, after = 0): ConsoleLine[] {
    const s = this.ensure(id);
    return s.lines.slice(after);
  }

  async start(spec: ManagedSpec): Promise<{ status: InstanceStatus; pid: number | null }> {
    const state = this.ensure(spec.id);
    if (state.status === "running" || state.status === "starting" || state.status === "mock") {
      return { status: state.status, pid: state.pid };
    }

    state.status = "starting";
    this.pushLine(spec.id, "system", `Starting ${spec.name} (${spec.edition})…`);
    this.emitStatus(spec.id);

    if (daemonConfig.mockMode) {
      return this.startMock(spec);
    }

    return this.startReal(spec);
  }

  async stop(id: string): Promise<{ status: InstanceStatus; pid: number | null }> {
    const state = this.ensure(id);
    if (state.status === "stopped") {
      return { status: "stopped", pid: null };
    }

    state.status = "stopping";
    this.pushLine(id, "system", "Stopping instance…");
    this.emitStatus(id);

    if (state.mockTimer) {
      clearInterval(state.mockTimer);
      state.mockTimer = null;
    }

    if (state.child && state.pid) {
      try {
        state.child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      // Force kill after grace period
      const child = state.child;
      setTimeout(() => {
        if (child.exitCode === null && !child.killed) {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }
      }, 15_000).unref();
    }

    await new Promise((r) => setTimeout(r, daemonConfig.mockMode ? 400 : 200));
    state.status = "stopped";
    state.pid = null;
    state.child = null;
    this.pushLine(id, "system", "Instance stopped.");
    this.emitStatus(id);
    return { status: "stopped", pid: null };
  }

  async restart(spec: ManagedSpec): Promise<{ status: InstanceStatus; pid: number | null }> {
    await this.stop(spec.id);
    return this.start(spec);
  }

  /** Build launch argv without executing — used by panel and docs. */
  buildLaunchCommand(spec: ManagedSpec): { cwd: string; command: string; args: string[]; env: Record<string, string> } {
    const map = findMap(spec.edition, spec.mapId);
    const launchMap = map?.launchMap ?? spec.mapId;
    const sessionBits = [
      `${launchMap}?listen`,
      `SessionName=${spec.sessionName}`,
      `Port=${spec.gamePort}`,
      `QueryPort=${spec.queryPort}`,
      `RCONPort=${spec.rconPort}`,
      `RCONEnabled=True`,
      `ServerAdminPassword=${spec.adminPassword}`,
      `MaxPlayers=${spec.maxPlayers}`,
    ];
    if (spec.serverPassword) {
      sessionBits.push(`ServerPassword=${spec.serverPassword}`);
    }

    const extra = spec.extraArgs.trim().split(/\s+/).filter(Boolean);
    const clusterArgs: string[] = [];
    if (spec.clusterToken) {
      clusterArgs.push(`-clusterid=${spec.clusterToken}`);
      if (spec.transferInventory) clusterArgs.push("-ClusterDirOverride=" + path.join(daemonConfig.instancesRoot, "_cluster", spec.clusterToken));
      // Transfer toggles are typically GameUserSettings; stub flags for visibility
      if (!spec.transferDinos) clusterArgs.push("-NoTransferDinos");
    }

    if (spec.edition === "ASA") {
      const win64 = path.join(spec.installPath, "ShooterGame", "Binaries", "Win64");
      const proton = daemonConfig.protonPath;
      const prefix = path.join(spec.installPath, "proton-prefix");
      return {
        cwd: win64,
        command: path.join(proton, "proton"),
        args: ["run", "./ArkAscendedServer.exe", sessionBits.join("?"), "-server", "-log", "-NoBattlEye", ...clusterArgs, ...extra],
        env: {
          STEAM_COMPAT_CLIENT_INSTALL_PATH: path.join(daemonConfig.instancesRoot, "_steam"),
          STEAM_COMPAT_DATA_PATH: prefix,
        },
      };
    }

    // ASE Linux native binary path
    const linuxBin = path.join(spec.installPath, "ShooterGame", "Binaries", "Linux");
    return {
      cwd: linuxBin,
      command: path.join(linuxBin, "ShooterGameServer"),
      args: [sessionBits.join("?"), "-server", "-log", ...clusterArgs, ...extra],
      env: {},
    };
  }

  private startMock(spec: ManagedSpec): { status: InstanceStatus; pid: number | null } {
    const state = this.ensure(spec.id);
    const fakePid = 40_000 + Math.floor(Math.random() * 10_000);
    state.pid = fakePid;
    state.status = "mock";
    state.startedAt = new Date().toISOString();

    this.pushLine(spec.id, "stdout", `[Mock] ${spec.edition} dedicated server boot sequence`);
    this.pushLine(spec.id, "stdout", `[Mock] Map=${spec.mapId} Session=${spec.sessionName}`);
    this.pushLine(spec.id, "stdout", `[Mock] GamePort=${spec.gamePort} QueryPort=${spec.queryPort} RCON=${spec.rconPort}`);
    const cmd = this.buildLaunchCommand(spec);
    this.pushLine(spec.id, "system", `[Mock] Would exec: ${cmd.command} ${cmd.args.join(" ")}`);
    this.pushLine(spec.id, "stdout", "[Mock] Server is ready for connections (simulated).");

    let tick = 0;
    state.mockTimer = setInterval(() => {
      tick += 1;
      this.pushLine(spec.id, "stdout", `[Mock] heartbeat tick=${tick} players=0/${spec.maxPlayers}`);
    }, 15_000);
    state.mockTimer.unref();

    this.emitStatus(spec.id);
    return { status: "mock", pid: fakePid };
  }

  private startReal(spec: ManagedSpec): { status: InstanceStatus; pid: number | null } {
    const state = this.ensure(spec.id);
    const cmd = this.buildLaunchCommand(spec);

    if (!fs.existsSync(cmd.command) && !fs.existsSync(path.join(cmd.cwd, path.basename(cmd.command)))) {
      state.status = "crashed";
      this.pushLine(
        spec.id,
        "stderr",
        `Binary not found. Install game files via SteamCMD first, or enable ARK_HOST_MOCK=1. Expected: ${cmd.command}`,
      );
      this.emitStatus(spec.id);
      return { status: "crashed", pid: null };
    }

    fs.mkdirSync(cmd.cwd, { recursive: true });
    const child = spawn(cmd.command, cmd.args, {
      cwd: cmd.cwd,
      env: { ...process.env, ...cmd.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    state.child = child;
    state.pid = child.pid ?? null;
    state.status = "running";
    state.startedAt = new Date().toISOString();
    this.pushLine(spec.id, "system", `Spawned pid=${state.pid}`);
    this.emitStatus(spec.id);

    child.stdout?.on("data", (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (line) this.pushLine(spec.id, "stdout", line);
      }
    });
    child.stderr?.on("data", (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (line) this.pushLine(spec.id, "stderr", line);
      }
    });
    child.on("exit", (code, signal) => {
      state.child = null;
      state.pid = null;
      state.status = code === 0 || signal === "SIGTERM" ? "stopped" : "crashed";
      this.pushLine(spec.id, "system", `Process exited code=${code} signal=${signal}`);
      this.emitStatus(spec.id);
    });

    return { status: state.status, pid: state.pid };
  }

  private ensure(id: string): RuntimeState {
    let s = this.states.get(id);
    if (!s) {
      s = {
        status: "stopped",
        pid: null,
        child: null,
        mockTimer: null,
        startedAt: null,
        lines: [],
      };
      this.states.set(id, s);
    }
    return s;
  }

  private pushLine(id: string, stream: ConsoleLine["stream"], text: string): void {
    const s = this.ensure(id);
    const line: ConsoleLine = { ts: new Date().toISOString(), stream, text };
    s.lines.push(line);
    if (s.lines.length > MAX_LINES) {
      s.lines.splice(0, s.lines.length - MAX_LINES);
    }
    this.emit("console", id, line);
  }

  private emitStatus(id: string): void {
    const s = this.ensure(id);
    this.emit("status", id, { status: s.status, pid: s.pid });
  }
}

export const processManager = new ProcessManager();
