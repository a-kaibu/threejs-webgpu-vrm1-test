import { useState, useRef, useCallback, useEffect } from "react";
import type { RefObject } from "react";

type WebRTCStatus = "idle" | "connecting" | "connected" | "error";

export interface PoseFrame {
  frame: number;
  timestamp: number;
  persons: { keypoints: [number, number][]; scores: number[] }[];
  image_size: [number, number];
}

export interface WebRTCStats {
  fps: number;
  frame: number;
  persons: number;
  latencyMs: number;
}

export interface UseWebRTCReturn {
  status: WebRTCStatus;
  connect: () => void;
  disconnect: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  poseFrame: PoseFrame | null;
  stats: WebRTCStats;
}

export function useWebRTC(serverUrl: string, transform: string): UseWebRTCReturn {
  const [status, setStatus] = useState<WebRTCStatus>("idle");
  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null);
  const [stats, setStats] = useState<WebRTCStats>({ fps: 0, frame: 0, persons: 0, latencyMs: 0 });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fpsCountRef = useRef(0);
  const fpsTimerRef = useRef(performance.now());

  const disconnect = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    fpsCountRef.current = 0;
    fpsTimerRef.current = performance.now();
    pcRef.current?.close();
    pcRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPoseFrame(null);
    setStats({ fps: 0, frame: 0, persons: 0, latencyMs: 0 });
    setStatus("idle");
  }, []);

  const connect = useCallback(() => {
    disconnect();
    setStatus("connecting");

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.ontrack = (evt) => {
      if (evt.track.kind === "video" && videoRef.current) {
        videoRef.current.srcObject = evt.streams[0] ?? new MediaStream([evt.track]);
      }
    };

    pc.ondatachannel = (evt) => {
      if (evt.channel.label !== "pose") return;
      evt.channel.onmessage = (e: MessageEvent<string>) => {
        const frame = JSON.parse(e.data) as PoseFrame;

        fpsCountRef.current++;
        const now = performance.now();
        if (now - fpsTimerRef.current >= 1000) {
          const fps = fpsCountRef.current;
          fpsCountRef.current = 0;
          fpsTimerRef.current = now;
          const latencyMs = Math.round((Date.now() / 1000 - frame.timestamp) * 1000);
          setStats({ fps, frame: frame.frame, persons: frame.persons.length, latencyMs });
        }

        setPoseFrame(frame);
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setStatus("error");
      }
    };

    void (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (pcRef.current !== pc) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") resolve();
        };
        if (pc.iceGatheringState === "complete") resolve();
      });

      const res = await fetch(`${serverUrl}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: pc.localDescription!.sdp,
          type: pc.localDescription!.type,
          video_transform: transform,
        }),
      });
      const answer = (await res.json()) as { sdp: string; type: RTCSdpType };
      await pc.setRemoteDescription(answer);
    })().catch(() => setStatus("error"));
  }, [serverUrl, transform, disconnect]);

  // Cleanup on unmount
  useEffect(() => disconnect, [disconnect]);

  return { status, connect, disconnect, videoRef, poseFrame, stats };
}
