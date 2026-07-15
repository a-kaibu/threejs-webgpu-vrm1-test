import { useState, useCallback, useEffect } from "react";
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
      const url = URL.createObjectURL(file);
      setVrmUrl(url);
      if (prev) URL.revokeObjectURL(prev);
    },
    [vrmUrl],
  );

  // Revoke the current URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (vrmUrl) URL.revokeObjectURL(vrmUrl);
    };
  }, [vrmUrl]);

  return { vrmUrl, onDragOver, onDrop };
}
