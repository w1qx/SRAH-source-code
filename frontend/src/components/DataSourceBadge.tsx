"use client";

import type { DataSource } from "@shared/types";

/**
 * Says where a figure came from: "مُدخل يدوياً" (the user typed it), "موثّق من سمة" (verified
 * against their SIMAH credit report), or "موثّق من التأمينات" (verified from their GOSI record).
 *
 * Never colour alone — every state ships an icon AND a label, so the distinction survives
 * greyscale, colour-blindness, and the app's no-green/no-red status palette.
 */
interface DataSourceBadgeProps {
  source: DataSource;
  size?: "sm" | "md";
  className?: string;
}

const PencilIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const ShieldCheckIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

export default function DataSourceBadge({ source, size = "sm", className = "" }: DataSourceBadgeProps) {
  // GOSI and SIMAH are both verified sources; only "manual" is user-typed. "safe" (teal) reads as
  // trusted/official in this palette — never green.
  const VERIFIED = {
    bg: "bg-safe-bg",
    text: "text-safe",
    border: "border-safe/25",
    icon: ShieldCheckIcon,
  } as const;

  const cfg =
    source === "simah"
      ? { label: "موثّق من سمة", ...VERIFIED }
      : source === "gosi"
        ? { label: "موثّق من التأمينات", ...VERIFIED }
        : {
            label: "مُدخل يدوياً",
            bg: "bg-warm-bg",
            text: "text-text-secondary",
            border: "border-border",
            icon: PencilIcon,
          };

  const sizeClasses =
    size === "md" ? "text-xs px-2.5 py-1 gap-1.5" : "text-[10px] px-2 py-0.5 gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.border} ${sizeClasses} ${className}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
