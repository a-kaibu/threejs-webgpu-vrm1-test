import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { createWebGpuRenderer } from "../webgpu";
import { useVrm } from "../hooks/useVrm";
import { useWebRTC } from "../hooks/useWebRTC";
import { VrmModel } from "./VrmModel";

export function LiveCanvas() {
  const { vrmUrl, onDragOver, onDrop } = useVrm();
  const { status, connect, disconnect, videoRef, poseFrame, stats } = useWebRTC(
    "/api",
    "data_only",
  );
  const [showCamera, setShowCamera] = useState(true);

  return (
    <main className="live" onDragOver={onDragOver} onDrop={onDrop}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="live__video"
        style={{ visibility: showCamera ? "visible" : "hidden" }}
      />

      <div className="live__stage">
        <Canvas
          gl={createWebGpuRenderer}
          camera={{ position: [0, 1, 5], fov: 30, near: 0.1, far: 20 }}
        >
          <OrbitControls target={[0, 1, 0]} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[1, 2, 2]} intensity={Math.PI} />
          {vrmUrl && (
            <Suspense fallback={null}>
              <VrmModel url={vrmUrl} poseFrame={poseFrame} />
            </Suspense>
          )}
        </Canvas>
      </div>

      {!vrmUrl && <div className="live__drop">VRMファイルをここへドロップ</div>}

      <section className="live__controls" aria-label="Live controls">
        <div className={`live__status live__status--${status}`}>
          <span />
          {status === "connected"
            ? `LIVE · ${stats.fps} FPS`
            : status === "connecting"
              ? "接続中…"
              : status === "error"
                ? "接続エラー"
                : "未接続"}
        </div>
        <button
          type="button"
          onClick={status === "idle" || status === "error" ? connect : disconnect}
          disabled={status === "connecting"}
        >
          {status === "idle" || status === "error" ? "カメラ接続" : "切断"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={showCamera}
            onChange={(event) => setShowCamera(event.target.checked)}
          />
          カメラ映像を表示
        </label>
        {status === "connected" && (
          <small>
            通信 {stats.latencyMs} ms / 推論 {stats.inferenceMs} ms / 人物 {stats.persons}
          </small>
        )}
      </section>
    </main>
  );
}
