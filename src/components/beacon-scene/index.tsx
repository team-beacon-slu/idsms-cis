"use client";

import { useEffect, useRef } from "react";

// The 3D living beacon behind every dashboard page. Three.js is fetched only after
// the page has painted, and only on a desktop-size screen with motion allowed, WebGL2,
// several cores and no data saver; everywhere else the CSS lighthouse in globals.css
// stays (the shell's data-scene attribute turns it off once the 3D scene is running).
export function BeaconScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const capable =
      matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches &&
      (navigator.hardwareConcurrency ?? 4) >= 4 &&
      !connection?.saveData &&
      !!document.createElement("canvas").getContext("webgl2");
    if (!capable) return;

    const shell = canvas.closest<HTMLElement>(".lighthouse-backdrop");
    const html = document.documentElement;
    let stop: (() => void) | undefined;
    let cancelled = false;

    // Called through window: a detached requestIdleCallback throws "Illegal invocation".
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(cb, { timeout: 1500 })
        : setTimeout(cb, 300);
    idle(async () => {
      const { startBeaconScene } = await import("./scene");
      if (cancelled) return;
      let scene: ReturnType<typeof startBeaconScene>;
      try {
        scene = startBeaconScene(canvas, { dark: html.classList.contains("dark") });
      } catch (error) {
        // Decoration only: if WebGL fails, the CSS lighthouse simply stays.
        console.warn("Beacon scene unavailable", error);
        return;
      }
      shell?.setAttribute("data-scene", "on");
      // Follow the light/dark switch.
      const mo = new MutationObserver(() =>
        scene.setTheme({ dark: html.classList.contains("dark") })
      );
      mo.observe(html, { attributes: true, attributeFilter: ["class"] });
      stop = () => {
        mo.disconnect();
        scene.dispose();
        shell?.removeAttribute("data-scene");
      };
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-dvh w-screen"
    />
  );
}
