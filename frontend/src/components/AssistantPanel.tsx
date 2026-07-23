"use client";

/**
 * The context-aware voice assistant side panel, shared by the analysis and offers screens.
 *
 * Voice-first, but never voice-only:
 *  - Press the voice button and it flips into an embedded ORB mode — the same pearl orb as the
 *    chat page, a hands-free spoken conversation (the mic re-opens by itself after each answer
 *    and the recorder's silence detector sends the turn), but living INSIDE this mini panel
 *    rather than a full-screen overlay.
 *  - Or type the question — a first-class equivalent for anyone who can't use voice (a11y).
 *
 * All speech work (STT + TTS) and the LLM run on the backend via /assistant/ask; the browser only
 * records audio and plays back what the server returns. Context (the client's data + the exact
 * result/offers on screen) is read fresh at ask-time, so every answer is grounded in real figures
 * the assistant only ever EXPLAINS — it never recomputes or invents them.
 *
 * Mic states are explicit and never signalled by colour alone: each carries an icon/animation AND
 * an Arabic label, and the live status is announced via aria-live for screen readers.
 */

import "./AiOrbDrawer.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantContext, AssistantPage } from "@shared/types";
import { buildAssistantSystemPrompt } from "@/lib/assistant-prompt";
import { toast } from "@/lib/toast";
import { VoiceRecorder } from "@/lib/voice-recorder";
import { Logo } from "@/components/ui/logo";
import { Mic, Square, X, Send, Volume2, Loader2, MessageCircleQuestion, Keyboard } from "lucide-react";

type Phase = "idle" | "listening" | "processing" | "speaking";

interface Turn {
  question: string;
  answer: string;
}

/**
 * OpenAI-style messages forwarded verbatim to /api/voice (OpenRouter `openai/gpt-audio`) — the
 * SAME pipeline and key the chat voice uses. User turns carry the recorded WAV (real STT) or the
 * typed text; assistant turns are kept as their transcript so follow-ups stay small.
 */
type VoicePart =
  | { type: "text"; text: string }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" } };
interface VoiceMessage {
  role: "system" | "user" | "assistant";
  content: string | VoicePart[];
}

/** Cap the replayed history so a follow-up request never balloons with old audio clips. */
const MAX_HISTORY_MESSAGES = 6;

const PHASE_LABEL: Record<Phase, string> = {
  idle: "اضغط زر التحدث واسأل، أو اكتب سؤالك",
  listening: "أستمع إليك… توقّف عن الكلام لأرسل سؤالك",
  processing: "أفكّر في إجابتك…",
  speaking: "أشرح لك الآن…",
};

/** The orb's spoken state maps onto the same visual states the chat page's orb uses. */
const ORB_STATE: Record<Phase, string> = {
  idle: "",
  listening: "orb2--on orb2--listening",
  processing: "orb2--on orb2--thinking",
  speaking: "orb2--on orb2--talking",
};

const PROMPTS: Record<AssistantPage, { title: string; blurb: string; examples: string[] }> = {
  analysis: {
    title: "مساعد شرح التحليل",
    blurb: "اسألني عن أي رقم أو قسم في تحليلك وسأشرحه لك ببساطة.",
    examples: ["ماذا تعني نسبة الاستقطاع؟", "لماذا السنة الثالثة مرتفعة الخطورة؟"],
  },
  offers: {
    title: "المساعد الشخصي",
    blurb: "اسألني عن الفروق بين العروض وأثر كل عرض على وضعك.",
    examples: ["ما الفرق بين العرض الأول والثاني؟", "أي عرض أنسب لوضعي؟"],
  },
};

export default function AssistantPanel({
  page,
  getContext,
}: {
  page: AssistantPage;
  /** Read fresh at ask-time so the answer reflects exactly what's on screen right now. */
  getContext: () => AssistantContext;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [textInput, setTextInput] = useState("");
  /** When true, the panel shows the embedded orb and runs a hands-free spoken conversation. */
  const [voiceMode, setVoiceMode] = useState(false);

  const historyRef = useRef<VoiceMessage[]>([]);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finishTakeRef = useRef<() => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});
  const voiceModeRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const meta = PROMPTS[page];

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    stopPlayback();
  }, [stopPlayback]);

  useEffect(() => () => teardown(), [teardown]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, phase]);

  /** Plays the spoken answer; in orb mode it re-opens the mic on end so the talk stays hands-free. */
  const playAnswer = useCallback((audioBase64: string | null, mime: string | null) => {
    const handBack = () => {
      if (voiceModeRef.current) startListeningRef.current();
      else setPhase("idle");
    };
    if (!audioBase64) {
      setPhase("idle");
      handBack();
      return;
    }
    const el = new Audio(`data:${mime ?? "audio/mpeg"};base64,${audioBase64}`);
    audioRef.current = el;
    const done = () => {
      if (audioRef.current !== el) return; // superseded / torn down
      audioRef.current = null;
      handBack();
    };
    el.onended = done;
    el.onerror = done;
    setPhase("speaking");
    el.play().catch(done); // autoplay may be blocked — the text answer still carries the turn
  }, []);

  /**
   * The one network path: OpenRouter `openai/gpt-audio` via /api/voice (same key as the chat
   * voice). The system prompt is rebuilt from getContext() on EVERY turn, so the answer always
   * reflects exactly what's on the screen right now — real STT for spoken questions, real spoken
   * answer back, grounded in the page's own figures.
   */
  const ask = useCallback(
    async (payload: { question?: string; audioBase64?: string }) => {
      stopPlayback();
      setPhase("processing");
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: VoiceMessage = payload.audioBase64
        ? { role: "user", content: [{ type: "input_audio", input_audio: { data: payload.audioBase64, format: "wav" } }] }
        : { role: "user", content: payload.question ?? "" };
      const system: VoiceMessage = { role: "system", content: buildAssistantSystemPrompt(page, getContext()) };
      const messages = [system, ...historyRef.current, userMsg];

      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);

        const answer = (body.text ?? "").trim();
        const audio: string | null = body.audio ?? null;

        // Keep the exchange as short-term memory (assistant kept as text; capped).
        const assistantMsg: VoiceMessage = { role: "assistant", content: answer };
        historyRef.current = [...historyRef.current, userMsg, assistantMsg].slice(-MAX_HISTORY_MESSAGES);
        setTurns((t) => [...t, { question: payload.question ?? "🎤 سؤال صوتي", answer }]);
        playAnswer(audio, "audio/wav");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("assistant voice turn failed:", err);
        toast.error("تعذّر الوصول إلى المساعد الصوتي", "تحقّق من الاتصال وحاول مرة أخرى.");
        setPhase("idle");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [page, getContext, playAnswer, stopPlayback],
  );

  /** Stops the current take and sends it as a spoken question. */
  const finishTake = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    const b64 = rec.stop();
    recorderRef.current = null;
    if (!b64) {
      setPhase("idle");
      return;
    }
    void ask({ audioBase64: b64 });
  }, [ask]);

  useEffect(() => {
    finishTakeRef.current = finishTake;
  }, [finishTake]);

  const startListening = useCallback(async () => {
    stopPlayback();
    try {
      const rec = new VoiceRecorder((reason) => {
        if (reason === "silence") {
          finishTakeRef.current();
        } else {
          // Heard nothing — stop listening and wait (idle) rather than sending silence.
          recorderRef.current?.cancel();
          recorderRef.current = null;
          setPhase("idle");
        }
      });
      await rec.start();
      recorderRef.current = rec;
      setPhase("listening");
    } catch {
      toast.error("تعذّر الوصول إلى الميكروفون", "تأكد من السماح باستخدام الميكروفون في المتصفح.");
      setPhase("idle");
    }
  }, [stopPlayback]);

  useEffect(() => {
    startListeningRef.current = () => void startListening();
  }, [startListening]);

  /** Enters the embedded orb mode and opens the mic straight away (hands-free). */
  const enterVoice = useCallback(() => {
    voiceModeRef.current = true;
    setVoiceMode(true);
    void startListening();
  }, [startListening]);

  /** Leaves orb mode back to the text conversation; the collected turns are kept. */
  const exitVoice = useCallback(() => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    teardown();
    setPhase("idle");
  }, [teardown]);

  /** In orb mode the mic button is an override: send-now / interrupt / re-listen. */
  const onOrbMic = useCallback(() => {
    if (phase === "processing") return;
    if (phase === "listening") {
      finishTake();
      return;
    }
    if (phase === "speaking") {
      stopPlayback();
      void startListening();
      return;
    }
    void startListening(); // idle (silence timed out) → listen again
  }, [phase, finishTake, startListening, stopPlayback]);

  const onTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = textInput.trim();
      if (!q || phase === "processing") return;
      setTextInput("");
      void ask({ question: q });
    },
    [textInput, phase, ask],
  );

  const closePanel = useCallback(() => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    teardown();
    setPhase("idle");
    setOpen(false);
  }, [teardown]);

  const micBusy = phase === "processing";
  const lastAnswer = turns.length > 0 ? turns[turns.length - 1].answer : "";

  return (
    <>
      {/* Launcher — a docked pill on the inline-start edge (the right side in this RTL app). */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`افتح ${meta.title}`}
          className="fixed bottom-5 start-5 z-40 flex items-center gap-2 rounded-full bg-navy text-white ps-4 pe-5 py-3 shadow-[0_12px_30px_rgba(8,47,62,0.25)] hover:bg-navy/90 transition-colors cursor-pointer"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <Logo className="h-5 w-5 text-white" />
          </span>
          <span className="text-sm font-bold">{meta.title}</span>
        </button>
      )}

      {open && (
        <section
          dir="rtl"
          aria-label={meta.title}
          className="fixed bottom-5 start-5 z-40 flex w-[min(380px,calc(100vw-2.5rem))] max-h-[min(72vh,620px)] flex-col overflow-hidden rounded-[24px] border border-border bg-white shadow-[0_25px_60px_rgba(8,47,62,0.22)] animate-fade-in-up"
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-navy px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                <Logo className="h-5 w-5 text-white" />
              </span>
              <div className="text-right">
                <p className="text-sm font-bold leading-tight">{meta.title}</p>
                <p className="text-[11px] text-white/70 leading-tight">شرح وتوضيح — لا نصيحة مُلزِمة</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="إغلاق المساعد"
              className="rounded-full p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {voiceMode ? (
            /* ---- Embedded orb (voice) mode — the chat-page orb, inside the mini frame ---- */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gradient-to-b from-warm-bg/40 to-white px-5 py-5 text-center">
              <div className="relative h-[132px] w-[132px] shrink-0">
                <div className={`orb2 ${ORB_STATE[phase]}`}>
                  <span className="orb2__ripple" aria-hidden="true" />
                  <span className="orb2__ripple" aria-hidden="true" />
                  <span className="orb2__ripple" aria-hidden="true" />
                  <span className="orb2__halo" aria-hidden="true" />
                  <span className="orb2__ball" aria-hidden="true" />
                  <span className="orb2__recess" aria-hidden="true">
                    <Logo className="orb2__logo" />
                  </span>
                </div>
              </div>

              {/* The assistant's latest spoken line — read along while it talks. */}
              <p className="min-h-[2.5em] max-h-24 overflow-y-auto px-1 text-sm font-medium leading-relaxed text-navy whitespace-pre-line" aria-live="polite">
                {lastAnswer || meta.blurb}
              </p>

              <p className="flex items-center justify-center gap-2 text-[11px] font-semibold text-text-secondary" aria-live="polite">
                <StatusDot phase={phase} />
                {PHASE_LABEL[phase]}
              </p>

              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOrbMic}
                  disabled={micBusy}
                  aria-label={phase === "listening" ? "إرسال" : phase === "speaking" ? "مقاطعة" : "تحدّث"}
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 ${
                    phase === "listening"
                      ? "bg-danger animate-pulse"
                      : phase === "speaking"
                        ? "bg-navy"
                        : "bg-orange hover:bg-orange-hover"
                  }`}
                >
                  {phase === "listening" ? (
                    <Square className="h-5 w-5" fill="currentColor" />
                  ) : phase === "processing" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : phase === "speaking" ? (
                    <Volume2 className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={exitVoice}
                  className="flex h-12 items-center gap-1.5 rounded-full border border-border bg-white px-4 text-xs font-bold text-navy transition-colors hover:bg-warm-bg cursor-pointer"
                >
                  <Keyboard className="h-4 w-4" aria-hidden="true" />
                  الكتابة
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ---- Text conversation ---- */}
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-warm-bg/30 p-4">
                {turns.length === 0 ? (
                  <div className="rounded-2xl border border-border/70 bg-white p-4 text-right">
                    <p className="mb-2 text-sm font-semibold text-navy">{meta.blurb}</p>
                    <ul className="space-y-1.5">
                      {meta.examples.map((ex) => (
                        <li key={ex}>
                          <button
                            type="button"
                            onClick={() => void ask({ question: ex })}
                            disabled={micBusy}
                            className="flex w-full items-center gap-2 rounded-full border border-border/80 bg-warm-bg px-3 py-2 text-right text-xs font-medium text-navy transition-colors hover:border-navy/40 hover:bg-white disabled:opacity-50 cursor-pointer"
                          >
                            <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0 text-orange" aria-hidden="true" />
                            <span>{ex}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  turns.map((t, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-start">
                        <p className="max-w-[85%] rounded-2xl bg-navy px-4 py-2 text-sm text-white shadow-sm">
                          {t.question}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <p
                          className="max-w-[88%] rounded-2xl border border-border bg-white px-4 py-2.5 text-sm leading-relaxed text-navy shadow-sm whitespace-pre-line"
                          aria-live={i === turns.length - 1 ? "polite" : undefined}
                        >
                          {t.answer}
                        </p>
                        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy">
                          <Logo className="h-4 w-4 text-white" />
                        </span>
                      </div>
                    </div>
                  ))
                )}

                {phase === "processing" && (
                  <div className="flex items-center justify-end gap-2 text-xs text-text-secondary">
                    <span>أُجهّز الإجابة…</span>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  </div>
                )}
              </div>

              {/* ---- Controls ---- */}
              <div className="border-t border-border/60 bg-white p-3">
                <p className="mb-2 flex items-center justify-center gap-2 text-[11px] font-medium text-text-secondary" aria-live="polite">
                  <StatusDot phase={phase} />
                  {phase === "processing" ? PHASE_LABEL.processing : "اضغط زر التحدث لبدء محادثة صوتية، أو اكتب سؤالك"}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={enterVoice}
                    disabled={micBusy}
                    aria-label="بدء محادثة صوتية"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange text-white transition-colors hover:bg-orange-hover disabled:opacity-50 cursor-pointer"
                  >
                    <Mic className="h-5 w-5" />
                  </button>

                  {/* The text path — a full equivalent to voice for users who can't speak/listen. */}
                  <form onSubmit={onTextSubmit} className="flex flex-1 items-center gap-2">
                    <label htmlFor={`assistant-q-${page}`} className="sr-only">
                      اكتب سؤالك للمساعد
                    </label>
                    <input
                      id={`assistant-q-${page}`}
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="أو اكتب سؤالك هنا…"
                      className="min-h-[44px] w-full flex-1 rounded-full border border-border/80 bg-warm-bg px-4 py-2 text-sm text-navy placeholder:text-text-secondary/60 focus:border-navy/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/5"
                    />
                    <button
                      type="submit"
                      disabled={!textInput.trim() || micBusy}
                      aria-label="إرسال السؤال المكتوب"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy/90 disabled:opacity-40 cursor-pointer"
                    >
                      <Send className="h-4 w-4 -scale-x-100" />
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

/** A small state marker that pairs shape/animation with the colour, so it isn't colour-only. */
function StatusDot({ phase }: { phase: Phase }) {
  const cls =
    phase === "listening"
      ? "bg-danger animate-pulse"
      : phase === "processing"
        ? "bg-orange animate-pulse"
        : phase === "speaking"
          ? "bg-safe animate-pulse"
          : "bg-text-secondary/40";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} aria-hidden="true" />;
}
