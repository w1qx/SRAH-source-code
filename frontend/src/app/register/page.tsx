"use client";

import "../tamweel.css";
import { RegisterPage } from "@/components/ui/register.jsx";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { OpticalBezel } from "@/components/ui/optical-bezel";
import { requestOtp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

/**
 * There is no separate signup on the backend: creating an account IS the first successful
 * `/auth/otp/verify`. So "register" requests a real code and hands off to the login screen,
 * which verifies it (and takes the PDPL consent the backend requires on a first verify).
 *
 * Google/Apple are deliberately NOT wired: a Firebase sign-in would mint a session this API
 * knows nothing about, and every authenticated call afterwards would 401.
 */
export default function RegisterRoute() {
  const router = useRouter();

  const handleRegister = async (data: { email?: string }) => {
    const email = data?.email?.trim().toLowerCase();
    if (!email) {
      toast.error("خطأ", "الرجاء إدخال البريد الإلكتروني");
      return;
    }

    try {
      await requestOtp(email);
      toast.success("تم إرسال الرمز", "أدخل رمز التحقق لإكمال إنشاء حسابك");
      router.push(`/login?email=${encodeURIComponent(email)}`);
    } catch (err) {
      toast.error(
        "تعذّر إنشاء الحساب",
        err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم.",
      );
    }
  };

  const notSupported = () => {
    toast.info("غير متاح", "التسجيل يتم حالياً عبر البريد الإلكتروني ورمز التحقق فقط.");
  };

  return (
    <div dir="rtl" lang="ar" className="tamweel-theme min-h-screen relative">
      <OpticalBezel />
      <RegisterPage
        onRegister={handleRegister}
        onGoogleRegister={notSupported}
        onAppleRegister={notSupported}
        onLoginClick={() => router.push("/login")}
      />
    </div>
  );
}
