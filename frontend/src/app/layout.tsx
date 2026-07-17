import type { Metadata } from "next";
import "./globals.css";
import Toaster from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "سراة — منصة التوعية المالية",
  description: "منصة مالية توعوية تساعدك على فهم أثر قرارات التمويل على وضعك المالي",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased bg-[#faf8f5]">
      <body className="min-h-full flex flex-col font-sans bg-[#faf8f5]">
        <Toaster />
        {children}
      </body>
    </html>
  );
}
