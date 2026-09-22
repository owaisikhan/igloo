"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>[]";

type ScrambleTextProps = {
  text: string;
  active: boolean;
  duration?: number;
  className?: string;
};

/** Resolves random glyphs into `text` whenever `active` becomes true. */
export function ScrambleText({ text, active, duration = 700, className }: ScrambleTextProps) {
  const [output, setOutput] = useState(text);
  const frame = useRef(0);

  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const settled = Math.floor(t * text.length);
      let next = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        next += i < settled || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOutput(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [active, text, duration]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{output}</span>
    </span>
  );
}
