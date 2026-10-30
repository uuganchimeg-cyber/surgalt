"use client";

import { useEffect } from "react";

export default function DisableBrowserZoom() {
  useEffect(() => {
    const preventZoomShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key;
      const isZoomKey =
        key === "+" ||
        key === "=" ||
        key === "-" ||
        key === "_" ||
        key === "0" ||
        event.code === "NumpadAdd" ||
        event.code === "NumpadSubtract";

      if (isZoomKey) event.preventDefault();
    };

    const preventWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    const preventGestureZoom = (event: Event) => event.preventDefault();

    document.addEventListener("keydown", preventZoomShortcut, true);
    document.addEventListener("wheel", preventWheelZoom, { capture: true, passive: false });
    document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
    document.addEventListener("gesturechange", preventGestureZoom, { passive: false });

    return () => {
      document.removeEventListener("keydown", preventZoomShortcut, true);
      document.removeEventListener("wheel", preventWheelZoom, true);
      document.removeEventListener("gesturestart", preventGestureZoom);
      document.removeEventListener("gesturechange", preventGestureZoom);
    };
  }, []);

  return null;
}
