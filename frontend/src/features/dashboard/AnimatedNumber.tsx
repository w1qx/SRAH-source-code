"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { NUM, fmt } from "./labels";

/**
 * A number that springs to its new value instead of cutting — the "haptic feel"
 * shared by the gauge, the drawer readouts and the comparison matrix. Animates
 * FROM the currently displayed value, so rapid slider drags chain smoothly.
 * Under reduced motion the value lands instantly.
 */
export default function AnimatedNumber({
  value,
  decimals = 0,
  className,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
  suffix?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  // Mirrors the currently displayed value (updated only inside the animation
  // callback) so each new animation starts FROM what is on screen.
  const shownRef = useRef(value);

  useEffect(() => {
    const controls = animate(shownRef.current, value, {
      // Reduced motion: same animation, zero duration — the value lands instantly.
      ...(shouldReduceMotion
        ? { duration: 0 }
        : { type: "spring" as const, stiffness: 170, damping: 26 }),
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, shouldReduceMotion]);

  const rounded = decimals > 0 ? shown.toFixed(decimals) : fmt(Math.round(shown));

  return (
    <span className={className} style={{ ...NUM, direction: "ltr", unicodeBidi: "isolate" }}>
      {rounded}
      {suffix}
    </span>
  );
}
