"use client";

import { useAppStore } from "@/store/useAppStore";
import { Logo } from "./ui/logo";

const steps = [
  { num: 1, label: "بياناتك" },
  { num: 2, label: "تحليل القرار" },
  { num: 3, label: "العروض المناسبة" },
];

export default function Header() {
  const { currentStep, resetAll } = useAppStore();

  return (
    <header className="bg-white border-b border-border fixed top-0 left-0 right-0 z-50">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Logo className="w-16 h-8 text-navy" />
        </div>

        {/* Steps - Desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {steps.map((step, i) => (
            <div key={step.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    currentStep === step.num
                      ? "bg-navy text-white"
                      : currentStep > step.num
                      ? "bg-safe/10 text-safe"
                      : "bg-border text-text-secondary"
                  }`}
                >
                  {currentStep > step.num ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    step.num
                  )}
                </span>
                <span
                  className={`text-sm ${
                    currentStep === step.num
                      ? "font-semibold text-navy"
                      : "text-text-secondary"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-12 h-px bg-border mx-3" />
              )}
            </div>
          ))}
        </nav>

        {/* Steps - Mobile */}
        <div className="md:hidden text-sm text-text-secondary font-medium">
          الخطوة {currentStep} من 3
        </div>

        {/* Reset */}
        <button
          onClick={resetAll}
          className="hidden sm:block text-sm text-text-secondary hover:text-navy transition-colors flex-shrink-0"
        >
          بدء تحليل جديد
        </button>
      </div>
    </header>
  );
}
