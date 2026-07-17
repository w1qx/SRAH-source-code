"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore, REQUIRED_FIELDS, completeInput } from "@/store/useAppStore";
import { getQuestions, pullFinancialData, uploadStatement, type ScopedQuestion } from "@/lib/api/chat";
import { getFeatureFlags } from "@/lib/api/feature-flags";
import { ApiError } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { Logo } from "@/components/ui/logo";
import DataSourceBadge from "@/components/DataSourceBadge";
import AiOrbDrawer from "@/components/AiOrbDrawer";
import { BOUNDS } from "@/lib/field-bounds";
import { GridPattern } from "@/components/ui/page-backdrop";
import AnimatedStepList, { type Step, type StepStatus } from "@/features/searching/AnimatedStepList";
import type { DataSource, UserFinancialData } from "@shared/types";
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useAnimationFrame,
  AnimatePresence,
} from "framer-motion";
import { mockNafathLogin } from "@/lib/api/auth";
import { Smartphone, X, Upload, FileText } from "lucide-react";

/** The greeting is revealed one word at a time — words, not letters: Arabic letters are joined. */
const GREETING_WORDS = ["أهلًا،", "أنا", "سراة"];

/**
 * How long سراة's greeting stays on screen before it dissolves into the first question. The last
 * line finishes arriving at ~1.7s (780ms delay + 950ms rise), so this leaves the settled screen
 * roughly a second to be read.
 */
const FLASH_HOLD_MS = 2900;

const SEARCH_STEPS = [
  { id: "verify", label: "نتحقق من بياناتك" },
  { id: "gosi", label: "نجلب دخلك من التأمينات الاجتماعية" },
  { id: "simah", label: "نجلب تقريرك الائتماني من سمة" },
  { id: "match", label: "نطابق مع أنظمة الإقراض المسؤول" },
  { id: "prepare", label: "نجهّز تحليلك" },
] as const;
/** Must match the `.flash-stage` transition in globals.css. */
const FLASH_FADE_MS = 620;

/* ------------------------------------------------------------------ */
/* Value handling                                                      */
/* ------------------------------------------------------------------ */

/** Fields the backend types as numbers; everything else is an enum answered by quick reply. */
const NUMERIC_FIELDS = new Set<keyof UserFinancialData>([
  "financingAmount",
  "termYears",
  "grossSalary",
  "additionalIncome",
  "existingCommitments",
  "monthlyExpenses",
  "savings",
  "tenureYears",
]);

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII, so Number() can parse what was typed. */
function toAsciiDigits(val: string): string {
  return val
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

function parseNumber(val: string): number | null {
  const digits = toAsciiDigits(val).replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// The backend's numeric bounds — shared with the voice assistant, see lib/field-bounds.

/** Returns an Arabic error, or null when the value is acceptable to the backend. */
function validate(field: keyof UserFinancialData, value: number): string | null {
  const b = BOUNDS[field];
  if (!b) return null;
  if (!Number.isInteger(value) || value < b.min || value > b.max) return b.msg;
  return null;
}

function formatNumber(val: string | number): string {
  const n = typeof val === "number" ? val : parseNumber(val);
  return n === null ? "" : n.toLocaleString("en-US");
}

/** Fields measured in years read badly with a ريال suffix. */
const YEAR_FIELDS = new Set<keyof UserFinancialData>(["termYears", "tenureYears"]);

/**
 * The two figures SIMAH can verify. While SIMAH is off these are self-declared ("مُدخل يدوياً");
 * when the flag is on they will be replaced by the bureau's verified numbers at analysis time.
 */

/**
 * The headline auto-pulled figures (GOSI salary, SIMAH obligations) surfaced — with their source
 * badge — in the sidebar and review. Sector and tenure are also pulled and merged into `answers`
 * (so the analysis input is complete), but they aren't shown as cards here; these two are the
 * ones the pull story is about, and both render as clean "X ريال" amounts.
 */
const PULLED_FIELDS: { field: keyof UserFinancialData; ar: string; short: string }[] = [
  { field: "grossSalary", ar: "الراتب الشهري الإجمالي", short: "الراتب الشهري" },
  { field: "existingCommitments", ar: "إجمالي الالتزامات الشهرية", short: "الالتزامات" },
];

interface ChatMessage {
  type: "bot" | "user";
  text: string;
  questionIndex?: number;
}

export default function ConversationPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const gridOffsetX = useMotionValue(0);
  const gridOffsetY = useMotionValue(0);

  useAnimationFrame(() => {
    gridOffsetX.set((gridOffsetX.get() + 0.5) % 40);
    gridOffsetY.set((gridOffsetY.get() + 0.5) % 40);
  });

  const maskImage = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  const {
    currentQuestion,
    setCurrentQuestion,
    answers,
    setAnswer,
    chatStarted,
    setChatStarted,
    setReviewMode,
    reviewMode,
    setIsAnalyzing,
  } = useAppStore();

  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  /* --- The questions come from the backend. There is no local list. --- */
  const [questions, setQuestions] = useState<ScopedQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openBanking, setOpenBanking] = useState(false);
  /** SIMAH credit verification — gated by the `simah_credit` flag, off by default. */
  const [simahEnabled, setSimahEnabled] = useState(false);
  /** Source of each auto-pulled field, so the sidebar/review can badge them. Empty = nothing pulled. */
  const [pulledProvenance, setPulledProvenance] = useState<
    Partial<Record<keyof UserFinancialData, DataSource>>
  >({});

  // Gateway Onboarding States
  const [gatewayState, setGatewayState] = useState<"choose" | "nafath_modal" | "nafath_confirm" | "pdf_processing" | "pulling_data" | "completed">(() => {
    // Skip gateway if already answered questions or already has salary data
    if (useAppStore.getState().currentQuestion > 0 || useAppStore.getState().answers.grossSalary !== undefined) {
      return "completed";
    }
    return "choose";
  });
  const [nationalId, setNationalId] = useState("");
  const [confirmNumber, setConfirmNumber] = useState(45);
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  
  // Checklist steps animation states
  const [activeStep, setActiveStep] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Nafath timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gatewayState === "nafath_confirm" && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    } else if (countdown === 0) {
      setGatewayState("choose");
      toast.error("انتهت المهلة", "انتهت مهلة التأكيد عبر تطبيق نفاذ. الرجاء المحاولة مرة أخرى.");
    }
    return () => clearInterval(timer);
  }, [gatewayState, countdown]);

  // Step checklist interval driver
  useEffect(() => {
    if (gatewayState !== "pulling_data") return;
    const timer = setInterval(() => {
      setActiveStep((current) => {
        if (current >= SEARCH_STEPS.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 700);
    return () => clearInterval(timer);
  }, [gatewayState]);

  // Transition to completed when checklist finishes and data is fully ready
  useEffect(() => {
    if (gatewayState === "pulling_data" && activeStep >= SEARCH_STEPS.length && dataLoaded) {
      const delay = setTimeout(() => {
        setGatewayState("completed");
      }, 500);
      return () => clearTimeout(delay);
    }
  }, [gatewayState, activeStep, dataLoaded]);

  const handleNafathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nationalId || nationalId.length !== 10) {
      toast.error("خطأ في رقم الهوية", "الرجاء إدخال رقم هوية وطنية مكون من 10 أرقام.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setGatewayState("nafath_confirm");
      setCountdown(60);
      setConfirmNumber(Math.floor(10 + Math.random() * 90));
      toast.success("تم إرسال الطلب بنجاح", "يرجى تأكيد الدخول من تطبيق نفاذ.");

      // Simulate success callback
      setTimeout(async () => {
        try {
          await mockNafathLogin(nationalId);
          toast.success("تم تأكيد الهوية", "تم التحقق من هويتك عبر نفاذ.");
          setDataLoaded(false);
          setActiveStep(0);
          setGatewayState("pulling_data");
          
          // Trigger pullFinancialData to update the store with fetched data
          const result = await pullFinancialData();
          for (const [field, value] of Object.entries(result.pulled)) {
            setAnswer(field as keyof UserFinancialData, value as never);
          }
          setPulledProvenance(result.provenance);
          setDataLoaded(true);
        } catch (err) {
          toast.error("فشل التحقق عبر نفاذ", err instanceof Error ? err.message : "حدث خطأ غير متوقع");
          setGatewayState("choose");
        }
      }, 4000);
    }, 1200);
  };

  const handlePdfUpload = async (file: File) => {
    setSelectedFileName(file.name);
    setGatewayState("pdf_processing");

    try {
      // Real round-trip: the backend validates and parses the report, answering with the
      // same { pulled, provenance } contract as /chat/pull — so it merges identically and
      // the extracted figures carry the "موثّق من سمة" badge.
      const result = await uploadStatement(file);
      for (const [field, value] of Object.entries(result.pulled)) {
        setAnswer(field as keyof UserFinancialData, value as never);
      }
      setPulledProvenance((prev) => ({ ...prev, ...result.provenance }));
      toast.success("تم تحليل تقرير سمة بنجاح", `تم استخراج الراتب والالتزامات من الملف: ${file.name}`);

      // Go to checklist step and mark data as loaded
      setDataLoaded(true);
      setActiveStep(0);
      setGatewayState("pulling_data");
    } catch {
      toast.error("تعذّر تحليل الملف", "تأكد أن الملف تقرير PDF صالح ثم أعد المحاولة.");
      setGatewayState("choose");
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    // Auto-pull the fields the chat no longer asks for (GOSI salary/sector/tenure, SIMAH
    // obligations) and merge them into the answers, so the review is complete and analysis can
    // run. Returns empty objects when the flags are off, so this is a safe no-op then. Done here
    // (not only on the searching screen) so it works no matter how the advisor was reached.
    pullFinancialData(controller.signal)
      .then((result) => {
        for (const [field, value] of Object.entries(result.pulled)) {
          setAnswer(field as keyof UserFinancialData, value as never);
        }
        setPulledProvenance(result.provenance);
      })
      .catch(() => {
        /* Best-effort: a failed pull just leaves those fields to be asked/blank. */
      });

    getQuestions(controller.signal)
      .then((qs) => {
        setQuestions(qs);
        // No welcome gate here anymore — the greeting and the "ابدأ التحليل" button live on
        // /consent, so the chat opens itself on the first question as soon as it can.
        // `chatStarted` is read fresh: a user who navigates back mid-flow must not be restarted.
        if (qs.length > 0 && !useAppStore.getState().chatStarted) {
          setChatStarted(true);
          setMessages([{ type: "bot", text: qs[0].ar, questionIndex: 0 }]);
        }
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLoadError(
          e instanceof ApiError ? e.message : "تعذّر تحميل الأسئلة من الخادم.",
        );
      });

    // Data connections are backend capabilities, not UI toggles: if a flag is off there is
    // nothing to import, and we must not pretend otherwise. One fetch drives both indicators.
    getFeatureFlags(controller.signal)
      .then((flags) => {
        setOpenBanking(flags.find((f) => f.key === "open_banking")?.enabled ?? false);
        setSimahEnabled(flags.find((f) => f.key === "simah_credit")?.enabled ?? false);
      })
      .catch(() => {
        setOpenBanking(false);
        setSimahEnabled(false);
      });

    return () => controller.abort();
  }, [setChatStarted, setAnswer]);

  /** The pulled fields that actually arrived, ready to render with their badges. */
  const pulledDisplay = PULLED_FIELDS.filter(
    (f) => pulledProvenance[f.field] && answers[f.field] !== undefined,
  );

  /* --- The greeting flash: fade in, hold, dissolve into the first question. --- */
  const [flashPhase, setFlashPhase] = useState<"in" | "out" | "done">("in");

  useEffect(() => {
    const fadeOut = setTimeout(() => setFlashPhase("out"), FLASH_HOLD_MS);
    const finish = setTimeout(() => setFlashPhase("done"), FLASH_HOLD_MS + FLASH_FADE_MS);
    return () => {
      clearTimeout(fadeOut);
      clearTimeout(finish);
    };
  }, []);

  // The flash holds past its timer if the questions haven't landed yet: there is nothing to
  // dissolve into until the chat has its first message.
  const showFlash = flashPhase !== "done" || !chatStarted;

  const totalQuestions = questions?.length ?? REQUIRED_FIELDS.length;
  const currentQ = questions?.[currentQuestion];
  const progress = (currentQuestion / totalQuestions) * 100;

  /** field → value → Arabic label, built from the backend's own quick replies. */
  const labelFor = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const q of questions ?? []) {
      if (!q.quickReplies) continue;
      map.set(q.field, new Map(q.quickReplies.map((r) => [r.value, r.ar])));
    }
    return (field: keyof UserFinancialData, value: unknown): string => {
      const enumLabel = map.get(field)?.get(String(value));
      if (enumLabel) return enumLabel;
      if (typeof value === "number") {
        return YEAR_FIELDS.has(field)
          ? `${formatNumber(value)} ${value === 2 ? "سنتان" : "سنة"}`
          : `${formatNumber(value)} ريال`;
      }
      return value === undefined || value === null || value === "" ? "—" : String(value);
    };
  }, [questions]);

  const isNumericQ = currentQ ? NUMERIC_FIELDS.has(currentQ.field) : false;

  /** The input tells the user what it wants, rather than letting them discover it by failing. */
  const inputPlaceholder = !currentQ
    ? "اكتب إجابتك هنا..."
    : isNumericQ
      ? YEAR_FIELDS.has(currentQ.field)
        ? "اكتب عدد السنوات..."
        : "اكتب المبلغ بالريال..."
      : "اكتب إجابتك أو اختر من الخيارات...";

  const inputHint = useMemo(() => {
    if (!currentQ) return null;

    if (isNumericQ) {
      const b = BOUNDS[currentQ.field];
      if (!b) return null;
      return YEAR_FIELDS.has(currentQ.field)
        ? `القيمة المقبولة: من ${b.min} إلى ${b.max} سنة.`
        : `القيمة المقبولة: من ${b.min.toLocaleString("en-US")} إلى ${b.max.toLocaleString("en-US")} ريال.`;
    }

    if (currentQ.quickReplies) return "اختر أحد الخيارات بالأعلى، أو اكتبه كما هو.";
    return null;
  }, [currentQ, isNumericQ]);

  const scrollToBottom = useCallback(() => {
    // block:"nearest" keeps the scroll inside the message list — the default ("start")
    // also scrolls every ancestor, which drags the whole page.
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Each new question hands the caret straight back to the user.
  useEffect(() => {
    if (chatStarted && !reviewMode) inputRef.current?.focus();
  }, [currentQuestion, chatStarted, reviewMode]);


  /** Commits one typed answer and advances, or flips to review when the last field is in. */
  const commit = (field: keyof UserFinancialData, value: string | number, display: string) => {
    setAnswer(field, value as never);

    const next = currentQuestion + 1;
    const newMessages: ChatMessage[] = [...messages, { type: "user", text: display }];

    if (questions && next < questions.length) {
      newMessages.push({ type: "bot", text: questions[next].ar, questionIndex: next });
      setCurrentQuestion(next);
    } else {
      setReviewMode(true);
    }

    setMessages(newMessages);
    setInputValue("");
  };

  const handleQuickReply = (value: string, label: string) => {
    if (!currentQ) return;
    commit(currentQ.field, value, label);
  };

  const handleSend = () => {
    if (!currentQ) return;
    const raw = inputValue.trim();
    if (!raw) return;

    if (NUMERIC_FIELDS.has(currentQ.field)) {
      const n = parseNumber(raw);
      if (n === null) {
        toast.error("من فضلك اكتب رقماً.");
        return;
      }

      const invalid = validate(currentQ.field, n);
      if (invalid) {
        toast.error(invalid);
        return;
      }

      commit(currentQ.field, n, labelFor(currentQ.field, n));
      return;
    }

    // A non-numeric field is an enum: only its quick replies are valid values.
    const match = currentQ.quickReplies?.find((r) => r.ar === raw || r.value === raw);
    if (!match) {
      toast.error("اختر أحد الخيارات المعروضة.");
      return;
    }
    commit(currentQ.field, match.value, match.ar);
  };

  /* --- Voice input --- */
  const startListening = () => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("ميزة الإملاء الصوتي غير مدعومة في متصفحك.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = "ar-SA";
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => {
      toast.error("حدث خطأ أثناء التعرف على الصوت.");
      setIsListening(false);
    };
    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (!transcript) return;
      setInputValue((prev) =>
        currentQ && NUMERIC_FIELDS.has(currentQ.field)
          ? formatNumber(transcript)
          : prev + transcript,
      );
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      startListening();
    }
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const handleAnalyze = () => {
    const input = completeInput(answers);
    if (!input) {
      toast.error("لم تكتمل البيانات بعد.");
      return;
    }

    // Re-check every collected number against the backend's bounds. A value edited from the
    // review screen (or left over from an earlier run) must not reach the API and come back
    // as an opaque 400 — send the user to the offending question instead.
    for (const [idx, q] of (questions ?? []).entries()) {
      if (!NUMERIC_FIELDS.has(q.field)) continue;
      const invalid = validate(q.field, input[q.field] as number);
      if (invalid) {
        toast.error(invalid);
        setReviewMode(false);
        setCurrentQuestion(idx);
        setMessages((m) => [...m, { type: "bot", text: q.ar, questionIndex: idx }]);
        return;
      }
    }

    // AnalyzingOverlay owns the request itself — see its comment.
    setReviewMode(false);
    setIsAnalyzing(true);
  };

  const restart = () => {
    setReviewMode(false);
    setCurrentQuestion(0);
    setMessages(questions ? [{ type: "bot", text: questions[0].ar, questionIndex: 0 }] : []);
  };

  /* ------------------------------------------------------------------ */
  /* Error / greeting flash                                              */
  /* ------------------------------------------------------------------ */

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 overflow-hidden">
        <div role="alert" className="w-full max-w-lg text-center rounded-[20px] border border-danger/30 bg-danger-bg p-5 animate-fade-in-up">
          <p className="text-sm font-semibold text-danger mb-3">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-6 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  // The greeting is a flash, not a gate: it fades in, holds, then dissolves into the first
  // question on its own. It also covers the questions request — if that outruns the timer, the
  // greeting simply stays up (rather than blinking to a spinner) until the chat is ready.
  if (showFlash) {
    return (
      <div
        className={`flex-1 flex items-center justify-center px-4 sm:px-6 overflow-hidden flash-stage ${
          flashPhase === "out" && chatStarted ? "flash-stage--out" : ""
        }`}
        aria-live="polite"
      >
        <div className="w-full max-w-lg text-center">
          <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center mx-auto mb-6 shadow-sm flash-seal">
            <Logo className="w-11 h-11 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy mb-4 flex flex-wrap justify-center gap-x-2.5 gap-y-1">
            {GREETING_WORDS.map((word, i) => (
              <span
                key={word}
                className="flash-word"
                style={{ animationDelay: `${160 + i * 140}ms` }}
              >
                {word}
              </span>
            ))}
          </h1>
          <p className="text-text-secondary text-sm sm:text-lg leading-relaxed mb-2 px-2 flash-line flash-delay-2">
            سأطرح عليك {totalQuestions} أسئلة قصيرة لفهم قرارك التمويلي، ثم أوضح لك كيف قد يؤثر في
            وضعك المالي خلال السنوات القادمة.
          </p>
          <p className="text-text-secondary text-xs sm:text-sm leading-relaxed px-2 flash-line flash-delay-3">
            التحليل يُحسب على خادم سراة وفق قواعد مؤسسة النقد، ويُحفظ في حسابك.
          </p>
        </div>
      </div>
    );
  }

  if (gatewayState !== "completed") {
    return (
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 max-w-[640px] mx-auto w-full min-h-[70vh] z-10 select-none">
        <AnimatePresence mode="wait">
          {gatewayState === "choose" && (
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
                    <div className="w-12 h-12 rounded-full bg-[#00897B]/10 flex items-center justify-center p-2">
                      <img src="/nafath.svg" alt="نفاذ" className="w-8 h-auto object-contain" />
                    </div>
                    <h3 className="text-lg font-bold text-navy">السحب التلقائي الآمن</h3>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      الربط المباشر مع الجهات الحكومية (سمة والتأمينات) لجلب الراتب والالتزامات تلقائياً.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGatewayState("nafath_modal")}
                    className="w-full h-14 text-white font-bold text-base transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                    style={{ borderRadius: "16px", backgroundColor: "#00897B" }}
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

          {gatewayState === "nafath_modal" && (
            <motion.div
              key="nafath_modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white border border-border rounded-3xl p-8 shadow-xl text-right relative"
            >
              <button
                onClick={() => setGatewayState("choose")}
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
                <div className="bg-[#E0F2F1]/40 p-4 text-[#00695C] text-xs leading-relaxed text-center" style={{ borderRadius: "12px" }}>
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
                  className="w-full h-14 text-white font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{ borderRadius: "16px", backgroundColor: "#00897B" }}
                >
                  {loading ? "جاري الاتصال..." : "إرسال طلب التحقق"}
                </button>
              </form>
            </motion.div>
          )}

          {gatewayState === "nafath_confirm" && (
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

          {gatewayState === "pdf_processing" && (
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

          {gatewayState === "pulling_data" && (() => {
            const stepModel: Step[] = SEARCH_STEPS.map((step, i) => {
              const status: StepStatus = i < activeStep ? "done" : i === activeStep ? "running" : "pending";
              return { id: step.id, title: step.label, status };
            });
            return (
              <motion.div
                key="pulling_data"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white border border-border rounded-3xl p-8 shadow-xl text-center flex flex-col items-center"
              >
                <ProcessSeal />
                <h1 className="mt-6 text-xl font-bold text-navy">
                  جارٍ جلب بياناتك التمويلية...
                </h1>
                <p className="mt-1.5 text-xs text-text-secondary">
                  يرجى عدم إغلاق هذه الصفحة لتفويض السحب بنجاح.
                </p>

                <AnimatedStepList className="mt-6 text-right w-full" steps={stepModel} />
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Chat + review                                                       */
  /* ------------------------------------------------------------------ */

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="flex-1 min-h-0 flex items-center justify-center w-full relative overflow-hidden bg-[#faf8f5] animate-fade-in -mt-[var(--nav-h)] pt-[calc(var(--nav-h)+12px)] pb-3"
    >
      <div className="absolute -inset-y-96 inset-x-0 z-0 opacity-[0.25] pointer-events-none">
        <GridPattern offsetX={gridOffsetX} offsetY={gridOffsetY} />
      </div>
      <motion.div
        className="absolute -inset-y-96 inset-x-0 z-0 opacity-80 pointer-events-none"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <GridPattern offsetX={gridOffsetX} offsetY={gridOffsetY} />
      </motion.div>
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute right-[-10%] top-[-10%] w-[35%] h-[35%] rounded-full bg-orange/15 blur-[120px]" />
        <div className="absolute left-[-10%] bottom-[-15%] w-[35%] h-[35%] rounded-full bg-navy/10 blur-[120px]" />
      </div>

      {/* The voice-assistant pull strip. Rendered HERE — in the same stacking context as the
          chat card — so its z-5 is guaranteed to paint under the card's z-10. Gets the same
          backend-owned questions, so the voice agent asks exactly what the chat asks.
          Hidden on the review form: answers are complete there, so voice has no job. */}
      {!reviewMode && <AiOrbDrawer questions={questions} />}

      {reviewMode ? (
        <div className="flex w-[92%] max-w-[820px] max-h-full relative bg-slate-50/95 border border-border rounded-[32px] p-4 md:p-5 shadow-[0_25px_60px_rgba(8,47,62,0.15)] z-10 animate-fade-in-up mx-auto" dir="rtl">
          <div className="flex-1 min-w-0 bg-white rounded-[24px] border border-border/85 shadow-[0_15px_40px_rgba(8,47,62,0.08)] p-5 sm:p-6 overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center shrink-0">
                <Logo className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="font-semibold text-navy">اكتملت المعلومات الأساسية</p>
                <p className="text-sm text-text-secondary">راجع بياناتك قبل أن أبدأ التحليل.</p>
              </div>
            </div>

            <div className="space-y-2">
              {(questions ?? []).map((q, idx) => (
                <div
                  key={q.field}
                  className="flex items-center justify-between py-2.5 px-3.5 rounded-[20px] bg-warm-bg"
                >
                  <span className="text-sm text-text-secondary">{q.ar}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-navy">
                      {labelFor(q.field, answers[q.field])}
                    </span>
                    <button
                      onClick={() => {
                        setReviewMode(false);
                        setCurrentQuestion(idx);
                        setMessages((m) => [...m, { type: "bot", text: q.ar, questionIndex: idx }]);
                      }}
                      aria-label={`تعديل ${q.ar}`}
                      className="text-text-secondary hover:text-orange transition-colors p-1 cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Auto-verified figures pulled from GOSI/SIMAH — shown with their source, not asked. */}
            {pulledDisplay.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-bold text-text-secondary">موثّقة تلقائياً</p>
                {pulledDisplay.map((f) => (
                  <div
                    key={f.field}
                    className="flex items-center justify-between gap-2 py-2.5 px-3.5 rounded-[20px] bg-safe-bg/40 border border-safe/15"
                  >
                    <span className="text-sm text-text-secondary">{f.ar}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-navy" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {labelFor(f.field, answers[f.field])}
                      </span>
                      <DataSourceBadge source={pulledProvenance[f.field]!} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                onClick={handleAnalyze}
                className="bg-orange hover:bg-orange-hover text-white font-semibold px-6 py-3.5 rounded-full text-base transition-colors flex-1 min-h-[48px] cursor-pointer"
              >
                تحليل قراري
              </button>
              <button
                onClick={restart}
                className="border border-border text-navy font-medium px-6 py-3.5 rounded-full text-base transition-colors hover:bg-warm-bg min-h-[48px] cursor-pointer"
              >
                تعديل الإجابات
              </button>
            </div>
          </div>
        </div>
      ) : (
        // h-[680px] is the card's real size. (h-full collapses it: as a centered flex item, a
        // percentage height has nothing definite to resolve against.) max-h-full keeps it inside
        // the viewport on a short window.
        <div className="flex flex-col md:flex-row items-stretch w-[92%] max-w-[1100px] h-[680px] max-h-full relative bg-slate-50/95 border border-border rounded-[32px] p-4 md:p-5 gap-4 md:gap-5 shadow-[0_25px_60px_rgba(8,47,62,0.15)] z-10 animate-chat-in" dir="rtl">
          {/* Sidebar — your data as it is collected. Nothing here is invented. */}
          <aside className="w-full md:w-[280px] flex flex-col text-right justify-between shrink-0 animate-chat-panel chat-panel-delay-1">
            <div>
              <div className="flex items-center gap-3.5 mb-5 justify-start">
                <img src="/sama.svg" className="w-[130px] h-auto object-contain shrink-0" alt="SAMA logo" />
                <div className="border-r border-border/80 pr-3.5 py-0.5 text-right">
                  <h3 className="font-bold text-xs text-navy">ساما (SAMA)</h3>
                  <p className="text-[9.5px] text-text-secondary leading-tight mt-0.5">
                    البنك المركزي السعودي
                  </p>
                </div>
              </div>

              <div className="bg-white border border-border/70 rounded-[20px] p-4 mb-4 shadow-[0_6px_20px_-8px_rgba(8,47,62,0.18)]">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-navy/5 text-navy flex items-center justify-center shrink-0" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                    </span>
                    <span className="text-xs font-bold text-navy truncate">حالة الربط</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      openBanking
                        ? "bg-safe-bg text-safe border-safe/20"
                        : "bg-warm-bg text-text-secondary border-border"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${openBanking ? "bg-safe animate-pulse" : "bg-text-secondary/50"}`} />
                    {openBanking ? "الربط المباشر مفعّل" : "الربط المباشر غير مفعّل"}
                  </span>
                </div>

                <p className="text-[11px] text-text-secondary leading-relaxed pt-2.5 border-t border-border/60">
                  {openBanking
                    ? "سيتم استيراد بياناتك المالية رسمياً عبر الربط المباشر الموحد (ساما)."
                    : "الربط المباشر مع الجهات المالية غير مفعّل بعد، لذلك نعتمد على البيانات التي تدخلها بنفسك."}
                </p>
              </div>

              {/* SIMAH credit verification — built and wired, gated behind `simah_credit`.
                  Visible but disabled ("قريباً") until SAMA licensing + SIMAH membership land;
                  the same flag flips it live. Never faked. */}
              <div className="bg-white border border-border/70 rounded-[20px] p-4 mb-4 shadow-[0_6px_20px_-8px_rgba(8,47,62,0.18)]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-navy/5 text-navy flex items-center justify-center shrink-0" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                    </span>
                    <span className="text-xs font-bold text-navy truncate">توثيق سمة الائتماني</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      simahEnabled
                        ? "bg-safe-bg text-safe border-safe/25"
                        : "bg-purple-light/50 text-purple border-purple/25"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${simahEnabled ? "bg-safe animate-pulse" : "bg-purple/70"}`} />
                    {simahEnabled ? "مفعّل" : "قريباً"}
                  </span>
                </div>

                <p className="text-[11px] text-text-secondary leading-relaxed pt-2.5 border-t border-border/60">
                  {simahEnabled
                    ? "سنجلب راتبك والتزاماتك موثّقة من سمة بدلاً من الإدخال اليدوي."
                    : "سيتيح ربط سمة توثيق راتبك والتزاماتك تلقائياً. الميزة مبنية وجاهزة، وتُفعَّل عند اكتمال الترخيص."}
                </p>

                <button
                  type="button"
                  disabled={!simahEnabled}
                  aria-disabled={!simahEnabled}
                  className={`mt-3 w-full min-h-[40px] rounded-full text-xs font-bold border transition-colors ${
                    simahEnabled
                      ? "bg-navy text-white border-navy hover:bg-navy/90 cursor-pointer"
                      : "bg-warm-bg text-text-secondary border-border opacity-60 cursor-not-allowed"
                  }`}
                >
                  {simahEnabled ? "متصل بسمة" : "ربط سمة (قريباً)"}
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                  بياناتك الموثّقة:
                </p>

                <div className="space-y-1.5">
                  {/* Only the auto-pulled figures (GOSI salary, SIMAH obligations) with their source
                      badge. The typed answers live in the chat and the review, not here. */}
                  {pulledDisplay.map((f) => (
                    <div
                      key={f.field}
                      className="p-2.5 px-4 rounded-[20px] text-xs bg-safe-bg/40 border border-safe/15 text-navy"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-secondary truncate">{f.short}</span>
                        <span className="font-semibold shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {labelFor(f.field, answers[f.field])}
                        </span>
                      </div>
                      <div className="mt-1.5 flex justify-end">
                        <DataSourceBadge source={pulledProvenance[f.field]!} />
                      </div>
                    </div>
                  ))}

                  {pulledDisplay.length === 0 && (
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      سنعرض هنا راتبك والتزاماتك الموثّقة بمجرد جلبها.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 bg-navy/5 border border-navy/10 rounded-[20px] p-2.5 px-3.5 flex items-center gap-2 justify-end">
              <span className="text-[10.5px] text-navy font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {/* Count only the ASKED questions answered — `answers` also holds the pulled
                    fields, which would otherwise push the count past the question total. */}
                {(questions ?? []).filter((q) => answers[q.field] !== undefined).length} من{" "}
                {totalQuestions} مكتملة
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-navy animate-pulse" />
            </div>
          </aside>

          {/* Chat */}
          <div className="flex-1 flex flex-col min-w-0 bg-white rounded-[24px] border border-border/85 shadow-[0_15px_40px_rgba(8,47,62,0.08)] overflow-hidden animate-chat-panel chat-panel-delay-2">
            <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center shrink-0">
                  <Logo className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-0.5 text-right">
                  <div className="flex items-center gap-2 font-bold text-sm text-navy">
                    سراة المساعد المالي
                  </div>
                  <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-safe bg-safe-bg px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-safe animate-pulse" />
                      مباشر الآن
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-xs text-text-secondary font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                  السؤال {Math.min(currentQuestion + 1, totalQuestions)} من {totalQuestions}
                </span>
                <div className="w-24 h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-navy rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-warm-bg/20">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 animate-bubble-in ${i === 0 ? "bubble-delay-first" : ""} ${
                    msg.type === "user" ? "justify-start" : "justify-end"
                  }`}
                >
                  {msg.type === "bot" ? (
                    <>
                      <div className="max-w-[80%]">
                        <div className="bg-white border border-border rounded-3xl px-5 py-4 shadow-sm text-right">
                          <p className="text-navy font-semibold leading-relaxed">{msg.text}</p>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-navy shrink-0 flex items-center justify-center mt-1">
                        <Logo className="w-5 h-5 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="bg-navy text-white rounded-3xl px-5 py-3 max-w-[75%] text-sm shadow-sm text-right">
                      {msg.text}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Answer area.
                The input is ALWAYS visible — quick replies are shortcuts above it, not a
                replacement for it, so the user can always see where to type and what is
                accepted. Enum questions still only accept one of their options; typing a
                label (or its value) works, and anything else is rejected with a message. */}
            <div className="border-t border-border/60 p-4 bg-white shrink-0 space-y-3">
              {currentQ?.quickReplies && (
                <div className="flex flex-wrap gap-2 justify-end">
                  {currentQ.quickReplies.map((opt) => {
                    const chosen = answers[currentQ.field] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleQuickReply(opt.value, opt.ar)}
                        className={`px-4 py-2.5 rounded-full text-xs font-semibold min-h-[40px] border transition-colors cursor-pointer ${
                          chosen
                            ? "bg-navy text-white border-navy"
                            : "bg-warm-bg border-border/80 text-navy hover:border-navy/40 hover:bg-white"
                        }`}
                      >
                        {opt.ar}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 items-center">
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  aria-label="إرسال"
                  className="bg-orange hover:bg-orange-hover disabled:opacity-40 disabled:cursor-not-allowed text-white p-3.5 rounded-full transition-colors min-h-[52px] min-w-[52px] flex items-center justify-center cursor-pointer active:scale-95 shrink-0 shadow-sm"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="-scale-x-100" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>

                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode={isNumericQ ? "numeric" : "text"}
                    value={inputValue}
                    onChange={(e) =>
                      setInputValue(isNumericQ ? formatNumber(e.target.value) : e.target.value)
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={inputPlaceholder}
                    aria-label={currentQ?.ar ?? "إجابتك"}
                    className="w-full bg-warm-bg border border-border/80 rounded-full ps-16 pe-6 py-4 text-base text-navy font-semibold placeholder:text-text-secondary/50 focus:outline-none focus:bg-white focus:border-navy/30 focus:ring-2 focus:ring-navy/5 min-h-[52px] text-right transition-all"
                  />
                  <button
                    type="button"
                    onClick={toggleListening}
                    aria-label="الإملاء الصوتي"
                    className={`absolute start-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-200 cursor-pointer ${
                      isListening
                        ? "bg-danger text-white animate-pulse"
                        : "text-text-secondary hover:text-navy hover:bg-warm-bg/80"
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* What this field will accept — shown, not discovered by being rejected. */}
              {inputHint && (
                <p className="text-[11px] text-text-secondary text-right px-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {inputHint}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Minimal typings for the Web Speech API, which TS does not ship. */
interface SpeechRecognitionLike {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onerror: () => void;
  onresult: (event: { results: Array<Array<{ transcript: string }>> }) => void;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

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
        className="relative cursor-pointer select-none mx-auto"
        style={{ width: "200px", height: "120px" }}
      >
        {/* Folder Back Panel */}
        <div
          className="relative mx-auto flex justify-center items-center"
          style={{
            background: "#1E1A16",
            boxShadow: "0px 0px 15px 10px rgba(17, 17, 17, 0.2) inset",
            borderRadius: "12px",
            width: "176px",
            height: "120px",
          }}
        >
          {/* Document pages inside the folder */}
          {[
            {
              initial: { rotate: -3, x: -20, y: 2 },
              open: { rotate: -8, x: -35, y: -30 },
              transition: { ...pageVariants.spring, bounce: 0.15, stiffness: 160, damping: 22 },
              className: "z-10 shadow-md",
            },
            {
              initial: { rotate: 0, x: 0, y: 0 },
              open: { rotate: 1, x: 2, y: -40 },
              transition: { ...pageVariants.spring, duration: 0.55, bounce: 0.12, stiffness: 190, damping: 24 },
              className: "z-20 shadow-lg",
            },
            {
              initial: { rotate: 3.5, x: 20, y: 1 },
              open: { rotate: 9, x: 35, y: -35 },
              transition: { ...pageVariants.spring, duration: 0.58, bounce: 0.17, stiffness: 170, damping: 21 },
              className: "z-10 shadow-md",
            },
          ].map((page, i) => (
            <motion.div
              key={i}
              initial={page.initial}
              animate={isOpen ? page.open : page.initial}
              transition={page.transition}
              className={`absolute top-2 rounded-lg ${page.className}`}
              style={{ width: "80px" }}
            >
              <FolderPage />
            </motion.div>
          ))}
        </div>

        {/* Folder Front Flap (Glassmorphic Srah Teal) */}
        <motion.div
          animate={{ rotateX: isOpen ? -38 : 0 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
          className="absolute -left-[1px] -right-[1px] -bottom-[1px] z-30 rounded-2xl origin-bottom flex justify-center items-center overflow-visible"
          style={{ height: "96px", width: "200px" }}
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
  <div
    className="w-full bg-gradient-to-b from-[#F5EFEB] to-[#EDE7E0] border border-[#DDD3C9] rounded-lg shadow-sm p-1.5 flex flex-col justify-between overflow-hidden"
    style={{ height: "64px" }}
  >
    <div className="flex flex-col gap-0.5">
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
