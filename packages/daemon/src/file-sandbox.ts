import fs from "node:fs/promises";
import path from "node:path";
import type { DirEntry } from "@ark-host/shared";
import { daemonConfig } from "./config.js";

const FORBIDDEN_NAMES = new Set(["", ".", ".."]);
const MAX_WRITE_BYTES = 2_000_000;
const MAX_UPLOAD_BYTES = 25_000_000;

export function resolveInstancePath(instanceId: string, relPath = "."): string {
  const root = path.resolve(daemonConfig.instancesRoot, instanceId);
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.split("/").some((p) => FORBIDDEN_NAMES.has(p) && p !== ".")) {
    // allow "." as whole path only
  }
  if (normalized.includes("\0")) throw new Error("Invalid path");
  const target = path.resolve(root, normalized === "" ? "." : normalized);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path escapes instance sandbox");
  }
  return target;
}

export function resolveClusterPath(clusterToken: string, relPath = "."): string {
  const root = path.resolve(daemonConfig.instancesRoot, "_cluster", clusterToken);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path escapes cluster sandbox");
  }
  return target;
}

export async function ensureInstanceDir(instanceId: string): Promise<string> {
  const root = resolveInstancePath(instanceId);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, "Saved"), { recursive: true });
  await fs.mkdir(path.join(root, "Config"), { recursive: true });
  await fs.mkdir(path.join(root, "ShooterGame", "Saved", "Config", "WindowsServer"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "ShooterGame", "Saved", "Config", "LinuxServer"), {
    recursive: true,
  });
  return root;
}

export async function ensureClusterDir(clusterToken: string): Promise<string> {
  const root = resolveClusterPath(clusterToken);
  await fs.mkdir(root, { recursive: true });
  return root;
}

function toPosixRel(relPath: string, name: string): string {
  const base = relPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!base || base === ".") return name;
  return `${base}/${name}`;
}

export async function listDir(instanceId: string, relPath = "."): Promise<DirEntry[]> {
  const abs = resolveInstancePath(instanceId, relPath);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const out: DirEntry[] = [];
  for (const ent of entries) {
    const full = path.join(abs, ent.name);
    const st = await fs.stat(full);
    out.push({
      name: ent.name,
      path: toPosixRel(relPath, ent.name),
      type: ent.isDirectory() ? "dir" : "file",
      size: st.size,
      mtime: st.mtime.toISOString(),
    });
  }
  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function readFileBounded(
  instanceId: string,
  relPath: string,
  maxBytes = 512_000,
): Promise<{ content: string; truncated: boolean; size: number }> {
  const abs = resolveInstancePath(instanceId, relPath);
  const st = await fs.stat(abs);
  if (!st.isFile()) throw new Error("Not a file");
  const buf = await fs.readFile(abs);
  const truncated = buf.length > maxBytes;
  return {
    content: buf.subarray(0, maxBytes).toString("utf8"),
    truncated,
    size: buf.length,
  };
}

export async function writeFileText(
  instanceId: string,
  relPath: string,
  content: string,
): Promise<{ path: string; size: number }> {
  if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
    throw new Error(`File exceeds ${MAX_WRITE_BYTES} byte write limit`);
  }
  const abs = resolveInstancePath(instanceId, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  const st = await fs.stat(abs);
  return { path: relPath.replace(/\\/g, "/"), size: st.size };
}

export async function writeFileBuffer(
  instanceId: string,
  relPath: string,
  data: Buffer,
): Promise<{ path: string; size: number }> {
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new Error(`Upload exceeds ${MAX_UPLOAD_BYTES} byte limit`);
  }
  const abs = resolveInstancePath(instanceId, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return { path: relPath.replace(/\\/g, "/"), size: data.length };
}

export async function mkdirp(instanceId: string, relPath: string): Promise<{ path: string }> {
  const abs = resolveInstancePath(instanceId, relPath);
  await fs.mkdir(abs, { recursive: true });
  return { path: relPath.replace(/\\/g, "/") };
}

export async function removePath(instanceId: string, relPath: string): Promise<void> {
  if (!relPath || relPath === "." || relPath === "/") {
    throw new Error("Refusing to delete instance root");
  }
  const abs = resolveInstancePath(instanceId, relPath);
  const root = resolveInstancePath(instanceId);
  if (abs === root) throw new Error("Refusing to delete instance root");
  await fs.rm(abs, { recursive: true, force: true });
}

export async function readFileRaw(instanceId: string, relPath: string): Promise<Buffer> {
  const abs = resolveInstancePath(instanceId, relPath);
  const st = await fs.stat(abs);
  if (!st.isFile()) throw new Error("Not a file");
  if (st.size > MAX_UPLOAD_BYTES) throw new Error("File too large to download via panel");
  return fs.readFile(abs);
}

export { MAX_WRITE_BYTES, MAX_UPLOAD_BYTES };
