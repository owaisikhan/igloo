// Scroll timeline shared by the WebGL scene and the HTML overlays.
// Progress `p` runs 0 → 1 over the full page scroll.

export const SECTIONS = [
  { id: "intro", label: "INDEX", start: 0, end: 0.08 },
  { id: "hero", label: "KODEXA", start: 0.08, end: 0.26 },
  { id: "manifesto", label: "MANIFESTO", start: 0.26, end: 0.46 },
  { id: "ventures", label: "VENTURES", start: 0.46, end: 0.72 },
  { id: "labs", label: "LABS", start: 0.72, end: 0.92 },
  { id: "contact", label: "CONTACT", start: 0.92, end: 1 },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const SCROLL_PAGES = 10;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Normalised position of `p` inside [a, b]. */
export const range = (p: number, a: number, b: number) =>
  clamp01((p - a) / (b - a));

export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 0 → 1 → 0 envelope: fades in over `fade` after `a`, out over `fade` before `b`. */
export const band = (p: number, a: number, b: number, fade = 0.02) =>
  Math.min(smoothstep(a, a + fade, p), 1 - smoothstep(b - fade, b, p));

export const sectionIndexAt = (p: number) => {
  const i = SECTIONS.findIndex((s) => p < s.end);
  return i === -1 ? SECTIONS.length - 1 : i;
};

/** Section boundaries where the scene "glitches" to mask a cut. */
export const GLITCH_POINTS = [0.08, 0.26, 0.46, 0.72, 0.92];

export const glitchAt = (p: number) =>
  GLITCH_POINTS.reduce(
    (acc, b) => Math.max(acc, 1 - Math.abs(p - b) / 0.018),
    0,
  );

// Ventures: the camera flies down -Z past three floating blocks.
export const VENTURE_CAMERA = { from: 22, to: -66 };
export const VENTURE_SPACING = 28;
export const VENTURE_VIEW_DISTANCE = 12;

/** Scroll progress at which venture `i` sits in front of the camera. */
export const ventureFocus = (i: number) => {
  const { start, end } = SECTIONS[3];
  const travel = VENTURE_CAMERA.from - VENTURE_CAMERA.to;
  const needed = VENTURE_CAMERA.from - (-i * VENTURE_SPACING + VENTURE_VIEW_DISTANCE);
  return start + (needed / travel) * (end - start);
};
