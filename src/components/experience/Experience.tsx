"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { brand, footer, hero, labs, manifesto, ventures } from "@/content/site";
import {
  SCROLL_PAGES,
  SECTIONS,
  band,
  sectionIndexAt,
  smoothstep,
  ventureFocus,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type { KodexaEngine } from "./engine";
import { ScrambleText } from "./ScrambleText";
import { Wordmark } from "./Wordmark";

const [, HERO, MANIFESTO, , LABS, CONTACT] = SECTIONS;

/** Opacity + pointer handling for an overlay layer. */
function layer(visible: number) {
  return {
    className: cn(
      "transition-opacity duration-300",
      visible > 0.05 ? "pointer-events-auto" : "pointer-events-none",
    ),
    style: { opacity: visible },
  };
}

export function Experience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<KodexaEngine | null>(null);
  const anchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [lab, setLab] = useState(0);
  const [webglError, setWebglError] = useState(false);

  // Boot the WebGL engine (dynamically imported so three.js stays client-only).
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("./engine")
      .then(async ({ KodexaEngine }) => {
        await document.fonts.ready;
        if (cancelled) return;
        const engine = new KodexaEngine({ canvas, reducedMotion });
        engine.setVentureAnchors(anchorRefs.current);
        engine.start();
        engineRef.current = engine;
        setReady(true);
      })
      .catch(() => setWebglError(true));

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Loader counter.
  useEffect(() => {
    if (loaded >= 100) return;
    const id = window.setTimeout(
      () => setLoaded((v) => Math.min(ready ? 100 : 92, v + (ready ? 9 : 3))),
      40,
    );
    return () => window.clearTimeout(id);
  }, [loaded, ready]);

  // Scroll → progress.
  useEffect(() => {
    let raf = 0;
    const read = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      engineRef.current?.setProgress(p);
      setProgress((prev) => (Math.abs(prev - p) > 0.0004 ? p : prev));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const changeLab = useCallback((dir: number) => {
    setLab((i) => {
      const next = (i + dir + labs.length) % labs.length;
      engineRef.current?.setLab(next);
      return next;
    });
  }, []);

  const labsVisible = band(progress, LABS.start + 0.02, LABS.end, 0.02);

  useEffect(() => {
    if (labsVisible < 0.5) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") changeLab(1);
      if (e.key === "ArrowLeft") changeLab(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [labsVisible, changeLab]);

  const section = sectionIndexAt(progress);
  const loading = loaded < 100;
  const heroVisible = band(progress, HERO.start + 0.015, HERO.end - 0.01, 0.025);
  const introVisible = 1 - smoothstep(0.01, 0.06, progress);
  const maniVisible = band(progress, MANIFESTO.start + 0.01, MANIFESTO.end - 0.005, 0.02);
  const contactVisible = smoothstep(CONTACT.start + 0.01, CONTACT.start + 0.05, progress);
  const activeLab = labs[lab];

  return (
    <>
      {/* Scroll track */}
      <div aria-hidden className="h-[1000vh]" data-pages={SCROLL_PAGES} />

      <canvas ref={canvasRef} className="fixed inset-0 h-screen w-screen" aria-hidden />
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      {webglError && (
        <div className="fixed inset-0 grid place-items-center bg-background p-6 text-center text-sm">
          <p>{brand.tagline} — your browser needs WebGL to view this experience.</p>
        </div>
      )}

      <div className="pointer-events-none fixed inset-0 text-foreground">
        {/* ---------------- HUD ---------------- */}
        <header className="absolute left-5 top-5 flex items-center md:left-12 md:top-10">
          <a href="#" className="pointer-events-auto" aria-label={`${brand.name} home`}>
            <Wordmark className="text-2xl md:text-[34px]" />
          </a>
        </header>

        <div className="absolute right-5 top-6 text-right text-[11px] tracking-[0.2em] md:right-12 md:top-11">
          <ScrambleText
            text={`${String(section + 1).padStart(2, "0")} / ${SECTIONS[section].label}`}
            active
            className="text-glow"
          />
        </div>

        <div className="absolute bottom-6 left-5 flex items-center gap-3 md:bottom-10 md:left-12">
          <div className="h-[14px] w-24 border border-foreground/90 p-[2px]">
            <div
              className="h-full origin-left bg-foreground"
              style={{ transform: `scaleX(${Math.max(0.02, progress)})` }}
            />
          </div>
          <span className="text-glow text-[11px] tabular-nums tracking-[0.2em]">
            {String(Math.round(progress * 100)).padStart(3, "0")}%
          </span>
        </div>

        {/* ---------------- Intro ---------------- */}
        <div {...layer(introVisible * (loading ? 0 : 1))}>
          <div className="absolute inset-x-0 bottom-[14vh] flex flex-col items-center gap-3 text-center">
            <p className="text-glow text-[11px] tracking-[0.35em]">{hero.cue}</p>
            <span className="block h-10 w-px animate-pulse bg-foreground/80" />
          </div>
        </div>

        {/* ---------------- Hero ---------------- */}
        <section {...layer(heroVisible)} aria-label="Introduction">
          <div className="absolute bottom-[12vh] left-5 max-w-[640px] md:left-12">
            <p className="mb-5 text-[11px] tracking-[0.3em] text-foreground/85">
              <ScrambleText text={hero.eyebrow} active={heroVisible > 0.3} />
            </p>
            <h1 className="text-glow text-[34px] font-medium uppercase leading-[1.05] tracking-tight md:text-[64px]">
              {hero.title.map((line) => (
                <span key={line} className="block">
                  <ScrambleText text={line} active={heroVisible > 0.3} duration={900} />
                </span>
              ))}
            </h1>
          </div>
        </section>

        {/* ---------------- Manifesto ---------------- */}
        <section {...layer(maniVisible)} aria-label={manifesto.label}>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="mb-8 text-[11px] tracking-[0.35em] text-ink/80">
              [ {manifesto.label} ]
            </p>
            <div className="max-w-[900px] space-y-3">
              {manifesto.lines.map((line, i) => {
                const at = MANIFESTO.start + 0.025 + i * 0.026;
                const on = progress > at;
                return (
                  <p
                    key={line}
                    className={cn(
                      "text-lg font-medium uppercase leading-snug text-ink transition-all duration-700 md:text-[28px]",
                      on ? "translate-y-0 opacity-100 blur-0" : "translate-y-3 opacity-0 blur-sm",
                    )}
                  >
                    <ScrambleText text={line} active={on} duration={800} />
                  </p>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- Ventures ---------------- */}
        <section aria-label="Ventures">
          {ventures.map((v, i) => {
            const focus = ventureFocus(i);
            const vis = band(progress, focus - 0.05, focus + 0.03, 0.02);
            return (
              <div
                key={v.id}
                ref={(el) => {
                  anchorRefs.current[i] = el;
                }}
                className="absolute left-0 top-0 will-change-transform"
              >
                <article
                  {...layer(vis)}
                  className={cn(layer(vis).className, "w-[250px] -translate-y-full md:w-[320px]")}
                >
                  <div className="mb-2 h-px w-16 bg-foreground/90" />
                  <div className="flex items-center gap-2 text-[10px] tracking-[0.25em]">
                    <span className="bg-foreground px-1.5 py-0.5 text-ink">{v.index}</span>
                    <ScrambleText text={v.kind} active={vis > 0.3} />
                  </div>
                  <h2 className="text-glow mt-3 text-2xl font-medium uppercase md:text-3xl">
                    <ScrambleText text={v.name} active={vis > 0.3} />
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-foreground/90 md:text-[13px]">
                    {v.summary}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-3 border border-foreground/80 px-2 py-1 text-[10px] tracking-[0.2em]">
                    <span>{v.stat.label}</span>
                    <span className="bg-foreground px-1 text-ink">{v.stat.value}</span>
                  </div>
                </article>
              </div>
            );
          })}
        </section>

        {/* ---------------- Labs ---------------- */}
        <section {...layer(labsVisible)} aria-label="Labs">
          <p className="absolute left-1/2 top-[13vh] -translate-x-1/2 text-[11px] tracking-[0.35em] text-foreground/85">
            [ KODEXA LABS ]
          </p>
          <button
            type="button"
            onClick={() => changeLab(-1)}
            className="group absolute left-[8vw] top-1/2 flex h-12 w-24 -translate-y-1/2 items-center md:left-[20vw]"
            aria-label="Previous experiment"
          >
            <span className="block h-px w-full bg-foreground transition-transform group-hover:-translate-x-2" />
            <span className="absolute left-0 h-3 w-px origin-bottom -rotate-[60deg] bg-foreground" />
          </button>
          <button
            type="button"
            onClick={() => changeLab(1)}
            className="group absolute right-[8vw] top-1/2 flex h-12 w-24 -translate-y-1/2 items-center md:right-[20vw]"
            aria-label="Next experiment"
          >
            <span className="block h-px w-full bg-foreground transition-transform group-hover:translate-x-2" />
            <span className="absolute right-0 h-3 w-px origin-bottom rotate-[60deg] bg-foreground" />
          </button>

          <div className="absolute inset-x-0 bottom-[7vh] flex flex-col items-center gap-3 px-6 text-center">
            <div className="flex items-center gap-4 text-[10px] tracking-[0.25em]">
              <span className="text-foreground/80">{String(lab + 1).padStart(2, "0")}</span>
              <div className="relative border border-foreground/90 bg-foreground/90 px-8 py-2 text-ink">
                <span className="absolute -left-1.5 -top-1.5 h-3 w-3 border-l border-t border-foreground" />
                <span className="absolute -bottom-1.5 -right-1.5 h-3 w-3 border-b border-r border-foreground" />
                <ScrambleText
                  text={activeLab.name}
                  active
                  key={activeLab.id}
                  className="text-base font-semibold tracking-[0.3em]"
                />
              </div>
              <span className="text-foreground/80">{activeLab.status}</span>
            </div>
            <p className="text-glow max-w-sm text-xs text-foreground/90">{activeLab.description}</p>
          </div>
        </section>

        {/* ---------------- Contact ---------------- */}
        <footer {...layer(contactVisible)} aria-label="Contact">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center">
            <Wordmark className="text-5xl md:text-[120px]" />
            <p className="text-glow max-w-xl text-base uppercase md:text-xl">{footer.cta}</p>
            <a
              href={`mailto:${brand.email}`}
              className="border border-foreground px-5 py-2 text-xs tracking-[0.25em] transition-colors hover:bg-foreground hover:text-ink"
            >
              {brand.email.toUpperCase()}
            </a>
            <nav className="flex flex-wrap justify-center gap-6 text-[11px] tracking-[0.25em]">
              {footer.links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground/85 underline-offset-4 hover:text-foreground hover:underline"
                >
                  {l.label}
                </a>
              ))}
            </nav>
            <p className="absolute bottom-6 right-5 text-[10px] tracking-[0.2em] text-foreground/70 md:right-12">
              {footer.legal}
            </p>
          </div>
        </footer>
      </div>

      {/* ---------------- Loader ---------------- */}
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background transition-opacity duration-700",
          loading ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!loading}
      >
        <Wordmark className="text-5xl md:text-7xl" />
        <div className="flex items-center gap-3">
          <div className="h-[10px] w-40 border border-foreground p-[2px]">
            <div
              className="h-full origin-left bg-foreground transition-transform"
              style={{ transform: `scaleX(${loaded / 100})` }}
            />
          </div>
          <span className="text-glow w-10 text-[11px] tabular-nums tracking-[0.2em]">
            {String(loaded).padStart(3, "0")}
          </span>
        </div>
      </div>
    </>
  );
}
