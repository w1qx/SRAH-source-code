import type { Metadata } from "next";
import "../tamweel.css";
import Navbar from "@/components/Navbar";
import DashboardScreen from "@/features/dashboard/DashboardScreen";
import { OpticalBezel } from "@/components/ui/optical-bezel";
import { PageBackdrop } from "@/components/ui/page-backdrop";
import RequireAuth from "@/components/RequireAuth";

export const metadata: Metadata = {
  title: "لوحتك المالية | سُراة",
  description: "مؤشر صحتك المالية، طلبات التمويل، وتحليلاتك السابقة.",
};

export default function DashboardPage() {
  return (
    <div className="tamweel-theme min-h-screen relative flex flex-col overflow-x-hidden !bg-[#faf8f5]">
      <OpticalBezel />
      <Navbar />
      {/* Same reservation as the advisor pages: the notch navbar is ~104px on md+. */}
      <main className="flex-1 flex flex-col pt-[var(--nav-h)]">
        <div className="flex-1 w-full relative bg-[#faf8f5]">
          {/* Static: the dashboard scrolls, and a per-frame backdrop stutters it. */}
          <PageBackdrop animated={false} />
          <div className="relative z-10 flex-1 flex flex-col">
            <RequireAuth>
              <DashboardScreen />
            </RequireAuth>
          </div>
        </div>
      </main>
    </div>
  );
}
