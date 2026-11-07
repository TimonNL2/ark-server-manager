import { useEffect, useRef, useState } from "react";
import type { ConsoleLine } from "@ark-host/shared";

interface Props {
  instanceId: string;
}

export function LiveConsole({ instanceId }: Props) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "closed" | "error">("connecting");
  const [autoScroll, setAutoScroll] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const cursor = useRef(-1);

  useEffect(() => {
    setLines([]);
    cursor.current = -1;
    setStatus("connecting");

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/api/instances/${instanceId}/console/ws?after=-1`;
    const ws = new WebSocket(url);

    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("error");
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          lines?: ConsoleLine[];
          status?: string;
          error?: string;
        };
        if (msg.type === "lines" && msg.lines?.length) {
          setLines((prev) => {
            const next = [...prev];
            for (const line of msg.lines!) {
              if (line.index <= cursor.current) continue;
              next.push(line);
              cursor.current = line.index;
            }
            return next.slice(-800);
          });
        }
      } catch {
        /* ignore */
      }
    };

    const ping = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 20_000);

    return () => {
      window.clearInterval(ping);
      ws.close();
    };
  }, [instanceId]);

  useEffect(() => {
    if (!autoScroll || !scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lines, autoScroll]);

  return (
    <div className="console-wrap">
      <div className="console-toolbar">
        <span className={`badge badge-${status === "live" ? "running" : "stopped"}`}>
          {status === "live" && <span className="pulse-dot" />}
          console {status}
        </span>
        <label className="console-check">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
        <button type="button" className="btn btn-ghost" onClick={() => setLines([])}>
          Clear view
        </button>
      </div>
      <div className="console" ref={scroller}>
        {lines.length === 0 ? (
          <div className="console-empty">Waiting for output… Start the instance to see mock/live lines.</div>
        ) : (
          lines.map((line) => (
            <div key={line.index} className={`console-line console-${line.stream}`}>
              <span className="console-ts">{line.ts.slice(11, 19)}</span>
              <span className="console-stream">{line.stream}</span>
              <span className="console-text">{line.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
