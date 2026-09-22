# Kodexa — website

A scroll-driven WebGL marketing site for Kodexa, built with Next.js 16, React 19,
Tailwind CSS v4 and three.js.

## Sections

1. **Intro** — wireframe network with floating figures.
2. **Hero** — a geodesic "vault" with glowing seams on a procedural snowfield.
3. **Manifesto** — the vault opens while the mission statement resolves line by line.
4. **Ventures** — the camera flies past three iridescent rock blocks, each tagged with a HUD card.
5. **Labs** — a particle sculpture on a pedestal that morphs between experiments (arrow buttons / ← → keys).
6. **Contact** — wordmark, email and social links.

All geometry is generated procedurally in code; there are no external 3D or image assets.

## Editing content

All copy (brand name, taglines, manifesto, ventures, labs, footer links) lives in
`src/content/site.ts`. Scroll timing for each section is in `src/lib/timeline.ts`.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run typecheck
npm run check      # lint + typecheck + build
```
