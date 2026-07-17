"use client";

import "./tamweel.css";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import SmartFeatures from "@/components/SmartFeatures";
import Stats from "@/components/Stats";
import Banks from "@/components/Banks";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import SiteLoader from "@/components/SiteLoader";
import { MeshBackground } from "@/components/ui/mesh-background";
import { OpticalBezel } from "@/components/ui/optical-bezel";

export default function Home() {
  return (
    <div className="tamweel-theme min-h-screen relative">
      <OpticalBezel />
      <SiteLoader />
      {/* SHADER BACKGROUND WRAPPER (Spans Navbar + Hero) */}
      <div className="relative w-full">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <MeshBackground />
        </div>
        <div className="relative z-10">
          <Navbar />
          <Hero />
        </div>
      </div>
      <Features />
      <div className="relative w-full bg-gradient-to-b from-[#FFFDFB] via-[#FCEAE2] to-[#F1B497]/20">
        <HowItWorks />
        <SmartFeatures />
      </div>

      <CTA />
      <Footer />
    </div>
  );
}
