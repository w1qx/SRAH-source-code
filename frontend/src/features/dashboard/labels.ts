import type { BankApplicationStatus, FinancingGoal, RiskTier } from "@shared/types";

/** Latin digits + tabular figures, as everywhere else in the app. */
export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export const NUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Arabic month names, Latin digits (matches the number style used in charts). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export const GOAL_LABEL: Record<FinancingGoal, string> = {
  car: "شراء سيارة",
  wedding: "الزواج",
  home: "شراء سكن",
  education: "التعليم",
  project: "مشروع",
  debt_consolidation: "دمج الديون",
  personal_need: "حاجة شخصية",
  personal: "تمويل شخصي",
  other: "هدف آخر",
};

/**
 * The contract's RiskTier ("high") maps onto the app's StatusBadge status
 * ("danger") — the badge component is shared with the analysis and offers pages,
 * so risk reads identically across the product.
 */
export const RISK_STATUS: Record<RiskTier, "safe" | "caution" | "danger"> = {
  safe: "safe",
  caution: "caution",
  high: "danger",
};

export const RISK_LABEL: Record<RiskTier, string> = {
  safe: "آمن",
  caution: "مقبول مع الحذر",
  high: "عالي المخاطر",
};

export interface AppStatusStyle {
  label: string;
  /** Tailwind classes for the chip. */
  chip: string;
  /** Tailwind class for the leading dot / icon color. */
  accent: string;
}

export const APPLICATION_STATUS: Record<BankApplicationStatus, AppStatusStyle> = {
  pending: {
    label: "قيد المراجعة",
    chip: "bg-caution-bg text-caution border-caution/20",
    accent: "text-caution",
  },
  approved: {
    label: "تمت الموافقة",
    chip: "bg-safe-bg text-safe border-safe/20",
    accent: "text-safe",
  },
  rejected: {
    label: "مرفوض",
    chip: "bg-danger-bg text-danger border-danger/20",
    accent: "text-danger",
  },
  expired: {
    label: "منتهي الصلاحية",
    chip: "bg-warm-bg text-text-secondary border-border",
    accent: "text-text-secondary",
  },
};

/** Risk-tinted start rail for list rows (past analyses). */
export const RISK_RAIL: Record<RiskTier, string> = {
  safe: "border-s-safe/50",
  caution: "border-s-caution/50",
  high: "border-s-danger/50",
};
