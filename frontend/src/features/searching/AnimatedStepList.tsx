"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type StepStatus = "pending" | "running" | "done" | "skipped";

export interface Step {
  id: string;
  title: string;
  status: StepStatus;
}

interface AnimatedStepListProps {
  steps: Step[];
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Status icons                                                        */
/* ------------------------------------------------------------------ */

/** Ring of 8 dashes with one lit dash travelling around it. */
function SyncingIcon({ activeDashIndex }: { activeDashIndex: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16">
      {Array.from({ length: 8 }).map((_, index) => {
        const angle = index * 45 - 90; // start at the top
        const radian = (angle * Math.PI) / 180;
        const radius = 6;
        const dashLength = 1.8;

        const startX = 8 + (radius - dashLength / 2) * Math.cos(radian);
        const startY = 8 + (radius - dashLength / 2) * Math.sin(radian);
        const endX = 8 + (radius + dashLength / 2) * Math.cos(radian);
        const endY = 8 + (radius + dashLength / 2) * Math.sin(radian);

        const isActive = index === activeDashIndex;

        return (
          <line
            key={index}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            // Purple is the app's "in progress" hue (see AnalyzingOverlay).
            stroke={isActive ? "var(--color-purple)" : "var(--color-border)"}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function DoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" className="drop-shadow-sm">
      <circle cx="8" cy="8" r="8" fill="var(--color-safe)" />
      <path
        d="M5 8l2.5 2.5 3.5-4"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="2 2.5" />
    </svg>
  );
}

/** A clock — the step exists and is built, but is not active yet ("قريباً"). */
function SkippedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--color-purple)" strokeWidth="1.4" opacity="0.7" />
      <path d="M8 4.5V8l2.2 1.3" stroke="var(--color-purple)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

const STATUS_TEXT: Record<StepStatus, string | null> = {
  done: "تم",
  running: "جارٍ",
  pending: "بالانتظار",
  skipped: "قريباً",
};

export default function AnimatedStepList({ steps, className = "" }: AnimatedStepListProps) {
  const [activeDashIndex, setActiveDashIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  // Travelling dash — the only continuously-running animation in the list.
  useEffect(() => {
    if (shouldReduceMotion) return;
    const interval = setInterval(() => {
      setActiveDashIndex((prev) => (prev + 1) % 8);
    }, 100);
    return () => clearInterval(interval);
  }, [shouldReduceMotion]);

  const iconFor = (status: StepStatus) => {
    if (status === "done") return <DoneIcon />;
    if (status === "running") return <SyncingIcon activeDashIndex={activeDashIndex} />;
    if (status === "skipped") return <SkippedIcon />;
    return <PendingIcon />;
  };

  return (
    // The steps are the live region: each transition is announced once.
    <motion.ol
      dir="rtl"
      aria-live="polite"
      className={`space-y-3 ${className}`}
      variants={{
        visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
      }}
      initial="hidden"
      animate="visible"
    >
      {steps.map((step) => (
        <motion.li
          key={step.id}
          layout
          variants={{
            hidden: { opacity: 0, y: 20, scale: 0.98 },
            visible: {
              opacity: 1,
              y: 0,
              scale: 1,
              transition: shouldReduceMotion
                ? { duration: 0.2 }
                : { type: "spring", stiffness: 300, damping: 30 },
            },
          }}
          transition={{
            layout: shouldReduceMotion
              ? { duration: 0.2 }
              : { type: "spring", stiffness: 400, damping: 30 },
          }}
        >
          <motion.div
            className={`relative overflow-hidden rounded-xl border p-4 transition-colors duration-300 ${
              step.status === "done"
                ? "border-border bg-white"
                : step.status === "running"
                ? "border-purple/40 bg-white"
                : step.status === "skipped"
                ? "border-purple/25 bg-purple-light/25"
                : "border-border/60 bg-white/50"
            }`}
            // A single settle-pulse the moment a step lands on "done".
            animate={
              step.status === "done" && !shouldReduceMotion
                ? {
                    scale: [1, 1.02, 1],
                    transition: { duration: 0.6, ease: [0.04, 0.62, 0.23, 0.98], times: [0, 0.3, 1] },
                  }
                : {}
            }
          >
            {/* Soft wash on the step currently running — reads as "active" */}
            {step.status === "running" && (
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-l from-purple-light/70 to-transparent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
            )}

            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {/* Icons cross-fade in place: with mode="wait" the old icon
                    leaves before the new one arrives, flashing an empty slot. */}
                <div className="relative h-5 w-5 shrink-0">
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={step.status}
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0.15 }
                          : { type: "spring", stiffness: 400, damping: 25 }
                      }
                    >
                      {iconFor(step.status)}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <span
                  className={`truncate text-sm font-semibold ${
                    step.status === "pending" || step.status === "skipped"
                      ? "text-text-secondary"
                      : "text-navy"
                  }`}
                >
                  {step.title}
                </span>
              </div>

              {/* Status word — identity never rests on color alone */}
              <div className="relative flex h-6 w-14 shrink-0 items-center justify-end">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={step.status}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 flex items-center justify-end whitespace-nowrap text-[11px] font-bold tracking-wide ${
                      step.status === "done"
                        ? "text-safe"
                        : step.status === "running"
                        ? "text-purple"
                        : step.status === "skipped"
                        ? "text-purple/80"
                        : "text-text-secondary/70"
                    }`}
                  >
                    {STATUS_TEXT[step.status]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.li>
      ))}
    </motion.ol>
  );
}
