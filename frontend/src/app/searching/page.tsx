import type { Metadata } from "next";
import "../tamweel.css";
import Navbar from "@/components/Navbar";
import SearchingScreen from "@/features/searching/SearchingScreen";
import { OpticalBezel } from "@/components/ui/optical-bezel";

export const metadata: Metadata = {
  title: "جارٍ التحليل | سُراة",
  description: "نسحب بياناتك من الجهات المخوّلة ونجهّز تحليلك.",
};

export default function SearchingPage() {
  return (
    <div className="tamweel-theme min-h-screen relative flex flex-col overflow-x-hidden !bg-[#faf8f5]">
      <OpticalBezel />
      <Navbar />
      {/* Same reservation as the other flow pages: the notch navbar is ~104px on md+. */}
      <main className="flex-1 flex flex-col pt-[var(--nav-h)] bg-warm-bg">
        <SearchingScreen />
      </main>
    </div>
  );
}
