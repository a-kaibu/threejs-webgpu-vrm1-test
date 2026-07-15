import { useRef, useEffect, useState } from "react";
import { useWebRTC, type PoseFrame } from "../hooks/useWebRTC";

const SERVER_URL = "http://127.0.0.1:8787";

const BODY_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 6],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];

function drawPose(canvas: HTMLCanvasElement, video: HTMLVideoElement, frame: PoseFrame) {
  const vw = video.videoWidth || video.clientWidth;
  const vh = video.videoHeight || video.clientHeight;
  if (canvas.width !== vw || canvas.height !== vh) {
    canvas.width = vw;
    canvas.height = vh;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const person of frame.persons) {
    const { keypoints: kpts, scores } = person;

    ctx.lineWidth = 2;
    for (const [a, b] of BODY_EDGES) {
      if (a >= kpts.length || b >= kpts.length) continue;
      if (scores[a] < 0.43 || scores[b] < 0.43) continue;
      ctx.strokeStyle = a < 11 ? "#51e5ff" : a % 2 === 1 ? "#00ff88" : "#ff8c00";
      ctx.beginPath();
      ctx.moveTo(kpts[a][0] * canvas.width, kpts[a][1] * canvas.height);
      ctx.lineTo(kpts[b][0] * canvas.width, kpts[b][1] * canvas.height);
      ctx.stroke();
    }

    for (let i = 0; i < Math.min(kpts.length, 17); i++) {
      if (scores[i] < 0.43) continue;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(kpts[i][0] * canvas.width, kpts[i][1] * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function PoseDebug() {
  const [transform, setTransform] = useState("pose");
  const { status, connect, disconnect, videoRef, poseFrame, stats } = useWebRTC(
    SERVER_URL,
    transform,
  );
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (poseFrame && overlayRef.current && videoRef.current) {
      drawPose(overlayRef.current, videoRef.current, poseFrame);
    }
  }, [poseFrame]);

  const jsonPreview = poseFrame
    ? JSON.stringify(
        {
          ...poseFrame,
          persons: poseFrame.persons.slice(0, 1).map((p) => ({
            keypoints: p.keypoints.slice(0, 5),
            scores: p.scores.slice(0, 5),
          })),
        },
        null,
        2,
      ) + (poseFrame.persons.length > 0 ? "\n  … (133点)" : "")
    : "接続待ち…";

  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        background: "#0d0d14",
        color: "#e0e0e0",
        fontFamily: "system-ui, monospace, sans-serif",
        fontSize: 13,
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          background: "#13131f",
          borderRight: "1px solid #2a2a3a",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid #2a2a3a" }}>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12 }}>
            Pose Debug
          </h1>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background: status === "connected" ? "#00ff88" : "#555",
                boxShadow: status === "connected" ? "0 0 6px #00ff88" : "none",
              }}
            />
            <span>
              {status === "connected"
                ? "接続中"
                : status === "connecting"
                  ? "接続中…"
                  : status === "error"
                    ? "エラー"
                    : "切断中"}
            </span>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["接続", "切断"] as const).map((label, i) => (
              <button
                key={label}
                disabled={
                  i === 0 ? status === "connected" || status === "connecting" : status === "idle"
                }
                onClick={i === 0 ? connect : disconnect}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  border: "1px solid #3a3a52",
                  borderRadius: 4,
                  background: "#1e1e30",
                  color: "#e0e0e0",
                  cursor: "pointer",
                  fontSize: 12,
                  opacity: (
                    i === 0 ? status === "connected" || status === "connecting" : status === "idle"
                  )
                    ? 0.4
                    : 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Transform select */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#888", fontSize: 11 }}>video_transform</span>
            <select
              value={transform}
              onChange={(e) => {
                setTransform(e.target.value);
              }}
              style={{
                background: "#1e1e30",
                border: "1px solid #3a3a52",
                borderRadius: 4,
                color: "#e0e0e0",
                padding: "4px 6px",
                fontSize: 12,
              }}
            >
              <option value="pose">pose (overlay + data)</option>
              <option value="data_only">data_only (data のみ)</option>
              <option value="none">none (passthrough)</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #2a2a3a",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {(
            [
              ["FPS", stats.fps],
              ["フレーム", stats.frame],
              ["人数", stats.persons],
              ["遅延", `${stats.latencyMs} ms`],
            ] as [string, number | string][]
          ).map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#666" }}>{label}</span>
              <span>{status === "connected" ? val : "—"}</span>
            </div>
          ))}
        </div>

        {/* JSON */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            style={{
              padding: "8px 16px",
              fontSize: 11,
              color: "#666",
              borderBottom: "1px solid #2a2a3a",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            DataChannel JSON
          </div>
          <pre
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              fontSize: 11,
              lineHeight: 1.6,
              color: "#7ecfff",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {jsonPreview}
          </pre>
        </div>
      </div>

      {/* Video area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080810",
          minWidth: 0,
        }}
      >
        <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ display: "block", maxWidth: "100%", maxHeight: "100dvh", background: "#111" }}
          />
          <canvas
            ref={overlayRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
