import { useState, useCallback } from "react";
import type { DragEvent } from "react";

interface UseVrmReturn {
  vrmUrl: string | null;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
}

export function useVrm(): UseVrmReturn {
  const [vrmUrl, setVrmUrl] = useState<string | null>(null);

  const onDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const prev = vrmUrl;
      const url = URL.createObjectURL(new Blob([file], { type: "application/octet-stream" }));
      setVrmUrl(url);
      if (prev) URL.revokeObjectURL(prev);
    },
    [vrmUrl],
  );

  return { vrmUrl, onDragOver, onDrop };
}
