"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

// The /about backdrop: six Blender stills per cut (scripts/blender/build-beacon.py), one
// per section, crossfaded by scroll — ~70-280 KB a cut instead of a 6 MB film (council
// verdict). Each still eases in from a slight zoom as its section arrives, so the camera
// still seems to move. Still 0 ships in the HTML (works with no script); stills 1-5 are
// added only as the scroll nears them, for the active theme and screen shape only.
const STILLS = 6;
const PORTRAIT = "(max-aspect-ratio: 1/1)";
const src = (theme: string, portrait: boolean, i: number) =>
  `/about/beacon-${theme}${portrait ? "-m" : ""}-${i}.avif`;

export function HeroStills() {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "night" : "day";
  const [portrait, setPortrait] = useState(false);
  const [wanted, setWanted] = useState(1); // stills 1..wanted-1 are in the page

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shape = matchMedia(PORTRAIT);
    // Scroll position -> a continuous stop index: section i (data-stop) centred = i.
    let keys: [number, number][] = [];
    const measure = () => {
      setPortrait(shape.matches);
      keys = [...document.querySelectorAll<HTMLElement>("[data-stop]")].map((el) => [
        Math.max(0, el.offsetTop + el.offsetHeight / 2 - innerHeight / 2),
        Number(el.dataset.stop),
      ]);
    };
    const at = (y: number) => {
      let i = 0;
      while (i < keys.length - 1 && y > keys[i + 1][0]) i++;
      const [y0, s0] = keys[i] ?? [0, 0];
      const [y1, s1] = keys[Math.min(i + 1, keys.length - 1)] ?? [0, 0];
      return y1 > y0 ? s0 + (s1 - s0) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0))) : s1;
    };
    let raf = 0;
    const paint = () => {
      raf = 0;
      const t = at(scrollY);
      setWanted((w) => Math.max(w, Math.min(STILLS, Math.floor(t + 2.5)))); // keep one ahead
      for (const img of root.querySelectorAll<HTMLImageElement>("img[data-i]")) {
        const i = Number(img.dataset.i);
        const d = t - i;
        img.style.opacity = String(
          i === 0 ? Math.min(1, Math.max(0, 1 - d)) : Math.max(0, 1 - Math.abs(d))
        );
        if (!still) img.style.transform = `scale(${1.06 - 0.06 * Math.min(1, Math.max(0, d + 1))})`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onResize = () => {
      measure();
      onScroll();
    };
    measure();
    paint();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
    };
  }, []);

  // Stills added after a scroll (or a theme switch) get their opacity on the next frame;
  // they render at opacity 0 until then, so nothing flashes in.
  useEffect(() => {
    dispatchEvent(new Event("scroll"));
  }, [wanted, theme, portrait]);

  const cls = "absolute inset-0 size-full object-cover";
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden bg-sky-300 dark:bg-slate-950"
    >
      {(["day", "night"] as const).map((t) => (
        <div key={t} className={t === "day" ? "dark:hidden" : "hidden dark:block"}>
          <picture>
            <source media={PORTRAIT} srcSet={src(t, true, 0)} />
            <img src={src(t, false, 0)} alt="" data-i={0} fetchPriority="high" className={cls} />
          </picture>
          {t === theme &&
            Array.from({ length: wanted - 1 }, (_, k) => (
              // eslint-disable-next-line @next/next/no-img-element -- see above
              <img
                key={`${portrait}-${k + 1}`}
                src={src(t, portrait, k + 1)}
                alt=""
                data-i={k + 1}
                decoding="async"
                className={cls}
                style={{ opacity: 0 }}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
