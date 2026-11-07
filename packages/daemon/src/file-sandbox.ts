import fs from "node:fs/promises";
import path from "node:path";
import { daemonConfig } from "./config.js";

/**
 * Path-sandbox helpers for instance directories.
 * Full file browser UI is ASM-3; these hooks are ready for it.
 */
export function resolveInstancePath(instanceId: string, relPath = "."): string {
  const root = path.resolve(daemonConfig.instancesRoot, instanceId);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path escapes instance sandbox");
  }
  return target;
}

export async function ensureInstanceDir(instanceId: string): Promise<string> {
  const root = resolveInstancePath(instanceId);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, "Saved"), { recursive: true });
  await fs.mkdir(path.join(root, "Config"), { recursive: true });
  return root;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: string;
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
      path: path.posix.join(relPath.replace(/\\/g, "/"), ent.name).replace(/^\.\//, ""),
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
): Promise<{ content: string; truncated: boolean }> {
  const abs = resolveInstancePath(instanceId, relPath);
  const st = await fs.stat(abs);
  if (!st.isFile()) throw new Error("Not a file");
  const buf = await fs.readFile(abs);
  const truncated = buf.length > maxBytes;
  return {
    content: buf.subarray(0, maxBytes).toString("utf8"),
    truncated,
  };
}
