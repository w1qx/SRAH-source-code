"use client";

import "../tamweel.css";
import { useAppStore } from "@/store/useAppStore";
import Navbar from "@/components/Navbar";
import ConversationPage from "@/components/ConversationPage";
import AnalysisPage from "@/components/AnalysisPage";
import OffersPage from "@/components/OffersPage";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";
import { OpticalBezel } from "@/components/ui/optical-bezel";
import RequireAuth from "@/components/RequireAuth";

export default function AdvisorPage() {
  const { currentStep, isAnalyzing, runId } = useAppStore();

  return (
    <div className="tamweel-theme min-h-screen relative flex flex-col overflow-x-hidden !bg-[#faf8f5]">
      <OpticalBezel />
      <Navbar />
      {/* The notch navbar is ~104px tall on md+ (80px logo + padding), not 64px —
          reserve its real height or the page header renders behind it. */}
      <main className="flex-1 flex flex-col pt-[var(--nav-h)]">
        <RequireAuth>
          {isAnalyzing ? (
            <AnalyzingOverlay />
          ) : currentStep === 1 ? (
            /* Keyed on runId: "بدء تحليل جديد" must clear the chat's own message list. */
            <ConversationPage key={runId} />
          ) : currentStep === 2 ? (
            <AnalysisPage />
          ) : (
            <OffersPage />
          )}
        </RequireAuth>
      </main>
    </div>
  );
}
