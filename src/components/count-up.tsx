"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

// A figure that counts up from 0 on first paint; the server-rendered value is the
// fallback, so with reduced motion or no script the real number shows at once.
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
      const shown = { n: 0 };
      const decimals = Number.isInteger(value) ? 0 : 2;
      gsap.to(shown, {
        n: value,
        duration: 0.9,
        ease: "expo.out",
        onUpdate: () => {
          el.textContent = shown.n.toFixed(decimals);
        },
      });
    });
  });
  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
