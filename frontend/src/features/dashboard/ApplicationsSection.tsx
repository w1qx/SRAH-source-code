"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { BankApplication } from "@shared/types";
import { APPLICATION_STATUS, NUM, fmt, formatDate } from "./labels";

function StatusIcon({ status }: { status: BankApplication["status"] }) {
  if (status === "approved") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === "rejected") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  if (status === "expired") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  // pending
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin motion-reduce:animate-none" style={{ animationDuration: "2s" }} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function ApplicationCard({ application }: { application: BankApplication }) {
  const style = APPLICATION_STATUS[application.status];
  const settled = application.respondedAt !== null;

  return (
    <div className="h-full bg-white rounded-[15px] border border-border transition-shadow duration-200 hover:shadow-[0_1px_3px_rgba(8,47,62,0.06),0_14px_28px_-18px_rgba(8,47,62,0.28)]">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-bold text-navy text-base truncate">{application.bankName}</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              قُدّم في {formatDate(application.submittedAt)}
            </p>
          </div>
          {/* Status: icon + word, never color alone */}
          <span
            className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${style.chip}`}
          >
            <StatusIcon status={application.status} />
            {style.label}
          </span>
        </div>

        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-[11px] text-text-secondary mb-0.5">مبلغ التمويل</dt>
            <dd className="text-sm font-bold text-navy" style={NUM}>
              {fmt(application.financingAmount)}{" "}
              <span className="text-[10px] font-normal text-text-secondary">ر.س</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-secondary mb-0.5">القسط الشهري</dt>
            <dd className="text-sm font-bold text-navy" style={NUM}>
              {fmt(application.monthlyInstallment)}{" "}
              <span className="text-[10px] font-normal text-text-secondary">ر.س</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-secondary mb-0.5">المدة</dt>
            <dd className="text-sm font-bold text-navy" style={NUM}>
              {application.termYears}{" "}
              <span className="text-[10px] font-normal text-text-secondary">سنوات</span>
            </dd>
          </div>
        </dl>

        <p className={`text-[11px] mt-4 pt-3 border-t border-border/60 ${settled ? style.accent : "text-text-secondary"}`}>
          {settled
            ? `صدر القرار في ${formatDate(application.respondedAt as string)}`
            : "بانتظار قرار الجهة الممولة."}
        </p>
      </div>
    </div>
  );
}

export default function ApplicationsSection({ applications }: { applications: BankApplication[] }) {
  const pending = applications.filter((a) => a.status === "pending").length;
  const shouldReduceMotion = useReducedMotion();

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-base font-bold text-navy">طلبات التمويل</h2>
        {pending > 0 && (
          <span className="text-xs text-text-secondary" style={NUM}>
            {pending} قيد المراجعة
          </span>
        )}
      </div>
      <p className="text-xs text-text-secondary mb-4">
        الطلبات التي قدّمتها للجهات الممولة وحالتها الحالية.
      </p>

      {applications.length === 0 ? (
        <div className="bg-white rounded-[15px] border border-dashed border-border p-8 text-center">
          <p className="text-sm font-semibold text-navy mb-1">لا توجد طلبات بعد</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            بعد اختيار عرض مناسب من نتائج التحليل، ستظهر هنا طلباتك وحالتها.
          </p>
        </div>
      ) : (
        <motion.ul
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
          initial="hidden"
          animate="visible"
        >
          {applications.map((application) => (
            <motion.li
              key={application.id}
              variants={{
                hidden: { opacity: 0, y: 16, scale: 0.99 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: shouldReduceMotion
                    ? { duration: 0.2 }
                    : { type: "spring", stiffness: 300, damping: 30 },
                },
              }}
            >
              <ApplicationCard application={application} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
