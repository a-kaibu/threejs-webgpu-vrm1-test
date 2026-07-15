import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { createWebGpuRenderer } from "../webgpu";
import { useVrm } from "../hooks/useVrm";
import { VrmModel } from "./VrmModel";

export function VrmCanvas() {
  const { vrmUrl, onDragOver, onDrop } = useVrm();

  return (
    <div style={{ width: "100%", height: "100%" }} onDragOver={onDragOver} onDrop={onDrop}>
      {!vrmUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#888",
            fontFamily: "system-ui, sans-serif",
            fontSize: "1.5rem",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 1,
          }}
        >
          Drop a VRM file here
        </div>
      )}
      <Canvas
        gl={createWebGpuRenderer}
        camera={{ position: [0, 1, 5], fov: 30, near: 0.1, far: 20 }}
      >
        <OrbitControls target={[0, 1, 0]} />
        <directionalLight position={[1, 1, 1]} intensity={Math.PI} />
        <gridHelper args={[10, 10]} />
        {vrmUrl && (
          <Suspense fallback={null}>
            <VrmModel url={vrmUrl} />
          </Suspense>
        )}
      </Canvas>
    </div>
  );
}
