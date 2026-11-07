import { useCallback, useEffect, useRef, useState } from "react";
import type { DirEntry } from "@ark-host/shared";
import { api, ApiError } from "../api";

interface Props {
  instanceId: string;
}

export function FileBrowser({ instanceId }: Props) {
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listFiles(instanceId, path);
      setEntries(res.entries);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to list files");
    }
  }, [instanceId, path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function parentPath(p: string): string {
    if (!p || p === ".") return ".";
    const parts = p.split("/").filter(Boolean);
    parts.pop();
    return parts.length ? parts.join("/") : ".";
  }

  async function openFile(rel: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.readFile(instanceId, rel);
      setEditorPath(rel);
      setEditorContent(res.content);
      setTruncated(res.truncated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Read failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveFile() {
    if (!editorPath) return;
    setBusy(true);
    try {
      await api.writeFile(instanceId, editorPath, editorContent);
      setTruncated(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onMkdir() {
    const name = prompt("New folder name");
    if (!name) return;
    const rel = path === "." ? name : `${path}/${name}`;
    try {
      await api.mkdir(instanceId, rel);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "mkdir failed");
    }
  }

  async function onDelete(rel: string) {
    if (!confirm(`Delete ${rel}?`)) return;
    try {
      await api.deleteFile(instanceId, rel);
      if (editorPath === rel) {
        setEditorPath(null);
        setEditorContent("");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(fileList)) {
        await api.uploadFile(instanceId, path, file);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="files-layout">
      <div className="panel files-pane">
        <div className="console-toolbar">
          <code className="path-crumb">{path}</code>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={path === "."}
              onClick={() => setPath(parentPath(path))}
            >
              Up
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void onMkdir()}>
              New folder
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
              Upload
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              onChange={(e) => void onUpload(e.target.files)}
            />
            <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Modified</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((ent) => (
              <tr key={ent.path}>
                <td>
                  {ent.type === "dir" ? (
                    <button type="button" className="linkish" onClick={() => setPath(ent.path)}>
                      [{ent.name}]
                    </button>
                  ) : (
                    <button type="button" className="linkish" onClick={() => void openFile(ent.path)}>
                      {ent.name}
                    </button>
                  )}
                </td>
                <td className="mono-cell">{ent.type === "dir" ? "—" : ent.size}</td>
                <td className="mono-cell">{ent.mtime.slice(0, 19).replace("T", " ")}</td>
                <td>
                  <div className="btn-row">
                    {ent.type === "file" && (
                      <a
                        className="btn btn-ghost"
                        href={`/api/instances/${instanceId}/files/download?path=${encodeURIComponent(ent.path)}`}
                      >
                        Download
                      </a>
                    )}
                    <button type="button" className="btn btn-danger" onClick={() => void onDelete(ent.path)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <div className="empty">Empty directory</div>}
      </div>

      <div className="panel files-editor">
        {editorPath ? (
          <>
            <div className="console-toolbar">
              <strong>{editorPath}</strong>
              {truncated && <span className="badge badge-starting">truncated</span>}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveFile()}>
                Save
              </button>
            </div>
            <textarea
              className="code-editor"
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              spellCheck={false}
            />
          </>
        ) : (
          <div className="empty">Select a file to view or edit (text files up to ~512KB preview).</div>
        )}
      </div>
    </div>
  );
}
