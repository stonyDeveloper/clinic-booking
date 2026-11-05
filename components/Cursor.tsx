"use client";

import { useEffect, useRef } from "react";

/**
 * A small oxblood dot that trails the pointer and stretches over anything
 * interactive. Pure decoration: it never intercepts a click, and it is not
 * rendered at all on touch devices.
 */
export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const el = dot.current;
    if (!el) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let scale = 1;
    let targetScale = 1;
    let frame = 0;
    let visible = false;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;

      // Until the pointer actually moves, the dot has no meaningful position —
      // keep it hidden rather than parking it in the middle of the hero.
      if (!visible) {
        visible = true;
        x = tx;
        y = ty;
        el.style.opacity = "0.85";
      }

      const target = (e.target as HTMLElement | null)?.closest(
        "a, button, [data-cursor]",
      );
      targetScale = target ? 3.2 : 1;
    };

    const onLeave = () => {
      visible = false;
      el.style.opacity = "0";
    };

    const loop = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      scale += (targetScale - scale) * 0.15;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
      frame = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={dot} className="cursor-dot" aria-hidden="true" />;
}
