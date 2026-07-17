"use client";

import { motion, useMotionValue, useAnimationFrame, type MotionValue } from "framer-motion";

/**
 * The drifting Sarat grid behind the advisor screens. Lifted out of
 * ConversationPage so the analysis page can share the exact same backdrop.
 */
export const GridPattern = ({
  offsetX,
  offsetY,
}: {
  offsetX: MotionValue<number>;
  offsetY: MotionValue<number>;
}) => {
  return (
    <svg className="w-full h-full">
      <defs>
        <motion.pattern
          id="grid-pattern"
          width="160"
          height="160"
          patternUnits="userSpaceOnUse"
          x={offsetX}
          y={offsetY}
        >
          {/* Grid lines spaced at 40px intervals */}
          <path
            d="M 160 0 L 0 0 0 160 M 40 0 L 40 160 M 80 0 L 80 160 M 120 0 L 120 160 M 0 40 L 160 40 M 0 80 L 160 80 M 0 120 L 160 120"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-navy/10" 
          />
          {/* Sarat Logo inside diagonal box 1: Row 0, Col 3 */}
          <svg x="128" y="8" width="24" height="24" viewBox="150 170 230 125" className="text-navy/20 fill-current">
            <g transform="translate(0.000000,500.000000) scale(0.100000,-0.100000)">
              <path d="M1990 3050 c-8 -5 -51 -10 -95 -10 -142 0 -149 -3 -195 -80 -46 -79 -51 -105 -17 -97 12 3 69 9 127 12 58 4 112 9 121 11 19 5 109 137 109 159 0 17 -27 20 -50 5z"/>
              <path d="M2188 2907 c-115 -92 -114 -91 -94 -118 14 -20 16 -58 16 -255 0 -250 -1 -244 53 -244 51 0 98 22 117 53 19 30 20 52 20 318 0 273 -4 311 -29 308 -4 0 -41 -28 -83 -62z"/>
              <path d="M3363 2870 c-67 -31 -83 -43 -83 -60 0 -20 4 -22 37 -15 41 7 154 61 165 79 14 21 8 36 -14 35 -13 0 -60 -18 -105 -39z"/>
              <path d="M3563 2739 c-57 -45 -63 -53 -63 -87 0 -41 -14 -62 -42 -62 -15 0 -18 9 -18 55 0 59 -5 64 -55 45 -14 -5 -33 -23 -43 -39 -32 -56 -82 -43 -82 21 0 43 -43 38 -110 -12 l-54 -40 -346 0 -346 0 -27 -28 c-27 -28 -27 -29 -27 -175 l0 -147 -40 -25 c-22 -14 -40 -28 -40 -31 0 -13 74 -34 119 -34 71 0 115 24 137 74 l19 41 400 5 c377 5 402 6 432 25 l32 20 34 -33 c28 -28 40 -32 84 -32 69 0 99 13 123 52 18 30 20 51 20 239 0 179 -2 208 -16 213 -24 9 -25 9 -91 -45z"/>
              <path d="M1712 2622 l-153 -147 1 -45 c0 -66 30 -223 45 -239 8 -7 21 -11 30 -7 13 5 15 14 10 44 l-6 39 154 6 c177 6 190 11 233 85 21 35 28 64 32 118 5 72 4 72 -48 165 -100 173 -98 173 -298 -19z m100 -59 c14 -15 48 -87 48 -99 0 -6 -122 -4 -163 3 l-38 6 52 53 c57 57 77 65 101 37z"/>
            </g>
          </svg>
          {/* Sarat Logo inside diagonal box 2: Row 1, Col 0 */}
          <svg x="8" y="48" width="24" height="24" viewBox="150 170 230 125" className="text-navy/20 fill-current">
            <g transform="translate(0.000000,500.000000) scale(0.100000,-0.100000)">
              <path d="M1990 3050 c-8 -5 -51 -10 -95 -10 -142 0 -149 -3 -195 -80 -46 -79 -51 -105 -17 -97 12 3 69 9 127 12 58 4 112 9 121 11 19 5 109 137 109 159 0 17 -27 20 -50 5z"/>
              <path d="M2188 2907 c-115 -92 -114 -91 -94 -118 14 -20 16 -58 16 -255 0 -250 -1 -244 53 -244 51 0 98 22 117 53 19 30 20 52 20 318 0 273 -4 311 -29 308 -4 0 -41 -28 -83 -62z"/>
              <path d="M3363 2870 c-67 -31 -83 -43 -83 -60 0 -20 4 -22 37 -15 41 7 154 61 165 79 14 21 8 36 -14 35 -13 0 -60 -18 -105 -39z"/>
              <path d="M3563 2739 c-57 -45 -63 -53 -63 -87 0 -41 -14 -62 -42 -62 -15 0 -18 9 -18 55 0 59 -5 64 -55 45 -14 -5 -33 -23 -43 -39 -32 -56 -82 -43 -82 21 0 43 -43 38 -110 -12 l-54 -40 -346 0 -346 0 -27 -28 c-27 -28 -27 -29 -27 -175 l0 -147 -40 -25 c-22 -14 -40 -28 -40 -31 0 -13 74 -34 119 -34 71 0 115 24 137 74 l19 41 400 5 c377 5 402 6 432 25 l32 20 34 -33 c28 -28 40 -32 84 -32 69 0 99 13 123 52 18 30 20 51 20 239 0 179 -2 208 -16 213 -24 9 -25 9 -91 -45z"/>
              <path d="M1712 2622 l-153 -147 1 -45 c0 -66 30 -223 45 -239 8 -7 21 -11 30 -7 13 5 15 14 10 44 l-6 39 154 6 c177 6 190 11 233 85 21 35 28 64 32 118 5 72 4 72 -48 165 -100 173 -98 173 -298 -19z m100 -59 c14 -15 48 -87 48 -99 0 -6 -122 -4 -163 3 l-38 6 52 53 c57 57 77 65 101 37z"/>
            </g>
          </svg>
          {/* Sarat Logo inside diagonal box 3: Row 2, Col 1 */}
          <svg x="48" y="88" width="24" height="24" viewBox="150 170 230 125" className="text-navy/20 fill-current">
            <g transform="translate(0.000000,500.000000) scale(0.100000,-0.100000)">
              <path d="M1990 3050 c-8 -5 -51 -10 -95 -10 -142 0 -149 -3 -195 -80 -46 -79 -51 -105 -17 -97 12 3 69 9 127 12 58 4 112 9 121 11 19 5 109 137 109 159 0 17 -27 20 -50 5z"/>
              <path d="M2188 2907 c-115 -92 -114 -91 -94 -118 14 -20 16 -58 16 -255 0 -250 -1 -244 53 -244 51 0 98 22 117 53 19 30 20 52 20 318 0 273 -4 311 -29 308 -4 0 -41 -28 -83 -62z"/>
              <path d="M3363 2870 c-67 -31 -83 -43 -83 -60 0 -20 4 -22 37 -15 41 7 154 61 165 79 14 21 8 36 -14 35 -13 0 -60 -18 -105 -39z"/>
              <path d="M3563 2739 c-57 -45 -63 -53 -63 -87 0 -41 -14 -62 -42 -62 -15 0 -18 9 -18 55 0 59 -5 64 -55 45 -14 -5 -33 -23 -43 -39 -32 -56 -82 -43 -82 21 0 43 -43 38 -110 -12 l-54 -40 -346 0 -346 0 -27 -28 c-27 -28 -27 -29 -27 -175 l0 -147 -40 -25 c-22 -14 -40 -28 -40 -31 0 -13 74 -34 119 -34 71 0 115 24 137 74 l19 41 400 5 c377 5 402 6 432 25 l32 20 34 -33 c28 -28 40 -32 84 -32 69 0 99 13 123 52 18 30 20 51 20 239 0 179 -2 208 -16 213 -24 9 -25 9 -91 -45z"/>
              <path d="M1712 2622 l-153 -147 1 -45 c0 -66 30 -223 45 -239 8 -7 21 -11 30 -7 13 5 15 14 10 44 l-6 39 154 6 c177 6 190 11 233 85 21 35 28 64 32 118 5 72 4 72 -48 165 -100 173 -98 173 -298 -19z m100 -59 c14 -15 48 -87 48 -99 0 -6 -122 -4 -163 3 l-38 6 52 53 c57 57 77 65 101 37z"/>
            </g>
          </svg>
          {/* Sarat Logo inside diagonal box 4: Row 3, Col 2 */}
          <svg x="88" y="128" width="24" height="24" viewBox="150 170 230 125" className="text-navy/20 fill-current">
            <g transform="translate(0.000000,500.000000) scale(0.100000,-0.100000)">
              <path d="M1990 3050 c-8 -5 -51 -10 -95 -10 -142 0 -149 -3 -195 -80 -46 -79 -51 -105 -17 -97 12 3 69 9 127 12 58 4 112 9 121 11 19 5 109 137 109 159 0 17 -27 20 -50 5z"/>
              <path d="M2188 2907 c-115 -92 -114 -91 -94 -118 14 -20 16 -58 16 -255 0 -250 -1 -244 53 -244 51 0 98 22 117 53 19 30 20 52 20 318 0 273 -4 311 -29 308 -4 0 -41 -28 -83 -62z"/>
              <path d="M3363 2870 c-67 -31 -83 -43 -83 -60 0 -20 4 -22 37 -15 41 7 154 61 165 79 14 21 8 36 -14 35 -13 0 -60 -18 -105 -39z"/>
              <path d="M3563 2739 c-57 -45 -63 -53 -63 -87 0 -41 -14 -62 -42 -62 -15 0 -18 9 -18 55 0 59 -5 64 -55 45 -14 -5 -33 -23 -43 -39 -32 -56 -82 -43 -82 21 0 43 -43 38 -110 -12 l-54 -40 -346 0 -346 0 -27 -28 c-27 -28 -27 -29 -27 -175 l0 -147 -40 -25 c-22 -14 -40 -28 -40 -31 0 -13 74 -34 119 -34 71 0 115 24 137 74 l19 41 400 5 c377 5 402 6 432 25 l32 20 34 -33 c28 -28 40 -32 84 -32 69 0 99 13 123 52 18 30 20 51 20 239 0 179 -2 208 -16 213 -24 9 -25 9 -91 -45z"/>
              <path d="M1712 2622 l-153 -147 1 -45 c0 -66 30 -223 45 -239 8 -7 21 -11 30 -7 13 5 15 14 10 44 l-6 39 154 6 c177 6 190 11 233 85 21 35 28 64 32 118 5 72 4 72 -48 165 -100 173 -98 173 -298 -19z m100 -59 c14 -15 48 -87 48 -99 0 -6 -122 -4 -163 3 l-38 6 52 53 c57 57 77 65 101 37z"/>
            </g>
          </svg>
        </motion.pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
    </svg>
  );
};


/**
 * Full-bleed backdrop: the Sarat grid + two glow orbs. Paints behind the
 * content (z-0) of whatever `relative` container it sits in.
 *
 * Perf, on a page that scrolls:
 *  - `animated` drives a per-frame drift of the SVG pattern. That repaints a
 *    full-page pattern 60×/sec and fights the scroll — leave it on only for
 *    fixed-height screens like the chat. Off, the grid is painted once.
 *  - the layers are `fixed`, so they stay viewport-sized instead of growing to
 *    the full scroll height, and don't repaint as the page moves.
 *  - translateZ(0) promotes them to their own compositor layer, which keeps the
 *    two 120px blurs (expensive to rasterise) off the scroll's critical path.
 */
export function PageBackdrop({ animated = true }: { animated?: boolean }) {
  const gridOffsetX = useMotionValue(0);
  const gridOffsetY = useMotionValue(0);

  useAnimationFrame(() => {
    if (!animated) return;
    gridOffsetX.set((gridOffsetX.get() + 0.5) % 40);
    gridOffsetY.set((gridOffsetY.get() + 0.5) % 40);
  });

  return (
    <>
      <div
        className="fixed inset-0 z-0 opacity-[0.25] pointer-events-none"
        style={{ transform: "translateZ(0)" }}
        aria-hidden="true"
      >
        <GridPattern offsetX={gridOffsetX} offsetY={gridOffsetY} />
      </div>

      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{ transform: "translateZ(0)" }}
        aria-hidden="true"
      >
        <div className="absolute right-[-10%] top-[-5%] w-[35%] h-[35%] rounded-full bg-orange/15 blur-[120px]" />
        <div className="absolute left-[-10%] bottom-[-10%] w-[35%] h-[35%] rounded-full bg-navy/10 blur-[120px]" />
      </div>
    </>
  );
}
