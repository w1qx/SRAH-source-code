export function OpticalBezel() {
  return (
    <div
      className="fixed inset-4 rounded-[2.5rem] pointer-events-none z-[10000]"
      style={{
        boxShadow: "0 0 0 100vmax var(--color-cream)", // The inverse shadow creating the bezel
        // A viewport-sized shadow spread on a fixed element is repainted on every
        // scroll frame. Promoting it to its own layer lets it be rasterised once
        // and simply composited — otherwise the page stutters as you scroll.
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      aria-hidden="true"
    />
  );
}
