"use client";
import React from "react";
import { MeshGradient } from "@paper-design/shaders-react";

export function MeshBackground() {
  return (
    <>
      <svg className="absolute inset-0 w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.05
                      0 0 0 0.9 0"
              result="tint"
            />
          </filter>
        </defs>
      </svg>

      {/* The base tint is a CSS background, not a `backgroundColor` prop: MeshGradient forwards
          unknown props straight onto its DOM node, which React rejects with a console error. */}
      <MeshGradient
        className="absolute inset-0 w-full h-full"
        style={{ backgroundColor: "#F5EFEB" }}
        colors={["#F5EFEB", "#FFFFFF", "#F1B497", "#EAD8D0", "#F5EFEB"]}
        speed={0.15}
      />
      
      {/* Overlay to subtly soften the mesh grid */}
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] pointer-events-none mix-blend-overlay" />
    </>
  );
}
