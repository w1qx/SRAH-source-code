import type { Metadata } from "next";
import "../tamweel.css";
import Navbar from "@/components/Navbar";
import ConsentForm from "@/features/consent/ConsentForm";
import { OpticalBezel } from "@/components/ui/optical-bezel";

export const metadata: Metadata = {
  title: "الموافقة | سُراة",
  description: "موافقتك على الشروط وسحب البيانات المالية قبل بدء التحليل.",
};

export default function ConsentPage() {
  return (
    <div className="tamweel-theme min-h-screen relative flex flex-col overflow-x-hidden !bg-[#faf8f5]">
      <OpticalBezel />
      <Navbar />
      {/* Same reservation as the advisor pages: the notch navbar is ~104px on md+. */}
      <main className="flex-1 flex flex-col pt-[var(--nav-h)] bg-warm-bg">
        <ConsentForm />
      </main>
    </div>
  );
}
