import React, { useState, useEffect } from 'react';
import { requestOtp, verifyOtp, mockNafathLogin } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { ArrowRight, KeyRound, X, Smartphone, CheckCircle } from 'lucide-react';
import { Logo } from './logo';
import { Input } from './input';
import { toast } from '@/lib/toast';
import Link from 'next/link';

export const LoginPage = ({
  title = "تسجيل الدخول",
  description = "سجّل دخولك وتابع رحلتك المالية معنا",
  onLoginSuccess,
  onNafathModalToggle,
}) => {
  const [step, setStep] = useState('email'); // 'email' or 'otp'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [pdplConsent, setPdplConsent] = useState(false);

  // Nafath Modal States
  const [showNafathModal, setShowNafathModal] = useState(false);
  const [nafathStep, setNafathStep] = useState('id'); // 'id' or 'confirm'
  const [nationalId, setNationalId] = useState('');
  const [confirmNumber, setConfirmNumber] = useState(45);
  const [countdown, setCountdown] = useState(60);

  const videoRef = React.useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const playVideo = () => {
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Autoplay prevented, retrying...", error);
          // Retry on user interaction as fallback
          const startPlay = () => {
            video.play().catch(() => {});
            document.removeEventListener('click', startPlay);
            document.removeEventListener('touchstart', startPlay);
          };
          document.addEventListener('click', startPlay);
          document.addEventListener('touchstart', startPlay);
        });
      }
    };

    // If already loaded
    if (video.readyState >= 3) {
      playVideo();
    } else {
      video.addEventListener('canplay', playVideo);
    }

    // IntersectionObserver fallback
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) playVideo(); },
      { threshold: 0.1 }
    );
    observer.observe(video);

    return () => {
      video.removeEventListener('canplay', playVideo);
      observer.disconnect();
    };
  }, []);

  // Sync Nafath Modal visibility with parent so they can hide bezel/frame
  useEffect(() => {
    onNafathModalToggle?.(showNafathModal);
    return () => {
      onNafathModalToggle?.(false);
    };
  }, [showNafathModal, onNafathModalToggle]);

  // Countdown timer for Nafath OTP simulation
  useEffect(() => {
    let timer;
    if (showNafathModal && nafathStep === 'confirm' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setNafathStep('id');
      toast.error("انتهت المهلة", "انتهت مهلة التحقق عبر تطبيق نفاذ. الرجاء المحاولة مرة أخرى.");
    }
    return () => clearInterval(timer);
  }, [showNafathModal, nafathStep, countdown]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("خطأ", "الرجاء إدخال البريد الإلكتروني");
      return;
    }
    setLoading(true);
    try {
      // Real request: the backend mails (or, in dev, prints) a 6-digit code valid for 10 minutes.
      const { expiresInSeconds } = await requestOtp(email.trim().toLowerCase());
      setStep('otp');
      toast.success(
        "تم إرسال الرمز",
        `تم إرسال رمز تحقق إلى بريدك، وهو صالح لمدة ${Math.round(expiresInSeconds / 60)} دقائق`,
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === 'rate_limited'
            ? "حاولت كثيراً. انتظر قليلاً ثم أعد المحاولة."
            : err.message
          : "تعذّر الاتصال بالخادم.";
      toast.error("تعذّر إرسال الرمز", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length < 6) {
      toast.error("خطأ", "الرجاء إدخال رمز التحقق كاملاً");
      return;
    }
    if (!pdplConsent) {
      toast.error("الموافقة مطلوبة", "يجب الموافقة على معالجة بياناتك وفق نظام حماية البيانات (PDPL).");
      return;
    }
    setLoading(true);
    try {
      // Verifying IS the signup: there is no separate register endpoint, which is why the
      // PDPL consent has to ride along on the first-ever verify.
      const { profile, isNewUser } = await verifyOtp(email.trim().toLowerCase(), otpCode, pdplConsent);
      toast.success(isNewUser ? "تم إنشاء حسابك" : "تم تسجيل الدخول", `مرحباً بك، ${profile.email}`);
      onLoginSuccess?.(profile, isNewUser);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? {
              otp_invalid: "الرمز غير صحيح.",
              otp_expired: "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
              otp_too_many_attempts: "تجاوزت عدد المحاولات. اطلب رمزاً جديداً.",
            }[err.code] ?? err.message
          : "تعذّر الاتصال بالخادم.";
      toast.error("تعذّر التحقق", msg);
    } finally {
      setLoading(false);
    }
  };

  const openNafathModal = () => {
    setNafathStep('id');
    setNationalId('');
    setCountdown(60);
    setConfirmNumber(Math.floor(10 + Math.random() * 90)); // Generate random 2-digit number
    setShowNafathModal(true);
  };

  const handleNafathSubmit = (e) => {
    e.preventDefault();
    if (!nationalId || nationalId.length !== 10) {
      toast.error("خطأ", "الرجاء إدخال رقم الهوية الوطنية المكون من 10 أرقام (يبدأ بـ 1 أو 2)");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setNafathStep('confirm');
      setCountdown(60);
      toast.success("تم إرسال طلب نفاذ", "الرجاء فتح تطبيق نفاذ لتأكيد الهوية");
      
      // Simulate user confirming in the Nafath app
      setTimeout(async () => {
        if (showNafathModal) {
          try {
            const { profile, isNewUser } = await mockNafathLogin(nationalId);
            toast.success("تم التحقق بنجاح", "تم تأكيد الهوية الوطنية عبر تطبيق نفاذ");
            setShowNafathModal(false);
            onLoginSuccess?.(profile, isNewUser);
          } catch (err) {
            toast.error("فشل التحقق عبر نفاذ", err instanceof Error ? err.message : "حدث خطأ غير متوقع");
          }
        }
      }, 4000);
    }, 1500);
  };

  const handleOtpChange = (index, value) => {
    if (isNaN(Number(value))) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 relative overflow-x-hidden"
      dir="rtl"
      style={{
        background: 'linear-gradient(145deg, #EDE7E0 0%, #E8DDD5 50%, #DDD3C9 100%)',
        fontFamily: "'IBM Plex Arabic', sans-serif",
      }}
    >
      <div className="w-full max-w-[1280px] min-h-[85vh] flex flex-col md:flex-row bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.08)]" style={{ borderRadius: '2.5rem' }}>

        {/* ===== FORM PANEL ===== */}
        <section
          className="flex-1 flex flex-col items-center justify-center py-10 px-6 md:px-12 lg:px-16 relative"
          style={{
            background: 'linear-gradient(180deg, #F5EFEB 0%, #EDE7E0 100%)',
            fontFamily: "'IBM Plex Arabic', sans-serif",
            maxWidth: '600px',
          }}
        >
          {/* Back Button for OTP Step */}
          {step === 'otp' && (
            <button
              onClick={() => setStep('email')}
              className="absolute top-8 right-8 p-3 rounded-full bg-white/50 hover:bg-white shadow-sm transition-all duration-300 group z-10"
              aria-label="العودة"
            >
              <ArrowRight className="w-5 h-5 text-[#111] group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* Back Button for Home */}
          {step === 'email' && (
            <Link
              href="/"
              className="absolute top-8 right-8 p-3 rounded-full bg-white/50 hover:bg-white shadow-sm transition-all duration-300 group z-10"
              aria-label="العودة للرئيسية"
            >
              <ArrowRight className="w-5 h-5 text-[#111] group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}

          <div className="w-full max-w-[380px]">
            {/* Brand Logo */}
            <div className="animate-element animate-delay-100 flex justify-center mb-10">
              <Logo className="w-32 h-auto text-[#111]" />
            </div>

            {/* Heading */}
            <div className="text-center" style={{ marginBottom: '40px' }}>
              <h1
                className="animate-element animate-delay-100 text-3xl md:text-[2.2rem] font-bold tracking-tight leading-tight"
                style={{ 
                  fontFamily: "'IBM Plex Arabic', sans-serif", 
                  color: '#111',
                  marginBottom: '16px'
                }}
              >
                {step === 'email' ? title : "رمز التحقق"}
              </h1>
              <p
                className="animate-element animate-delay-200 text-sm leading-relaxed"
                style={{ color: '#888', fontFamily: "'IBM Plex Arabic', sans-serif" }}
              >
                {step === 'email' ? description : `تم إرسال رمز التحقق إلى ${email}`}
              </p>
            </div>

            {/* STEP 1: EMAIL ENTRY */}
            {step === 'email' && (
              <div className="flex flex-col gap-6 w-full">
                {/* Email Login Form */}
                <form className="flex flex-col gap-6" onSubmit={handleSendOtp}>
                  <div className="animate-element animate-delay-500">
                    <label
                      className="text-sm font-semibold block"
                      style={{ 
                        color: '#666', 
                        fontFamily: "'IBM Plex Arabic', sans-serif",
                        paddingRight: '20px',
                        marginBottom: '12px'
                      }}
                    >
                      البريد الإلكتروني
                    </label>
                    <Input
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="h-[60px] pl-6 text-base border-none shadow-sm focus-visible:ring-2 focus-visible:ring-[#00897B]/50"
                      style={{
                        background: '#FFFFFF',
                        color: '#111',
                        borderRadius: '99px',
                        paddingRight: '30px'
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="animate-element animate-delay-600 w-full h-[60px] mt-2 text-lg font-bold transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center"
                    style={{
                      background: '#111',
                      color: '#F5EFEB',
                      borderRadius: '99px',
                      fontFamily: "'IBM Plex Arabic', sans-serif",
                    }}
                  >
                    {loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}
                  </button>
                </form>
              </div>
            )}

            {/* STEP 2: OTP VERIFICATION */}
            {step === 'otp' && (
              <form className="flex flex-col gap-6" onSubmit={handleVerifyOtp}>
                <div className="animate-element animate-delay-300 flex justify-between gap-2" dir="ltr">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-14 text-center text-xl font-bold border border-neutral-300 rounded-lg focus:outline-none focus:border-[#006C35] focus:ring-2 focus:ring-[#006C35]/20 bg-white text-black"
                    />
                  ))}
                </div>

                <label className="flex items-start gap-2.5 text-right cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdplConsent}
                    onChange={(e) => setPdplConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-[#111] cursor-pointer"
                  />
                  <span className="text-xs leading-relaxed text-neutral-600">
                    أوافق على معالجة بياناتي المالية وتخزينها لأغراض التحليل، وفق نظام حماية
                    البيانات الشخصية (PDPL).
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading || !pdplConsent}
                  className="animate-element animate-delay-400 w-full h-[60px] text-lg font-bold transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    background: '#111',
                    color: '#F5EFEB',
                    borderRadius: '99px',
                    fontFamily: "'IBM Plex Arabic', sans-serif",
                  }}
                >
                  {loading ? "جاري التحقق..." : "تأكيد الرمز"}
                </button>

                <div className="text-center mt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await requestOtp(email.trim().toLowerCase());
                        toast.success("تم إعادة إرسال الرمز", "تحقق من بريدك الإلكتروني");
                      } catch (err) {
                        toast.error(
                          "تعذّر إعادة الإرسال",
                          err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم.",
                        );
                      }
                    }}
                    className="text-sm font-semibold underline text-neutral-600 hover:text-black"
                  >
                    إعادة إرسال الرمز
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        {/* ===== HERO PANEL ===== */}
        <section className="hidden md:flex flex-1 relative overflow-hidden bg-neutral-100" style={{ minWidth: '40%', minHeight: '85vh' }}>
          <video
            ref={videoRef}
            src="/ad2.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ display: 'block' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent pointer-events-none" />
        </section>
      </div>

      {/* ===== REALISTIC NAFATH POPUP MODAL ===== */}
      {showNafathModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div 
            className="w-full max-w-[480px] bg-white shadow-2xl border border-neutral-100 flex flex-col relative overflow-hidden" 
            style={{ borderRadius: '1.5rem', fontFamily: "'IBM Plex Arabic', sans-serif" }}
          >
            {/* Modal Header Decorative Bar */}
            <div className="h-2 w-full bg-[#00897B]" />
            
            {/* Close Button */}
            <button 
              onClick={() => setShowNafathModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Portal Content */}
            <div className="p-8 flex flex-col items-center">
              {/* Nafath Logo */}
              <img 
                src="/nafath.svg" 
                alt="نفاذ" 
                className="h-16 w-auto object-contain mb-4"
              />
              
              <div className="text-center mb-6">
                <h2 className="text-lg font-bold text-[#004D40] mb-1">بوابة النفاذ الوطني الموحد</h2>
                <p className="text-xs text-neutral-500">الخدمة الوطنية للتحقق من الهوية الرقمية</p>
              </div>

              {/* ID ENTRY STEP */}
              {nafathStep === 'id' && (
                <form onSubmit={handleNafathSubmit} className="w-full flex flex-col gap-5">
                  <div className="bg-[#E0F2F1]/50 p-4 rounded-xl text-[#00695C] text-xs leading-relaxed text-center mb-1">
                    أدخل رقم هويتك الوطنية أو الإقامة لتلقي طلب التحقق على تطبيق نفاذ في هاتفك المحمول.
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-neutral-600 pr-2">رقم الهوية الوطنية / الإقامة</label>
                    <input
                      type="text"
                      required
                      maxLength={10}
                      value={nationalId}
                      onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                      placeholder="الرجاء إدخال رقم الهوية"
                      className={`h-14 w-full px-4 text-center border border-neutral-300 focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-white text-black transition-all duration-200 ${nationalId ? 'tracking-widest text-lg font-bold' : 'text-sm font-medium'}`}
                      style={{ borderRadius: '0.75rem', fontFamily: "'IBM Plex Arabic', sans-serif" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-14 bg-[#00897B] hover:bg-[#00695C] text-white text-base font-bold transition-all duration-300 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                    style={{ borderRadius: '0.75rem' }}
                  >
                    {loading ? "جاري الاتصال بالنظام..." : "تسجيل الدخول"}
                  </button>

                  <div className="text-center text-[10px] text-neutral-400 mt-2">
                    جميع البيانات مشفرة وآمنة تماماً وفقاً لمعايير الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا).
                  </div>
                </form>
              )}

              {/* CONFIRMATION SCREEN */}
              {nafathStep === 'confirm' && (
                <div className="w-full flex flex-col items-center text-center">
                  <div className="flex items-center justify-center gap-2 text-[#00897B] mb-4">
                    <Smartphone className="w-5 h-5 animate-bounce" />
                    <span className="text-sm font-bold">يرجى فتح تطبيق نفاذ على جوالك</span>
                  </div>

                  <p className="text-xs text-neutral-600 leading-relaxed mb-6 px-4">
                    قم بالموافقة على طلب تسجيل الدخول الوارد، ثم اختر الرقم الموضح أدناه لإتمام عملية الدخول بنجاح.
                  </p>

                  {/* Gigantic Code display */}
                  <div className="relative flex items-center justify-center mb-6">
                    {/* Pulsing ring */}
                    <div className="absolute inset-0 w-28 h-28 rounded-full border-4 border-[#00897B]/30 animate-ping" />
                    
                    <div className="w-28 h-28 rounded-full bg-[#E0F2F1] border-4 border-[#00897B] flex items-center justify-center z-10 shadow-lg">
                      <span className="text-4xl font-extrabold text-[#004D40] tracking-wider">{confirmNumber}</span>
                    </div>
                  </div>

                  {/* Countdown progress bar */}
                  <div className="w-full max-w-[200px] mb-4">
                    <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#00897B] transition-all duration-1000 ease-linear"
                        style={{ width: `${(countdown / 60) * 100}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-neutral-400">
                    رمز التحقق صالح لمدة: <span className="font-bold text-[#00897B]">{countdown}</span> ثانية
                  </p>

                  <div className="mt-8 flex justify-center items-center gap-2 text-xs text-neutral-500">
                    <div className="w-2 h-2 rounded-full bg-[#00897B] animate-pulse" />
                    بانتظار تأكيدك عبر التطبيق...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
