"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const INJECTED_STYLES = `
  .gsap-reveal { visibility: hidden; }

  /* Environment Overlays */
  .film-grain {
      position: absolute; inset: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 50; opacity: 0.05; mix-blend-mode: overlay;
      background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
  }

  .bg-grid-theme {
      background-size: 60px 60px;
      background-image: 
          linear-gradient(to right, color-mix(in srgb, var(--color-foreground) 5%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in srgb, var(--color-foreground) 5%, transparent) 1px, transparent 1px);
      mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
      -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  }

  /* -------------------------------------------------------------------
     PHYSICAL SKEUOMORPHIC MATERIALS (Restored 3D Depth)
  ---------------------------------------------------------------------- */
  
  /* OUTSIDE THE CARD: Theme-aware text (Shadow in Light Mode, Glow in Dark Mode) */
  .text-3d-matte {
      color: var(--color-foreground);
      text-shadow: 
          0 10px 30px color-mix(in srgb, var(--color-foreground) 20%, transparent), 
          0 2px 4px color-mix(in srgb, var(--color-foreground) 10%, transparent);
  }

  .text-silver-matte {
      background: linear-gradient(180deg, var(--color-foreground) 0%, color-mix(in srgb, var(--color-foreground) 40%, transparent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0); /* Hardware acceleration to prevent WebKit clipping bug */
      filter: 
          drop-shadow(0px 10px 20px color-mix(in srgb, var(--color-foreground) 15%, transparent)) 
          drop-shadow(0px 2px 4px color-mix(in srgb, var(--color-foreground) 10%, transparent));
  }

  /* INSIDE THE CARD: Hardcoded Silver/White for the dark background, deep rich shadows */
  .text-card-silver-matte {
      background: linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0);
      filter: 
          drop-shadow(0px 12px 24px rgba(0,0,0,0.8)) 
          drop-shadow(0px 4px 8px rgba(0,0,0,0.6));
  }

  /* Deep Physical Card with Dynamic Mouse Lighting */
  .premium-depth-card {
      background: transparent;
      box-shadow: 
          0 40px 100px -20px rgba(0, 0, 0, 0.4),
          0 20px 40px -20px rgba(0, 0, 0, 0.3),
          inset 0 1px 2px rgba(255, 255, 255, 0.15),
          inset 0 -2px 4px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      position: relative;
  }

  /* Aurora Background animation */
  @keyframes aurora-anim {
      from {
          background-position: 50% 50%, 50% 50%;
      }
      to {
          background-position: 350% 50%, 350% 50%;
      }
  }

  .aurora-bg-container {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 0;
      background: #f6e7dc;
  }

  .aurora-bg-element {
      pointer-events: none;
      position: absolute;
      inset: -100px;
      opacity: 0.85;
      filter: blur(35px);
      will-change: transform;
      
      background-image: repeating-linear-gradient(
          120deg,
          #f6e7dc 0%,
          #f6e7dc 18%,
          #c36b4e 25%,
          #c36b4e 35%,
          #f6e7dc 42%,
          #f6e7dc 60%
      );
      background-size: 300% 200%;
      background-position: 50% 50%;
      animation: aurora-move-1 25s linear infinite;
  }

  .aurora-bg-element::after {
      content: "";
      position: absolute;
      inset: 0;
      opacity: 0.8;
      background-image: repeating-linear-gradient(
          80deg,
          #f6e7dc 0%,
          #f6e7dc 15%,
          #c36b4e 22%,
          #c36b4e 32%,
          #f6e7dc 40%,
          #f6e7dc 55%
      );
      background-size: 200% 150%;
      background-position: 50% 50%;
      animation: aurora-move-2 30s linear infinite;
  }

  @keyframes aurora-move-1 {
      0% {
          background-position: 0% 50%;
      }
      50% {
          background-position: 100% 100%;
      }
      100% {
          background-position: 0% 50%;
      }
  }

  @keyframes aurora-move-2 {
      0% {
          background-position: 100% 100%;
      }
      50% {
          background-position: 0% 0%;
      }
      100% {
          background-position: 100% 100%;
      }
  }

  /* Continuous Floating animations for each of the 6 badges */
  @keyframes continuous-float-y {
      0%, 100% {
          transform: translateY(0px);
      }
      50% {
          transform: translateY(-8px);
      }
  }

  .animate-continuous-float-1 {
      animation: continuous-float-y 5s ease-in-out infinite;
  }
  .animate-continuous-float-2 {
      animation: continuous-float-y 5.4s ease-in-out infinite 0.4s;
  }
  .animate-continuous-float-3 {
      animation: continuous-float-y 4.8s ease-in-out infinite 0.8s;
  }
  .animate-continuous-float-4 {
      animation: continuous-float-y 5.2s ease-in-out infinite 0.2s;
  }
  .animate-continuous-float-5 {
      animation: continuous-float-y 4.6s ease-in-out infinite 0.6s;
  }
  .animate-continuous-float-6 {
      animation: continuous-float-y 5.6s ease-in-out infinite 1.0s;
  }

  .card-sheen {
      position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 50;
      background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.06) 0%, transparent 40%);
      mix-blend-mode: screen; transition: opacity 0.3s ease;
  }

  /* Realistic iPhone Mockup Hardware */
  .iphone-bezel {
      background-color: #111;
      box-shadow: 
          inset 0 0 0 2px #52525B, 
          inset 0 0 0 7px #000, 
          0 40px 80px -15px rgba(0,0,0,0.9),
          0 15px 25px -5px rgba(0,0,0,0.7);
      transform-style: preserve-3d;
  }

  .hardware-btn {
      background: linear-gradient(90deg, #404040 0%, #171717 100%);
      box-shadow: 
          -2px 0 5px rgba(0,0,0,0.8),
          inset -1px 0 1px rgba(255,255,255,0.15),
          inset 1px 0 2px rgba(0,0,0,0.8);
      border-left: 1px solid rgba(255,255,255,0.05);
  }
  
  .screen-glare {
      background: linear-gradient(110deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 45%);
  }

  .widget-depth {
      background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
      box-shadow: 
          0 10px 20px rgba(0,0,0,0.3),
          inset 0 1px 1px rgba(255,255,255,0.05),
          inset 0 -1px 1px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.03);
  }

  .floating-ui-badge {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%);
      backdrop-filter: blur(24px); 
      -webkit-backdrop-filter: blur(24px);
      box-shadow: 
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 25px 50px -12px rgba(0, 0, 0, 0.8),
          inset 0 1px 1px rgba(255,255,255,0.2),
          inset 0 -1px 1px rgba(0,0,0,0.5);
  }

  /* Physical Tactile Buttons */
  .btn-modern-light, .btn-modern-dark {
      transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  }
  .btn-modern-light {
      background: linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%);
      color: #0F172A;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.1), 0 12px 24px -4px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }
  .btn-modern-light:hover {
      transform: translateY(-3px);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 6px 12px -2px rgba(0,0,0,0.15), 0 20px 32px -6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }
  .btn-modern-light:active {
      transform: translateY(1px);
      background: linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1), inset 0 3px 6px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(0,0,0,0.02);
  }
  .btn-modern-dark {
      background: linear-gradient(180deg, #27272A 0%, #18181B 100%);
      color: #FFFFFF;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.6), 0 12px 24px -4px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -3px 6px rgba(0,0,0,0.8);
  }
  .btn-modern-dark:hover {
      transform: translateY(-3px);
      background: linear-gradient(180deg, #3F3F46 0%, #27272A 100%);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 6px 12px -2px rgba(0,0,0,0.7), 0 20px 32px -6px rgba(0,0,0,1), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -3px 6px rgba(0,0,0,0.8);
  }
  .btn-modern-dark:active {
      transform: translateY(1px);
      background: #18181B;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.05), inset 0 3px 8px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(0,0,0,0.5);
  }

  .progress-ring {
      transform: rotate(-90deg);
      transform-origin: center;
      stroke-dasharray: 402;
      stroke-dashoffset: 402;
      stroke-linecap: round;
  }

  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
    40% {transform: translateY(-10px);}
    60% {transform: translateY(-5px);}
  }
  .animate-bounce-slow {
    animation: bounce 2s infinite;
  }
`;

export interface CinematicHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  brandName?: string;
  tagline1?: string;
  tagline2?: string;
  cardHeading?: string;
  cardDescription?: React.ReactNode;
  metricValue?: number;
  metricLabel?: string;
  ctaHeading?: string;
  ctaDescription?: string;
}

export function CinematicHero({
  brandName = "سراة",
  tagline1 = "قرارك المالي،",
  tagline2 = "يبدأ بوعي.",
  cardHeading = "تحليل عميق لمستقبلك المالي",
  cardDescription = <>منصة <span className="text-white font-semibold">سراة</span> تحلل بياناتك المالية وتربطها بالمتغيرات الاقتصادية ومعدلات التضخم، لتمنحك رؤية واضحة للسيناريوهات المحتملة.</>,
  metricValue = 850,
  metricLabel = "Score",
  ctaHeading = "حلّل وضعك المالي",
  ctaDescription = "اكتشف أثر قرارات التمويل على مستقبلك من خلال تحليل عميق وخط زمني تفاعلي",
  className,
  ...props
}: CinematicHeroProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);

  // 1.5 Scroll to Next Section
  const scrollToNext = () => {
    const nextSection = containerRef.current?.nextElementSibling;
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Fallback: Scroll past the pinned height
      window.scrollTo({
        top: window.innerHeight + 3500,
        behavior: 'smooth'
      });
    }
  };

  // 1. High-Performance Mouse Interaction Logic (Using requestAnimationFrame)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;

      cancelAnimationFrame(requestRef.current);

      requestRef.current = requestAnimationFrame(() => {
        if (mainCardRef.current && mockupRef.current) {
          const rect = mainCardRef.current.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          mainCardRef.current.style.setProperty("--mouse-x", `${mouseX}px`);
          mainCardRef.current.style.setProperty("--mouse-y", `${mouseY}px`);

          const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
          const yVal = (e.clientY / window.innerHeight - 0.5) * 2;

          gsap.to(mockupRef.current, {
            rotationY: xVal * 12,
            rotationX: -yVal * 12,
            ease: "power3.out",
            duration: 1.2,
          });
        }
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // 2. Complex Cinematic Scroll Timeline
  useEffect(() => {
    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      gsap.set(".text-track", { autoAlpha: 0, y: 60, scale: 0.85, filter: "blur(20px)", rotationX: -20 });
      gsap.set(".text-days", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".main-card", { y: window.innerHeight + 200, autoAlpha: 1 });
      gsap.set([".card-left-text", ".card-right-text", ".mockup-scroll-wrapper", ".floating-badge", ".phone-widget"], { autoAlpha: 0 });
      gsap.set(".cta-wrapper", { autoAlpha: 0, scale: 0.8, filter: "blur(30px)" });

      const introTl = gsap.timeline({ delay: 0.3 });
      introTl
        .to(".text-track", { duration: 1.8, autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", rotationX: 0, ease: "expo.out" })
        .to(".text-days", { duration: 1.4, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" }, "-=1.0");

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=3500",
          pin: true,
          scrub: 0.5,
          anticipatePin: 1,
        },
      });

      scrollTl
        .to([".hero-text-wrapper", ".bg-grid-theme"], { scale: 1.15, filter: "blur(20px)", opacity: 0.2, ease: "power2.inOut", duration: 2 }, 0)
        .to(".main-card", { y: 0, ease: "power3.inOut", duration: 2 }, 0)
        .to(".main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1.5 })
        .fromTo(".mockup-scroll-wrapper",
          { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 2.5 }, "-=0.8"
        )
        .fromTo(".phone-widget", { y: 40, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: "back.out(1.2)", duration: 1.5 }, "-=1.5")
        .to(".progress-ring", { strokeDashoffset: 60, duration: 2, ease: "power3.inOut" }, "-=1.2")
        .to(".counter-val", { innerHTML: metricValue, snap: { innerHTML: 1 }, duration: 2, ease: "expo.out" }, "-=2.0")
        .fromTo(".floating-badge", { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 }, { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1.5, stagger: 0.2 }, "-=2.0")
        .fromTo(".card-left-text", { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1.5 }, "-=1.5")
        .fromTo(".card-right-text", { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.5 }, "<")
        .to({}, { duration: 2.5 })
        .set(".hero-text-wrapper", { autoAlpha: 0 })
        .set(".cta-wrapper", { autoAlpha: 1 })
        .to({}, { duration: 1.5 })
        .to([".mockup-scroll-wrapper", ".floating-badge", ".card-left-text", ".card-right-text"], {
          scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: "power3.in", duration: 1.2, stagger: 0.05,
        })
        // Responsive card pullback sizing
        .to(".main-card", {
          width: isMobile ? "92vw" : "85vw",
          height: isMobile ? "92vh" : "85vh",
          borderRadius: isMobile ? "32px" : "40px",
          ease: "expo.inOut",
          duration: 1.8
        }, "pullback")
        .to(".cta-wrapper", { scale: 1, filter: "blur(0px)", ease: "expo.inOut", duration: 1.8 }, "pullback")
        .to(".main-card", { y: -window.innerHeight - 300, ease: "power3.in", duration: 1.5 });

    }, containerRef);

    return () => ctx.revert();
  }, [metricValue]);

  return (
    <div
      ref={containerRef}
      // Above the navbar (z-1000) so the expanding card passes over it rather than
      // under. pointer-events-none keeps the navbar clickable through this layer —
      // the card and the CTA opt back in with pointer-events-auto.
      className={cn("relative z-[1200] pointer-events-none w-[100vw] h-screen overflow-hidden flex items-center justify-center bg-transparent text-foreground font-sans antialiased", className)}
      style={{ perspective: "1500px" }}
      {...props}
    >
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="film-grain" aria-hidden="true" />
      <div className="bg-grid-theme absolute inset-0 z-0 pointer-events-none opacity-50" aria-hidden="true" />

      {/* BACKGROUND LAYER: Hero Texts */}
      <div className="hero-text-wrapper absolute inset-0 z-10 flex flex-col items-center justify-center text-center w-full px-4 will-change-transform transform-style-3d">
        <h1 className="text-track gsap-reveal text-3d-matte text-5xl md:text-7xl lg:text-[5rem] font-bold tracking-tight mb-2" dir="rtl" style={{ fontFamily: "var(--font-family-body)" }}>
          {tagline1}
        </h1>
        <h1 className="text-days gsap-reveal text-silver-matte text-5xl md:text-7xl lg:text-[5rem] font-extrabold tracking-tighter" dir="rtl" style={{ fontFamily: "var(--font-family-display)" }}>
          {tagline2}
        </h1>
      </div>

      {/* BACKGROUND LAYER 2: Tactile CTA Buttons */}
      <div className="cta-wrapper absolute inset-0 z-10 flex flex-col items-center justify-center text-center w-full px-4 gsap-reveal pointer-events-auto will-change-transform" dir="rtl">
        <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight text-silver-matte" style={{ fontFamily: "var(--font-family-display)" }}>
          {ctaHeading}
        </h2>
        <p className="text-muted-foreground text-lg md:text-xl mb-12 max-w-xl mx-auto font-light leading-relaxed font-body">
          {ctaDescription}
        </p>
        <div className="flex flex-col sm:flex-row gap-6">
          <a href="#" aria-label="حلّل وضعك المالي" className="btn-modern-dark flex items-center justify-center gap-3 px-8 py-4 rounded-[1.25rem] group focus:outline-none">
            <span className="flex flex-col items-start">
              <div className="text-xl font-bold leading-none tracking-tight">حلّل وضعك المالي</div>
            </span>
          </a>
        </div>
      </div>

      {/* FOREGROUND LAYER: The Physical Deep Blue Card */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none" style={{ perspective: "1500px" }}>
        <div
          ref={mainCardRef}
          className="main-card premium-depth-card relative overflow-hidden gsap-reveal flex items-center justify-center pointer-events-auto w-[92vw] md:w-[85vw] h-[92vh] md:h-[85vh] rounded-[32px] md:rounded-[40px]"
        >
          <div className="card-sheen" aria-hidden="true" />

          {/* Aurora Background inside the card */}
          <div className="aurora-bg-container absolute inset-0 z-0">
            <div className="aurora-bg-element" />
            {/* Subtle dark overlay for readability of white text */}
            <div className="absolute inset-0 bg-slate-950/10 z-[1]" />
          </div>

          {/* Layout Container */}
          <div className="relative w-full h-full max-w-[96vw] mx-auto px-4 lg:px-6 xl:px-12 flex flex-col justify-evenly items-center z-10 py-6 lg:py-0">

            {/* CENTER: iPad Mockup & Copy */}
            <div className="relative w-full flex flex-col justify-between items-center z-10 pb-4 lg:py-4">
              
              <div className="card-left-text gsap-reveal z-40 w-full text-center px-4 pt-4 lg:pt-8 mb-6 lg:mb-10">
                <h3 className="text-white text-3xl md:text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tight drop-shadow-lg" style={{ fontFamily: "var(--font-family-display)" }}>
                  {cardHeading}
                </h3>
              </div>

              <div className="mockup-scroll-wrapper relative w-full flex items-center justify-center z-10" style={{ perspective: "1200px" }}>

                {/* Scaling wrapper */}
                <div className="relative w-full flex items-center justify-center transform scale-[0.45] sm:scale-[0.55] md:scale-[0.65] lg:scale-[0.75] xl:scale-[0.85]">

                {/* iPad Pro 12.9" Landscape — 4:3 aspect, thin bezels */}
                <div
                  ref={mockupRef}
                  className="relative flex flex-col will-change-transform transform-style-3d"
                  style={{ 
                    width: '1024px', 
                    height: '768px',
                    borderRadius: '36px',
                    background: 'linear-gradient(160deg, #2C2C2E 0%, #1C1C1E 100%)',
                    boxShadow: 'inset 0 0 0 1.5px #3A3A3C, inset 0 0 0 4px #000, 0 60px 120px -30px rgba(0,0,0,0.95), 0 0 0 0.5px rgba(255,255,255,0.06)' 
                  }}
                >
                  {/* iPad Camera — landscape top center */}
                  <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-[8px] h-[8px] rounded-full bg-neutral-800 z-50 ring-1 ring-neutral-700 shadow-inner" aria-hidden="true" />

                  {/* iPad Power Button — top right */}
                  <div className="absolute -top-[1.5px] right-[80px] h-[1.5px] w-[44px] bg-gradient-to-r from-neutral-600 via-neutral-500 to-neutral-600 rounded-t-sm z-0" aria-hidden="true" />

                  {/* iPad Volume Buttons — right side */}
                  <div className="absolute top-[100px] -right-[1.5px] w-[1.5px] h-[32px] bg-gradient-to-b from-neutral-600 via-neutral-500 to-neutral-600 rounded-r-sm z-0" aria-hidden="true" />
                  <div className="absolute top-[145px] -right-[1.5px] w-[1.5px] h-[32px] bg-gradient-to-b from-neutral-600 via-neutral-500 to-neutral-600 rounded-r-sm z-0" aria-hidden="true" />

                  {/* Inner Screen */}
                  <div className="absolute inset-[6px] bg-[#F7F5F2] overflow-hidden z-10" style={{ borderRadius: '30px' }}>
                    <img 
                      src="/ipad-chat.png" 
                      alt="سراة المساعد المالي" 
                      className="w-full h-full object-cover select-none pointer-events-none" 
                    />
                  </div>
                </div>

                {/* ========== Floating Feature Badges ========== */}
                
                {/* RIGHT PILLAR */}

                {/* 1. Top Right — تحليل ذكي */}
                <div className="floating-badge absolute flex top-[6%] right-[-40px] lg:right-[-70px] xl:right-[-90px] border border-white/20 bg-black/50 backdrop-blur-xl rounded-[1.5rem] p-3.5 xl:p-4 items-center gap-3.5 z-30 shadow-[0_30px_60px_rgba(0,0,0,0.5)] min-w-[170px] xl:min-w-[190px]" dir="rtl">
                  <div className="animate-continuous-float-1 flex items-center gap-3.5 w-full h-full">
                    <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white flex flex-shrink-0 items-center justify-center text-black shadow-lg">
                      <svg className="w-6 h-6 xl:w-7 xl:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                      <p className="text-white text-sm xl:text-base font-bold tracking-wide">تحليل ذكي</p>
                      <p className="text-white/70 text-xs mt-0.5">لبياناتك المالية</p>
                    </div>
                  </div>
                </div>

                {/* 2. Mid Right — سيناريوهات تفاعلية */}
                <div className="floating-badge absolute flex top-1/2 -translate-y-1/2 right-[-60px] lg:right-[-90px] xl:right-[-110px] border border-white/20 bg-black/50 backdrop-blur-xl rounded-[1.5rem] p-3.5 xl:p-4 items-center gap-3.5 z-30 shadow-[0_40px_80px_rgba(0,0,0,0.6)] min-w-[170px] xl:min-w-[190px]" dir="rtl">
                  <div className="animate-continuous-float-2 flex items-center gap-3.5 w-full h-full">
                    <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white flex flex-shrink-0 items-center justify-center text-black shadow-lg">
                      <svg className="w-6 h-6 xl:w-7 xl:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 012-2h2a2 2 0 002-2z" /></svg>
                    </div>
                    <div>
                      <p className="text-white text-sm xl:text-base font-bold tracking-wide">سيناريوهات تفاعلية</p>
                      <p className="text-white/70 text-xs mt-0.5">الأفضل والأسوأ</p>
                    </div>
                  </div>
                </div>

                {/* 3. Bottom Right — معدلات التضخم */}
                <div className="floating-badge absolute flex bottom-[6%] right-[-40px] lg:right-[-70px] xl:right-[-90px] border border-white/20 bg-black/50 backdrop-blur-xl rounded-[1.5rem] p-3.5 xl:p-4 items-center gap-3.5 z-30 shadow-[0_30px_60px_rgba(0,0,0,0.5)] min-w-[170px] xl:min-w-[190px]" dir="rtl">
                  <div className="animate-continuous-float-3 flex items-center gap-3.5 w-full h-full">
                    <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white flex flex-shrink-0 items-center justify-center text-black shadow-lg">
                      <svg className="w-6 h-6 xl:w-7 xl:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <div>
                      <p className="text-white text-sm xl:text-base font-bold tracking-wide">معدلات التضخم</p>
                      <p className="text-white/70 text-xs mt-0.5">تحديث آني ودقيق</p>
                    </div>
                  </div>
                </div>

                {/* LEFT PILLAR */}

                {/* 4. Top Left — تكامل نفاذ */}
                <div className="floating-badge absolute flex top-[6%] left-[-40px] lg:left-[-70px] xl:left-[-90px] border border-white/20 bg-black/50 backdrop-blur-xl rounded-[1.5rem] p-3.5 xl:p-4 items-center gap-3.5 z-30 flex-row-reverse shadow-[0_30px_60px_rgba(0,0,0,0.5)] min-w-[170px] xl:min-w-[190px]" dir="rtl">
                  <div className="animate-continuous-float-4 flex items-center gap-3.5 w-full h-full flex-row-reverse">
                    <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white flex flex-shrink-0 items-center justify-center text-black shadow-lg">
                      <svg className="w-6 h-6 xl:w-7 xl:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div className="text-left w-full">
                      <p className="text-white text-sm xl:text-base font-bold tracking-wide">تكامل نفاذ</p>
                      <p className="text-white/70 text-xs mt-0.5">تحقق آمن ومباشر</p>
                    </div>
                  </div>
                </div>

                {/* 5. Mid Left — توصيات مخصصة */}
                <div className="floating-badge absolute flex top-1/2 -translate-y-1/2 left-[-60px] lg:left-[-90px] xl:left-[-110px] border border-white/20 bg-black/50 backdrop-blur-xl rounded-[1.5rem] p-3.5 xl:p-4 items-center gap-3.5 z-30 flex-row-reverse shadow-[0_40px_80px_rgba(0,0,0,0.6)] min-w-[170px] xl:min-w-[190px]" dir="rtl">
                  <div className="animate-continuous-float-5 flex items-center gap-3.5 w-full h-full flex-row-reverse">
                    <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white flex flex-shrink-0 items-center justify-center text-black shadow-lg">
                      <svg className="w-6 h-6 xl:w-7 xl:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </div>
                    <div className="text-left w-full">
                      <p className="text-white text-sm xl:text-base font-bold tracking-wide">توصيات مخصصة</p>
                      <p className="text-white/70 text-xs mt-0.5">بناءً على تحليلك</p>
                    </div>
                  </div>
                </div>

                {/* 6. Bottom Left — حماية فائقة */}
                <div className="floating-badge absolute flex bottom-[6%] left-[-40px] lg:left-[-70px] xl:left-[-90px] border border-white/20 bg-black/50 backdrop-blur-xl rounded-[1.5rem] p-3.5 xl:p-4 items-center gap-3.5 z-30 flex-row-reverse shadow-[0_30px_60px_rgba(0,0,0,0.5)] min-w-[170px] xl:min-w-[190px]" dir="rtl">
                  <div className="animate-continuous-float-6 flex items-center gap-3.5 w-full h-full flex-row-reverse">
                    <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white flex flex-shrink-0 items-center justify-center text-black shadow-lg">
                      <svg className="w-6 h-6 xl:w-7 xl:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <div className="text-left w-full">
                      <p className="text-white text-sm xl:text-base font-bold tracking-wide">حماية فائقة</p>
                      <p className="text-white/70 text-xs mt-0.5">أمان معايير ساما</p>
                    </div>
                  </div>
                </div>

                </div>
              </div>

              <div className="card-left-text gsap-reveal z-40 w-full hidden md:flex justify-center text-center px-4 pb-6 lg:pb-12">
                <p className="text-blue-100/95 text-sm md:text-base lg:text-lg font-normal leading-[1.8] max-w-2xl drop-shadow-md" style={{ fontFamily: "var(--font-family-body)" }}>
                  {cardDescription}
                </p>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Scroll Down Indicator - Pushed Down for Breathing Room */}
      <div 
        onClick={scrollToNext}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-3 cursor-pointer group opacity-60 hover:opacity-100 transition-opacity"
      >
        <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/50 group-hover:text-white transition-colors mb-2">اكتشف المزيد</span>
        <div className="w-1 h-12 rounded-full bg-white/10 relative overflow-hidden">
          <motion.div 
            animate={{ y: [0, 48, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-0 left-0 w-full h-1/3 bg-[#F1B497] rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
