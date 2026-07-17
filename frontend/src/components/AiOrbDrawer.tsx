"use client";

/**
 * سراة — the AI voice assistant.
 *
 * Collapsed: a pull-strip tab ("المساعد الصوتي") tucked BEHIND the chat card's left edge;
 * hovering drags it out from under the card with a quick spring, click opens it.
 *
 * Expanded: a REAL voice conversation over OpenRouter's `openai/gpt-audio` (proxied by
 * /api/voice so the key stays server-side). The agent is instructed to ask the SAME
 * backend-owned questions as the text chat, one at a time. The exchange is HANDS-FREE:
 * when the agent finishes talking the mic opens by itself, and the recorder's silence
 * detector sends the answer once the user stops speaking — the button is only an override
 * (interrupt / send now / retry). When every field is collected the agent calls the
 * `submit_answers` tool (schema built from the questions) — we write those answers into
 * the store and flip the flow to the review screen, exactly where the text chat lands, so
 * "بدء التحليل" carries on to the analysis step. Closing the orb at any point returns to
 * the text chat; answers already collected by voice are kept.
 *
 * MUST be rendered inside ConversationPage's chat container: the strip's z-5 only reliably
 * loses to the card's z-10 when both are in the same stacking context (the container's
 * fade-in animation traps its subtree in one). The expanded overlay portals to <body> so it
 * still covers the navbar.
 */

import "./AiOrbDrawer.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/ui/logo";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/store/useAppStore";
import type { ScopedQuestion } from "@/lib/api/chat";
import type { UserFinancialData } from "@shared/types";
import { BOUNDS } from "@/lib/field-bounds";
import { VoiceRecorder } from "@/lib/voice-recorder";

type AgentState = null | "listening" | "thinking" | "talking";

const PHASE_LABEL: Record<Exclude<AgentState, null>, string> = {
  listening: "أستمع إليك… توقّف عن الكلام وسأرسل إجابتك",
  thinking: "أفكّر…",
  talking: "أتحدّث…",
};

/** Must match the exit animation duration in AiOrbDrawer.css. */
const CLOSE_MS = 300;

/** OpenAI-style message, forwarded verbatim by /api/voice. Assistant turns are kept as
    their transcript text so the history stays small; user turns carry the recorded WAV. */
type VoicePart =
  | { type: "text"; text: string }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" } };
interface VoiceMessage {
  role: "system" | "user" | "assistant";
  content: string | VoicePart[];
}

/**
 * The agent's policy. Built from the SAME `/chat/questions` list the text chat renders, so
 * the two flows can never drift apart: field names, Arabic wording and the allowed enum
 * values all come from the backend.
 */
function buildSystemPrompt(questions: ScopedQuestion[]): string {
  const lines = questions.map((q, i) => {
    const opts = q.quickReplies?.map((r) => `${r.value}=${r.ar}`).join("، ");
    if (opts) return `${i + 1}. (${q.field}) ${q.ar} — الخيارات: ${opts}`;
    const b = BOUNDS[q.field];
    return `${i + 1}. (${q.field}) ${q.ar} — الإجابة رقم صحيح${
      b ? ` بين ${b.min} و${b.max}` : ""
    }`;
  });
  return [
    'أنت "سراة"، مساعد صوتي مالي سعودي بشخصية دافئة هادئة وواثقة — مهني كموظف علاقات عملاء محترف، لكن قريب من الناس ومطمئن. مهمتك جمع إجابات المستخدم على الأسئلة التالية بنفس ترتيبها، سؤالًا واحدًا في كل رسالة:',
    ...lines,
    "قواعد صارمة:",
    "- ابدأ الترحيب بـ«هلا والله» بجملة واحدة ثم اطرح السؤال الأول مباشرة.",
    "- استخدم كلمات سعودية لطيفة بشكل عفوي وغير متكلف في بعض ردودك، مثل: «أبشر»، «طال عمرك»، «تمام».",
    "- لا تقرأ نص السؤال حرفيًا كأنك تقرأ من كتاب؛ صِغه بأسلوبك في جملة محادثة طبيعية قصيرة، واذكر الخيارات عفويًا ضمن الكلام عند الحاجة.",
    "- اطرح سؤالًا واحدًا فقط في كل رسالة، ولا تخرج عن هذه الأسئلة ولا تقدّم نصائح أو تحليلًا.",
    "- اسأل الأسئلة كلها دون استثناء وبالترتيب؛ يُمنع تجاوز أي سؤال، ويُمنع افتراض أو تخمين إجابة لم يقلها المستخدم صراحةً.",
    "- إذا طلب المستخدم تعديل إجابة سابقة: عدّل ذلك الحقل وحده واحتفظ بباقي الإجابات كما هي، ثم تابع من حيث توقفت؛ وإن كانت الأسئلة قد اكتملت فاستدعِ submit_answers مباشرة بالقيم بعد التعديل.",
    "- الحقول الرقمية: المستخدم يتحدث، فحوّل الأرقام المنطوقة بالكلمات إلى رقم صحيح بنفسك (مثال: «مئة وخمسون ألف ريال» = 150000)، ولا تطلب الإعادة إلا إذا تعذّر فهم الرقم إطلاقًا.",
    "- التزم بالحدود المذكورة أمام كل سؤال رقمي: إذا أعطى المستخدم قيمة خارجها (مثل 17 مليارًا لمبلغ التمويل) فلا تقبلها أبدًا؛ أخبره بلطف بالمدى المسموح واطلب قيمة ضمنه.",
    "- حقول الخيارات: طابق كلام المستخدم مع أقرب خيار، واستخدم في النتيجة القيمة الإنجليزية (ما قبل علامة =).",
    "- لا تستدعِ الأداة submit_answers إلا بعد حصولك على إجابة صريحة من المستخدم لكل حقل من الحقول أعلاه.",
    "- عند اكتمال جميع الإجابات: اشكر المستخدم بجملة واحدة وأخبره أنه سينتقل الآن لمراجعة إجاباته، ثم استدعِ الأداة submit_answers بجميع القيم المجمعة.",
  ].join("\n");
}

/** The completion channel: the agent submits the collected answers as a tool call —
    structured JSON, never spoken text — with the schema derived from the questions. */
function buildSubmitTool(questions: ScopedQuestion[]) {
  const properties: Record<string, unknown> = {};
  for (const q of questions) {
    const b = BOUNDS[q.field];
    properties[q.field] = q.quickReplies
      ? { type: "string", enum: q.quickReplies.map((r) => r.value), description: q.ar }
      : {
          type: "integer",
          description: q.ar,
          ...(b ? { minimum: b.min, maximum: b.max } : {}),
        };
  }
  return {
    type: "function",
    function: {
      name: "submit_answers",
      description: "تُستدعى مرة واحدة عند اكتمال جميع إجابات المستخدم، لإرسالها إلى شاشة المراجعة.",
      parameters: {
        type: "object",
        properties,
        required: questions.map((q) => q.field),
        additionalProperties: false,
      },
    },
  };
}

export default function AiOrbDrawer({ questions }: { questions: ScopedQuestion[] | null }) {
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [phase, setPhase] = useState<AgentState>(null);
  const [transcript, setTranscript] = useState("");

  const historyRef = useRef<VoiceMessage[]>([]);
  const startedRef = useRef(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const finishTakeRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const closeTimer = useRef<number | null>(null);

  const { setAnswer, setReviewMode } = useAppStore();

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  /** Kills anything in flight: the take, the request, the playing reply. */
  const teardown = useCallback(() => {
    recorderRef.current?.cancel();
    abortRef.current?.abort();
    abortRef.current = null;
    stopPlayback();
  }, [stopPlayback]);

  // Play the fade-out, THEN unmount — so closing is animated, not an instant cut.
  const collapse = useCallback(() => {
    teardown();
    setPhase(null);
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setExpanded(false);
      setClosing(false);
    }, CLOSE_MS);
  }, [teardown]);

  /**
   * Hands-free take: opens the mic straight away; the recorder's voice-activity detector
   * ends the take on its own — a pause after speaking sends the answer, prolonged silence
   * hands the mic back to the button.
   */
  const startListening = useCallback(async () => {
    try {
      const rec = new VoiceRecorder((reason) => {
        if (reason === "silence") {
          finishTakeRef.current();
        } else {
          recorderRef.current?.cancel();
          recorderRef.current = null;
          setPhase(null);
        }
      });
      await rec.start();
      recorderRef.current = rec;
      setPhase("listening");
    } catch {
      toast.error("تعذّر الوصول إلى الميكروفون. تأكد من السماح به في المتصفح.");
      setPhase(null);
    }
  }, []);

  /** Speaks (and shows) one assistant reply, then opens the mic for the user's answer. */
  const speak = useCallback(
    (text: string, audioB64: string | null, onDone?: () => void) => {
      setTranscript(text.trim());
      // Unless this is the farewell (onDone = go to review), the mic opens by itself.
      const handBack = onDone ?? (() => void startListening());
      if (!audioB64) {
        setPhase(null);
        handBack();
        return;
      }
      const el = new Audio(`data:audio/wav;base64,${audioB64}`);
      audioRef.current = el;
      const finish = () => {
        if (audioRef.current !== el) return; // interrupted or torn down — don't reopen the mic
        audioRef.current = null;
        setPhase(null);
        handBack();
      };
      el.onended = finish;
      el.onerror = finish;
      setPhase("talking");
      // Autoplay can be blocked before any gesture — the transcript still carries the turn.
      el.play().catch(finish);
    },
    [startListening],
  );

  /**
   * The agent finished: map its `submit_answers` arguments onto the store through the SAME
   * field contract as the chat (enum fields must match a quick-reply value, the rest are
   * integers), then send the flow to the review screen — the chat's own next step.
   */
  const applyResult = useCallback(
    (raw: string): boolean => {
      if (!questions) return false;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return false;
      }

      const writes: { field: keyof UserFinancialData; value: string | number }[] = [];
      for (const q of questions) {
        const v = parsed[q.field];
        if (v === undefined || v === null) return false;
        if (q.quickReplies) {
          const match = q.quickReplies.find((r) => r.value === String(v) || r.ar === String(v));
          if (!match) return false;
          writes.push({ field: q.field, value: match.value });
        } else {
          const n = Math.round(Number(String(v).replace(/[^\d.-]/g, "")));
          if (!Number.isFinite(n)) return false;
          // Same net as the chat: an out-of-range number never reaches the store.
          const b = BOUNDS[q.field];
          if (b && (n < b.min || n > b.max)) return false;
          writes.push({ field: q.field, value: n });
        }
      }

      // All fields validated — only now touch the store, so a bad payload changes nothing.
      for (const w of writes) setAnswer(w.field, w.value as never);
      return true;
    },
    [questions, setAnswer],
  );

  /** One turn: send the history, handle the reply (question, retry, or final submission). */
  const sendTurn = useCallback(async () => {
    if (!questions) return;
    setPhase("thinking");
    const controller = new AbortController();
    abortRef.current = controller;

    let reply: { text: string; audio: string | null; toolArgs: string | null };
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyRef.current,
          tools: [buildSubmitTool(questions)],
        }),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      reply = { text: body.text ?? "", audio: body.audio ?? null, toolArgs: body.toolArgs ?? null };
    } catch (e) {
      if (controller.signal.aborted) return;
      toast.error("تعذّر الاتصال بالمساعد الصوتي. حاول مجددًا.");
      console.error("voice turn failed:", e);
      setPhase(null);
      return;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }

    // Keep the assistant's turn as its transcript, so the next request replays the
    // conversation without re-uploading audio.
    if (reply.text) {
      historyRef.current = [...historyRef.current, { role: "assistant", content: reply.text }];
    }

    if (reply.toolArgs && applyResult(reply.toolArgs)) {
      // Let the farewell (if any) play, then land on review — the chat's own next step.
      speak(reply.text, reply.audio, () => {
        collapse();
        setReviewMode(true);
        toast.success("اكتملت إجاباتك الصوتية — راجعها ثم ابدأ التحليل.");
      });
      return;
    }
    if (reply.toolArgs) toast.error("لم أستطع قراءة بعض الإجابات — لنُكمل المحادثة.");

    speak(reply.text, reply.audio);
  }, [questions, applyResult, collapse, setReviewMode, speak]);

  /** First turn: the policy + a kick-off message; the agent greets and asks question 1. */
  const begin = useCallback(() => {
    if (startedRef.current || !questions || questions.length === 0) return;
    startedRef.current = true;
    historyRef.current = [
      { role: "system", content: buildSystemPrompt(questions) },
      { role: "user", content: "ابدأ المحادثة الآن." },
    ];
    void sendTurn();
  }, [questions, sendTurn]);

  // The conversation starts as soon as the orb opens (and continues where it left off if
  // the orb is closed and reopened — the history survives the collapse).
  useEffect(() => {
    if (expanded) begin();
  }, [expanded, begin]);

  /** Ends the current take and sends it as the user's turn. */
  const finishTake = useCallback(() => {
    if (!recorderRef.current) return; // already sent (button race with the auto-stop)
    const b64 = recorderRef.current.stop();
    recorderRef.current = null;
    if (!b64) {
      setPhase(null);
      return;
    }
    historyRef.current = [
      ...historyRef.current,
      {
        role: "user",
        content: [{ type: "input_audio", input_audio: { data: b64, format: "wav" } }],
      },
    ];
    void sendTurn();
  }, [sendTurn]);

  // The recorder's auto-stop fires from an audio callback; the ref always points at the
  // freshest finishTake so it never sends through a stale closure.
  useEffect(() => {
    finishTakeRef.current = finishTake;
  }, [finishTake]);

  /** The button is now just an override — the conversation itself is hands-free. */
  const toggleMic = useCallback(async () => {
    if (phase === "thinking") return;

    if (phase === "talking") {
      // Interrupt the reply and take the mic straight away.
      stopPlayback();
      void startListening();
      return;
    }

    if (phase === "listening") {
      // Send now instead of waiting out the silence.
      finishTake();
      return;
    }

    // Idle (auto-listen timed out or mic was denied) → try again.
    void startListening();
  }, [phase, finishTake, startListening, stopPlayback]);

  useEffect(
    () => () => {
      teardown();
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [teardown],
  );

  // Esc closes the expanded orb.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, collapse]);

  const active = phase !== null;

  return (
    <>
      {/* Collapsed: a pull-strip tab tucked behind the chat card — hover drags it out. */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="افتح المساعد الصوتي"
          className="orb-strip"
        >
          <span className="orb-strip__grip" aria-hidden="true" />
          <Logo className="orb-strip__mark" />
          <span className="orb-strip__title">المساعد الصوتي</span>
          <svg
            className="orb-strip__chevron"
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      )}

      {/* Expanded: blur the chat, and let the orb take over its space. Portalled to <body>
          so its z-index escapes the chat container's stacking context and covers the navbar. */}
      {expanded &&
        createPortal(
          <div
            className={`orb-overlay ${closing ? "orb-overlay--closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="المساعد الصوتي"
          >
          {/* Scrim blurs whatever is behind it — i.e. the chat — and carries the background texture. */}
          <button
            type="button"
            className="orb-overlay__scrim"
            onClick={collapse}
            aria-label="إغلاق"
            tabIndex={-1}
          />

          <button type="button" onClick={collapse} aria-label="إغلاق" className="orb-close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div className={`orb-expanded ${closing ? "orb-expanded--closing" : ""}`} dir="rtl">
            {/* The pearl orb: a CSS radial-gradient sphere with a rotating sheen, ripples, a
                listening halo, and the سراة logo set into the surface. */}
            <div className="orb-stage">
              <div className={`orb2 ${active ? "orb2--on" : ""} ${phase ? `orb2--${phase}` : ""}`}>
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

            {/* What the agent just said — the spoken reply's transcript. */}
            <p className="orb-transcript" aria-live="polite">
              {transcript}
            </p>

            <p className="orb-status" aria-live="polite">
              {active ? PHASE_LABEL[phase] : "اضغط للتحدث"}
            </p>

            <button
              type="button"
              onClick={toggleMic}
              disabled={phase === "thinking"}
              aria-label={phase === "listening" ? "إرسال" : phase === "talking" ? "مقاطعة" : "تحدّث"}
              className={`orb-mic ${active ? `orb-mic--active orb-mic--${phase}` : ""}`}
            >
              {active && <span className="orb-mic__ring" aria-hidden="true" />}
              {phase === null ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2.5" />
                </svg>
              )}
            </button>

            {/* The other half of the choice: voice is optional, the text chat stays a click away. */}
            <p className="orb-alt">أو أغلق المساعد وتابع الإجابة كتابةً في المحادثة.</p>
          </div>
          </div>,
          document.body,
        )}
    </>
  );
}
