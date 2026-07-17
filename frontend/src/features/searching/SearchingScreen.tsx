"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { UserFinancialData } from "@shared/types";
import { Logo } from "@/components/ui/logo";
import DataSourceBadge from "@/components/DataSourceBadge";
import { useAppStore } from "@/store/useAppStore";
import { useConsentStore } from "@/store/useConsentStore";
import { getRules } from "@/lib/api/analysis";
import { getQuestions, pullFinancialData, uploadStatement, type PulledFinancialData } from "@/lib/api/chat";
import { getProfile, mockNafathLogin } from "@/lib/api/auth";
import { getFeatureFlags } from "@/lib/api/feature-flags";
import AnimatedStepList, { type Step, type StepStatus } from "./AnimatedStepList";
import { toast } from "@/lib/toast";
import { Smartphone, X, Upload, FileText } from "lucide-react";

const fmtSar = (n: number) => `${n.toLocaleString("en-US")} ريال`;
const NEXT_ROUTE = "/advisor";
const MIN_VISIBLE_MS = 3400;

const STEPS = [
  { id: "verify", label: "نتحقق من بياناتك" },
  { id: "gosi", label: "نجلب دخلك من التأمينات الاجتماعية" },
  { id: "simah", label: "نجلب تقريرك الائتماني من سمة" },
  { id: "match", label: "نطابق مع أنظمة الإقراض المسؤول" },
  { id: "prepare", label: "نجهّز تحليلك" },
] as const;

const STEP_INTERVAL_MS = MIN_VISIBLE_MS / STEPS.length;

function ProcessSeal({ animate = true }: { animate?: boolean }) {
  return (
    <div className="relative w-28 h-28 mx-auto" aria-hidden="true">
      {animate && (
        <>
          <span className="absolute inset-0 rounded-full border border-[#00897B]/30 animate-ring" />
          <span
            className="absolute inset-0 rounded-full border border-[#00897B]/25 animate-ring"
            style={{ animationDelay: "0.8s" }}
          />
          <span
            className="absolute inset-0 rounded-full border border-navy/15 animate-ring"
            style={{ animationDelay: "1.6s" }}
          />
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-orbit">
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-border)" strokeWidth="2" />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#00897B"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="46 243"
            />
          </svg>
        </>
      )}
      {!animate && (
        <div className="absolute inset-0 rounded-full border-2 border-border" />
      )}
      <span className="absolute inset-[14px] flex items-center justify-center">
        <Logo className="w-14 h-auto text-navy" />
      </span>
    </div>
  );
}

// Interactive PDF Folder Component in Srah Theme
function FolderInteraction({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pageVariants = {
    spring: { type: "spring" as const, duration: 0.6 },
  };

  const handleFolderClick = () => {
    setIsOpen(true);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 300);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("نوع الملف غير مدعوم", "الرجاء رفع ملف بصيغة PDF فقط.");
        setIsOpen(false);
        return;
      }
      onFileSelect(file);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div className="w-full flex flex-col justify-center items-center gap-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf"
        className="hidden"
      />
      <div
        onClick={handleFolderClick}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="w-72 h-44 relative cursor-pointer select-none"
      >
        {/* Folder Back Panel */}
        <div
          className="folder relative w-[88%] mx-auto h-full flex justify-center items-center"
          style={{
            background: "#1E1A16",
            boxShadow: "0px 0px 15px 10px rgba(17, 17, 17, 0.2) inset",
            borderRadius: 12,
          }}
        >
          {/* Document pages inside the folder */}
          {[
            {
              initial: { rotate: -3, x: -32, y: 2 },
              open: { rotate: -8, x: -55, y: -45 },
              transition: { ...pageVariants.spring, bounce: 0.15, stiffness: 160, damping: 22 },
              className: "z-10 shadow-md",
            },
            {
              initial: { rotate: 0, x: 0, y: 0 },
              open: { rotate: 1, x: 2, y: -60 },
              transition: { ...pageVariants.spring, duration: 0.55, bounce: 0.12, stiffness: 190, damping: 24 },
              className: "z-20 shadow-lg",
            },
            {
              initial: { rotate: 3.5, x: 32, y: 1 },
              open: { rotate: 9, x: 55, y: -50 },
              transition: { ...pageVariants.spring, duration: 0.58, bounce: 0.17, stiffness: 170, damping: 21 },
              className: "z-10 shadow-md",
            },
          ].map((page, i) => (
            <motion.div
              key={i}
              initial={page.initial}
              animate={isOpen ? page.open : page.initial}
              transition={page.transition}
              className={`absolute top-2 w-28 h-fit rounded-lg ${page.className}`}
            >
              <FolderPage />
            </motion.div>
          ))}
        </div>

        {/* Folder Front Flap (Glassmorphic Srah Teal) */}
        <motion.div
          animate={{ rotateX: isOpen ? -38 : 0 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
          className="absolute -left-[1px] -right-[1px] -bottom-[1px] z-30 h-36 rounded-2xl origin-bottom flex justify-center items-center overflow-visible"
        >
          <svg
            className="w-full h-full overflow-visible"
            viewBox="0 0 235 121"
            fill="none"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <foreignObject x="-13" y="-13" width="262.4" height="148.4">
              <div
                style={{
                  backdropFilter: "blur(6.5px)",
                  clipPath: "url(#bgblur_0_1_106_clip_path)",
                  height: "100%",
                  width: "100%",
                }}
              ></div>
            </foreignObject>
            <path
              id="Vector"
              d="M104.615 0.350494L33.1297 0.838776C32.7542 0.841362 32.3825 0.881463 32.032 0.918854C31.6754 0.956907 31.3392 0.992086 31.0057 0.992096H31.0047C30.6871 0.99235 30.3673 0.962051 30.0272 0.929596C29.6927 0.897686 29.3384 0.863802 28.9803 0.866119L13.2693 0.967682H13.2527L13.2352 0.969635C13.1239 0.981406 13.0121 0.986674 12.9002 0.986237H9.91388C8.33299 0.958599 6.76052 1.22345 5.27423 1.76651H5.27325C4.33579 2.11246 3.48761 2.66213 2.7879 3.37393L2.49689 3.68839L2.492 3.69424C1.62667 4.73882 1.00023 5.96217 0.656067 7.27725C0.653324 7.28773 0.654065 7.29886 0.652161 7.30948C0.3098 8.62705 0.257231 10.0048 0.499817 11.3446L12.2147 114.399L12.2156 114.411L12.2176 114.423C12.6046 116.568 13.7287 118.508 15.3934 119.902C17.058 121.297 19.1572 122.056 21.3231 122.049V122.05H215.379C217.76 122.02 220.064 121.192 221.926 119.698V119.697C223.657 118.384 224.857 116.485 225.305 114.35L225.307 114.339L235.914 53.3798L235.968 53.1093L235.97 53.0985L235.971 53.0888C236.134 51.8978 236.044 50.685 235.705 49.5321C235.307 48.1669 234.63 46.9005 233.717 45.8144L233.383 45.4296C232.58 44.5553 231.614 43.8449 230.539 43.3398C229.311 42.7628 227.971 42.4685 226.616 42.4774H146.746C144.063 42.4705 141.423 41.8004 139.056 40.5263C136.691 39.2522 134.671 37.4127 133.175 35.1689L113.548 5.05948L113.544 5.05362L113.539 5.04776C112.545 3.65165 111.238 2.51062 109.722 1.72061C108.266 0.886502 106.627 0.422235 104.952 0.365143V0.364166L104.633 0.350494H104.615Z"
              fill="url(#paint0_linear_1_106)"
              fillOpacity="0.3"
              stroke="url(#paint1_linear_1_106)"
              strokeWidth="0.7"
            />
            <defs>
              <clipPath id="bgblur_0_1_106_clip_path" transform="translate(13 13)">
                <path d="M104.615 0.350494L33.1297 0.838776C32.7542 0.841362 32.3825 0.881463 32.032 0.918854C31.6754 0.956907 31.3392 0.992086 31.0057 0.992096H31.0047C30.6871 0.99235 30.3673 0.962051 30.0272 0.929596C29.6927 0.897686 29.3384 0.863802 28.9803 0.866119L13.2693 0.967682H13.2527L13.2352 0.969635C13.1239 0.981406 13.0121 0.986674 12.9002 0.986237H9.91388C8.33299 0.958599 6.76052 1.22345 5.27423 1.76651H5.27325C4.33579 2.11246 3.48761 2.66213 2.7879 3.37393L2.49689 3.68839L2.492 3.69424C1.62667 4.73882 1.00023 5.96217 0.656067 7.27725C0.653324 7.28773 0.654065 7.29886 0.652161 7.30948C0.3098 8.62705 0.257231 10.0048 0.499817 11.3446L12.2147 114.399L12.2156 114.411L12.2176 114.423C12.6046 116.568 13.7287 118.508 15.3934 119.902C17.058 121.297 19.1572 122.056 21.3231 122.049V122.05H215.379C217.76 122.02 220.064 121.192 221.926 119.698V119.697C223.657 118.384 224.857 116.485 225.305 114.35L225.307 114.339L235.914 53.3798L235.968 53.1093L235.97 53.0985L235.971 53.0888C236.134 51.8978 236.044 50.685 235.705 49.5321C235.307 48.1669 234.63 46.9005 233.717 45.8144L233.383 45.4296C232.58 44.5553 231.614 43.8449 230.539 43.3398C229.311 42.7628 227.971 42.4685 226.616 42.4774H146.746C144.063 42.4705 141.423 41.8004 139.056 40.5263C136.691 39.2522 134.671 37.4127 133.175 35.1689L113.548 5.05948L113.544 5.05362L113.539 5.04776C112.545 3.65165 111.238 2.51062 109.722 1.72061C108.266 0.886502 106.627 0.422235 104.952 0.365143V0.364166L104.633 0.350494H104.615Z" />
              </clipPath>
              {/* Web theme linear gradients: warm tones & Srah teal */}
              <linearGradient
                id="paint0_linear_1_106"
                x1="114.7"
                y1="0.7"
                x2="114.7"
                y2="121.7"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#00897B" />
                <stop offset="1" stopColor="#005B52" />
              </linearGradient>
              <linearGradient
                id="paint1_linear_1_106"
                x1="114.7"
                y1="0.7"
                x2="114.7"
                y2="121.7"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#00BFA5" stopOpacity="0.4" />
                <stop offset="1" stopColor="#004D40" stopOpacity="0.3" />
              </linearGradient>
            </defs>
          </svg>
        </motion.div>
      </div>
    </div>
  );
}

// Inner page component styled with Srah theme colors
const FolderPage = () => (
  <div className="w-full h-24 bg-gradient-to-b from-[#F5EFEB] to-[#EDE7E0] border border-[#DDD3C9] rounded-lg shadow-sm p-2 flex flex-col justify-between">
    <div className="flex flex-col gap-1">
      <div className="w-1/2 h-1 bg-[#00897B]/40 rounded-full" />
      <div className="w-3/4 h-0.5 bg-[#DDD3C9] rounded-full" />
      <div className="w-full h-0.5 bg-[#DDD3C9] rounded-full" />
    </div>
    <div className="flex justify-between items-center mt-1">
      <FileText className="w-4 h-4 text-[#00897B]/60" />
      <div className="w-6 h-1 bg-[#00897B]/30 rounded-full" />
    </div>
  </div>
);

type ScreenState = "welcome" | "choose" | "nafath_modal" | "nafath_confirm" | "pdf_processing" | "pulling_data";

export default function SearchingScreen() {
  const router = useRouter();
  const consent = useConsentStore((s) => s.consent);
  const setAnswer = useAppStore((s) => s.setAnswer);
  
  const [screenState, setScreenState] = useState<ScreenState>("welcome");
  const [activeStep, setActiveStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const [simahEnabled, setSimahEnabled] = useState(false);
  const [gosiEnabled, setGosiEnabled] = useState(false);
  const [pulled, setPulled] = useState<PulledFinancialData | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Nafath modal specifics
  const [nationalId, setNationalId] = useState("");
  const [confirmNumber, setConfirmNumber] = useState(45);
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");

  // Check feature flags
  useEffect(() => {
    const controller = new AbortController();
    getFeatureFlags(controller.signal)
      .then((flags) => {
        setSimahEnabled(flags.find((f) => f.key === "simah_credit")?.enabled ?? false);
        setGosiEnabled(flags.find((f) => f.key === "gosi_income")?.enabled ?? false);
      })
      .catch(() => {
        setSimahEnabled(false);
        setGosiEnabled(false);
      });
    return () => controller.abort();
  }, []);

  // Guarantee consent is active
  useEffect(() => {
    if (!consent.consentedAt) {
      router.replace("/consent");
    }
  }, [consent.consentedAt, router]);

  // Transition from Welcome to Choose screen after 2.5s
  useEffect(() => {
    if (screenState === "welcome") {
      const timer = setTimeout(() => {
        setScreenState("choose");
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [screenState]);

  // Nafath timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (screenState === "nafath_confirm" && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    } else if (countdown === 0) {
      setScreenState("choose");
      toast.error("انتهت المهلة", "انتهت مهلة التأكيد عبر تطبيق نفاذ. الرجاء المحاولة مرة أخرى.");
    }
    return () => clearInterval(timer);
  }, [screenState, countdown]);

  // Step checklist interval driver
  useEffect(() => {
    if (screenState !== "pulling_data" || failed) return;
    const timer = setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [screenState, failed, attempt]);

  // Main data pipeline trigger once pulling_data state is active
  useEffect(() => {
    if (screenState !== "pulling_data") return;

    let cancelled = false;
    const controller = new AbortController();
    const minVisible = new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_MS));

    const pull = pullFinancialData(controller.signal).then((result) => {
      if (cancelled) return result;
      for (const [field, value] of Object.entries(result.pulled)) {
        setAnswer(field as keyof UserFinancialData, value as never);
      }
      setPulled(result);
      return result;
    });

    Promise.all([
      getProfile(controller.signal),
      getRules(controller.signal),
      getQuestions(controller.signal),
      pull,
      minVisible,
    ])
      .then(() => {
        if (cancelled) return;
        setActiveStep(STEPS.length);
        router.push(NEXT_ROUTE);
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setFailed(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [screenState, router, attempt, setAnswer]);

  const handleNafathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nationalId || nationalId.length !== 10) {
      toast.error("خطأ في رقم الهوية", "الرجاء إدخال رقم هوية وطنية مكون من 10 أرقام.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setScreenState("nafath_confirm");
      setCountdown(60);
      setConfirmNumber(Math.floor(10 + Math.random() * 90));
      toast.success("تم إرسال الطلب بنجاح", "يرجى تأكيد الدخول من تطبيق نفاذ.");

      // Simulate success callback
      setTimeout(async () => {
        try {
          await mockNafathLogin(nationalId);
          toast.success("تم تأكيد الهوية", "تم التحقق من هويتك عبر نفاذ.");
          setScreenState("pulling_data");
        } catch (err) {
          toast.error("فشل التحقق عبر نفاذ", err instanceof Error ? err.message : "حدث خطأ غير متوقع");
          setScreenState("choose");
        }
      }, 4000);
    }, 1200);
  };

  const handlePdfUpload = async (file: File) => {
    setSelectedFileName(file.name);
    setScreenState("pdf_processing");

    try {
      // Real round-trip: the backend validates and parses the report, answering with the
      // same { pulled, provenance } contract as /chat/pull — merged like the auto-pull.
      const result = await uploadStatement(file);
      for (const [field, value] of Object.entries(result.pulled)) {
        setAnswer(field as keyof UserFinancialData, value as never);
      }
      toast.success("تم تحليل تقرير سمة بنجاح", `تم استخراج الراتب والالتزامات من الملف: ${file.name}`);

      // Proceed directly to Chat advisor after parsing is done
      router.push(NEXT_ROUTE);
    } catch {
      toast.error("تعذّر تحليل الملف", "تأكد أن الملف تقرير PDF صالح ثم أعد المحاولة.");
      setScreenState("choose");
    }
  };

  const retry = () => {
    setFailed(false);
    setActiveStep(0);
    setAttempt((n) => n + 1);
  };

  const stepModel: Step[] = STEPS.map((step, i) => {
    if ((step.id === "simah" && !simahEnabled) || (step.id === "gosi" && !gosiEnabled)) {
      return { id: step.id, title: step.label, status: "skipped" };
    }
    const status: StepStatus = i < activeStep ? "done" : i === activeStep ? "running" : "pending";
    return { id: step.id, title: step.label, status };
  });

  return (
    <div className="w-full max-w-[640px] mx-auto px-4 py-10 sm:py-16 text-center min-h-[70vh] flex flex-col justify-center items-center">
      <AnimatePresence mode="wait">
        
        {/* STATE 1: WELCOME */}
        {screenState === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col items-center gap-6"
          >
            <ProcessSeal />
            <h1 className="text-2xl sm:text-3xl font-bold text-navy">
              أهلاً بك، أنا سراة مساعدك المالي.
            </h1>
            <p className="text-text-secondary max-w-md mx-auto leading-relaxed">
              سأقوم بتبسيط تحليل قرارك التمويلي ودراسة التزاماتك وفق لوائح البنك المركزي السعودي (SAMA).
            </p>
          </motion.div>
        )}

        {/* STATE 2: CHOOSE GATE */}
        {screenState === "choose" && (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="w-full flex flex-col items-center gap-8"
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold text-navy mb-2">لخدمتك بشكل أفضل</h2>
              <p className="text-text-secondary text-sm">الرجاء اختيار أحد الخيارات لتزويدنا ببياناتك المالية:</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl mt-4">
              
              {/* Option 1: Nafath */}
              <div className="flex flex-col justify-between items-center p-6 bg-white border border-border rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col items-center text-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-[#00897B]/10 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-[#00897B]" />
                  </div>
                  <h3 className="text-lg font-bold text-navy">السحب التلقائي الآمن</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    الربط المباشر مع الجهات الحكومية (نفاذ والتأمينات) لجلب الراتب والالتزامات تلقائياً.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScreenState("nafath_modal")}
                  className="w-full h-14 bg-[#00897B] hover:bg-[#00695C] text-white font-bold text-base rounded-2xl transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  التحقق عبر نفاذ
                </button>
              </div>

              {/* Option 2: Upload PDF */}
              <div className="flex flex-col justify-between items-center p-6 bg-white border border-border rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col items-center text-center gap-3 mb-4">
                  <FolderInteraction onFileSelect={handlePdfUpload} />
                  <h3 className="text-lg font-bold text-navy">رفع تقرير سمة الائتماني</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    رفع ملف تقريرك الائتماني بصيغة PDF لنقوم باستخراج التزاماتك ودراستها فوراً.
                  </p>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* STATE 3: NAFATH LOGIN MODAL */}
        {screenState === "nafath_modal" && (
          <motion.div
            key="nafath_modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-white border border-border rounded-3xl p-8 shadow-xl text-right relative"
          >
            <button
              onClick={() => setScreenState("choose")}
              className="absolute top-6 left-6 p-2 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center mb-6">
              <img src="/nafath.svg" alt="نفاذ" className="h-14 w-auto object-contain mb-3" />
              <h2 className="text-lg font-bold text-[#004D40]">بوابة النفاذ الوطني الموحد</h2>
              <p className="text-xs text-neutral-500">التحقق من الهوية لتفويض سحب البيانات</p>
            </div>
            <form onSubmit={handleNafathSubmit} className="flex flex-col gap-5">
              <div className="bg-[#E0F2F1]/40 p-4 rounded-xl text-[#00695C] text-xs leading-relaxed text-center">
                الرجاء إدخال رقم الهوية الوطنية لتأكيد طلب التحقق عبر تطبيق نفاذ في جوالك.
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-neutral-600 pr-2">الهوية الوطنية / الإقامة</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
                  placeholder="رقم الهوية الوطنية"
                  className={`h-14 w-full px-4 text-center border border-neutral-300 focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-white text-black transition-all ${
                    nationalId ? "tracking-widest text-lg font-bold" : "text-sm"
                  }`}
                  style={{ borderRadius: "0.75rem" }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#00897B] hover:bg-[#00695C] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? "جاري الاتصال..." : "إرسال طلب التحقق"}
              </button>
            </form>
          </motion.div>
        )}

        {/* STATE 4: NAFATH CONFIRMATION NUMBER SCREEN */}
        {screenState === "nafath_confirm" && (
          <motion.div
            key="nafath_confirm"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-white border border-border rounded-3xl p-8 shadow-xl flex flex-col items-center"
          >
            <div className="flex items-center justify-center gap-2 text-[#00897B] mb-4">
              <Smartphone className="w-5 h-5 animate-bounce" />
              <span className="text-sm font-bold">يرجى فتح تطبيق نفاذ على جوالك</span>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed text-center mb-6 px-4">
              وافق على طلب تسجيل الدخول الوارد في التطبيق، ثم اختر رقم التأكيد الموضح أدناه:
            </p>
            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-[#00897B]/30 animate-ping" />
              <div className="w-24 h-24 rounded-full bg-[#E0F2F1] border-4 border-[#00897B] flex items-center justify-center z-10 shadow-lg">
                <span className="text-4xl font-extrabold text-[#004D40]">{confirmNumber}</span>
              </div>
            </div>
            <div className="w-full max-w-[200px] mb-4">
              <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00897B] transition-all duration-1000 ease-linear"
                  style={{ width: `${(countdown / 60) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-400">
              الرمز صالح لمدة: <span className="font-bold text-[#00897B]">{countdown}</span> ثانية
            </p>
          </motion.div>
        )}

        {/* STATE 5: PDF PROCESSING ANIMATION */}
        {screenState === "pdf_processing" && (
          <motion.div
            key="pdf_processing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-white border border-border rounded-3xl p-8 shadow-xl flex flex-col items-center gap-6"
          >
            <div className="relative w-20 h-20 flex items-center justify-center bg-[#00897B]/10 rounded-full text-[#00897B]">
              <Upload className="w-10 h-10 animate-pulse" />
              <span className="absolute inset-0 rounded-full border-2 border-dashed border-[#00897B] animate-spin-slow" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-navy mb-2">جاري قراءة تقرير سمة الائتماني</h3>
              <p className="text-xs text-text-secondary truncate max-w-[280px] mx-auto">{selectedFileName}</p>
            </div>
            <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 4, ease: "easeInOut" }}
                className="h-full bg-[#00897B]"
              />
            </div>
            <p className="text-[11px] text-[#00897B] animate-pulse">جاري استخراج الراتب وتدقيق الالتزامات والتمويلات القائمة...</p>
          </motion.div>
        )}

        {/* STATE 6: AUTOMATIC PULLING CHECKLIST */}
        {screenState === "pulling_data" && (
          <motion.div
            key="pulling_data"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="w-full"
          >
            <ProcessSeal />
            <h1 className="mt-9 text-xl sm:text-2xl font-bold text-navy">
              جارٍ جلب بياناتك التمويلية...
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              يرجى عدم إغلاق هذه الصفحة لتفويض السحب بنجاح.
            </p>

            <AnimatedStepList className="mt-9 text-right" steps={stepModel} />

            {pulled && (pulled.pulled.grossSalary !== undefined || pulled.pulled.existingCommitments !== undefined) && (
              <div className="mt-6 space-y-2 text-right">
                {pulled.pulled.grossSalary !== undefined && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-sm font-bold text-navy" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {fmtSar(pulled.pulled.grossSalary)}
                      </span>
                      {pulled.provenance.grossSalary && <DataSourceBadge source={pulled.provenance.grossSalary} />}
                    </span>
                    <span className="text-xs text-text-secondary">الراتب الشهري</span>
                  </div>
                )}
                {pulled.pulled.existingCommitments !== undefined && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-sm font-bold text-navy" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {fmtSar(pulled.pulled.existingCommitments)}
                      </span>
                      {pulled.provenance.existingCommitments && (
                        <DataSourceBadge source={pulled.provenance.existingCommitments} />
                      )}
                    </span>
                    <span className="text-xs text-text-secondary">الالتزامات الشهرية</span>
                  </div>
                )}
              </div>
            )}

            {failed && (
              <div role="alert" className="mt-6 rounded-2xl border border-danger/30 bg-danger-bg/60 p-5">
                <p className="text-sm font-semibold text-danger mb-1">تعذّر سحب البيانات</p>
                <p className="text-xs text-text-secondary leading-relaxed mb-4">
                  قد يكون هناك ضغط على الخادم الحكومي حالياً. يمكنك إعادة المحاولة.
                </p>
                <button
                  onClick={retry}
                  className="min-h-[44px] px-6 bg-[#00897B] hover:bg-[#00695C] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
