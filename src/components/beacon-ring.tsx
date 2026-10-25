"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { BrandTile } from "@/components/brand-mark";

gsap.registerPlugin(useGSAP);

// The hours as the lighthouse's beam: a ring that fills toward the required hours, with
// the BEACON mark at its centre. Drawn for a navy tile; the figures sit beside it.
export function BeaconRing({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  const arc = useRef<SVGCircleElement>(null);
  // The beam fills to its value once on arrival (reduced motion: drawn full at once).
  useGSAP(() => {
    if (!arc.current || ratio <= 0) return;
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(arc.current, { strokeDasharray: `0 ${c}`, duration: 0.9, ease: "expo.out" });
    });
  });
  return (
    <div
      className="relative grid size-36 shrink-0 place-items-center"
      role="progressbar"
      aria-label="Confirmed hours"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.16)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          ref={arc}
          stroke="#5fbf8f"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(ratio * c, ratio > 0 ? 6 : 0)} ${c}`}
        />
      </svg>
      <BrandTile className="size-14 rounded-2xl shadow-sm ring-4 ring-white/15" />
    </div>
  );
}
