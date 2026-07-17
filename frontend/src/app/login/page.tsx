"use client";

import "../tamweel.css";
import { LoginPage } from "@/components/ui/login.jsx";
import { useRouter } from "next/navigation";
import { OpticalBezel } from "@/components/ui/optical-bezel";
import { useAppStore } from "@/store/useAppStore";
import { useConsentStore } from "@/store/useConsentStore";

import { useState } from "react";

export default function LoginRoute() {
  const router = useRouter();
  const [hideBezel, setHideBezel] = useState(false);

  const handleLoginSuccess = (_profile?: unknown, isNewUser?: boolean) => {
    // A DIFFERENT person may have used this tab before this login. The zustand stores
    // are module-level and survive SPA navigation, so without this reset the new
    // account inherits the previous user's chat answers, step and consent draft —
    // and lands mid-conversation as if they were the same person.
    useAppStore.getState().resetAll();
    useConsentStore.getState().reset();

    // Each identity gets its own path: a first-ever verify (signup) starts at the
    // consent/onboarding screen; a returning user goes straight to the advisor.
    router.push(isNewUser ? "/consent" : "/advisor");
  };

  return (
    <div dir="rtl" lang="ar" className="tamweel-theme min-h-screen relative">
      {!hideBezel && <OpticalBezel />}
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        onNafathModalToggle={setHideBezel}
      />
    </div>
  );
}
