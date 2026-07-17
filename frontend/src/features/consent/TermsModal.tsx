"use client";

import { useEffect, useRef } from "react";

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
}

/** TODO(content): replace with the real legal copy once it is approved. */
const SECTIONS = [
  {
    title: "١. طبيعة الخدمة",
    body: "تقدّم منصة سُراة تحليلاً توعوياً تقديرياً لأثر قرارات التمويل على وضعك المالي. المنصة ليست جهة تمويل، ولا تمثّل نتائجها موافقة ائتمانية أو توصية مالية ملزمة.",
  },
  {
    title: "٢. البيانات التي نعالجها",
    body: "نعالج البيانات التي تدخلها بنفسك، إضافةً إلى البيانات التي نسحبها من الجهات المخوّلة بعد موافقتك الصريحة، وذلك لغرض تحليل وضعك المالي فقط.",
  },
  {
    title: "٣. حماية البيانات (PDPL)",
    body: "تُعالَج بياناتك وفقاً لنظام حماية البيانات الشخصية في المملكة العربية السعودية. بياناتك مشفّرة أثناء النقل والتخزين، ولا تُستخدم لغير الغرض الموضّح، ولك حق طلب حذفها في أي وقت.",
  },
  {
    title: "٤. سحب الموافقة",
    body: "يمكنك سحب موافقتك لاحقاً من إعدادات حسابك. عند سحب الموافقة نتوقف عن معالجة بياناتك، ويُحذف ما هو مخزّن منها وفق سياسة الاحتفاظ المعتمدة.",
  },
  {
    title: "٥. حدود المسؤولية",
    body: "تعتمد نتائج التحليل على البيانات المُدخلة وعلى افتراضات اقتصادية قابلة للتغيّر. قرار التمويل النهائي ومسؤوليته يعودان إليك وإلى الجهة الممولة.",
  },
];

export default function TermsModal({ open, onClose }: TermsModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes; focus lands on the dialog's close button when it opens.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Keep Tab inside the dialog.
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Blur signals the background is dismissible */}
      <div
        className="absolute inset-0 bg-navy/40 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        className="relative w-full sm:max-w-lg max-h-[85dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-modal-in"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border">
          <div>
            <h2 id="terms-title" className="text-lg font-bold text-navy">
              الشروط والأحكام وسياسة الخصوصية
            </h2>
            <p className="text-xs text-text-secondary mt-1">
              نسخة تجريبية — النص النهائي قيد الاعتماد.
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="إغلاق الشروط والأحكام"
            className="p-2 -m-1 rounded-xl text-text-secondary hover:bg-warm-bg hover:text-navy transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-bold text-navy mb-1.5">{section.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{section.body}</p>
            </section>
          ))}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-warm-bg/60 sm:rounded-b-3xl">
          <button
            onClick={onClose}
            className="w-full min-h-[48px] bg-navy hover:bg-navy/90 active:scale-[0.99] text-white font-semibold rounded-2xl transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            تم، أغلق
          </button>
        </footer>
      </div>
    </div>
  );
}
