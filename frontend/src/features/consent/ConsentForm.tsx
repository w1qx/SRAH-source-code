"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { REQUIRED_FIELDS } from "@/store/useAppStore";
import { bothConsentsGiven, useConsentStore } from "@/store/useConsentStore";
import TermsModal from "./TermsModal";

/** Where the journey continues once consent is captured. */
const NEXT_ROUTE = "/advisor";

/** Same count the advisor's questions carry — the backend requires all of them. */
const TOTAL_QUESTIONS = REQUIRED_FIELDS.length;

interface ConsentCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  children: ReactNode;
  descriptionId: string;
  description: ReactNode;
  icon: ReactNode;
}

function ConsentCheckbox({
  id,
  checked,
  onChange,
  title,
  children,
  descriptionId,
  description,
  icon,
}: ConsentCheckboxProps) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-colors duration-200 ${
        checked ? "border-purple/40 bg-purple-light/40" : "border-border bg-white"
      }`}
    >
      <div className="flex items-start gap-3.5">
        {/* Native checkbox: keyboard + screen-reader support for free */}
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={descriptionId}
          className="mt-0.5 w-5 h-5 shrink-0 cursor-pointer accent-purple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
        />

        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block cursor-pointer">
            <span className="flex items-center gap-2 mb-1.5">
              <span className="text-purple shrink-0" aria-hidden="true">
                {icon}
              </span>
              <span className="text-sm font-bold text-navy">{title}</span>
              <span className="text-danger text-xs" aria-hidden="true">
                *
              </span>
            </span>
            <span className="block text-sm text-text-secondary leading-relaxed">{children}</span>
          </label>

          <p id={descriptionId} className="text-xs text-text-secondary/90 leading-relaxed mt-2">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ConsentForm() {
  const router = useRouter();
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consent = useConsentStore((s) => s.consent);
  const setTermsAccepted = useConsentStore((s) => s.setTermsAccepted);
  const setDataRetrievalAccepted = useConsentStore((s) => s.setDataRetrievalAccepted);
  const confirmConsent = useConsentStore((s) => s.confirmConsent);

  const canContinue = bothConsentsGiven(consent);

  const handleContinue = () => {
    if (!canContinue || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // There is no POST /consent: the backend takes PDPL consent on the first
      // /auth/otp/verify (signing up IS consenting), and records `pdplConsentAt` on the
      // user. So this screen records the decision and the login step transmits it.
      confirmConsent();
      router.push(NEXT_ROUTE);
    } catch {
      setError("تعذّر حفظ موافقتك. حاول مرة أخرى.");
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[640px] mx-auto px-4 py-10 sm:py-14">
      {/* Header. No logo here: the navbar above already carries it, and سُراة's greeting
          flashes on the advisor screen just before the first question. */}
      <header className="text-center animate-fade-in-up">
        <span className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full bg-purple-light/60 text-purple text-xs font-bold">
          الخطوة 1 من 4 · إقرارك
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-navy mb-3">قبل أن نبدأ</h1>
        <p className="text-text-secondary leading-relaxed max-w-lg mx-auto">
          سأطرح عليك {TOTAL_QUESTIONS} أسئلة قصيرة لفهم قرارك التمويلي — ولتحليل وضعك المالي بدقة،
          تحتاج سُراة إلى موافقتك أولاً.
        </p>
      </header>

      {/* Consents */}
      <div className="mt-9 space-y-4 animate-fade-in-up anim-delay-1">
        <ConsentCheckbox
          id="consent-terms"
          checked={consent.termsAccepted}
          onChange={setTermsAccepted}
          title="الشروط والأحكام"
          descriptionId="consent-terms-desc"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          }
          description={
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="inline-flex items-center gap-1 font-bold text-orange hover:text-orange-hover underline underline-offset-2 transition-colors cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
            >
              اقرأ الشروط والأحكام
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
          }
        >
          أوافق على الشروط والأحكام وسياسة الخصوصية الخاصة بمنصة سُراة.
        </ConsentCheckbox>

        <ConsentCheckbox
          id="consent-data"
          checked={consent.dataRetrievalAccepted}
          onChange={setDataRetrievalAccepted}
          title="سحب البيانات المالية وتخزينها"
          descriptionId="consent-data-desc"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          }
          description="تُستخدم بياناتك لغرض التحليل فقط، وتُعالَج مشفّرة، ويمكنك سحب موافقتك وطلب حذفها في أي وقت."
        >
          أوافق على سحب بياناتي المالية من الجهات المخوّلة (مثل سمة SIMAH وغيرها) وتخزينها لغرض
          تحليل وضعي المالي، وفقاً لنظام حماية البيانات الشخصية (PDPL).
        </ConsentCheckbox>
      </div>

      {/* Status: tells the user why the button is still disabled */}
      <p
        className="mt-5 flex items-center justify-center gap-2 text-xs text-text-secondary"
        aria-live="polite"
      >
        {canContinue ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-safe shrink-0" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            تم منح الموافقتين — يمكنك المتابعة.
          </>
        ) : (
          "يلزم تحديد الموافقتين معاً لبدء التحليل."
        )}
      </p>

      {error && (
        <p role="alert" className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-danger">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}

      {/* Primary action */}
      <button
        onClick={handleContinue}
        disabled={!canContinue || submitting}
        className="mt-5 w-full min-h-[56px] flex items-center justify-center gap-2.5 bg-orange text-white font-bold text-base rounded-2xl shadow-sm transition-all duration-200 enabled:hover:bg-orange-hover enabled:hover:shadow-md enabled:active:scale-[0.99] enabled:cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
      >
        {submitting ? (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            جارٍ الحفظ…
          </>
        ) : (
          "ابدأ التحليل"
        )}
      </button>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text-secondary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        اتصال مشفّر · بياناتك تُعالَج وفق نظام حماية البيانات الشخصية (PDPL)
      </p>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
